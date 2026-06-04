/**
 * TransLingua — TranslatorPage (Çeviri Sayfası)
 *
 * Yeni nesil çeviri akışı:
 *  - Sayfa sadece UI sunar; çeviri işi TranslationContext üzerinden yürütülür
 *  - Kullanıcı 'Bu sayfada kal' veya 'Arka plana al' seçeneklerinden birini seçer
 *  - Sayfa-bazında canlı ilerleme (tile grid'i + faz göstergeleri + log)
 *  - Bitince: indir (PDF), dokümanlarım, yeni çeviri
 *  - Görsel çeviri: PDF'de çevrilebilir görseller varsa kullanıcıya sorar
 */
import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Upload, FileText, X, Check, AlertCircle, Download, MessageSquare,
  ArrowRight, Info, Search, MonitorPlay, BellRing, AlertTriangle,
  Loader, Pause, ImageIcon, Eye, ChevronDown,
  HeartPulse, Scale, Sigma, Wrench, Cpu, TrendingUp, Sparkles, RotateCcw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { SPRING_TIGHT } from '../components/ui/motion';
import { useAuth } from '../context/AuthContext';
import { useTranslationJob, type ActiveJob } from '../context/TranslationContext';
import { SUPPORTED_LANGUAGES, TARGET_LANGUAGE } from '../lib/constants';
import { permissionState, requestPermission, notificationsSupported } from '../lib/notifications';
import { getServiceCapabilities, checkForTranslatableImages, type ServiceCapabilities } from '../lib/pdfExtractorService';
import { supabase } from '../lib/supabase';
import styles from '../styles/components/translator.module.css';

// pdf-lib (~1.2MB) + pdf.js render zinciri yalnızca önizleme açılınca yüklensin.
const PDFOverlayViewer = lazy(() => import('../components/PDFOverlayViewer'));

type Step = 'upload' | 'mode' | 'progress' | 'result';

export default function TranslatorPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { job, start, cancel, setMode, dismiss, downloadResult } = useTranslationJob();

  const [file, setFile] = useState<File | null>(null);
  const [sourceLang, setSourceLang] = useState('auto');
  const [domain, setDomain] = useState('general');
  const [glossaryEntries, setGlossaryEntries] = useState<Array<{ source_term: string; target_term: string; domain: string }>>([]);
  const [chosenMode, setChosenMode] = useState<'foreground' | 'background'>('foreground');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activity, setActivity] = useState<Array<{ ts: number; text: string }>>([]);
  const lastMsgRef = useRef<string>('');
  const [translateImages, setTranslateImages] = useState(false);
  const [hasImages, setHasImages] = useState(false);
  const [checkingImages, setCheckingImages] = useState(false);
  const [caps, setCaps] = useState<ServiceCapabilities>({ available: false });
  const [showPreview, setShowPreview] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  // Tamamlanan çevirinin in-app önizlemesi için kaynak PDF'in object URL'i.
  // Yalnızca dosya bellekteyken (bu oturumda çevrildiyse) üretilir.
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  // Backend yetenek tespiti — bir kez kontrol
  useEffect(() => {
    let cancel = false;
    getServiceCapabilities().then(c => { if (!cancel) setCaps(c); });
    return () => { cancel = true; };
  }, []);

  // Kullanıcının terim sözlüğünü yükle
  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from('glossaries')
      .select('source_term, target_term, domain')
      .eq('user_id', profile.id)
      .limit(2000)
      .then(({ data }) => { if (data) setGlossaryEntries(data); });
  }, [profile?.id]);

  // Şu anki adımı belirleme: aktif iş varsa progress/result, yoksa form
  const step: Step = useMemo(() => {
    if (job?.status === 'running') return 'progress';
    if (job && (job.status === 'completed' || job.status === 'error' || job.status === 'cancelled')) return 'result';
    if (file) return 'mode';
    return 'upload';
  }, [file, job]);

  // İlerleme mesajı log'a düşsün
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    if (job.message && job.message !== lastMsgRef.current) {
      lastMsgRef.current = job.message;
      setActivity(prev => {
        const next = [...prev, { ts: Date.now(), text: job.message }];
        return next.slice(-20);
      });
    }
  }, [job?.message, job?.status]);

  // ── Sürükle-bırak ──
  const onDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    if (e.type === 'dragleave') setDragActive(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type === 'application/pdf') handleFileSet(f);
    else if (f) toast.error('Sadece PDF kabul edilir.');
  };
  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFileSet(f);
  };

  // Dosya seçildiğinde görselleri kontrol et
  const handleFileSet = (f: File) => {
    setFile(f);
    setHasImages(false);
    setTranslateImages(false);
    // Backend varsa, PDF'de çevrilebilir görsel olup olmadığını kontrol et
    if (caps.available) {
      setCheckingImages(true);
      checkForTranslatableImages(f)
        .then(has => {
          setHasImages(has);
          if (has) setTranslateImages(true); // varsayılan: çevir
        })
        .catch(() => setHasImages(false))
        .finally(() => setCheckingImages(false));
    }
  };

  const formatSize = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  };

  const handleStart = async () => {
    if (!file || !profile) return;

    if (chosenMode === 'background') {
      // Bildirim izni iste — başarısız olursa kullanıcıyı bilgilendir
      if (notificationsSupported() && permissionState() === 'default') {
        const result = await requestPermission();
        if (result !== 'granted') {
          toast('Bildirim izni verilmedi — bitince yine de toast ile uyaracağız.', { icon: '🔔', duration: 5000 });
        }
      }
    }

    setActivity([]);
    lastMsgRef.current = '';
    const glossary = Object.fromEntries(
      glossaryEntries
        .filter(e => e.domain === domain || e.domain === 'general')
        .map(e => [e.source_term, e.target_term]),
    );
    await start({
      file,
      sourceLang,
      domain,
      glossary: Object.keys(glossary).length > 0 ? glossary : undefined,
      userId: profile.id,
      credits: profile.credits_remaining,
      mode: chosenMode,
      translateImages: translateImages && hasImages,
    });
  };

  const handleReset = () => {
    setFile(null);
    setSourceLang('auto');
    setDomain('general');
    setChosenMode('foreground');
    setActivity([]);
    setHasImages(false);
    setTranslateImages(false);
    setShowPreview(false);
    dismiss();
  };

  const stepIndex = ['upload', 'mode', 'progress', 'result'].indexOf(step);

  return (
    <div className={styles.translator}>
      <div className={styles.hero}>
        <span className={styles.heroEyebrow}><Sparkles size={13} /> AI Belge Çevirisi</span>
        <h1 className={styles.pageTitle}>
          Belgeni <span className={styles.titleAccent}>Türkçeye</span> çevir
        </h1>
        <p className={styles.pageDesc}>
          PDF'ini yükle — metni yapay zekâ ile Türkçeye çevirelim. Grafikler, resimler ve şekiller orijinal hâliyle korunur.
        </p>
      </div>

      {/* Adım çubuğu */}
      <div className={styles.steps}>
        {(['Yükle', 'Ayarla', 'Çevir', 'Sonuç'] as const).map((label, i) => {
          const isDone = i < stepIndex;
          const isActive = i === stepIndex;
          return (
            <div key={i} className={styles.step}>
              <div className={`${styles.stepDot} ${isDone ? styles.stepDotDone : ''} ${isActive ? styles.stepDotActive : ''}`}>
                {isDone ? <Check size={12} /> : i + 1}
              </div>
              <span className={`${styles.stepName} ${isDone ? styles.stepNameDone : ''} ${isActive ? styles.stepNameActive : ''}`}>
                {label}
              </span>
              {i < 3 && (
                <div className={`${styles.stepLine} ${isDone ? styles.stepLineDone : ''} ${isActive ? styles.stepLineActive : ''}`} />
              )}
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {/* ───────────────────── 1) Yükleme + Mod ────────────────────── */}
        {(step === 'upload' || step === 'mode') && (
          <motion.div
            key="upload"
            className={styles.card}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            {!file && (
              <motion.div
                className={`${styles.dropzone} ${dragActive ? styles.dropzoneActive : ''}`}
                onDragEnter={onDrag} onDragLeave={onDrag} onDragOver={onDrag} onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                whileHover={reduced ? undefined : { scale: 1.005 }}
                whileTap={reduced ? undefined : { scale: 0.995 }}
                animate={dragActive && !reduced ? { scale: 1.02 } : { scale: 1 }}
                transition={SPRING_TIGHT}
              >
                <input ref={fileInputRef} type="file" accept="application/pdf" onChange={onSelect} hidden />
                <motion.div
                  className={styles.dropIcon}
                  animate={reduced ? undefined : { y: [0, -6, 0] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Upload size={28} />
                </motion.div>
                <div className={styles.dropTitle}>PDF'ini sürükle ya da seç</div>
                <div className={styles.dropHint}>Sadece PDF • Maks. 100 MB</div>
              </motion.div>
            )}

            <AnimatePresence>
              {file && (
                <motion.div
                  className={styles.fileInfo}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.28 }}
                >
                  <div className={styles.fileInfoIcon}><FileText size={22} /></div>
                  <div className={styles.fileInfoText}>
                    <div className={styles.fileInfoName}>{file.name}</div>
                    <div className={styles.fileInfoSize}>{formatSize(file.size)} · PDF</div>
                  </div>
                  <motion.button
                    className={styles.fileRemove}
                    onClick={() => { setFile(null); setLangOpen(false); }}
                    title="Dosyayı kaldır"
                    whileHover={reduced ? undefined : { rotate: 90, scale: 1.1 }}
                    whileTap={reduced ? undefined : { scale: 0.9 }}
                    transition={SPRING_TIGHT}
                  >
                    <X size={18} />
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {file && (
                <motion.div
                  className={styles.configSection}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.32, delay: 0.05 }}
                >
                  {/* ── Diller: kompakt seçici → hedef ── */}
                  <div className={styles.fieldLabel}>Diller</div>
                  <div className={styles.langPair}>
                    <button
                      type="button"
                      className={`${styles.langPicker} ${langOpen ? styles.langPickerOpen : ''}`}
                      onClick={() => setLangOpen(o => !o)}
                    >
                      <span className={styles.langPickerLabel}>
                        {sourceLang === 'auto' ? (
                          <><Search size={15} /> Otomatik Algıla</>
                        ) : (() => {
                          const l = SUPPORTED_LANGUAGES.find(x => x.code === sourceLang);
                          return <>{l?.flag} {l?.name ?? 'Kaynak dil'}</>;
                        })()}
                      </span>
                      <ChevronDown size={16} className={styles.langChevron} />
                    </button>
                    <span className={styles.langArrow}><ArrowRight size={16} /></span>
                    <div className={styles.langTarget}>
                      <span className={styles.langTargetFlag}>{TARGET_LANGUAGE.flag}</span>
                      <span>{TARGET_LANGUAGE.name}</span>
                    </div>
                  </div>

                  <AnimatePresence>
                    {langOpen && (
                      <motion.div
                        className={styles.langPanel}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.24 }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div className={styles.langGrid}>
                          <button
                            className={`${styles.langOption} ${styles.langAuto} ${sourceLang === 'auto' ? styles.langSelected : ''}`}
                            onClick={() => { setSourceLang('auto'); setLangOpen(false); }}
                          >
                            <Search size={14} /> Otomatik Algıla
                          </button>
                          {SUPPORTED_LANGUAGES.map(l => (
                            <button
                              key={l.code}
                              className={`${styles.langOption} ${sourceLang === l.code ? styles.langSelected : ''}`}
                              onClick={() => { setSourceLang(l.code); setLangOpen(false); }}
                            >
                              {l.flag} {l.name}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* ── Belge alanı ── */}
                  <div className={styles.fieldLabel} style={{ marginTop: 'var(--space-6)' }}>Belge alanı</div>
                  <div className={styles.domainGrid}>
                    {([
                      { id: 'general',     label: 'Genel',        icon: <FileText size={16} /> },
                      { id: 'medical',     label: 'Tıp',          icon: <HeartPulse size={16} /> },
                      { id: 'legal',       label: 'Hukuk',        icon: <Scale size={16} /> },
                      { id: 'math',        label: 'Matematik',    icon: <Sigma size={16} /> },
                      { id: 'engineering', label: 'Mühendislik',  icon: <Wrench size={16} /> },
                      { id: 'cs',          label: 'Bilgisayar',   icon: <Cpu size={16} /> },
                      { id: 'economics',   label: 'İktisat',      icon: <TrendingUp size={16} /> },
                    ] as const).map(d => (
                      <button
                        key={d.id}
                        className={`${styles.domainCard} ${domain === d.id ? styles.domainCardActive : ''}`}
                        onClick={() => setDomain(d.id)}
                        type="button"
                      >
                        <span className={styles.domainCardIcon}>{d.icon}</span>
                        <span className={styles.domainCardLabel}>{d.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* ── Çeviri modu ── */}
                  <div className={styles.fieldLabel} style={{ marginTop: 'var(--space-6)' }}>Çeviri modu</div>
                  <div className={styles.modeChoice}>
                    <button
                      className={`${styles.modeCard} ${chosenMode === 'foreground' ? styles.modeCardActive : ''}`}
                      onClick={() => setChosenMode('foreground')}
                      type="button"
                    >
                      <span className={styles.modeRadio} aria-hidden />
                      <span className={styles.modeBody}>
                        <span className={styles.modeCardTitle}><MonitorPlay size={15} /> Bu sayfada kal</span>
                        <span className={styles.modeCardDesc}>İlerlemeyi canlı izle. Sekmeyi kapatma.</span>
                      </span>
                    </button>
                    <button
                      className={`${styles.modeCard} ${chosenMode === 'background' ? styles.modeCardActive : ''}`}
                      onClick={() => setChosenMode('background')}
                      type="button"
                    >
                      <span className={styles.modeRadio} aria-hidden />
                      <span className={styles.modeBody}>
                        <span className={styles.modeCardTitle}><BellRing size={15} /> Arka planda çevir</span>
                        <span className={styles.modeCardDesc}>Gezinmeye devam et — bitince haber veririz.</span>
                      </span>
                    </button>
                  </div>

                  {/* ── Görsel çevirisi (görseller varsa) ── */}
                  {(hasImages || checkingImages) && (
                    <>
                      <div className={styles.fieldLabel} style={{ marginTop: 'var(--space-6)' }}>Görsel çevirisi</div>
                      {checkingImages ? (
                        <div className={styles.hint}>
                          <Loader size={14} style={{ animation: 'spin 0.9s linear infinite', color: 'var(--color-accent)' }} />
                          <span>Görseller kontrol ediliyor…</span>
                        </div>
                      ) : hasImages ? (
                        <button
                          type="button"
                          className={`${styles.modeCard} ${translateImages ? styles.modeCardActive : ''}`}
                          onClick={() => setTranslateImages(prev => !prev)}
                          style={{ width: '100%' }}
                        >
                          <span className={styles.modeRadio} aria-hidden />
                          <span className={styles.modeBody}>
                            <span className={styles.modeCardTitle}><ImageIcon size={15} /> Görsellerdeki metinleri de çevir</span>
                            <span className={styles.modeCardDesc}>
                              PDF içindeki grafik, diyagram ve şekillerde bulunan metinler de Türkçeye çevrilir.
                            </span>
                          </span>
                        </button>
                      ) : null}
                    </>
                  )}

                  {/* ── İnce uyarı ── */}
                  {chosenMode === 'foreground' ? (
                    <div className={styles.hint}>
                      <AlertTriangle size={15} />
                      <span>Çeviri bu pencerede çalışır — sekmeyi kapatma. Başka sayfada gezmek istersen <strong>Arka planda çevir</strong>'i seç.</span>
                    </div>
                  ) : (
                    <div className={`${styles.hint} ${styles.hintInfo}`}>
                      <BellRing size={15} style={{ color: 'var(--color-accent)' }} />
                      <span>İstediğin sayfada gezinebilirsin; bitince bildirim göndeririz. Yine de tarayıcıyı kapatma.</span>
                    </div>
                  )}

                  {/* ── Footer: kredi + servis durumu + başlat ── */}
                  <div className={styles.footerBar}>
                    <div className={styles.footerMeta}>
                      <span className={styles.footerCredit}>
                        <Info size={14} /> Sayfa başına <strong>1 kredi</strong> · {profile?.credits_remaining ?? 0} kredin var
                      </span>
                      <span className={`${styles.serviceBadge} ${caps.redactionWrite ? styles.serviceOn : styles.serviceOff}`}>
                        {caps.redactionWrite
                          ? <><Check size={12} /> Profesyonel mod</>
                          : <><AlertTriangle size={12} /> Standart mod</>}
                      </span>
                    </div>
                    <motion.button
                      className={styles.btnPrimary}
                      onClick={handleStart}
                      disabled={!file}
                      whileHover={reduced || !file ? undefined : { y: -2 }}
                      whileTap={reduced || !file ? undefined : { scale: 0.97 }}
                      transition={SPRING_TIGHT}
                    >
                      Çeviriyi Başlat <ArrowRight size={18} />
                    </motion.button>
                  </div>

                  {!caps.redactionWrite && (
                    <div className={styles.serviceNote}>
                      PDF servisi bağlı değil — çeviri yine çalışır. En temiz çıktı için <code>cd backend &amp;&amp; uvicorn main:app --port 5050</code> ile servisi başlat.
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ───────────────────── 2) İlerleme ─────────────────────── */}
        {step === 'progress' && job && (
          <motion.div
            key="progress"
            className={styles.card}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <ProgressView job={job} activity={activity} onCancel={cancel} onToggleMode={() => setMode(job.mode === 'foreground' ? 'background' : 'foreground')} />
          </motion.div>
        )}

        {/* ───────────────────── 3) Sonuç ─────────────────────── */}
        {step === 'result' && job && (
          <motion.div
            key="result"
            className={styles.card}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className={styles.resultSection}>
              {job.status === 'error' || job.status === 'cancelled' ? (
                <>
                  <motion.div
                    className={`${styles.resultIcon} ${styles.resultError}`}
                    initial={{ scale: 0, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 360, damping: 16 }}
                  >
                    <AlertCircle size={32} />
                  </motion.div>
                  <h2 className={styles.resultTitle}>
                    {job.status === 'cancelled' ? 'Çeviri İptal Edildi' : 'Çeviri Başarısız'}
                  </h2>
                  <p className={styles.resultDesc}>{job.errorMessage || job.message}</p>
                </>
              ) : (
                <>
                  <motion.div
                    className={`${styles.resultIcon} ${styles.resultSuccess}`}
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.15, 1] }}
                    transition={{ duration: 0.5, times: [0, 0.6, 1] }}
                  >
                    <Check size={32} />
                  </motion.div>
                  <h2 className={styles.resultTitle}>Çeviri Tamamlandı!</h2>
                  <p className={styles.resultDesc}>
                    Belgeniz Türkçeye çevrildi — grafikler, resimler ve şekiller orijinal kalitede korundu.
                  </p>
                </>
              )}

              <motion.div
                className={styles.resultActions}
                initial="hidden"
                animate="visible"
                variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06, delayChildren: 0.3 } } }}
              >
                <motion.button
                  className={styles.resultBtn}
                  onClick={handleReset}
                  variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                >
                  <RotateCcw size={15} /> Yeni Çeviri
                </motion.button>
                {job.status === 'completed' && (
                  <>
                    {previewUrl && job.overlay && (
                      <motion.button
                        className={`${styles.resultBtn} ${styles.resultBtnPrimary}`}
                        onClick={() => setShowPreview(true)}
                        variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                      >
                        <Eye size={16} /> Önizle
                      </motion.button>
                    )}
                    <motion.button
                      className={styles.resultBtn}
                      onClick={downloadResult}
                      variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                    >
                      <Download size={16} /> PDF İndir
                    </motion.button>
                    <motion.button
                      className={styles.resultBtn}
                      onClick={() => navigate('/documents')}
                      variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                    >
                      <FileText size={16} /> Dokümanlarım
                    </motion.button>
                    <motion.div variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
                      <Link to="/chat" className={styles.resultBtn}><MessageSquare size={16} /> AI'a Sor</Link>
                    </motion.div>
                  </>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* In-app önizleme — tamamlanan çevirinin tam ekran görüntüleyicisi */}
      {showPreview && previewUrl && job?.overlay && (
        <Suspense fallback={null}>
          <PDFOverlayViewer
            pdfUrl={previewUrl}
            documentName={file?.name ?? 'Çeviri'}
            sourceLang={job.overlay.sourceLang}
            overlayData={job.overlay}
            onClose={() => setShowPreview(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

// ─── Alt bileşen: ilerleme görünümü ────────────────────────────────────────
function ProgressView({
  job, activity, onCancel, onToggleMode,
}: {
  job: ActiveJob;
  activity: Array<{ ts: number; text: string }>;
  onCancel: () => void;
  onToggleMode: () => void;
}) {
  const circumference = 2 * Math.PI * 52;
  const dash = circumference - (job.progress / 100) * circumference;

  const phases = [
    { key: 'uploading', label: 'Yükleme', match: ['uploading'] },
    { key: 'extracting', label: 'Metin çıkarma', match: ['extracting', 'loading'] },
    { key: 'translating', label: 'AI çevirisi', match: ['translating'] },
    { key: 'translating-images', label: 'Görsel çevirisi', match: ['translating-images'] },
    { key: 'saving', label: 'Kaydetme', match: ['saving', 'finalizing'] },
  ] as const;

  const order = ['uploading', 'loading', 'extracting', 'translating', 'translating-images', 'finalizing', 'saving', 'completed'];
  const currentIdx = order.indexOf(job.phase);

  return (
    <div className={styles.progressSection}>
      <motion.div
        className={styles.progressRing}
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <svg width="120" height="120" viewBox="0 0 120 120">
          <defs>
            <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0057FF" />
              <stop offset="100%" stopColor="#0EA5E9" />
            </linearGradient>
          </defs>
          <circle className={styles.progressCircleBg} cx="60" cy="60" r="52" />
          <circle className={styles.progressCircle} cx="60" cy="60" r="52" strokeDasharray={circumference} strokeDashoffset={dash} />
        </svg>
        <div className={styles.progressPercent}>{job.progress}%</div>
      </motion.div>

      <motion.div
        key={job.message}
        className={styles.progressStatus}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {job.message}
      </motion.div>

      <div className={styles.progressDetail}>
        {job.totalPages > 0 && (
          <>
            {job.completedPages}/{job.totalPages} sayfa
            {job.etaSeconds != null && job.etaSeconds > 0 && ` • ~${formatEta(job.etaSeconds)} kaldı`}
          </>
        )}
        {job.detail && <span style={{ marginLeft: 8 }}>• {job.detail}</span>}
      </div>

      {/* Faz göstergeleri */}
      <div className={styles.phaseSteps}>
        {phases.map((p, i) => {
          const phaseStartIdx = Math.min(...p.match.map(m => order.indexOf(m)));
          const isActive = p.match.some(m => m === job.phase);
          const isDone = currentIdx > phaseStartIdx && !isActive;
          return (
            <div
              key={p.key}
              className={`${styles.phaseRow} ${isActive ? styles.phaseRowActive : ''} ${isDone ? styles.phaseRowDone : ''}`}
            >
              <div className={styles.phaseDot}>
                {isDone ? <Check size={10} /> : isActive ? <Loader size={10} style={{ animation: 'spin 0.9s linear infinite' }} /> : i + 1}
              </div>
              <span>{p.label}</span>
            </div>
          );
        })}
      </div>

      {/* Sayfa tile grid'i */}
      {job.pageStatuses && job.totalPages > 0 && (
        <div className={styles.tilesWrap}>
          <div className={styles.tilesTitle}>
            <span>Sayfa Durumu</span>
            <span>{job.completedPages}/{job.totalPages}</span>
          </div>
          <div className={styles.tiles}>
            {Array.from({ length: job.totalPages }, (_, i) => {
              const s = job.pageStatuses![i] ?? 0;
              const cls =
                s === 3 ? styles.tileDone :
                s === 2 ? styles.tileTranslating :
                s === 1 ? styles.tileExtracting :
                s === 4 ? styles.tileError : styles.tilePending;
              return (
                <div key={i} className={`${styles.tile} ${cls}`} title={`Sayfa ${i + 1}`}>
                  {i + 1}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Canlı log */}
      {activity.length > 0 && (
        <div className={styles.activityLog}>
          {activity.slice(-6).map((a, i) => (
            <div key={i} className={styles.activityRow}>
              <span className={styles.activityTime}>{formatClock(a.ts)}</span>
              <span>{a.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Orta kontroller */}
      <div className={styles.midControls}>
        <button className={styles.midBtn} onClick={onToggleMode} type="button">
          {job.mode === 'foreground'
            ? <><BellRing size={13} /> Arka plana al</>
            : <><MonitorPlay size={13} /> Sayfada izle</>}
        </button>
        <button className={`${styles.midBtn} ${styles.midBtnDanger}`} onClick={onCancel} type="button">
          <Pause size={13} /> İptal
        </button>
      </div>

      {job.mode === 'foreground' && (
        <div className={styles.warning} style={{ marginTop: 'var(--space-5)' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>Bu sekmeyi kapatmayın. Diğer sayfalara gitmek için <strong>Arka plana al</strong>'a tıklayın.</span>
        </div>
      )}
    </div>
  );
}

function formatEta(sec: number): string {
  if (sec < 60) return `${sec} sn`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} dk ${s} sn`;
}

function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
