import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { FileText, MessageSquare, Trash2, FolderOpen, Eye, X, DownloadCloud, FileType, FileCode, Layers, Loader, BookOpen, Share2, Archive, CheckSquare, Square, Lock, MoreVertical, LayoutGrid, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import JSZip from 'jszip';
import { SPRING_TIGHT } from '../components/ui/motion';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { summarizeDocument } from '../lib/ai';
import { getCreditCosts } from '../lib/creditConfig';
import { STATUS_LABELS } from '../lib/constants';
import { formatTrDate, getQualityScore } from '../lib/utils';
import { useExportDoc } from '../hooks/useExportDoc';
import type { ExportFormat } from '../hooks/useExportDoc';
import type { Document, Translation } from '../types';
import styles from '../styles/components/documents.module.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import PDFOverlayViewer from '../components/PDFOverlayViewer';

/** Belge + varsa ilk çeviri bilgisi */
interface DocumentWithTranslation extends Document {
  translation?: Translation | null;
}

export default function DocumentsPage() {
  const { profile, refreshProfile } = useAuth();
  const reduced = useReducedMotion();
  const [documents, setDocuments] = useState<DocumentWithTranslation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<DocumentWithTranslation | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const { exporting, downloadAs: exportDoc } = useExportDoc();

  const [sharing, setSharing] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zipping, setZipping] = useState(false);

  // New UI/UX states
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(null);

  // Close dropdown menu and overlays when clicking anywhere on the screen
  useEffect(() => {
    const handleOutsideClick = () => {
      setActiveMenuId(null);
      setActiveOverlayId(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Paylaşım modalı (şifre opsiyonu)
  const [shareModalDoc, setShareModalDoc] = useState<DocumentWithTranslation | null>(null);
  const [shareUsePassword, setShareUsePassword] = useState(false);
  const [shareCode, setShareCode] = useState('');

  const toggleSelect = (id: string) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const selectAll = () => setSelected(new Set(documents.filter(d => d.translation?.translated_text).map(d => d.id)));
  const clearSelect = () => setSelected(new Set());

  // PDF Overlay Viewer
  const [overlayDoc, setOverlayDoc] = useState<DocumentWithTranslation | null>(null);
  const [overlayUrl, setOverlayUrl] = useState('');

  // Özet modal
  const [summaryDoc, setSummaryDoc] = useState<DocumentWithTranslation | null>(null);
  const [summaryText, setSummaryText] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const summaryAbortRef = useRef<AbortController | null>(null);

  // Belgeleri ve çevirilerini birlikte çek (sayfalı — performans)
  const [docPage, setDocPage] = useState(0);
  const [hasMoreDocs, setHasMoreDocs] = useState(false);
  const DOC_PAGE_SIZE = 30;

  useEffect(() => {
    if (!profile) return;

    const fetchDocuments = async () => {
      if (docPage === 0) setLoading(true);
      const start = docPage * DOC_PAGE_SIZE;
      const { data: docs } = await supabase
        .from('documents')
        .select(`
          *,
          translation:translations(*)
        `)
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .range(start, start + DOC_PAGE_SIZE);

      if (docs) {
        const more = docs.length > DOC_PAGE_SIZE;
        const slice = more ? docs.slice(0, DOC_PAGE_SIZE) : docs;
        const mapped = slice.map((d: DocumentWithTranslation & { translation: Translation[] }) => ({
          ...d,
          translation: Array.isArray(d.translation) ? d.translation[0] ?? null : d.translation,
        }));
        setDocuments(prev => docPage === 0 ? mapped : [...prev, ...mapped]);
        setHasMoreDocs(more);
      }
      setLoading(false);
    };

    fetchDocuments();
  }, [profile, docPage]);

  /** Belge durumuna göre renk sınıfı döndürür */
  const statusClass = (s: string) => {
    if (s === 'completed') return styles.statusCompleted;
    if (s === 'error') return styles.statusError;
    return styles.statusProcessing;
  };

  /** Belgeyi veritabanından ve listeden siler */
  const handleDelete = async (id: string) => {
    await supabase.from('documents').delete().eq('id', id);
    setDocuments(prev => prev.filter(d => d.id !== id));
    if (selectedDoc?.id === id) setSelectedDoc(null);
  };

  /** 4 haneli erişim kodunu token'a bağlı SHA-256 hash'ine çevirir (edge function ile aynı şema) */
  const hashShareCode = async (token: string, code: string): Promise<string> => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${token}:${code.toUpperCase()}`));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  };

  /** Paylaşım linkini oluştur — opsiyonel 4 haneli şifre ile */
  const createShareLink = async (doc: DocumentWithTranslation, code?: string) => {
    if (!doc.translation?.id || !doc.original_storage_path) {
      toast.error('Paylaşım için tamamlanmış bir çeviri gerekli.');
      return;
    }
    setSharing(prev => new Set(prev).add(doc.id));
    try {
      const { data: signedData, error: signErr } = await supabase.storage
        .from('originals')
        .createSignedUrl(doc.original_storage_path, 31536000);
      if (signErr || !signedData?.signedUrl) throw new Error('PDF URL oluşturulamadı');
      const token = crypto.randomUUID();
      const share_password_hash = code ? await hashShareCode(token, code) : null;
      const { error: updateErr } = await supabase
        .from('translations')
        .update({ share_token: token, shared_pdf_url: signedData.signedUrl, share_password_hash })
        .eq('id', doc.translation.id);
      if (updateErr) throw new Error('Paylaşım kaydedilemedi: ' + updateErr.message);
      const shareUrl = `${window.location.origin}/shared/${token}`;
      await navigator.clipboard.writeText(shareUrl).catch(() => {});
      setShareModalDoc(null);
      toast.success(
        code
          ? `Şifreli link kopyalandı! Kod: ${code.toUpperCase()} (1 yıl geçerli)`
          : 'Paylaşım linki kopyalandı! (1 yıl geçerli)',
        { duration: 7000 },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Paylaşım oluşturulamadı');
    } finally {
      setSharing(prev => { const s = new Set(prev); s.delete(doc.id); return s; });
    }
  };

  /** Paylaşım modalını aç */
  const openShareModal = (doc: DocumentWithTranslation) => {
    if (!doc.translation?.id || !doc.original_storage_path) {
      toast.error('Paylaşım için tamamlanmış bir çeviri gerekli.');
      return;
    }
    setShareUsePassword(false);
    setShareCode('');
    setShareModalDoc(doc);
  };

  /** Rastgele 4 haneli kod üret (harf + rakam, karışabilecek karakterler hariç) */
  const randomCode = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 0/O, 1/I/L hariç
    let out = '';
    const arr = new Uint32Array(4);
    crypto.getRandomValues(arr);
    for (let i = 0; i < 4; i++) out += chars[arr[i] % chars.length];
    setShareCode(out);
  };

  /** PDF Overlay Viewer'ı aç — Supabase Storage'dan imzalı URL al */
  const openOverlay = async (doc: DocumentWithTranslation) => {
    if (!doc.original_storage_path) {
      toast.error('Orijinal PDF bulunamadı.');
      return;
    }
    
    const promise = (async () => {
      const { data, error } = await supabase.storage
        .from('originals')
        .createSignedUrl(doc.original_storage_path, 3600);
      if (error || !data?.signedUrl) throw new Error('PDF URL alınamadı');
      setOverlayUrl(data.signedUrl);
      setOverlayDoc(doc);
    })();

    toast.promise(promise, {
      loading: 'PDF yükleniyor...',
      success: 'PDF yüklendi',
      error: 'PDF açılamadı',
    });
  };

  /** Özet oluştur */
  const openSummary = async (doc: DocumentWithTranslation) => {
    const text = doc.translation?.translated_text?.pages.join('\n\n');
    if (!text) { toast.error('Çeviri metni bulunamadı.'); return; }
    // Operasyon jetonu — özet de bir AI çağrısıdır; kredi harcanmadan proxy çağrılamaz.
    const cost = (await getCreditCosts()).chat;
    const { data: opData, error: opErr } = await supabase.rpc('begin_ai_operation', {
      p_action: 'chat',
      p_amount: cost,
      p_calls: 3,
      p_reference: doc.id,
    });
    const operationId = (opData as Array<{ operation_id: string }> | null)?.[0]?.operation_id;
    if (opErr || !operationId) {
      const m = opErr?.message ?? '';
      toast.error(
        /Yetersiz/.test(m) ? `Yetersiz kredi — özet için ${cost} kredi gerekiyor.`
          : /fazla istek/.test(m) ? 'Çok fazla istek — biraz bekleyin.'
          : 'Özet başlatılamadı.',
      );
      return;
    }
    void refreshProfile?.();
    setSummaryDoc(doc);
    setSummaryText('');
    setSummaryLoading(true);
    summaryAbortRef.current = new AbortController();
    try {
      await summarizeDocument(
        text,
        summaryAbortRef.current.signal,
        (_delta, full) => setSummaryText(full),
        operationId,
      );
    } catch (e) {
      // Erken hata/iptal → kredi iadesi (yalnızca hiç çağrı yapılmadıysa)
      try { await supabase.rpc('refund_ai_operation', { p_op_id: operationId }); } catch { /* yut */ }
      void refreshProfile?.();
      if (e instanceof Error && e.name !== 'AbortError') toast.error(e.message || 'Özet oluşturulamadı');
    } finally {
      setSummaryLoading(false);
    }
  };

  const downloadZip = async () => {
    const targets = documents.filter(d => selected.has(d.id) && d.translation?.translated_text);
    if (targets.length === 0) { toast.error('Seçili çeviri bulunamadı.'); return; }
    setZipping(true);
    const zip = new JSZip();
    for (const doc of targets) {
      const md = doc.translation!.translated_text!.pages.join('\n\n');
      const name = doc.original_name.replace(/\.pdf$/i, '') + '_ceviri.txt';
      zip.file(name, md);
    }
    try {
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `TransWordly_Ceviriler_${new Date().toISOString().slice(0,10)}.zip`;
      a.click(); URL.revokeObjectURL(url);
      toast.success(`${targets.length} çeviri ZIP olarak indirildi`);
      clearSelect();
    } catch {
      toast.error('ZIP oluşturulamadı');
    } finally {
      setZipping(false);
    }
  };

  const downloadAs = (format: ExportFormat) => {
    if (!selectedDoc?.translation?.translated_text) return;
    exportDoc(format, {
      markdown: selectedDoc.translation.translated_text.pages.join('\n\n'),
      filename: selectedDoc.original_name.replace(/\.pdf$/i, '') + '_ceviri',
      title: selectedDoc.original_name,
      subtitle: `Türkçe çeviri • ${formatTrDate()}`,
      onDone: () => setExportOpen(false),
    });
  };

  const filteredDocs = documents.filter(doc =>
    doc.original_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <span className={styles.heroEyebrow}><FolderOpen size={13} /> Belge Yönetimi</span>
          <h1 className={styles.title}>Dokümanlarım</h1>
          <p className={styles.desc}>Yüklediğiniz ve çevirdiğiniz tüm belgeler burada.</p>
        </div>
        <motion.div
          whileHover={reduced ? undefined : { y: -2 }}
          whileTap={reduced ? undefined : { scale: 0.96 }}
          transition={SPRING_TIGHT}
        >
          <Link to="/translate" className={styles.newBtn}>
            + Yeni Çeviri
          </Link>
        </motion.div>
      </div>

      {/* Kontrol Barı */}
      {!loading && documents.length > 0 && (
        <div className={styles.controlsBar}>
          <div className={styles.searchWrapper}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Belgelerde ara..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className={styles.searchClear}>
                <X size={14} />
              </button>
            )}
          </div>

          <div className={styles.controlsRight}>
            {documents.some(d => d.translation?.translated_text) && (
              <button className={styles.selectAllBtn} onClick={selected.size === 0 ? selectAll : clearSelect}>
                {selected.size === 0 ? <CheckSquare size={14} /> : <Square size={14} />}
                <span>{selected.size === 0 ? 'Tümünü Seç' : 'Temizle'}</span>
              </button>
            )}

            <div className={styles.viewToggle}>
              <button
                className={`${styles.toggleBtn} ${viewMode === 'grid' ? styles.toggleBtnActive : ''}`}
                onClick={() => setViewMode('grid')}
                title="Izgara Görünümü"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                className={`${styles.toggleBtn} ${viewMode === 'list' ? styles.toggleBtnActive : ''}`}
                onClick={() => setViewMode('list')}
                title="Liste Görünümü"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-list"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Skeleton loading */}
      {loading && (
        <div className={styles.grid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard}>
              <div className={styles.skeletonHeader}>
                <div className={`${styles.skeletonBox} ${styles.skeletonIcon}`} />
                <div className={styles.skeletonLines}>
                  <div className={`${styles.skeletonBox} ${styles.skeletonTitle}`} />
                  <div className={`${styles.skeletonBox} ${styles.skeletonMeta}`} />
                </div>
                <div className={`${styles.skeletonBox} ${styles.skeletonBadge}`} />
              </div>
              <div className={`${styles.skeletonBox} ${styles.skeletonDate}`} />
              <div className={styles.skeletonActions}>
                <div className={`${styles.skeletonBox} ${styles.skeletonBtn}`} />
                <div className={`${styles.skeletonBox} ${styles.skeletonBtnSm}`} />
                <div className={`${styles.skeletonBox} ${styles.skeletonBtnSm}`} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Boş durum & liste */}
      {!loading && (documents.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}><FolderOpen size={40} /></div>
          <p className={styles.emptyTitle}>Henüz doküman yok</p>
          <p className={styles.emptyDesc}>
            İlk belgenizi çevirmek için{' '}
            <Link to="/translate" className={styles.emptyLink}>çeviri sayfasına</Link>{' '}
            gidin.
          </p>
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}><Search size={40} /></div>
          <p className={styles.emptyTitle}>Eşleşen belge bulunamadı</p>
        </div>
      ) : (
        <>
          {/* Izgara Görünümü (Grid View) */}
          {viewMode === 'grid' && (
            <div className={styles.grid}>
              <AnimatePresence mode="popLayout">
                {filteredDocs.map((doc, i) => (
                  <motion.div
                    key={doc.id}
                    layout
                    className={`${styles.card} ${selected.has(doc.id) ? styles.cardSelected : ''} ${activeOverlayId === doc.id ? styles.cardOverlayActive : ''}`}
                    initial={{ opacity: 0, y: 20, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.22 } }}
                    transition={{ delay: i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    whileHover={reduced ? undefined : { y: -4 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveOverlayId(activeOverlayId === doc.id ? null : doc.id);
                    }}
                  >
                    <div className={styles.cardAccent} />
                    
                    {/* PDF Tag at top left */}
                    <span className={styles.pdfTag}>PDF</span>

                    {/* Checkbox */}
                    {doc.translation?.translated_text && (
                      <button
                        className={`${styles.checkBtn} ${selected.has(doc.id) ? styles.checkBtnActive : ''} ${styles.checkBtnHoverShow}`}
                        onClick={(e) => { e.stopPropagation(); toggleSelect(doc.id); }}
                        aria-label="Seç"
                      >
                        {selected.has(doc.id) ? <CheckSquare size={15} /> : <Square size={15} />}
                      </button>
                    )}

                    {/* Stylized Paper Cover Content */}
                    <div className={styles.paperBody}>
                      <div className={styles.paperTitleArea}>
                        <h3 className={styles.paperTitle} title={doc.original_name}>{doc.original_name}</h3>
                      </div>

                      {/* Beautiful Blurred Mock Page Preview */}
                      <div className={styles.mockPreview}>
                        <div className={styles.mockPreviewHeader}>
                          <div className={styles.mockLogo} />
                          <div className={styles.mockHeaderLine} />
                        </div>
                        
                        <div className={styles.mockPreviewRow}>
                          <div className={styles.mockPreviewLeftCol}>
                            <div className={styles.mockTextLine} style={{ width: '100%' }} />
                            <div className={styles.mockTextLine} style={{ width: '90%' }} />
                            <div className={styles.mockTextLine} style={{ width: '95%' }} />
                            <div className={styles.mockTextLine} style={{ width: '85%' }} />
                          </div>
                          <div className={styles.mockPreviewRightCol}>
                            <div className={styles.mockChartContainer}>
                              <div className={styles.mockChartBar} style={{ height: '70%' }} />
                              <div className={styles.mockChartBar} style={{ height: '40%' }} />
                              <div className={styles.mockChartBar} style={{ height: '90%' }} />
                              <div className={styles.mockChartBar} style={{ height: '60%' }} />
                            </div>
                          </div>
                        </div>

                        <div className={styles.mockTextLine} style={{ width: '100%' }} />
                        <div className={styles.mockTextLine} style={{ width: '95%' }} />
                        <div className={styles.mockTextLine} style={{ width: '40%' }} />
                        
                        <div className={styles.mockPreviewRow} style={{ marginTop: '4px' }}>
                          <div className={styles.mockPreviewLeftCol} style={{ flex: '1.2' }}>
                            <div className={styles.mockTextLine} style={{ width: '90%' }} />
                            <div className={styles.mockTextLine} style={{ width: '80%' }} />
                            <div className={styles.mockTextLine} style={{ width: '85%' }} />
                          </div>
                          <div className={styles.mockPreviewRightCol} style={{ flex: '0.8' }}>
                            <div className={styles.mockCircleGraphic} />
                          </div>
                        </div>
                      </div>

                      {/* Quality score badge inside page */}
                      {doc.translation && doc.status === 'completed' && doc.translation.status === 'completed' && (() => {
                        const q = getQualityScore(doc.page_count, doc.file_size_bytes, doc.id);
                        return (
                          <div className={styles.paperQualityBadge} style={{ '--q-color': q.color } as React.CSSProperties}>
                            <span className={styles.paperQualityText}>TR &bull; {q.score} Skor</span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Paper Footer with page details and date */}
                    <div className={styles.paperFooter}>
                      <div className={styles.paperMetaRow}>
                        <span className={`${styles.statusBadge} ${statusClass(doc.status)}`}>
                          <span className={styles.statusDot} /> {STATUS_LABELS[doc.status] || doc.status}
                        </span>
                        <span className={styles.paperPageCount}>{doc.page_count || '?'} sayfa &bull; {(doc.file_size_bytes / 1024 / 1024).toFixed(1)} MB</span>
                      </div>
                      <span className={styles.paperDate}>{formatTrDate(doc.created_at)}</span>
                    </div>

                    {/* Buzlu Cam Eylem Katmanı (Overlay Actions) */}
                    <div className={styles.cardOverlay} onClick={(e) => e.stopPropagation()}>
                      <button 
                        className={styles.overlayClose} 
                        onClick={(e) => { e.stopPropagation(); setActiveOverlayId(null); }}
                        title="Kapat"
                      >
                        <X size={14} />
                      </button>

                      <div className={styles.overlayTitle}>{doc.original_name}</div>
                      
                      <div className={styles.overlayActionsGrid}>
                        {doc.status === 'completed' && doc.original_storage_path && (
                          <button className={styles.overlayPrimaryBtn} onClick={() => { setActiveOverlayId(null); openOverlay(doc); }}>
                            <Layers size={14} /> <span>PDF Görüntüle</span>
                          </button>
                        )}
                        
                        <div className={styles.overlaySecondaryRow}>
                          {doc.translation?.translated_text && (
                            <button className={styles.overlaySecBtn} onClick={() => { setActiveOverlayId(null); setSelectedDoc(doc); }} title="Metni Oku">
                              <Eye size={14} /> <span>Metin</span>
                            </button>
                          )}
                          
                          {doc.translation?.translated_text && (
                            <button className={styles.overlaySecBtn} onClick={() => { setActiveOverlayId(null); openSummary(doc); }} title="Özet Çıkar">
                              <BookOpen size={14} /> <span>Özetle</span>
                            </button>
                          )}
                        </div>

                        <div className={styles.overlaySecondaryRow}>
                          <Link to="/chat" state={{ documentId: doc.id }} className={styles.overlaySecBtn} onClick={() => setActiveOverlayId(null)} title="AI ile Konuş">
                            <MessageSquare size={14} /> <span>AI Sor</span>
                          </Link>

                          {doc.status === 'completed' && doc.translation?.id && (
                            <button className={styles.overlaySecBtn} onClick={() => { setActiveOverlayId(null); openShareModal(doc); }} title="Belgeyi Paylaş">
                              <Share2 size={14} /> <span>Paylaş</span>
                            </button>
                          )}
                        </div>

                        <div className={styles.overlayDivider} />

                        <button className={styles.overlayDeleteBtn} onClick={() => { setActiveOverlayId(null); handleDelete(doc.id); }}>
                          <Trash2 size={14} /> <span>Belgeyi Sil</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Liste Görünümü (List View) */}
          {viewMode === 'list' && (
            <div className={styles.listContainer}>
              <table className={styles.listTable}>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>Seç</th>
                    <th>Dosya Adı</th>
                    <th style={{ width: 140 }}>Yükleme Tarihi</th>
                    <th style={{ width: 160 }}>Çeviri Kalitesi</th>
                    <th style={{ width: 120 }}>Durum</th>
                    <th style={{ width: 50 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map((doc) => (
                    <tr key={doc.id} className={`${styles.listRow} ${activeMenuId === doc.id ? styles.listRowActiveMenu : ''}`}>
                      <td>
                        {doc.translation?.translated_text ? (
                          <button
                            className={`${styles.listCheckBtn} ${selected.has(doc.id) ? styles.listCheckBtnActive : ''}`}
                            onClick={() => toggleSelect(doc.id)}
                            aria-label="Seç"
                          >
                            {selected.has(doc.id) ? <CheckSquare size={14} /> : <Square size={14} />}
                          </button>
                        ) : (
                          <span className={styles.listCheckPlaceholder}>-</span>
                        )}
                      </td>
                      <td className={styles.listFileNameCol} onClick={() => doc.status === 'completed' && openOverlay(doc)}>
                        <div className={styles.listFileIcon}>
                          <FileText size={16} />
                        </div>
                        <div className={styles.listFileInfo}>
                          <span className={styles.listFileName} title={doc.original_name}>{doc.original_name}</span>
                          <span className={styles.listFileMeta}>
                            {doc.page_count || '?'} sayfa &bull; {(doc.file_size_bytes / 1024 / 1024).toFixed(1)} MB
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={styles.listDate}>{formatTrDate(doc.created_at)}</span>
                      </td>
                      <td>
                        {doc.translation ? (
                          doc.status === 'completed' && doc.translation.status === 'completed' ? (() => {
                            const q = getQualityScore(doc.page_count, doc.file_size_bytes, doc.id);
                            return (
                              <div className={styles.listTranslationInfo}>
                                <span className={styles.listLanguageBadge}>Türkçe</span>
                                <span className={styles.listQualityDot} style={{ background: q.color }} />
                                <span className={styles.listQualityText} style={{ color: q.color }}>{q.score} Skor</span>
                              </div>
                            );
                          })() : (
                            <span className={styles.listTranslationPending}>Hazırlanıyor...</span>
                          )
                        ) : (
                          <span className={styles.listNoTranslation}>Mevcut Değil</span>
                        )}
                      </td>
                      <td>
                        <span className={`${styles.statusBadge} ${statusClass(doc.status)}`}>
                          <span className={styles.statusDot} /> {STATUS_LABELS[doc.status] || doc.status}
                        </span>
                      </td>
                      <td>
                        <div className={styles.menuContainer}>
                          <button
                            className={`${styles.menuTrigger} ${activeMenuId === doc.id ? styles.menuTriggerActive : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(activeMenuId === doc.id ? null : doc.id);
                            }}
                          >
                            <MoreVertical size={16} />
                          </button>
                          <AnimatePresence>
                            {activeMenuId === doc.id && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                transition={{ duration: 0.15 }}
                                className={styles.dropdownMenu}
                                style={{ right: 0, top: '100%' }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {doc.status === 'completed' && doc.original_storage_path && (
                                  <button onClick={() => { setActiveMenuId(null); openOverlay(doc); }}>
                                    <Layers size={13} /> PDF Görüntüle
                                  </button>
                                )}
                                {doc.translation?.translated_text && (
                                  <button onClick={() => { setActiveMenuId(null); setSelectedDoc(doc); }}>
                                    <Eye size={13} /> Metni Oku
                                  </button>
                                )}
                                {doc.translation?.translated_text && (
                                  <button onClick={() => { setActiveMenuId(null); openSummary(doc); }}>
                                    <BookOpen size={13} /> Özet Çıkar
                                  </button>
                                )}
                                <Link to="/chat" state={{ documentId: doc.id }} onClick={() => setActiveMenuId(null)}>
                                  <MessageSquare size={13} /> AI ile Konuş
                                </Link>
                                {doc.status === 'completed' && doc.translation?.id && (
                                  <button onClick={() => { setActiveMenuId(null); openShareModal(doc); }}>
                                    <Share2 size={13} /> Paylaş
                                  </button>
                                )}
                                <div className={styles.menuDivider} />
                                <button className={styles.menuDeleteBtn} onClick={() => { setActiveMenuId(null); handleDelete(doc.id); }}>
                                  <Trash2 size={13} /> Belgeyi Sil
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ))}

      {/* Daha fazla yükle */}
      {hasMoreDocs && (
        <div className={styles.loadMoreWrap}>
          <button className={styles.loadMoreBtn} onClick={() => setDocPage(p => p + 1)}>Daha fazla yükle</button>
        </div>
      )}

      {/* Yüzen Toplu İşlem Paneli (Floating Bulk Actions Panel) */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className={styles.floatingBulkBar}
          >
            <div className={styles.bulkCount}>
              <strong>{selected.size}</strong> belge seçildi
            </div>
            <div className={styles.bulkActionsRow}>
              <button className={styles.bulkZipBtn} onClick={downloadZip} disabled={zipping}>
                {zipping ? <Loader size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Archive size={14} />}
                {zipping ? 'Hazırlanıyor…' : `${selected.size} Seçili ZIP İndir`}
              </button>
              <button className={styles.bulkCancelBtn} onClick={clearSelect}>
                İptal Et
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

            {/* Çeviri Görüntüleme Modal */}
      <AnimatePresence>
        {selectedDoc && (
          <motion.div
            className={styles.modalOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedDoc(null)}
          >
            <motion.div
              className={styles.modal}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <div>
                  <h2 className={styles.modalTitle}>{selectedDoc.original_name}</h2>
                  <p className={styles.modalSub}>Türkçe Çeviri</p>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', position: 'relative' }}>
                  <motion.button
                    className={styles.btnView}
                    style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)', border: 'none', padding: '8px 12px', borderRadius: 'var(--radius-sm)', cursor: exporting ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}
                    onClick={() => setExportOpen(o => !o)}
                    disabled={!!exporting}
                    whileHover={reduced || exporting ? undefined : { y: -1 }}
                    whileTap={reduced || exporting ? undefined : { scale: 0.96 }}
                    transition={SPRING_TIGHT}
                  >
                    <DownloadCloud size={16} />
                    {exporting ? `${exporting.toUpperCase()} hazırlanıyor…` : 'İndir'}
                  </motion.button>
                  <AnimatePresence>
                    {exportOpen && !exporting && (
                      <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.96 }}
                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        style={{
                          position: 'absolute', top: 'calc(100% + 6px)', right: 60,
                          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
                          padding: 6, minWidth: 180, zIndex: 5,
                        }}
                      >
                        {([
                          { fmt: 'pdf' as const, label: 'PDF (.pdf)', icon: <FileText size={14} /> },
                          { fmt: 'docx' as const, label: 'Word (.docx)', icon: <FileType size={14} /> },
                          { fmt: 'txt' as const, label: 'Metin (.txt)', icon: <FileCode size={14} /> },
                        ]).map(({ fmt, label, icon }) => (
                          <button
                            key={fmt}
                            onClick={() => downloadAs(fmt)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              width: '100%', padding: '8px 10px', background: 'transparent',
                              border: 'none', borderRadius: 8, cursor: 'pointer',
                              fontSize: 13, color: 'var(--color-text-primary)', textAlign: 'left',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-alt)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            {icon} {label}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <button className={styles.modalClose} onClick={() => setSelectedDoc(null)}>
                    <X size={20} />
                  </button>
                </div>
              </div>
              <div className={`${styles.modalBody} markdown-body`}>
                <ReactMarkdown
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  remarkPlugins={[remarkGfm as any, remarkMath as any]}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  rehypePlugins={[rehypeKatex as any]}
                >
                  {selectedDoc.translation?.translated_text?.pages.join('\n\n') || ''}
                </ReactMarkdown>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── PDF Overlay Viewer ─────────────────────────────────── */}
      <AnimatePresence>
        {overlayDoc && overlayUrl && (
          <PDFOverlayViewer
            pdfUrl={overlayUrl}
            documentName={overlayDoc.original_name}
            sourceLang={overlayDoc.original_language || 'en'}
            overlayData={overlayDoc.translation?.translated_text?.overlay}
            onOverlayGenerated={async (data) => {
              // Eski belge için yeni üretilen overlay'i kaydet
              if (!overlayDoc.translation) return;
              const existingText = overlayDoc.translation.translated_text;
              const newText = { ...existingText, pages: existingText?.pages ?? [''], overlay: data };
              await supabase.from('translations')
                .update({ translated_text: newText })
                .eq('id', overlayDoc.translation.id);
              // Local state'i de güncelle
              setDocuments(prev => prev.map(d =>
                d.id === overlayDoc.id
                  ? { ...d, translation: { ...d.translation!, translated_text: newText } }
                  : d
              ));
              setOverlayDoc(prev => prev ? { ...prev, translation: { ...prev.translation!, translated_text: newText } } : null);
              toast.success('PDF çevirisi kalıcı olarak kaydedildi');
            }}
            onClose={() => { setOverlayDoc(null); setOverlayUrl(''); }}
          />
        )}
      </AnimatePresence>

      {/* ── Özet Modal ────────────────────────────────────────── */}
      <AnimatePresence>
        {summaryDoc && (
          <motion.div
            className={styles.modalOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setSummaryDoc(null); summaryAbortRef.current?.abort(); }}
          >
            <motion.div
              className={styles.modal}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{ maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
            >
              <div className={styles.modalHeader}>
                <div>
                  <h2 className={styles.modalTitle}>{summaryDoc.original_name}</h2>
                  <p className={styles.modalSub}>Yapay Zeka Özeti</p>
                </div>
                <button
                  className={styles.modalClose}
                  onClick={() => { setSummaryDoc(null); summaryAbortRef.current?.abort(); }}
                >
                  <X size={20} />
                </button>
              </div>

              <div className={`${styles.modalBody} markdown-body`} style={{ flex: 1, overflowY: 'auto' }}>
                {summaryLoading && !summaryText && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--color-text-tertiary)', padding: '20px 0' }}>
                    <Loader size={18} style={{ animation: 'spin 0.8s linear infinite' }} />
                    <span>Özet oluşturuluyor…</span>
                  </div>
                )}
                {summaryText && (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm as any, remarkMath as any]}
                    rehypePlugins={[rehypeKatex as any]}
                  >
                    {summaryText}
                  </ReactMarkdown>
                )}
                {summaryLoading && summaryText && (
                  <span style={{ display: 'inline-block', width: 2, height: 14, background: 'var(--color-text-secondary)', marginLeft: 3, verticalAlign: 'middle', borderRadius: 1, animation: 'pulse 1s ease-in-out infinite' }} />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Paylaşım modalı — opsiyonel 4 haneli şifre */}
      <AnimatePresence>
        {shareModalDoc && (
          <motion.div
            className={styles.modalOverlay}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShareModalDoc(null)}
          >
            <motion.div
              className={styles.modal}
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: 440 }}
            >
              <div className={styles.modalHeader}>
                <div>
                  <h2 className={styles.modalTitle}>Belgeyi Paylaş</h2>
                  <p className={styles.modalSub}>Bağlantıyı alan herkes görüntüleyip indirebilir</p>
                </div>
                <button className={styles.modalClose} onClick={() => setShareModalDoc(null)}>
                  <X size={20} />
                </button>
              </div>

              <div className={styles.modalBody} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* Şifre koruması toggle */}
                <button
                  onClick={() => { setShareUsePassword(v => !v); if (!shareUsePassword && !shareCode) randomCode(); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14,
                    border: `1.5px solid ${shareUsePassword ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    background: shareUsePassword ? 'rgba(0,87,255,0.05)' : 'var(--color-surface)',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center',
                    background: shareUsePassword ? 'var(--color-accent)' : 'var(--color-bg)',
                    color: shareUsePassword ? '#fff' : 'var(--color-text-tertiary)', transition: 'all 0.15s',
                  }}>
                    <Lock size={18} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>Şifre ile koru</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)' }}>4 haneli kod olmadan açılamaz</div>
                  </div>
                  <div style={{
                    width: 42, height: 24, borderRadius: 999, padding: 3, flexShrink: 0,
                    background: shareUsePassword ? 'var(--color-accent)' : 'var(--color-border)', transition: 'background 0.2s',
                    display: 'flex', justifyContent: shareUsePassword ? 'flex-end' : 'flex-start',
                  }}>
                    <motion.div layout style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff' }} />
                  </div>
                </button>

                {/* Kod girişi */}
                <AnimatePresence>
                  {shareUsePassword && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <input
                          value={shareCode}
                          onChange={e => setShareCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4))}
                          placeholder="ABCD"
                          maxLength={4}
                          style={{
                            flex: 1, padding: '12px 16px', fontSize: '1.4rem', fontWeight: 700, letterSpacing: '0.4em',
                            textAlign: 'center', textTransform: 'uppercase', color: 'var(--color-text-primary)',
                            background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
                            borderRadius: 12, outline: 'none', fontFamily: 'monospace',
                          }}
                        />
                        <button
                          onClick={randomCode}
                          style={{
                            padding: '12px 16px', fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap',
                            color: 'var(--color-accent)', background: 'rgba(0,87,255,0.08)',
                            border: 'none', borderRadius: 12, cursor: 'pointer',
                          }}
                        >
                          Rastgele
                        </button>
                      </div>
                      <p style={{ margin: '10px 2px 0', fontSize: '0.75rem', color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
                        Bu kodu çeviriyi göndereceğin kişiyle paylaş. 5 hatalı denemeden sonra erişim kapanır. Kodu sonradan göremezsin, not al.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  onClick={() => createShareLink(shareModalDoc, shareUsePassword ? shareCode : undefined)}
                  disabled={sharing.has(shareModalDoc.id) || (shareUsePassword && shareCode.length !== 4)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px',
                    borderRadius: 12, border: 'none', fontSize: '0.9rem', fontWeight: 700, color: '#fff',
                    background: (shareUsePassword && shareCode.length !== 4) ? 'var(--color-text-tertiary)' : 'var(--color-accent)',
                    cursor: (shareUsePassword && shareCode.length !== 4) ? 'not-allowed' : 'pointer',
                    opacity: sharing.has(shareModalDoc.id) ? 0.7 : 1, transition: 'all 0.15s',
                  }}
                >
                  {sharing.has(shareModalDoc.id)
                    ? <><Loader size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Oluşturuluyor…</>
                    : <><Share2 size={15} /> Linki oluştur ve kopyala</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
