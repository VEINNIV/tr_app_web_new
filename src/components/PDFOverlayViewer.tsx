/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PDFOverlayViewer — Profesyonel çeviri görüntüleyici
 *
 * Backend PyMuPDF ile çevrilmiş PDF oluşturur → PDF.js ile doğrudan render eder.
 * HTML overlay / sarı kutu yok — metin PDF'e fiziksel olarak yazılır.
 *
 * Mod 1: overlayData mevcut → otomatik translated PDF build + göster
 * Mod 2: overlayData yok (eski belge) → "Oluştur" → build + göster
 */
import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, X, Eye, EyeOff, Loader,
  ZoomIn, ZoomOut, Maximize2, Download, Sparkles, AlertCircle, CheckCircle2,
  Columns2, SquareStack, Pencil, Zap, Sparkles as Stars,
} from 'lucide-react';
import { loadPDFFromURL, renderPageToDataURL, type PDFProxy } from '../lib/pdfRenderer';
import { translatePDF } from '../lib/pdfTranslator';
import type { RenderMode } from '../lib/pdfExtractorService';
// pdfWriter (→ pdf-lib ~1.2MB) dinamik import edilir — bu görüntüleyiciyi içeren
// sayfalar (Belgeler listesi, Chat) açılırken değil, yalnızca çeviri kurulurken/indirilirken yüklenir.
import TranslationEditor from './TranslationEditor';
import type { OverlayData } from '../types';
import styles from '../styles/components/overlayViewer.module.css';

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const BASE_PAGE_WIDTH = 760;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(s * 100) / 100));

export interface PDFOverlayViewerProps {
  pdfUrl: string;
  documentName?: string;
  sourceLang: string;
  overlayData?: OverlayData;
  onOverlayGenerated?: (data: OverlayData) => Promise<void> | void;
  onClose: () => void;
}

export default function PDFOverlayViewer({
  pdfUrl,
  documentName = 'Belge',
  sourceLang,
  overlayData,
  onOverlayGenerated,
  onClose,
}: PDFOverlayViewerProps) {
  // ── Orijinal PDF ────────────────────────────────────────────────────────
  const [pdfProxy, setPdfProxy] = useState<PDFProxy | null>(null);
  const [pageImages, setPageImages] = useState<Record<number, string>>({});

  // ── Çevrilmiş PDF ───────────────────────────────────────────────────────
  const [translatedProxy, setTranslatedProxy] = useState<PDFProxy | null>(null);
  const [translatedImages, setTranslatedImages] = useState<Record<number, string>>({});
  const [translatedBytes, setTranslatedBytes] = useState<Uint8Array | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildDone, setBuildDone] = useState(false);
  const [buildError, setBuildError] = useState('');

  // ── UI ──────────────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showTranslation, setShowTranslation] = useState(true);
  const [scale, setScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const pageAreaRef = useRef<HTMLDivElement>(null);

  // ── Zoom (imleç-merkezli ctrl+tekerlek + sığdır/%100) ────────────────────
  const scaleRef = useRef(1);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  // setScale sonrası uygulanacak scroll hedefi (cursor altındaki noktayı sabit tutar)
  const pendingZoom = useRef<{ cx: number; cy: number; contentX: number; contentY: number; ratio: number } | null>(null);

  const applyZoomAt = useCallback((factor: number, clientX: number, clientY: number) => {
    const area = pageAreaRef.current;
    if (!area) { setScale(s => clampScale(s * factor)); return; }
    const prev = scaleRef.current;
    const next = clampScale(prev * factor);
    if (next === prev) return;
    const rect = area.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    pendingZoom.current = {
      cx, cy,
      contentX: area.scrollLeft + cx,
      contentY: area.scrollTop + cy,
      ratio: next / prev,
    };
    setScale(next);
  }, []);

  const zoomByButton = useCallback((factor: number) => {
    const area = pageAreaRef.current;
    if (!area) { setScale(s => clampScale(s * factor)); return; }
    const rect = area.getBoundingClientRect();
    applyZoomAt(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, [applyZoomAt]);

  const resetZoom = useCallback(() => {
    pendingZoom.current = null;
    setScale(1);
    const area = pageAreaRef.current;
    if (area) requestAnimationFrame(() => { area.scrollTop = 0; area.scrollLeft = 0; });
  }, []);

  const fitToWidth = useCallback(() => {
    const area = pageAreaRef.current;
    if (!area) return;
    pendingZoom.current = null;
    setScale(clampScale((area.clientWidth - 40) / BASE_PAGE_WIDTH));
    requestAnimationFrame(() => { area.scrollTop = 0; area.scrollLeft = 0; });
  }, []);

  // Scale değişince cursor-merkezli scroll'u uygula
  useLayoutEffect(() => {
    const area = pageAreaRef.current;
    const pz = pendingZoom.current;
    if (!area || !pz) return;
    pendingZoom.current = null;
    area.scrollLeft = Math.max(0, pz.contentX * pz.ratio - pz.cx);
    area.scrollTop = Math.max(0, pz.contentY * pz.ratio - pz.cy);
  }, [scale]);

  // Ctrl/Cmd + tekerlek ile zoom (trackpad pinch dahil); düz tekerlek normal kaydırır
  useEffect(() => {
    const area = pageAreaRef.current;
    if (!area) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      applyZoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
    };
    area.addEventListener('wheel', onWheel, { passive: false });
    return () => area.removeEventListener('wheel', onWheel);
  }, [applyZoomAt]);

  // Drag-to-pan scrolling mechanism
  useEffect(() => {
    const area = pageAreaRef.current;
    if (!area || scale <= 1) return;

    let isDown = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;

    const handleMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('button, input, a, textarea')) return;
      isDown = true;
      setIsPanning(true);
      startX = e.pageX - area.offsetLeft;
      startY = e.pageY - area.offsetTop;
      scrollLeft = area.scrollLeft;
      scrollTop = area.scrollTop;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - area.offsetLeft;
      const y = e.pageY - area.offsetTop;
      const walkX = (x - startX) * 1.5;
      const walkY = (y - startY) * 1.5;
      area.scrollLeft = scrollLeft - walkX;
      area.scrollTop = scrollTop - walkY;
    };

    const handleMouseUpOrLeave = () => {
      isDown = false;
      setIsPanning(false);
    };

    let touchStartX = 0;
    let touchStartY = 0;
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if ((e.target as HTMLElement).closest('button, input, a, textarea')) return;
      isDown = true;
      touchStartX = e.touches[0].pageX - area.offsetLeft;
      touchStartY = e.touches[0].pageY - area.offsetTop;
      scrollLeft = area.scrollLeft;
      scrollTop = area.scrollTop;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDown || e.touches.length !== 1) return;
      const x = e.touches[0].pageX - area.offsetLeft;
      const y = e.touches[0].pageY - area.offsetTop;
      const walkX = (x - touchStartX) * 1.2;
      const walkY = (y - touchStartY) * 1.2;
      area.scrollLeft = scrollLeft - walkX;
      area.scrollTop = scrollTop - walkY;
    };

    area.addEventListener('mousedown', handleMouseDown);
    area.addEventListener('mousemove', handleMouseMove);
    area.addEventListener('mouseup', handleMouseUpOrLeave);
    area.addEventListener('mouseleave', handleMouseUpOrLeave);

    area.addEventListener('touchstart', handleTouchStart, { passive: true });
    area.addEventListener('touchmove', handleTouchMove, { passive: true });
    area.addEventListener('touchend', handleMouseUpOrLeave);

    return () => {
      area.removeEventListener('mousedown', handleMouseDown);
      area.removeEventListener('mousemove', handleMouseMove);
      area.removeEventListener('mouseup', handleMouseUpOrLeave);
      area.removeEventListener('mouseleave', handleMouseUpOrLeave);

      area.removeEventListener('touchstart', handleTouchStart);
      area.removeEventListener('touchmove', handleTouchMove);
      area.removeEventListener('touchend', handleMouseUpOrLeave);
    };
  }, [scale]);

  // ── Overlay üretimi (eski belgeler) ────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<{ current: number; total: number; eta?: number; message: string }>({ current: 0, total: 0, message: '' });
  const [localOverlay, setLocalOverlay] = useState<OverlayData | undefined>(overlayData);
  const [exporting, setExporting] = useState(false);
  const [sideBySide, setSideBySide] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  /** Render kalite modu: 'auto' = otomatik, 'vector' = hızlı, 'raster' = en temiz */
  const [renderMode, setRenderMode] = useState<RenderMode>('auto');

  const abortRef = useRef<AbortController | null>(null);
  const translatedBlobRef = useRef<string | null>(null);

  // ── Orijinal PDF yükle ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    loadPDFFromURL(pdfUrl)
      .then(p => { if (!cancelled) setPdfProxy(p); })
      .catch(e => { if (!cancelled) setLoadError(e.message || 'PDF yüklenemedi'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pdfUrl]);

  // ── Overlay hazır olunca translated PDF oluştur ────────────────────────
  useEffect(() => {
    if (!localOverlay || !pdfUrl) return;
    let cancelled = false;
    setBuilding(true);
    setBuildDone(false);
    setBuildError('');
    setTranslatedProxy(null);
    setTranslatedImages({});

    (async () => {
      try {
        const { buildTranslatedPDF } = await import('../lib/pdfWriter');
        const res = await fetch(pdfUrl);
        const arrayBuffer = await res.arrayBuffer();
        const bytes = await buildTranslatedPDF({
          originalPDF: arrayBuffer,
          pages: localOverlay.pages,
          renderMode,
        });
        if (cancelled) return;
        setTranslatedBytes(bytes);

        const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        if (translatedBlobRef.current) URL.revokeObjectURL(translatedBlobRef.current);
        translatedBlobRef.current = blobUrl;

        const proxy = await loadPDFFromURL(blobUrl);
        if (!cancelled) {
          setTranslatedProxy(proxy);
          setBuildDone(true);
        }
      } catch (e: any) {
        if (!cancelled) setBuildError(e.message || 'Çeviri PDF oluşturulamadı');
      } finally {
        if (!cancelled) setBuilding(false);
      }
    })();

    return () => { cancelled = true; };
  }, [localOverlay, pdfUrl]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => { if (translatedBlobRef.current) URL.revokeObjectURL(translatedBlobRef.current); };
  }, []);

  // ── Sayfa render ───────────────────────────────────────────────────────
  const renderOriginalPage = useCallback(async (n: number) => {
    if (!pdfProxy || pageImages[n]) return;
    try {
      const url = await renderPageToDataURL(pdfProxy, n, 1.8);
      setPageImages(p => ({ ...p, [n]: url }));
    } catch { /* ignore */ }
  }, [pdfProxy, pageImages]);

  const renderTranslatedPage = useCallback(async (n: number) => {
    if (!translatedProxy || translatedImages[n]) return;
    try {
      const url = await renderPageToDataURL(translatedProxy, n, 1.8);
      setTranslatedImages(p => ({ ...p, [n]: url }));
    } catch { /* ignore */ }
  }, [translatedProxy, translatedImages]);

  // Orijinal sayfa
  useEffect(() => {
    if (pdfProxy && !pageImages[currentPage]) renderOriginalPage(currentPage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pdfProxy]);

  // İlk sayfa preload
  useEffect(() => {
    if (pdfProxy && !pageImages[1]) renderOriginalPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfProxy]);

  // Çevrilmiş sayfa
  useEffect(() => {
    if (translatedProxy && showTranslation && !translatedImages[currentPage]) {
      renderTranslatedPage(currentPage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, translatedProxy, showTranslation]);

  // Translated proxy hazır olunca mevcut sayfayı render et
  useEffect(() => {
    if (translatedProxy) renderTranslatedPage(currentPage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translatedProxy]);

  // ── Navigasyon ─────────────────────────────────────────────────────────
  const totalPages = pdfProxy?.numPages ?? 0;

  const goToPage = useCallback((n: number) => {
    if (n < 1 || n > totalPages) return;
    setCurrentPage(n);
  }, [totalPages]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomByButton(1.15); return; }
        if (e.key === '-') { e.preventDefault(); zoomByButton(1 / 1.15); return; }
        if (e.key === '0') { e.preventDefault(); resetZoom(); return; }
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') goToPage(currentPage + 1);
      if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   goToPage(currentPage - 1);
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentPage, goToPage, onClose, zoomByButton, resetZoom]);

  // ── Overlay üretimi (eski belgeler) ────────────────────────────────────
  const generateOverlay = async () => {
    if (!pdfUrl) return;
    setGenerating(true);
    abortRef.current = new AbortController();
    try {
      const { pages } = await translatePDF(pdfUrl, {
        sourceLang,
        targetLang: 'tr',
        signal: abortRef.current.signal,
        onProgress: (info) => setGenProgress({
          current: info.current,
          total: info.total,
          eta: info.estimatedSecondsLeft,
          message: info.message,
        }),
      });
      const data: OverlayData = { version: 1, sourceLang, targetLang: 'tr', pages };
      setLocalOverlay(data);
      if (onOverlayGenerated) await onOverlayGenerated(data);
    } catch (e: any) {
      if (e?.message !== 'İptal edildi') setLoadError(e.message || 'Çeviri üretilemedi');
    } finally {
      setGenerating(false);
    }
  };

  // ── İndir ──────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!localOverlay) return;
    const safeName = documentName.replace(/\.pdf$/i, '').replace(/[^\w\d-_]+/g, '_');
    const { buildTranslatedPDF, downloadBytes } = await import('../lib/pdfWriter');
    if (translatedBytes) {
      downloadBytes(translatedBytes, `${safeName}_TR.pdf`);
      return;
    }
    setExporting(true);
    try {
      const res = await fetch(pdfUrl);
      const arrayBuffer = await res.arrayBuffer();
    const bytes = await buildTranslatedPDF({ originalPDF: arrayBuffer, pages: localOverlay.pages, renderMode });
      downloadBytes(bytes, `${safeName}_TR.pdf`);
    } catch (e: any) {
      alert('İndirme hatası: ' + (e.message || 'Bilinmeyen hata'));
    } finally {
      setExporting(false);
    }
  };

  // ── Türetilmiş değerler ────────────────────────────────────────────────
  const showingTranslated = showTranslation && !!translatedProxy;
  const currentImage = showingTranslated
    ? (translatedImages[currentPage] ?? pageImages[currentPage])
    : pageImages[currentPage];

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      className={styles.backdrop}
      onClick={e => { if (e.target === e.currentTarget && !generating) onClose(); }}
    >
      <motion.div
        className={`${styles.modal} ${sideBySide ? styles.modalWide : ''}`}
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* ── Toolbar ─────────────────────────────────────────────── */}
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            {localOverlay && (
              <button
                className={`${styles.toolBtn} ${showTranslation ? styles.toolBtnActive : ''}`}
                onClick={() => setShowTranslation(v => !v)}
                title={showTranslation ? 'Orijinali göster' : 'Çeviriyi göster'}
              >
                {showTranslation
                  ? <><Eye size={14} /> <span>Çeviri</span></>
                  : <><EyeOff size={14} /> <span>Orijinal</span></>
                }
                {building && showTranslation && (
                  <Loader size={11} className={styles.spin} style={{ marginLeft: 3, opacity: 0.7 }} />
                )}
                {buildDone && showTranslation && (
                  <CheckCircle2 size={11} style={{ marginLeft: 3, color: 'var(--color-success)' }} />
                )}
              </button>
            )}

            <div className={styles.zoomCluster}>
              <button className={styles.zoomBtn} onClick={() => zoomByButton(1 / 1.15)} title="Uzaklaştır (Ctrl −)">
                <ZoomOut size={14} />
              </button>
              <button className={styles.zoomReset} onClick={resetZoom} title="Gerçek boyut (Ctrl 0)">
                {Math.round(scale * 100)}%
              </button>
              <button className={styles.zoomBtn} onClick={() => zoomByButton(1.15)} title="Yakınlaştır (Ctrl +)">
                <ZoomIn size={14} />
              </button>
              <button className={styles.zoomBtn} onClick={fitToWidth} title="Genişliğe sığdır">
                <Maximize2 size={13} />
              </button>
            </div>

            {localOverlay && translatedProxy && (
              <button
                className={`${styles.toolBtn} ${sideBySide ? styles.toolBtnActive : ''}`}
                onClick={() => setSideBySide(v => !v)}
                title={sideBySide ? 'Tek sayfa görünümü' : 'Yan yana görünüm'}
              >
                {sideBySide ? <SquareStack size={14} /> : <Columns2 size={14} />}
                <span className={styles.toolBtnLabel}>{sideBySide ? 'Tekli' : 'Yan Yana'}</span>
              </button>
            )}

            {localOverlay && (
              <button
                className={styles.toolBtn}
                onClick={() => setShowEditor(true)}
                title="Çeviriyi düzenle"
              >
                <Pencil size={14} /> <span className={styles.toolBtnLabel}>Düzenle</span>
              </button>
            )}

            {localOverlay && (
              <button
                className={`${styles.toolBtn} ${styles.toolBtnExport}`}
                onClick={handleExport}
                disabled={exporting || (building && !translatedBytes)}
                title="Çeviri PDF olarak indir"
              >
                {exporting
                  ? <><Loader size={13} className={styles.spin} /> İndiriliyor…</>
                  : <><Download size={14} /> <span>PDF İndir</span></>
                }
              </button>
            )}

            {/* Kalite modu toggle */}
            {localOverlay && (
              <button
                className={`${styles.toolBtn} ${renderMode === 'raster' ? styles.toolBtnActive : ''}`}
                onClick={() => setRenderMode(m => m === 'raster' ? 'auto' : 'raster')}
                title={renderMode === 'raster'
                  ? 'Şu an: Maks Temizlik (OpenCV inpaint) — tıkla: Otomatik'
                  : 'Şu an: Otomatik — tıkla: Maks Temizlik (OpenCV inpaint)'
                }
                style={{ gap: 5 }}
              >
                {renderMode === 'raster'
                  ? <><Stars size={13} /> <span style={{ fontSize: 11 }}>Maks Temizlik</span></>
                  : <><Zap size={13} /> <span style={{ fontSize: 11 }}>Otomatik</span></>
                }
              </button>
            )}
          </div>

          <div className={styles.toolbarCenter}>
            <button className={styles.navBtn} onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
              <ChevronLeft size={16} />
            </button>
            <span className={styles.pageInfo}>
              Sayfa <strong>{currentPage}</strong> / {totalPages || '…'}
            </span>
            <button className={styles.navBtn} onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages}>
              <ChevronRight size={16} />
            </button>
          </div>

          <div className={styles.toolbarRight}>
            <button className={styles.closeBtn} onClick={onClose} title="Kapat" disabled={generating}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Sayfa alanı ──────────────────────────────────────────── */}
        <div
          ref={pageAreaRef}
          className={`${styles.pageArea} ${scale > 1 ? styles.grabCursor : ''} ${isPanning ? styles.grabbingCursor : ''}`}
        >

          {/* İlk yükleme */}
          {loading && (
            <div className={styles.centeredOverlay}>
              <Loader size={28} className={styles.spin} />
              <span>PDF yükleniyor…</span>
            </div>
          )}

          {/* Hata */}
          {loadError && (
            <div className={styles.centeredOverlay}>
              <AlertCircle size={24} color="var(--color-error)" />
              <p className={styles.errorText}>{loadError}</p>
            </div>
          )}

          {/* Eski belge: overlay yok, üret */}
          {!loading && !loadError && !localOverlay && !generating && (
            <div className={styles.generatePanel}>
              <Sparkles size={32} className={styles.generateIcon} />
              <h3 className={styles.generateTitle}>PDF Çevirisi Henüz Oluşturulmadı</h3>
              <p className={styles.generateDesc}>
                Bu belge eski sistemle çevrildi. Bir kez oluşturun — kalıcı olarak kaydedilir,
                sonra anında açılır. Grafikler ve görseller orijinal kalır.
              </p>
              <button className={styles.generateBtn} onClick={generateOverlay}>
                <Sparkles size={15} /> PDF Çevirisini Oluştur
              </button>
            </div>
          )}

          {/* Overlay üretim ilerlemesi */}
          {generating && (
            <div className={styles.generatePanel}>
              <Loader size={32} className={`${styles.generateIcon} ${styles.spin}`} />
              <h3 className={styles.generateTitle}>Çeviri Üretiliyor</h3>
              <p className={styles.generateDesc}>{genProgress.message}</p>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressBarFill}
                  style={{ width: `${genProgress.total ? (genProgress.current / genProgress.total) * 100 : 0}%` }}
                />
              </div>
              <p className={styles.progressLabel}>
                {genProgress.current} / {genProgress.total} sayfa
                {genProgress.eta != null && genProgress.eta > 0 && ` • ~${genProgress.eta} sn kaldı`}
              </p>
              <button className={styles.cancelBtn} onClick={() => abortRef.current?.abort()}>İptal</button>
            </div>
          )}

          {/* Sayfa görüntüsü */}
          {!loading && !loadError && pdfProxy && !generating && (
            <div className={`${styles.pageWrapper} ${sideBySide ? styles.pageWrapperSbs : ''}`}>
              {/* ── Tek sayfa modu ── */}
              {!sideBySide && (
                <div
                  className={styles.pageContainer}
                  style={{
                    width: scale === 1 ? undefined : `${760 * scale}px`,
                    maxWidth: scale === 1 ? undefined : 'none',
                  }}
                >
                  <AnimatePresence mode="wait">
                    {currentImage ? (
                      <motion.img
                        key={`${showingTranslated ? 'tr' : 'orig'}-p${currentPage}`}
                        src={currentImage}
                        alt={`Sayfa ${currentPage}`}
                        className={styles.pageImg}
                        draggable={false}
                        onDragStart={e => e.preventDefault()}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                      />
                    ) : (
                      <motion.div key="page-loading" className={styles.pageLoading} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <Loader size={22} className={styles.spin} />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {showTranslation && building && (
                    <div className={styles.buildingBadge}>
                      <Loader size={11} className={styles.spin} />
                      <span>Çeviri hazırlanıyor…</span>
                    </div>
                  )}
                  <AnimatePresence>
                    {buildDone && showTranslation && !building && (
                      <motion.div className={styles.readyBadge} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                        <CheckCircle2 size={11} /><span>PyMuPDF</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {buildError && showTranslation && (
                    <div className={styles.errorBadge}><AlertCircle size={13} /><span>{buildError}</span></div>
                  )}
                </div>
              )}

              {/* ── Yan yana modu ── */}
              {sideBySide && (
                <div className={styles.sbsRow}>
                  {/* Sol: Orijinal */}
                  <div className={styles.sbsCol}>
                    <div className={styles.sbsLabel}>Orijinal</div>
                    <div
                      className={styles.pageContainer}
                      style={{
                        width: scale === 1 ? undefined : `${760 * scale}px`,
                        maxWidth: scale === 1 ? undefined : 'none',
                      }}
                    >
                      {pageImages[currentPage]
                        ? <img src={pageImages[currentPage]} alt="Orijinal" className={styles.pageImg} draggable={false} onDragStart={e => e.preventDefault()} />
                        : <div className={styles.pageLoading}><Loader size={20} className={styles.spin} /></div>
                      }
                    </div>
                  </div>
                  {/* Sağ: Çeviri */}
                  <div className={styles.sbsCol}>
                    <div className={styles.sbsLabel} style={{ color: 'var(--color-accent)' }}>
                      Türkçe
                      {building && <Loader size={11} className={styles.spin} style={{ marginLeft: 6 }} />}
                    </div>
                    <div
                      className={styles.pageContainer}
                      style={{
                        width: scale === 1 ? undefined : `${760 * scale}px`,
                        maxWidth: scale === 1 ? undefined : 'none',
                      }}
                    >
                      {translatedImages[currentPage]
                        ? <img src={translatedImages[currentPage]} alt="Çeviri" className={styles.pageImg} draggable={false} onDragStart={e => e.preventDefault()} />
                        : pageImages[currentPage]
                          ? <div className={styles.pageLoading}><Loader size={20} className={styles.spin} /><span style={{ fontSize: 12, marginTop: 8 }}>Hazırlanıyor…</span></div>
                          : <div className={styles.pageLoading}><Loader size={20} className={styles.spin} /></div>
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Alt bilgi ────────────────────────────────────────────── */}
        <div className={styles.footer}>
          <span className={styles.footerNote}>
            {showingTranslated
              ? 'Metinler Türkçeye çevrildi — grafikler ve görseller orijinal kalır.'
              : 'Orijinal belge gösteriliyor.'
            }
          </span>
          {building && (
            <span className={styles.footerStatus}>
              <Loader size={11} className={styles.spin} /> Hazırlanıyor…
            </span>
          )}
          {buildDone && !building && (
            <span className={styles.footerStatus} style={{ color: 'var(--color-success)' }}>
              <CheckCircle2 size={11} /> Hazır
            </span>
          )}
        </div>

        {/* ── Çeviri editörü (modal içi panel) ─────────────────────── */}
        <AnimatePresence>
          {showEditor && localOverlay && (
            <motion.div
              key="editor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{ position: 'absolute', inset: 0, zIndex: 20 }}
            >
              <TranslationEditor
                overlay={localOverlay}
                currentPage={currentPage}
                onSave={(updated) => {
                  setLocalOverlay(updated);
                  setShowEditor(false);
                }}
                onClose={() => setShowEditor(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
