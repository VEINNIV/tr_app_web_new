import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { generateStudyNotes } from '../lib/ai';
import { STUDY_SUBJECTS } from '../lib/constants';
import { getCreditCosts, getCachedCreditCosts } from '../lib/creditConfig';
import { formatTrDate, formatFileSize } from '../lib/utils';
import { useExportDoc } from '../hooks/useExportDoc';
import type { ExportFormat } from '../hooks/useExportDoc';
import toast from 'react-hot-toast';
import {
  BookOpen, Upload, File as FileIcon, X, Check,
  Image as ImageIcon, Copy, RefreshCw, FileText, FileType, FileCode, Wand2,
  History, Clock, Eye, Loader, Trash2, Plus, FolderOpen,
} from 'lucide-react';
import type { StudySession } from '../types';
import styles from '../styles/components/studynotes.module.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Step = 'upload' | 'processing' | 'result';

interface UploadedFile {
  id: string;
  file: File;
  preview?: string;
}

export default function StudyNotesPage() {
  const { profile, refreshProfile } = useAuth();
  const [view, setView] = useState<'create' | 'history'>('create');
  const [step, setStep] = useState<Step>('upload');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [subject, setSubject] = useState(STUDY_SUBJECTS[0]);
  const [isDragging, setIsDragging] = useState(false);
  const [generatedNotes, setGeneratedNotes] = useState<string>('');
  const [streamingText, setStreamingText] = useState<string>('');
  const [studyCost, setStudyCost] = useState<number>(getCachedCreditCosts().studyNotes);

  // Geçmiş ders notları (study_sessions)
  const [history, setHistory] = useState<StudySession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewingSession, setViewingSession] = useState<StudySession | null>(null);
  // Aktif oturum kimliği — hata durumunda 'error' işaretlemek için
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => { getCreditCosts().then(c => setStudyCost(c.studyNotes)); }, []);
  const { exporting, downloadAs: exportDoc } = useExportDoc();

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

  // İlk yüklemede geçmişi getir
  useEffect(() => { void fetchHistory(); }, [fetchHistory]);

  const handleDeleteSession = async (id: string) => {
    const { error } = await supabase.from('study_sessions').delete().eq('id', id);
    if (error) { toast.error('Silinemedi'); return; }
    setHistory(prev => prev.filter(s => s.id !== id));
    if (viewingSession?.id === id) setViewingSession(null);
    toast.success('Not silindi');
  };

  /** Markdown notu istenen formatta indirir (hem aktif sonuç hem geçmiş için). */
  const downloadNotes = (
    format: ExportFormat,
    markdown: string,
    subjectLabel: string,
    dateStr: string,
  ) => {
    if (!markdown) return;
    exportDoc(format, {
      markdown,
      filename: `${subjectLabel}_Notlari_${dateStr.slice(0, 10)}`.replace(/[^\w\d-_]+/g, '_'),
      title: `${subjectLabel} Notları`,
      subtitle: `${subjectLabel} • ${formatTrDate(dateStr)}`,
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFiles = (newFiles: FileList | File[]) => {
    const validFiles = Array.from(newFiles).filter(file => {
      // Allow images and PDFs up to 10MB each
      const isValidType = file.type.startsWith('image/') || file.type === 'application/pdf';
      const isValidSize = file.size <= 10 * 1024 * 1024;
      if (!isValidType) toast.error(`${file.name} desteklenmeyen bir format.`);
      if (!isValidSize) toast.error(`${file.name} boyutu çok büyük (Max 10MB).`);
      return isValidType && isValidSize;
    });

    if (files.length + validFiles.length > 5) {
      toast.error('Tek seferde en fazla 5 dosya yükleyebilirsiniz.');
      return;
    }

    const newUploadedFiles = validFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
    }));

    setFiles(prev => [...prev, ...newUploadedFiles]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const startProcessing = async () => {
    if (!profile) return;
    if (files.length === 0) {
      toast.error('Lütfen en az bir dosya yükleyin.');
      return;
    }

    const totalCost = files.length * (await getCreditCosts()).studyNotes;
    if (profile.credits_remaining < totalCost) {
      toast.error(`Yetersiz kredi. Bu işlem ${totalCost} kredi gerektiriyor.`);
      return;
    }

    setStep('processing');
    setStreamingText('');

    let operationId: string | undefined;
    try {
      // 1. Operasyon jetonu al — krediyi atomik düş + proxy çağrı hakkı üret.
      //    Jeton olmadan ai-proxy çağrılamaz (kredi-bypass imkânsız).
      const { data: opData, error: creditErr } = await supabase.rpc('begin_ai_operation', {
        p_action: 'study_notes',
        p_amount: totalCost,
        p_calls: files.length * 2 + 5,
        p_reference: null,
      });
      operationId = (opData as Array<{ operation_id: string }> | null)?.[0]?.operation_id;
      if (creditErr || !operationId) {
        const m = creditErr?.message ?? '';
        toast.error(
          /Yetersiz/.test(m) ? 'Yetersiz kredi.'
            : /fazla istek/.test(m) ? 'Çok fazla istek — biraz bekleyin.'
            : 'İşlem başlatılamadı.',
        );
        setStep('upload');
        return;
      }

      // 2. Session kaydı oluştur — hata yutulmaz; kayıt başarısız olursa
      //    not üretilse bile sonradan görüntülenemez, kullanıcıyı uyar.
      const { data: session, error: sessionErr } = await supabase.from('study_sessions').insert({
        user_id: profile.id,
        title: `${subject} Notları - ${formatTrDate()}`,
        subject: subject,
        source_count: files.length,
        status: 'processing',
        credits_used: totalCost,
      }).select().single();
      if (sessionErr || !session) {
        console.error('study_sessions insert başarısız:', sessionErr);
        throw new Error('Ders notu oturumu oluşturulamadı: ' + (sessionErr?.message ?? 'bilinmeyen hata'));
      }
      sessionIdRef.current = session.id;

      // 4. AI'a dosyaları DOĞRUDAN gönder — multimodal
      const rawFiles = files.map(f => f.file);
      const notes = await generateStudyNotes(
        rawFiles,
        subject,
        undefined,
        (_delta, full) => setStreamingText(full),
        operationId,
      );

      // 5. Sonucu kaydet — kayıt hatası da yutulmaz
      const { error: updateErr } = await supabase.from('study_sessions').update({
        generated_notes: notes,
        status: 'completed',
      }).eq('id', session.id);
      if (updateErr) {
        console.error('study_sessions update başarısız:', updateErr);
        toast.error('Not oluşturuldu ama kaydedilemedi — geçmişte görünmeyebilir.');
      }

      sessionIdRef.current = null; // başarı: hata işaretleme yok
      setGeneratedNotes(notes);
      setStep('result');
      await refreshProfile();
      void fetchHistory(); // geçmiş listesini tazele
      toast.success('Ders notu başarıyla oluşturuldu!');
    } catch (error) {
      console.error(error);
      // Oturum açıldıysa 'error' olarak işaretle ('processing'te asılı kalmasın)
      if (sessionIdRef.current) {
        try {
          await supabase.from('study_sessions').update({ status: 'error' }).eq('id', sessionIdRef.current);
        } catch { /* yut */ }
        sessionIdRef.current = null;
      }
      // Henüz hiç AI çağrısı yapılmadıysa krediyi iade et
      if (operationId) {
        try { await supabase.rpc('refund_ai_operation', { p_op_id: operationId }); } catch { /* yut */ }
        await refreshProfile();
      }
      const msg = error instanceof Error ? error.message : 'Notlar oluşturulurken bir hata oluştu.';
      toast.error(msg);
      setStep('upload');
    }
  };

  const downloadAs = (format: ExportFormat) => {
    downloadNotes(format, generatedNotes, subject, new Date().toISOString());
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedNotes);
    toast.success('Pano\'ya kopyalandı');
  };

  const reset = () => {
    setFiles([]);
    setGeneratedNotes('');
    setStep('upload');
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '9px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
    font: 'inherit', fontSize: '0.875rem', fontWeight: 600,
    border: `1px solid ${active ? 'transparent' : 'var(--color-border)'}`,
    background: active ? '#8b5cf6' : 'var(--color-surface)',
    color: active ? '#fff' : 'var(--color-text-secondary)',
    transition: 'all 0.15s',
  });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerIcon}><BookOpen size={24} /></div>
        <div>
          <h1 className={styles.title}>Ders Notu Çıkar</h1>
          <p className={styles.subtitle}>Sınıf tahtası, slaytlar veya kitap sayfalarından saniyeler içinde not oluşturun.</p>
        </div>
      </div>

      {/* Sekme: Yeni Not / Geçmiş Notlarım */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-5)' }}>
        <button onClick={() => setView('create')} style={tabStyle(view === 'create')}>
          <Plus size={16} /> Yeni Not
        </button>
        <button onClick={() => { setView('history'); void fetchHistory(); }} style={tabStyle(view === 'history')}>
          <History size={16} /> Geçmiş Notlarım{history.length > 0 ? ` (${history.length})` : ''}
        </button>
      </div>

      {view === 'create' && (
      <div className={styles.wizard}>
        <AnimatePresence mode="wait">

          {/* ── STEP 1: UPLOAD ── */}
          {step === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <div className={styles.uploadArea}>
                <div
                  className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('fileUpload')?.click()}
                >
                  <Upload size={48} className={styles.uploadIcon} />
                  <div className={styles.dropzoneText}>Görsel veya PDF'leri buraya sürükleyin</div>
                  <div className={styles.dropzoneSubtext}>veya cihazınızdan seçmek için tıklayın. (Max 5 dosya)</div>
                  <input
                    id="fileUpload"
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={handleFileInput}
                    style={{ display: 'none' }}
                  />
                </div>

                {files.length > 0 && (
                  <div className={styles.fileList}>
                    {files.map(file => (
                      <div key={file.id} className={styles.fileItem}>
                        <div className={styles.fileItemIcon}>
                          {file.file.type.startsWith('image/') ? <ImageIcon size={20} /> : <FileIcon size={20} />}
                        </div>
                        <div className={styles.fileItemInfo}>
                          <div className={styles.fileItemName}>{file.file.name}</div>
                          <div className={styles.fileItemSize}>{formatFileSize(file.file.size)}</div>
                        </div>
                        <button className={styles.removeBtn} onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}>
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.actionBar}>
                <select
                  className={styles.subjectSelect}
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                >
                  {STUDY_SUBJECTS.map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>

                <button
                  className={styles.generateBtn}
                  onClick={startProcessing}
                  disabled={files.length === 0}
                >
                  <Wand2 size={16} /> Notları Oluştur
                  <span style={{ fontSize: '0.75rem', opacity: 0.8, marginLeft: 4 }}>
                    ({files.length * studyCost} Kredi)
                  </span>
                </button>
              </div>
            </motion.div>
          )}

          {/* ── STEP 2: PROCESSING ── */}
          {step === 'processing' && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={styles.processingArea}
            >
              <motion.div
                className={styles.processingIcon}
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <BookOpen size={64} />
              </motion.div>
              <h2 className={styles.processingTitle}>Yapay Zeka Çalışıyor</h2>
              <p className={styles.processingSubtitle}>
                {files.length} kaynak analiz ediliyor ve {subject} notları oluşturuluyor.
              </p>
              <div className="animate-spin" style={{ width: 32, height: 32, border: '3px solid var(--color-border)', borderTopColor: '#8b5cf6', borderRadius: '50%', margin: '0 auto var(--space-6)' }} />
              {streamingText && (
                <motion.div
                  className="markdown-body"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    textAlign: 'left', maxHeight: 360, overflow: 'auto',
                    background: 'var(--color-bg-alt)', borderRadius: 'var(--radius-lg)',
                    padding: 'var(--space-4)', border: '1px solid var(--color-border)',
                    fontSize: '0.875rem',
                  }}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm as any]}>
                    {streamingText}
                  </ReactMarkdown>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ── STEP 3: RESULT ── */}
          {step === 'result' && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={styles.resultsArea}
            >
              <div className={styles.resultsHeader}>
                <div className={styles.resultsTitle}>
                  <Check size={20} color="var(--color-success)" />
                  {subject} Notları Hazır
                </div>
                <div className={styles.resultsActions}>
                  <button className={styles.actionBtn} onClick={() => downloadAs('pdf')} disabled={!!exporting} style={{ color: 'var(--color-success)', borderColor: 'var(--color-success-bg)' }}>
                    <FileText size={16} /> {exporting === 'pdf' ? 'PDF…' : 'PDF'}
                  </button>
                  <button className={styles.actionBtn} onClick={() => downloadAs('docx')} disabled={!!exporting}>
                    <FileType size={16} /> {exporting === 'docx' ? 'Word…' : 'Word'}
                  </button>
                  <button className={styles.actionBtn} onClick={() => downloadAs('txt')} disabled={!!exporting}>
                    <FileCode size={16} /> {exporting === 'txt' ? 'TXT…' : 'TXT'}
                  </button>
                  <button className={styles.actionBtn} onClick={handleCopy}>
                    <Copy size={16} /> Kopyala
                  </button>
                  <button className={styles.actionBtn} onClick={reset}>
                    <RefreshCw size={16} /> Yeni Not
                  </button>
                </div>
              </div>

              <div className={`${styles.markdownContent} markdown-body`} style={{ padding: 'var(--space-4)', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm as any]}>
                  {generatedNotes}
                </ReactMarkdown>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
      )}

      {/* ── GEÇMİŞ NOTLARIM ── */}
      {view === 'history' && (
        <div className={styles.wizard}>
          {historyLoading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '48px 0', color: 'var(--color-text-tertiary)' }}>
              <Loader size={20} style={{ animation: 'spin 0.8s linear infinite' }} /> Yükleniyor…
            </div>
          )}

          {!historyLoading && history.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--color-text-tertiary)' }}>
              <FolderOpen size={48} style={{ opacity: 0.4, marginBottom: 12 }} />
              <p style={{ fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Henüz ders notu yok</p>
              <p style={{ fontSize: '0.875rem' }}>İlk notunuzu oluşturmak için “Yeni Not” sekmesine geçin.</p>
            </div>
          )}

          {!historyLoading && history.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {history.map(s => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-lg)',
                  }}
                >
                  <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}>
                    <BookOpen size={20} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.title}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                      <Clock size={12} /> {formatTrDate(s.created_at)}
                      <span>•</span>{s.source_count} kaynak
                      {s.status === 'processing' && <span style={{ color: 'var(--color-warning, #d97706)' }}>• işleniyor</span>}
                      {s.status === 'error' && <span style={{ color: 'var(--color-error, #dc2626)' }}>• hata</span>}
                    </div>
                  </div>
                  {s.status === 'completed' && s.generated_notes ? (
                    <>
                      <button className={styles.actionBtn} onClick={() => setViewingSession(s)}>
                        <Eye size={14} /> Görüntüle
                      </button>
                      <button className={styles.actionBtn} disabled={!!exporting} title="PDF indir"
                        onClick={() => downloadNotes('pdf', s.generated_notes!, s.subject ?? 'Ders', s.created_at)}>
                        <FileText size={14} /> PDF
                      </button>
                      <button className={styles.actionBtn} disabled={!!exporting} title="Word indir"
                        onClick={() => downloadNotes('docx', s.generated_notes!, s.subject ?? 'Ders', s.created_at)}>
                        <FileType size={14} /> Word
                      </button>
                    </>
                  ) : (
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-tertiary)' }}>—</span>
                  )}
                  <button className={styles.actionBtn} title="Sil" onClick={() => handleDeleteSession(s.id)} style={{ color: 'var(--color-error, #dc2626)' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── GEÇMİŞ NOT GÖRÜNTÜLEME MODALI ── */}
      <AnimatePresence>
        {viewingSession && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setViewingSession(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-xl, 18px)', maxWidth: 760, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--color-border)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{viewingSession.title}</h2>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-tertiary)' }}>{viewingSession.subject} • {formatTrDate(viewingSession.created_at)}</p>
                </div>
                <button className={styles.actionBtn} disabled={!!exporting}
                  onClick={() => downloadNotes('pdf', viewingSession.generated_notes ?? '', viewingSession.subject ?? 'Ders', viewingSession.created_at)}>
                  <FileText size={14} /> PDF
                </button>
                <button className={styles.actionBtn} disabled={!!exporting}
                  onClick={() => downloadNotes('docx', viewingSession.generated_notes ?? '', viewingSession.subject ?? 'Ders', viewingSession.created_at)}>
                  <FileType size={14} /> Word
                </button>
                <button className={styles.actionBtn} disabled={!!exporting}
                  onClick={() => downloadNotes('txt', viewingSession.generated_notes ?? '', viewingSession.subject ?? 'Ders', viewingSession.created_at)}>
                  <FileCode size={14} /> TXT
                </button>
                <button className={styles.actionBtn} onClick={() => setViewingSession(null)}><X size={16} /></button>
              </div>
              <div className={`${styles.markdownContent} markdown-body`} style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-5)' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm as any]}>
                  {viewingSession.generated_notes ?? ''}
                </ReactMarkdown>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

