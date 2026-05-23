import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Send, Brain, FileText, ChevronDown, Paperclip, X as XIcon,
  StopCircle, Image as ImageIcon, Plus, List, HelpCircle,
  BookOpen, AlignLeft, ChevronLeft, ChevronRight, Eye,
  EyeOff, Copy, Check, Maximize2, Minimize2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  loadPDFFromURL,
  renderPageToDataURL,
  dataURLToFile,
  type PDFProxy,
} from '../lib/pdfRenderer';
import { useChatSession } from '../hooks/useChatSession';
import styles from '../styles/components/chat.module.css';
import { SPRING_TIGHT } from '../components/ui/motion';

// ─── Sabit hızlı promptlar ───────────────────────────────────────────────────

const QUICK_PROMPTS = [
  { icon: AlignLeft,  label: 'Özetle',        text: 'Bu belgeyi 5–7 madde halinde özetle.' },
  { icon: List,       label: 'Ana kavramlar',  text: 'Bu belgenin temel kavramlarını ve önemli noktalarını listele. Her madde için kısa açıklama ekle.' },
  { icon: HelpCircle, label: 'Sınav soruları', text: 'Bu belgeden 5 sınav sorusu hazırla (3 çoktan seçmeli, 2 açık uçlu) ve cevap anahtarını yaz.' },
  { icon: BookOpen,   label: 'Sade anlat',     text: 'Bu belgenin en karmaşık kısmını lise öğrencisine anlatır gibi sade bir Türkçeyle açıkla.' },
];

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button className={styles.copyBtn} onClick={copy} title="Kopyala">
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

// ─── Ana Bileşen ─────────────────────────────────────────────────────────────

export default function ChatPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const reduced = useReducedMotion();

  const initDocId = (location.state as { documentId?: string } | null)?.documentId || '';

  const {
    messages, input, setInput, loading,
    documents, selectedDocId, setSelectedDocId,
    pendingFiles, setPendingFiles, abortRef,
    sendMessage, clearChat,
  } = useChatSession({ profile, initDocId });

  // UI-only state
  const [showDocPicker, setShowDocPicker] = useState(false);

  // PDF viewer state
  const [showPDFPanel, setShowPDFPanel] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pageCache, setPageCache] = useState<Record<number, string>>({});
  const [includeCurrentPage, setIncludeCurrentPage] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);

  const bodyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfProxyRef = useRef<PDFProxy | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Clear navigation state after consuming initDocId
  useEffect(() => {
    if (initDocId) navigate(location.pathname, { replace: true, state: {} });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── PDF viewer: belge değişince sıfırla ───────────────────────────────────
  useEffect(() => {
    pdfProxyRef.current = null;
    setPageCache({});
    setCurrentPage(1);
    setTotalPages(0);
    setIncludeCurrentPage(false);
  }, [selectedDocId]);

  // ── PDF viewer: panel açılınca PDF'i yükle ────────────────────────────────
  useEffect(() => {
    if (!showPDFPanel || !selectedDocId) return;
    if (pdfProxyRef.current) return; // zaten yüklenmiş

    const doc = documents.find(d => d.id === selectedDocId);
    if (!doc?.original_storage_path) return;

    setPdfLoading(true);
    supabase.storage
      .from('originals')
      .createSignedUrl(doc.original_storage_path, 3600)
      .then(async ({ data }) => {
        if (!data?.signedUrl) return;
        const proxy = await loadPDFFromURL(data.signedUrl);
        pdfProxyRef.current = proxy;
        setTotalPages(proxy.numPages);
        const dataURL = await renderPageToDataURL(proxy, 1, 1.6);
        setPageCache({ 1: dataURL });
        setCurrentPage(1);
      })
      .catch(() => {})
      .finally(() => setPdfLoading(false));
  }, [showPDFPanel, selectedDocId, documents]);

  // ── Mesaj gelince scroll'u en alta at ─────────────────────────────────────
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages]);

  // ── Textarea otomatik yükseklik ───────────────────────────────────────────
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [input]);

  // ── PDF sayfa gezginleri ───────────────────────────────────────────────────
  const goToPage = useCallback(async (pageNum: number) => {
    if (!pdfProxyRef.current || pageNum < 1 || pageNum > totalPages) return;
    setCurrentPage(pageNum);
    if (pageCache[pageNum]) return;
    const dataURL = await renderPageToDataURL(pdfProxyRef.current, pageNum, 1.6);
    setPageCache(prev => ({ ...prev, [pageNum]: dataURL }));
  }, [totalPages, pageCache]);

  const handleSend = async (overrideText?: string) => {
    let pageFile: File | undefined;
    if (includeCurrentPage && pageCache[currentPage]) {
      pageFile = await dataURLToFile(pageCache[currentPage], `Sayfa ${currentPage} (PDF görüntüsü).jpg`);
    }
    await sendMessage({ overrideText, pageFile });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); }
  };

  const selectedDoc = documents.find(d => d.id === selectedDocId);
  const initials = profile?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  const hasPDF = !!selectedDoc;

  if (!profile) {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.spinner} />
      </div>
    );
  }

  return (
    <div className={`${styles.chatLayout} ${showPDFPanel && hasPDF ? (panelExpanded ? styles.chatLayoutExpanded : styles.chatLayoutWithPDF) : ''}`}>

      {/* ══════════ CHAT PANEL ══════════ */}
      <div className={styles.chatPanel}>

        {/* ── Header ────────────────────────────────────────────── */}
        <div className={styles.chatHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.headerLogo}>
              <Brain size={16} />
            </div>
            <span className={styles.chatTitle}>AI Asistan</span>
            {selectedDoc && (
              <span className={styles.docChip}>
                <FileText size={10} />
                <span>{selectedDoc.original_name}</span>
              </span>
            )}
          </div>

          <div className={styles.headerRight}>
            {messages.length > 0 && (
              <motion.button
                className={styles.headerBtn}
                onClick={clearChat}
                disabled={loading}
                whileHover={reduced ? undefined : { y: -1 }}
                whileTap={reduced ? undefined : { scale: 0.96 }}
                transition={SPRING_TIGHT}
                title="Yeni sohbet"
              >
                <Plus size={13} /> Yeni
              </motion.button>
            )}

            {/* PDF viewer toggle */}
            {hasPDF && (
              <motion.button
                className={`${styles.headerBtn} ${showPDFPanel ? styles.headerBtnActive : ''}`}
                onClick={() => setShowPDFPanel(v => !v)}
                whileHover={reduced ? undefined : { y: -1 }}
                whileTap={reduced ? undefined : { scale: 0.96 }}
                transition={SPRING_TIGHT}
                title={showPDFPanel ? 'PDF panelini gizle' : 'Orijinal PDF\'i görüntüle'}
              >
                {showPDFPanel ? <EyeOff size={13} /> : <Eye size={13} />}
                <span>{showPDFPanel ? 'PDF Gizle' : 'PDF Görüntüle'}</span>
              </motion.button>
            )}

            {/* Doküman seçici */}
            <div className={styles.docPickerWrapper}>
              <motion.button
                className={styles.docPickerBtn}
                onClick={() => setShowDocPicker(v => !v)}
                whileHover={reduced ? undefined : { y: -1 }}
                whileTap={reduced ? undefined : { scale: 0.97 }}
                transition={SPRING_TIGHT}
              >
                <Brain size={13} />
                <span>{selectedDoc ? selectedDoc.original_name : 'Belge seç'}</span>
                <motion.span
                  style={{ display: 'inline-flex', color: 'var(--color-text-tertiary)' }}
                  animate={{ rotate: showDocPicker ? 180 : 0 }}
                  transition={SPRING_TIGHT}
                >
                  <ChevronDown size={12} />
                </motion.span>
              </motion.button>

              <AnimatePresence>
                {showDocPicker && (
                  <motion.div
                    className={styles.docPickerDropdown}
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                  >
                    <button
                      className={`${styles.docPickerItem} ${!selectedDocId ? styles.docPickerItemActive : ''}`}
                      onClick={() => { setSelectedDocId(''); setShowDocPicker(false); setShowPDFPanel(false); }}
                    >
                      <Brain size={13} /> Genel asistan
                    </button>
                    {documents.length === 0 ? (
                      <div className={styles.docPickerEmpty}>
                        Tamamlanmış belge yok.{' '}
                        <Link to="/translate" onClick={() => setShowDocPicker(false)}>Çeviri başlat</Link>
                      </div>
                    ) : documents.map(d => (
                      <button
                        key={d.id}
                        className={`${styles.docPickerItem} ${selectedDocId === d.id ? styles.docPickerItemActive : ''}`}
                        onClick={() => { setSelectedDocId(d.id); setShowDocPicker(false); }}
                      >
                        <FileText size={12} />
                        <span className={styles.docPickerItemName}>{d.original_name}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* ── Mesaj alanı ───────────────────────────────────────── */}
        <div className={styles.chatBody} ref={bodyRef}>
          {messages.length === 0 ? (

            /* Boş durum */
            <motion.div
              className={styles.emptyState}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className={styles.emptyIcon}>
                <Brain size={30} />
              </div>
              <h2 className={styles.emptyTitle}>Nasıl yardımcı olabilirim?</h2>
              <p className={styles.emptyHint}>
                {selectedDoc
                  ? `"${selectedDoc.original_name}" üzerine soru sorabilirsiniz.`
                  : 'Bir belge seçin veya soruyla birlikte dosya ekleyin.'}
              </p>

              <div className={styles.quickGrid}>
                {QUICK_PROMPTS.map(qp => {
                  const Icon = qp.icon;
                  return (
                    <motion.button
                      key={qp.label}
                      className={styles.quickBtn}
                      onClick={() => void handleSend(qp.text)}
                      disabled={loading}
                      whileHover={reduced ? undefined : { y: -2 }}
                      whileTap={reduced ? undefined : { scale: 0.97 }}
                      transition={SPRING_TIGHT}
                    >
                      <span className={styles.quickBtnIcon}><Icon size={14} /></span>
                      {qp.label}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>

          ) : (

            /* Mesajlar */
            messages.map(msg => (
              <motion.div
                key={msg.id}
                className={`${styles.msgRow} ${msg.role === 'user' ? styles.msgRowUser : ''}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Avatar */}
                <div className={`${styles.avatar} ${msg.role === 'user' ? styles.avatarUser : styles.avatarAI}`}>
                  {msg.role === 'user' ? initials : <Brain size={14} />}
                </div>

                <div className={styles.msgGroup}>
                  {/* Ekler */}
                  {msg.attachmentNames && msg.attachmentNames.length > 0 && (
                    <div className={styles.attachRow}>
                      {msg.attachmentNames.map((n, i) => (
                        <span key={i} className={styles.attachTag}>
                          <Paperclip size={10} /> {n}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Baloncuk */}
                  <div className={`${styles.bubble} ${msg.role === 'user' ? styles.bubbleUser : styles.bubbleAI}`}>
                    {msg.role === 'assistant' ? (
                      msg.content ? (
                        <>
                          <div className="markdown-body">
                            <ReactMarkdown
                              remarkPlugins={remarkPlugins as any}
                              rehypePlugins={rehypePlugins as any}
                              components={{
                                p: ({ ...p }) => <p style={{ margin: 0, paddingBottom: '0.55em' }} {...p} />,
                                ul: ({ ...p }) => <ul style={{ margin: 0, paddingLeft: '1.4em', paddingBottom: '0.5em' }} {...p} />,
                                ol: ({ ...p }) => <ol style={{ margin: 0, paddingLeft: '1.4em', paddingBottom: '0.5em' }} {...p} />,
                                h1: ({ ...p }) => <h3 style={{ margin: '0.7em 0 0.25em', fontWeight: 800 }} {...p} />,
                                h2: ({ ...p }) => <h4 style={{ margin: '0.6em 0 0.2em', fontWeight: 750 }} {...p} />,
                                h3: ({ ...p }) => <h5 style={{ margin: '0.5em 0 0.15em', fontWeight: 700 }} {...p} />,
                                code: ({ className, children, ...rest }) => {
                                  const isBlock = className?.includes('language-');
                                  return isBlock
                                    ? <code className={`${styles.codeBlock} ${className ?? ''}`} {...rest}>{children}</code>
                                    : <code className={styles.codeInline} {...rest}>{children}</code>;
                                },
                                pre: ({ children }) => <pre className={styles.pre}>{children}</pre>,
                                table: ({ ...p }) => <div className={styles.tableWrap}><table className={styles.table} {...p} /></div>,
                                blockquote: ({ ...p }) => <blockquote className={styles.blockquote} {...p} />,
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                          {msg.pending && (
                            <motion.span
                              className={styles.cursor}
                              animate={{ opacity: [0.15, 1, 0.15] }}
                              transition={{ duration: 1.1, repeat: Infinity }}
                            />
                          )}
                        </>
                      ) : (
                        <span className={styles.typingDots}>
                          <span /><span /><span />
                        </span>
                      )
                    ) : (
                      <span className={styles.userText}>{msg.content}</span>
                    )}
                  </div>

                  {/* Zaman + Kopyala */}
                  <div className={`${styles.msgMeta} ${msg.role === 'user' ? styles.msgMetaRight : ''}`}>
                    <span className={styles.msgTime}>
                      {msg.timestamp.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {msg.role === 'assistant' && !msg.pending && msg.content && (
                      <CopyButton text={msg.content} />
                    )}
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* ── Bekleyen dosyalar şeridi ───────────────────────────── */}
        <AnimatePresence>
          {pendingFiles.length > 0 && (
            <motion.div
              className={styles.pendingStrip}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              {pendingFiles.map((f, i) => (
                <span key={i} className={styles.pendingTag}>
                  {f.type.startsWith('image/') ? <ImageIcon size={10} /> : <FileText size={10} />}
                  <span>{f.name}</span>
                  <button className={styles.pendingRemove} onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}>
                    <XIcon size={10} />
                  </button>
                </span>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Input alanı ───────────────────────────────────────── */}
        <div className={styles.inputArea}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={e => {
              const valid = Array.from(e.target.files || [])
                .filter(f => (f.type.startsWith('image/') || f.type === 'application/pdf') && f.size <= 10 * 1024 * 1024);
              setPendingFiles(prev => [...prev, ...valid].slice(0, 5));
              e.target.value = '';
            }}
            style={{ display: 'none' }}
          />

          <div className={styles.inputRow}>
            {/* Dosya ekle butonu */}
            <button
              className={styles.iconBtn}
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              title="Dosya ekle"
            >
              <Paperclip size={16} />
            </button>

            {/* Sayfa ekle toggle — sadece PDF panel açıkken */}
            {showPDFPanel && hasPDF && pageCache[currentPage] && (
              <button
                className={`${styles.iconBtn} ${includeCurrentPage ? styles.iconBtnActive : ''}`}
                onClick={() => setIncludeCurrentPage(v => !v)}
                title={includeCurrentPage ? 'Sayfayı çıkar' : `Sayfa ${currentPage}'i soruya ekle`}
              >
                <Eye size={16} />
              </button>
            )}

            <textarea
              ref={textareaRef}
              className={styles.inputField}
              placeholder={
                includeCurrentPage
                  ? `Sayfa ${currentPage} hakkında bir soru yazın…`
                  : 'Bir soru yazın…'
              }
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={loading}
            />

            {loading ? (
              <button
                className={`${styles.sendBtn} ${styles.sendBtnStop}`}
                onClick={() => abortRef.current?.abort()}
                title="Durdur"
              >
                <StopCircle size={18} />
              </button>
            ) : (
              <button
                className={styles.sendBtn}
                onClick={() => void handleSend()}
                disabled={!input.trim() && pendingFiles.length === 0}
                title="Gönder"
              >
                <Send size={16} />
              </button>
            )}
          </div>

          {includeCurrentPage && (
            <div className={styles.pageIncludedBadge}>
              <Eye size={11} /> Sayfa {currentPage} soruya eklendi — AI görseli doğrudan okuyacak
            </div>
          )}
        </div>
      </div>

      {/* ══════════ PDF VIEWER PANEL ══════════ */}
      <AnimatePresence>
        {showPDFPanel && hasPDF && (
          <motion.div
            className={styles.pdfPanel}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Panel başlığı */}
            <div className={styles.pdfHeader}>
              <div className={styles.pdfHeaderLeft}>
                <FileText size={13} />
                <span className={styles.pdfTitle}>Orijinal PDF</span>
              </div>
              <div className={styles.pdfHeaderRight}>
                <button
                  className={styles.pdfIconBtn}
                  onClick={() => setPanelExpanded(v => !v)}
                  title={panelExpanded ? 'Küçült' : 'Genişlet'}
                >
                  {panelExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                </button>
                <button
                  className={styles.pdfIconBtn}
                  onClick={() => setShowPDFPanel(false)}
                  title="Kapat"
                >
                  <XIcon size={13} />
                </button>
              </div>
            </div>

            {/* Sayfa görüntüsü */}
            <div className={styles.pdfCanvas}>
              {pdfLoading ? (
                <div className={styles.pdfLoading}>
                  <div className={styles.spinner} />
                  <span>PDF yükleniyor…</span>
                </div>
              ) : pageCache[currentPage] ? (
                <img
                  src={pageCache[currentPage]}
                  alt={`Sayfa ${currentPage}`}
                  className={styles.pdfPageImg}
                />
              ) : (
                <div className={styles.pdfLoading}>
                  <div className={styles.spinner} />
                </div>
              )}
            </div>

            {/* Navigasyon */}
            {totalPages > 0 && (
              <div className={styles.pdfNav}>
                <button
                  className={styles.pdfNavBtn}
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                >
                  <ChevronLeft size={15} />
                </button>
                <span className={styles.pdfPageInfo}>
                  {currentPage} <span>/</span> {totalPages}
                </span>
                <button
                  className={styles.pdfNavBtn}
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}

            {/* Sayfayı soruya ekle */}
            {pageCache[currentPage] && (
              <button
                className={`${styles.askPageBtn} ${includeCurrentPage ? styles.askPageBtnActive : ''}`}
                onClick={() => setIncludeCurrentPage(v => !v)}
              >
                {includeCurrentPage ? (
                  <><Check size={13} /> Sayfa {currentPage} eklendi</>
                ) : (
                  <><Eye size={13} /> Bu sayfayı AI'ya sor</>
                )}
              </button>
            )}

            <p className={styles.pdfHint}>
              AI grafikler, formüller ve görselleri doğrudan bu sayfadan okuyacak.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
