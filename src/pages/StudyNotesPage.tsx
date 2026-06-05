import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { generateStudyNotes, translateStudyNotes, generateFlashcards, type StudyNoteLang, type StudyNoteTextSource, type FlashcardGenType } from '../lib/ai';
import { createDeckWithCards } from '../lib/decks';
import CardGenDialog from '../components/study/CardGenDialog';
import { STUDY_SUBJECTS } from '../lib/constants';
import { getCreditCosts, getCachedCreditCosts } from '../lib/creditConfig';
import { formatTrDate, formatFileSize } from '../lib/utils';
import { useExportDoc } from '../hooks/useExportDoc';
import type { ExportFormat } from '../hooks/useExportDoc';
import { beginAiOperation, refundAiOperation } from '../lib/aiOperation';
import { useAiOperation } from '../hooks/useAiOperation';
import toast from 'react-hot-toast';
import {
  Upload, File as FileIcon, X, Check, Image as ImageIcon, Copy, RefreshCw,
  FileText, FileType, FileCode, Wand2, History, Clock, Eye, Loader2, Trash2,
  Plus, FolderOpen, Layers, Languages, FileStack, GripVertical, Sparkles, Brain,
} from 'lucide-react';
import type { Document, StudySession } from '../types';
import styles from '../styles/components/studynotes.module.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

type Step = 'compose' | 'processing' | 'result';

interface UploadedFile {
  id: string;
  file: File;
  preview?: string;
}

interface DocSource {
  id: string;
  label: string;
  text: string;
}

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];

// Markdown'ı yalnızca metin değişince yeniden render et — streaming sırasında
// her token'da tüm ağacın yeniden parse edilmesini önler (performans).
const NotesMarkdown = memo(function NotesMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins as any} rehypePlugins={rehypePlugins as any}>
      {text}
    </ReactMarkdown>
  );
});

export default function StudyNotesPage() {
  const { profile, refreshProfile } = useAuth();
  const { run: runAiOp } = useAiOperation();
  const navigate = useNavigate();
  const [makingCards, setMakingCards] = useState(false);
  const reduced = useReducedMotion();
  const [view, setView] = useState<'create' | 'history'>('create');
  const [step, setStep] = useState<Step>('compose');

  // Kaynaklar
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [docSources, setDocSources] = useState<DocSource[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Seçenekler
  const [subject, setSubject] = useState(STUDY_SUBJECTS[0]);
  const [language, setLanguage] = useState<StudyNoteLang>('tr');
  const [studyCost, setStudyCost] = useState<number>(getCachedCreditCosts().studyNotes);
  const [cardCost, setCardCost] = useState<number>(getCachedCreditCosts().flashcards);

  // Kart üretim diyaloğu + sonuçta görüntülenen oturum (deste kaynağı için)
  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  const [resultSessionId, setResultSessionId] = useState<string | null>(null);

  // Üretim / sonuç
  const [streamingText, setStreamingText] = useState('');
  const [notesByLang, setNotesByLang] = useState<Partial<Record<StudyNoteLang, string>>>({});
  const [activeLang, setActiveLang] = useState<StudyNoteLang>('tr');
  const [translating, setTranslating] = useState(false);

  // Belge seçici
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const [availableDocs, setAvailableDocs] = useState<Array<Document & { _text: string }>>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  // Geçmiş
  const [history, setHistory] = useState<StudySession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const { exporting, downloadAs: exportDoc } = useExportDoc();

  useEffect(() => { getCreditCosts().then(c => { setStudyCost(c.studyNotes); setCardCost(c.flashcards); }); }, []);

  // ── Geçmiş ────────────────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    if (!profile) return;
    setHistoryLoading(true);
    const { data } = await supabase
      .from('study_sessions')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setHistory((data as StudySession[] | null) ?? []);
    setHistoryLoading(false);
  }, [profile]);

  useEffect(() => { void fetchHistory(); }, [fetchHistory]);

  // ── Belge kaynaklarını yükle (tamamlanmış belgeler + çevirileri) ───────────
  const loadDocuments = useCallback(async () => {
    if (!profile) return;
    setDocsLoading(true);
    try {
      const { data: docs } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', profile.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });
      const docList = (docs as Document[] | null) ?? [];
      if (docList.length === 0) { setAvailableDocs([]); return; }

      const { data: trans } = await supabase
        .from('translations')
        .select('document_id, translated_text')
        .in('document_id', docList.map(d => d.id))
        .eq('status', 'completed');

      const textByDoc = new Map<string, string>();
      for (const t of (trans as Array<{ document_id: string; translated_text: { pages?: string[] } | null }> | null) ?? []) {
        const pages = t.translated_text?.pages;
        if (Array.isArray(pages) && pages.length) {
          textByDoc.set(t.document_id, pages.join('\n\n'));
        }
      }
      setAvailableDocs(docList.map(d => ({ ...d, _text: textByDoc.get(d.id) ?? '' })));
    } finally {
      setDocsLoading(false);
    }
  }, [profile]);

  const openDocPicker = () => { setDocPickerOpen(true); void loadDocuments(); };

  const toggleDocSource = (doc: Document & { _text: string }) => {
    setDocSources(prev => {
      const exists = prev.find(s => s.id === doc.id);
      if (exists) return prev.filter(s => s.id !== doc.id);
      if (!doc._text) { toast.error('Bu belgenin çeviri metni bulunamadı.'); return prev; }
      return [...prev, { id: doc.id, label: doc.original_name, text: doc._text }];
    });
  };

  // ── Dosya yükleme ───────────────────────────────────────────────────────────
  const processFiles = (newFiles: FileList | File[]) => {
    const valid = Array.from(newFiles).filter(file => {
      const okType = file.type.startsWith('image/') || file.type === 'application/pdf';
      const okSize = file.size <= 10 * 1024 * 1024;
      if (!okType) toast.error(`${file.name} desteklenmeyen bir format.`);
      if (!okSize) toast.error(`${file.name} çok büyük (Max 10MB).`);
      return okType && okSize;
    });
    if (files.length + valid.length > 8) { toast.error('En fazla 8 dosya ekleyebilirsiniz.'); return; }
    setFiles(prev => [...prev, ...valid.map(file => ({
      id: Math.random().toString(36).slice(2),
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }))]);
  };

  const removeFile = (id: string) => setFiles(prev => prev.filter(f => f.id !== id));
  const removeDocSource = (id: string) => setDocSources(prev => prev.filter(s => s.id !== id));

  const totalSources = files.length + docSources.length;
  const totalCost = totalSources * studyCost;

  // ── Üretim ───────────────────────────────────────────────────────────────
  const startProcessing = async () => {
    if (!profile) return;
    if (totalSources === 0) { toast.error('En az bir kaynak ekleyin (dosya veya belge).'); return; }

    const cost = totalSources * (await getCreditCosts()).studyNotes;
    if (profile.credits_remaining < cost) {
      toast.error(`Yetersiz kredi. Bu işlem ${cost} kredi gerektiriyor.`);
      return;
    }

    setStep('processing');
    setStreamingText('');

    let operationId: string | undefined;
    try {
      const begin = await beginAiOperation({
        action: 'study_notes',
        amount: cost,
        calls: totalSources * 2 + 5,
        reference: null,
      });
      operationId = begin.ok ? begin.operationId : undefined;
      if (!begin.ok) {
        const m = begin.message;
        toast.error(
          /Yetersiz/.test(m) ? 'Yetersiz kredi.'
            : /fazla istek/.test(m) ? 'Çok fazla istek — biraz bekleyin.'
            : 'İşlem başlatılamadı.',
        );
        setStep('compose');
        return;
      }

      const { data: session, error: sessionErr } = await supabase.from('study_sessions').insert({
        user_id: profile.id,
        title: `${subject} Notları - ${formatTrDate()}`,
        subject,
        source_count: totalSources,
        status: 'processing',
        credits_used: cost,
      }).select().single();
      if (sessionErr || !session) {
        throw new Error('Ders notu oturumu oluşturulamadı: ' + (sessionErr?.message ?? 'bilinmeyen hata'));
      }
      sessionIdRef.current = session.id;

      const textSources: StudyNoteTextSource[] = docSources.map(s => ({ label: s.label, text: s.text }));
      const notes = await generateStudyNotes({
        files: files.map(f => f.file),
        textSources,
        subject,
        language,
        onChunk: (_d, full) => setStreamingText(full),
        operationId,
      });

      const { error: updateErr } = await supabase.from('study_sessions').update({
        generated_notes: notes,
        status: 'completed',
      }).eq('id', session.id);
      if (updateErr) toast.error('Not oluşturuldu ama kaydedilemedi — geçmişte görünmeyebilir.');

      sessionIdRef.current = null;
      setNotesByLang({ [language]: notes });
      setActiveLang(language);
      setResultSessionId(session.id);
      setStep('result');
      await refreshProfile();
      void fetchHistory();
      toast.success('Ders notu hazır!');
    } catch (error) {
      if (sessionIdRef.current) {
        try { await supabase.from('study_sessions').update({ status: 'error' }).eq('id', sessionIdRef.current); } catch { /* yut */ }
        sessionIdRef.current = null;
      }
      if (operationId) {
        await refundAiOperation(operationId);
        await refreshProfile();
      }
      toast.error(error instanceof Error ? error.message : 'Notlar oluşturulurken bir hata oluştu.');
      setStep('compose');
    }
  };

  // ── Sonuç dilini değiştir (gerekirse çevir — ek kredi) ─────────────────────
  const switchLang = async (target: StudyNoteLang) => {
    if (target === activeLang) return;
    if (notesByLang[target]) { setActiveLang(target); return; }
    if (!profile) return;

    const source = notesByLang[activeLang];
    if (!source) return;

    const cost = await getCreditCosts().then(c => c.studyNotes);
    if (profile.credits_remaining < cost) { toast.error(`Çeviri için ${cost} kredi gerekiyor.`); return; }

    setTranslating(true);
    try {
      const res = await runAiOp({
        action: 'study_notes',
        amount: cost,
        calls: 3,
        reference: null,
        messages: { insufficient: 'Çeviri başlatılamadı.', rate_limit: 'Çeviri başlatılamadı.', error: 'Çeviri başlatılamadı.' },
        run: (operationId) => translateStudyNotes(source, target, undefined, operationId),
      });
      if (res.ok) {
        setNotesByLang(prev => ({ ...prev, [target]: res.data }));
        setActiveLang(target);
        toast.success(target === 'en' ? 'İngilizce sürüm hazır.' : 'Türkçe sürüm hazır.');
      }
    } finally {
      setTranslating(false);
    }
  };

  // ── İndirme ──────────────────────────────────────────────────────────────
  const downloadNotes = (format: ExportFormat, markdown: string, subjectLabel: string, dateStr: string, lang: StudyNoteLang) => {
    if (!markdown) return;
    const langTag = lang === 'en' ? 'EN' : 'TR';
    exportDoc(format, {
      markdown,
      filename: `${subjectLabel}_Notlari_${langTag}_${dateStr.slice(0, 10)}`.replace(/[^\w\d-_]+/g, '_'),
      title: `${subjectLabel} ${lang === 'en' ? 'Notes' : 'Notları'}`,
      subtitle: `${subjectLabel} • ${formatTrDate(dateStr)}`,
    });
  };

  /** Notlardan seçili tipte flashcard üret → yeni deste (nota bağlı) → /study */
  const makeCardsFromNotes = async (opts: { cardType: FlashcardGenType; count: number }) => {
    const text = currentNotes;
    if (!text?.trim()) { toast.error('Not metni bulunamadı.'); return; }
    if (!profile?.id) return;
    const cost = (await getCreditCosts()).flashcards;
    setMakingCards(true);
    toast.loading('Kartlar üretiliyor…', { id: 'mk-cards' });
    try {
      await runAiOp({
        action: 'flashcards',
        amount: cost,
        calls: 1,
        reference: resultSessionId,
        toastId: 'mk-cards',
        messages: {
          insufficient: `Yetersiz kredi — kart üretimi için ${cost} kredi gerekiyor.`,
          rate_limit: 'Çok fazla istek — biraz bekleyin.',
          error: 'Kart üretimi başlatılamadı.',
        },
        run: async (operationId) => {
          const cards = await generateFlashcards(text, { operationId, cardType: opts.cardType, count: opts.count });
          if (!cards.length) throw new Error('Karta dönüştürülecek içerik bulunamadı.');
          await createDeckWithCards(
            profile.id,
            `${subject} Notları`,
            { type: 'study_note', ref: resultSessionId, cardType: opts.cardType },
            cards,
          );
          setCardDialogOpen(false);
          toast.success(`${cards.length} kart üretildi! 🎉`, { id: 'mk-cards' });
          navigate('/study');
        },
      });
    } finally {
      setMakingCards(false);
    }
  };

  /** Geçmişteki bir notu zengin sonuç ekranında aç (sade modal yerine). */
  const openSessionInResult = (s: StudySession) => {
    if (!s.generated_notes) return;
    files.forEach(f => f.preview && URL.revokeObjectURL(f.preview));
    setFiles([]);
    setDocSources([]);
    setNotesByLang({ tr: s.generated_notes });
    setActiveLang('tr');
    setSubject(s.subject ?? subject);
    setResultSessionId(s.id);
    setStep('result');
    setView('create');
  };

  const currentNotes = notesByLang[activeLang] ?? '';
  const downloadCurrent = (format: ExportFormat) =>
    downloadNotes(format, currentNotes, subject, new Date().toISOString(), activeLang);

  const handleCopy = () => {
    navigator.clipboard.writeText(currentNotes);
    toast.success('Panoya kopyalandı');
  };

  const reset = () => {
    files.forEach(f => f.preview && URL.revokeObjectURL(f.preview));
    setFiles([]);
    setDocSources([]);
    setNotesByLang({});
    setStreamingText('');
    setStep('compose');
  };

  const handleDeleteSession = async (id: string) => {
    const { error } = await supabase.from('study_sessions').delete().eq('id', id);
    if (error) { toast.error('Silinemedi'); return; }
    setHistory(prev => prev.filter(s => s.id !== id));
    if (resultSessionId === id) { setResultSessionId(null); setStep('compose'); }
    toast.success('Not silindi');
  };

  if (!profile) {
    return <div className={styles.loadingPage}><Loader2 className={styles.spin} size={26} /></div>;
  }

  return (
    <div className={styles.page}>
      {/* ── Başlık ── */}
      <header className={styles.header}>
        <div className={styles.headerBrand}>
          <div className={styles.headerLogo}>
            <img src="/trans_wordly.png" alt="" width={26} height={26} draggable={false} />
          </div>
          <div>
            <h1 className={styles.title}>Not Stüdyosu</h1>
            <p className={styles.subtitle}>
              Fotoğraf, slayt, PDF veya çevirdiğin belgelerden tek tıkla ders notu çıkar.
            </p>
          </div>
        </div>

        <div className={styles.tabs}>
          <button className={`${styles.tab} ${view === 'create' ? styles.tabActive : ''}`} onClick={() => setView('create')}>
            <Plus size={15} /> Yeni Not
          </button>
          <button className={`${styles.tab} ${view === 'history' ? styles.tabActive : ''}`} onClick={() => { setView('history'); void fetchHistory(); }}>
            <History size={15} /> Notlarım{history.length > 0 ? ` · ${history.length}` : ''}
          </button>
        </div>
      </header>

      {/* ══════════ CREATE ══════════ */}
      {view === 'create' && (
        <AnimatePresence mode="wait">

          {/* ── COMPOSE ── */}
          {step === 'compose' && (
            <motion.div
              key="compose"
              className={styles.composeGrid}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Kaynaklar kartı */}
              <section className={styles.panel}>
                <div className={styles.panelHead}>
                  <Layers size={16} />
                  <h2>Kaynaklar</h2>
                  {totalSources > 0 && <span className={styles.countPill}>{totalSources}</span>}
                </div>

                <div
                  className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ''}`}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
                  onDrop={e => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files) processFiles(e.dataTransfer.files); }}
                  onClick={() => document.getElementById('snFileInput')?.click()}
                >
                  <div className={styles.dropIcon}><Upload size={22} /></div>
                  <div className={styles.dropText}>Görsel veya PDF sürükle</div>
                  <div className={styles.dropSub}>ya da seçmek için tıkla — en fazla 8 dosya, 10MB</div>
                  <input id="snFileInput" type="file" multiple accept="image/*,application/pdf"
                    onChange={e => { if (e.target.files) processFiles(e.target.files); e.target.value = ''; }}
                    style={{ display: 'none' }} />
                </div>

                <button className={styles.addDocsBtn} onClick={openDocPicker}>
                  <FileStack size={15} /> Belgelerimden / çevirilerimden ekle
                </button>

                {/* Seçili kaynak listesi */}
                {(files.length > 0 || docSources.length > 0) && (
                  <div className={styles.sourceList}>
                    {docSources.map(s => (
                      <div key={s.id} className={styles.sourceItem}>
                        <span className={`${styles.sourceIcon} ${styles.sourceIconDoc}`}><Languages size={16} /></span>
                        <div className={styles.sourceInfo}>
                          <div className={styles.sourceName}>{s.label}</div>
                          <div className={styles.sourceMeta}>Çevrilmiş belge · {Math.round(s.text.length / 1000)}K karakter</div>
                        </div>
                        <button className={styles.sourceRemove} onClick={() => removeDocSource(s.id)}><X size={15} /></button>
                      </div>
                    ))}
                    {files.map(f => (
                      <div key={f.id} className={styles.sourceItem}>
                        <span className={styles.sourceIcon}>
                          {f.preview ? <img src={f.preview} alt="" className={styles.sourceThumb} /> : f.file.type.startsWith('image/') ? <ImageIcon size={16} /> : <FileIcon size={16} />}
                        </span>
                        <div className={styles.sourceInfo}>
                          <div className={styles.sourceName}>{f.file.name}</div>
                          <div className={styles.sourceMeta}>{formatFileSize(f.file.size)}</div>
                        </div>
                        <button className={styles.sourceRemove} onClick={() => removeFile(f.id)}><X size={15} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Ayarlar kartı */}
              <section className={`${styles.panel} ${styles.panelOptions}`}>
                <div className={styles.panelHead}>
                  <Wand2 size={16} />
                  <h2>Not Ayarları</h2>
                </div>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Ders / Konu</span>
                  <select className={styles.select} value={subject} onChange={e => setSubject(e.target.value)}>
                    {STUDY_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>

                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Not dili</span>
                  <div className={styles.langSwitch}>
                    {(['tr', 'en'] as StudyNoteLang[]).map(l => (
                      <button key={l} className={`${styles.langOpt} ${language === l ? styles.langOptActive : ''}`} onClick={() => setLanguage(l)}>
                        {l === 'tr' ? 'Türkçe' : 'İngilizce'}
                      </button>
                    ))}
                  </div>
                  <span className={styles.fieldHint}>Sonuç ekranında diğer dile de çevirebilirsin.</span>
                </div>

                <div className={styles.costRow}>
                  <div className={styles.costInfo}>
                    <span className={styles.costLabel}>Tahmini maliyet</span>
                    <span className={styles.costValue}>{totalCost} kredi</span>
                  </div>
                  <span className={styles.costNote}>{totalSources} kaynak × {studyCost}</span>
                </div>

                <motion.button
                  className={styles.generateBtn}
                  onClick={startProcessing}
                  disabled={totalSources === 0}
                  whileHover={reduced || totalSources === 0 ? undefined : { y: -2 }}
                  whileTap={reduced ? undefined : { scale: 0.98 }}
                >
                  <Sparkles size={17} /> Notları Oluştur
                </motion.button>
              </section>
            </motion.div>
          )}

          {/* ── PROCESSING ── */}
          {step === 'processing' && (
            <motion.div key="processing" className={styles.panel}
              initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <div className={styles.processing}>
                <div className={styles.processingOrb}>
                  <motion.span animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }} className={styles.orbRing} />
                  <img src="/trans_wordly.png" alt="" width={34} height={34} draggable={false} />
                </div>
                <h2 className={styles.processingTitle}>Notların hazırlanıyor</h2>
                <p className={styles.processingSub}>{totalSources} kaynak analiz ediliyor · {subject}</p>
              </div>
              {streamingText && (
                <div className={`${styles.streamPreview} markdown-body`}>
                  <NotesMarkdown text={streamingText} />
                </div>
              )}
            </motion.div>
          )}

          {/* ── RESULT ── */}
          {step === 'result' && (
            <motion.div key="result" className={styles.panel}
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
              <div className={styles.resultHead}>
                <div className={styles.resultTitle}>
                  <Check size={18} className={styles.resultCheck} /> {subject} Notları
                </div>
                <div className={styles.resultActions}>
                  <div className={styles.langSwitch}>
                    {(['tr', 'en'] as StudyNoteLang[]).map(l => (
                      <button key={l} disabled={translating}
                        className={`${styles.langOpt} ${activeLang === l ? styles.langOptActive : ''}`}
                        onClick={() => switchLang(l)}>
                        {translating && activeLang !== l ? <Loader2 size={13} className={styles.spin} /> : null}
                        {l === 'tr' ? 'TR' : 'EN'}{!notesByLang[l] && l !== activeLang ? ` (+${studyCost})` : ''}
                      </button>
                    ))}
                  </div>
                  <button className={styles.actionBtn} onClick={() => downloadCurrent('pdf')} disabled={!!exporting}>
                    <FileText size={15} /> {exporting === 'pdf' ? '…' : 'PDF'}
                  </button>
                  <button className={styles.actionBtn} onClick={() => downloadCurrent('docx')} disabled={!!exporting}>
                    <FileType size={15} /> {exporting === 'docx' ? '…' : 'Word'}
                  </button>
                  <button className={styles.actionBtn} onClick={() => downloadCurrent('txt')} disabled={!!exporting}>
                    <FileCode size={15} /> TXT
                  </button>
                  <button className={styles.actionBtn} onClick={handleCopy}><Copy size={15} /> Kopyala</button>
                  <button className={styles.actionBtn} onClick={() => setCardDialogOpen(true)} disabled={makingCards}>
                    <Brain size={15} /> {makingCards ? '…' : 'Kart Üret'}
                  </button>
                  <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} onClick={reset}><RefreshCw size={15} /> Yeni</button>
                </div>
              </div>
              <div className={`${styles.notesBody} markdown-body`}>
                <NotesMarkdown text={currentNotes} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* ══════════ HISTORY ══════════ */}
      {view === 'history' && (
        <div className={styles.panel}>
          {historyLoading && (
            <div className={styles.historyEmpty}><Loader2 size={22} className={styles.spin} /> Yükleniyor…</div>
          )}
          {!historyLoading && history.length === 0 && (
            <div className={styles.historyEmpty}>
              <FolderOpen size={42} style={{ opacity: 0.4 }} />
              <p className={styles.historyEmptyTitle}>Henüz ders notu yok</p>
              <p>İlk notunu oluşturmak için “Yeni Not” sekmesine geç.</p>
            </div>
          )}
          {!historyLoading && history.length > 0 && (
            <div className={styles.historyList}>
              {history.map(s => (
                <div key={s.id} className={styles.historyItem}>
                  <div className={styles.historyIcon}><FileText size={18} /></div>
                  <div className={styles.historyInfo}>
                    <div className={styles.historyName}>{s.title}</div>
                    <div className={styles.historyMeta}>
                      <Clock size={12} /> {formatTrDate(s.created_at)} · {s.source_count} kaynak
                      {s.status === 'processing' && <span className={styles.statusWarn}> · işleniyor</span>}
                      {s.status === 'error' && <span className={styles.statusErr}> · hata</span>}
                    </div>
                  </div>
                  {s.status === 'completed' && s.generated_notes ? (
                    <div className={styles.historyBtns}>
                      <button className={styles.actionBtn} onClick={() => openSessionInResult(s)}><Eye size={14} /> Görüntüle</button>
                      <button className={styles.actionBtn} disabled={!!exporting} onClick={() => downloadNotes('pdf', s.generated_notes!, s.subject ?? 'Ders', s.created_at, 'tr')}><FileText size={14} /> PDF</button>
                      <button className={styles.iconBtn} title="Sil" onClick={() => handleDeleteSession(s.id)}><Trash2 size={14} /></button>
                    </div>
                  ) : (
                    <button className={styles.iconBtn} title="Sil" onClick={() => handleDeleteSession(s.id)}><Trash2 size={14} /></button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Belge seçici modal ── */}
      <AnimatePresence>
        {docPickerOpen && (
          <motion.div className={styles.modalOverlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setDocPickerOpen(false)}>
            <motion.div className={styles.modal} onClick={e => e.stopPropagation()}
              initial={{ scale: 0.96, opacity: 0, y: 8 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}>
              <div className={styles.modalHead}>
                <div><h3>Belgelerimden ekle</h3><p>Çevirisi tamamlanmış belgelerini kaynak olarak birleştir.</p></div>
                <button className={styles.iconBtn} onClick={() => setDocPickerOpen(false)}><X size={18} /></button>
              </div>
              <div className={styles.modalBody}>
                {docsLoading && <div className={styles.historyEmpty}><Loader2 size={20} className={styles.spin} /> Belgeler yükleniyor…</div>}
                {!docsLoading && availableDocs.length === 0 && (
                  <div className={styles.historyEmpty}><FolderOpen size={32} style={{ opacity: 0.4 }} /><p>Tamamlanmış belge bulunamadı.</p></div>
                )}
                {!docsLoading && availableDocs.map(d => {
                  const selected = !!docSources.find(s => s.id === d.id);
                  const hasText = !!d._text;
                  return (
                    <button key={d.id} className={`${styles.docOpt} ${selected ? styles.docOptActive : ''}`}
                      onClick={() => toggleDocSource(d)} disabled={!hasText}>
                      <span className={styles.docOptCheck}>{selected ? <Check size={14} /> : <GripVertical size={14} />}</span>
                      <div className={styles.sourceInfo}>
                        <div className={styles.sourceName}>{d.original_name}</div>
                        <div className={styles.sourceMeta}>{hasText ? `${Math.round(d._text.length / 1000)}K karakter` : 'Çeviri metni yok'}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className={styles.modalFoot}>
                <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} onClick={() => setDocPickerOpen(false)}>
                  Tamam{docSources.length ? ` · ${docSources.length} seçildi` : ''}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Kart üretim diyaloğu (tip + adet) ── */}
      <CardGenDialog
        open={cardDialogOpen}
        title={`${subject} Notları`}
        cost={cardCost}
        busy={makingCards}
        onClose={() => setCardDialogOpen(false)}
        onConfirm={makeCardsFromNotes}
      />
    </div>
  );
}
