import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Clock,
  Coins,
  Download,
  FileText,
  Globe,
  Languages,
  MessageSquare,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../context/auth';
import { supabase } from '../lib/supabase';
import { detectLanguage, translateDocument } from '../lib/ai';
import { SUPPORTED_LANGUAGES, TARGET_LANGUAGE } from '../lib/constants';
import type { TranslationStep } from '../types';
import styles from '../styles/components/translator.module.css';

interface PdfTextItem {
  str: string;
}

const steps: Array<{ id: TranslationStep; label: string }> = [
  { id: 'upload', label: 'Dosya' },
  { id: 'config', label: 'Dil' },
  { id: 'progress', label: 'İşlem' },
  { id: 'result', label: 'Sonuç' },
];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TranslatorPage() {
  const { profile } = useAuth();
  const reducedMotion = useReducedMotion();
  const [step, setStep] = useState<TranslationStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [sourceLang, setSourceLang] = useState('auto');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [detailText, setDetailText] = useState('');
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && dropped.type === 'application/pdf') {
      setFile(dropped);
      setStep('config');
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setStep('config');
    }
  };

  const clearFile = () => {
    setFile(null);
    setError('');
    setProgress(0);
    setStep('upload');
  };

  const startTranslation = async () => {
    if (!file || !profile) return;
    setStep('progress');
    setProgress(0);
    setError('');

    try {
      setStatusText('Dosya yükleniyor');
      setDetailText(file.name);
      setProgress(10);
      const filePath = `${profile.id}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage.from('originals').upload(filePath, file);
      if (uploadErr) throw new Error(`Dosya yüklenemedi: ${uploadErr.message}`);

      setStatusText('Doküman kaydediliyor');
      setProgress(20);
      const { data: docData, error: docErr } = await supabase.from('documents').insert({
        user_id: profile.id,
        original_name: file.name,
        original_storage_path: filePath,
        file_size_bytes: file.size,
        status: 'processing',
      }).select().single();
      if (docErr) throw new Error('Doküman oluşturulamadı');
      const docId = docData.id;

      setStatusText('Metin çıkarılıyor');
      setDetailText('PDF analiz ediliyor');
      setProgress(30);

      let text = '';
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i += 1) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map(item => ('str' in item ? (item as PdfTextItem).str : ''))
            .join(' ');
          fullText += `${pageText}\n\n`;
          setProgress(30 + Math.round((i / pdf.numPages) * 10));
        }

        text = fullText.trim();
        if (!text) throw new Error('PDF içinde okunabilir metin bulunamadı.');
      } catch (pdfErr) {
        throw new Error(`PDF okuma hatası: ${pdfErr instanceof Error ? pdfErr.message : 'Bilinmeyen hata'}`);
      }

      setStatusText('Dil tespit ediliyor');
      setProgress(44);
      let detectedLang = sourceLang;
      if (sourceLang === 'auto') {
        detectedLang = await detectLanguage(text.slice(0, 1000));
        setDetailText(`Tespit edilen dil: ${detectedLang.toUpperCase()}`);
      }

      setStatusText('Çevriliyor');
      setDetailText('AI çevirisi hazırlanıyor');
      setProgress(55);
      const translated = await translateDocument(text.slice(0, 10000), detectedLang, TARGET_LANGUAGE.code);
      setProgress(84);

      setStatusText('Sonuç kaydediliyor');
      setProgress(92);
      await supabase.from('translations').insert({
        document_id: docId,
        user_id: profile.id,
        target_language: TARGET_LANGUAGE.code,
        translated_text: { pages: [translated] },
        progress: 100,
        status: 'completed',
        credits_used: 1,
      });

      await supabase.from('documents').update({ status: 'completed', original_language: detectedLang }).eq('id', docId);
      await supabase.from('profiles').update({ credits_remaining: Math.max(0, profile.credits_remaining - 1) }).eq('id', profile.id);

      setProgress(100);
      setStatusText('Tamamlandı');
      setDetailText('Çeviri arşivinize kaydedildi');
      setStep('result');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Çeviri sırasında hata oluştu');
      setStep('result');
    }
  };

  const stepIndex = steps.findIndex(item => item.id === step);
  const circumference = 2 * Math.PI * 52;
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  const selectedLanguage = sourceLang === 'auto'
    ? 'Otomatik algılama'
    : SUPPORTED_LANGUAGES.find(lang => lang.code === sourceLang)?.name || sourceLang.toUpperCase();

  return (
    <div className={styles.translatorShell}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            <Languages size={14} />
            AI çeviri stüdyosu
          </span>
          <h1>Belgenizi temiz, okunabilir Türkçeye dönüştürün.</h1>
          <p>PDF yükleyin, kaynak dili seçin ve sonucu doküman arşivinizden indirin ya da AI asistanla inceleyin.</p>
        </div>
        <div className={styles.trustStrip}>
          <span><ShieldCheck size={15} /> Özel depolama</span>
          <span><Coins size={15} /> 1 kredi</span>
          <span><Clock size={15} /> Dakikalar içinde</span>
        </div>
      </section>

      <div className={styles.stepper} aria-label="Çeviri adımları">
        {steps.map((item, index) => (
          <div
            key={item.id}
            className={`${styles.stepItem} ${index < stepIndex ? styles.stepDone : ''} ${index === stepIndex ? styles.stepActive : ''}`}
          >
            <span>{index + 1}</span>
            <strong>{item.label}</strong>
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {(step === 'upload' || step === 'config') && (
          <motion.section
            key="configure"
            className={styles.workspace}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className={styles.uploadPanel}>
              <button
                type="button"
                className={`${styles.dropzone} ${dragActive ? styles.dropzoneActive : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileSelect} hidden />
                <motion.span
                  className={styles.dropIcon}
                  animate={reducedMotion ? undefined : { y: [0, -5, 0] }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Upload size={30} />
                </motion.span>
                <strong>PDF dosyanızı buraya bırakın</strong>
                <span>Sürükle-bırak veya cihazınızdan seçin</span>
                <small>Maksimum 100 MB</small>
              </button>

              {file && (
                <motion.div
                  className={styles.fileCard}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className={styles.fileIcon}><FileText size={20} /></div>
                  <div className={styles.fileMeta}>
                    <strong title={file.name}>{file.name}</strong>
                    <span>{formatSize(file.size)} · PDF</span>
                  </div>
                  <button type="button" onClick={clearFile} aria-label="Dosyayı kaldır">
                    <X size={18} />
                  </button>
                </motion.div>
              )}
            </div>

            <aside className={styles.configPanel}>
              <div className={styles.panelHeader}>
                <span><Globe size={15} /> Kaynak dil</span>
                <strong>{selectedLanguage}</strong>
              </div>

              <div className={styles.langGrid}>
                <button
                  type="button"
                  className={`${styles.langOption} ${styles.langAuto} ${sourceLang === 'auto' ? styles.langSelected : ''}`}
                  onClick={() => setSourceLang('auto')}
                >
                  <Search size={14} />
                  Otomatik
                </button>
                {SUPPORTED_LANGUAGES.map(lang => (
                  <button
                    type="button"
                    key={lang.code}
                    className={`${styles.langOption} ${sourceLang === lang.code ? styles.langSelected : ''}`}
                    onClick={() => setSourceLang(lang.code)}
                  >
                    <span>{lang.flag}</span>
                    {lang.name}
                  </button>
                ))}
              </div>

              <div className={styles.targetBox}>
                <span><ArrowRight size={15} /> Hedef dil</span>
                <strong>{TARGET_LANGUAGE.flag} {TARGET_LANGUAGE.nativeName}</strong>
              </div>

              <div className={styles.summaryBox}>
                <div>
                  <span>İşlem maliyeti</span>
                  <strong>1 kredi</strong>
                </div>
                <div>
                  <span>Kalan kredi</span>
                  <strong>{profile?.credits_remaining ?? 0}</strong>
                </div>
              </div>

              <button className={styles.startButton} type="button" onClick={startTranslation} disabled={!file}>
                <Sparkles size={16} />
                Çeviriyi Başlat
              </button>
            </aside>
          </motion.section>
        )}

        {step === 'progress' && (
          <motion.section
            key="progress"
            className={styles.processingPanel}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, y: -12 }}
          >
            <div className={styles.progressRing}>
              <svg width="132" height="132" viewBox="0 0 120 120">
                <defs>
                  <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#2454ff" />
                    <stop offset="100%" stopColor="#0f9f6e" />
                  </linearGradient>
                </defs>
                <circle className={styles.progressCircleBg} cx="60" cy="60" r="52" />
                <circle className={styles.progressCircle} cx="60" cy="60" r="52" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} />
              </svg>
              <strong>{progress}%</strong>
            </div>
            <h2>{statusText}</h2>
            <p>{detailText}</p>
            <div className={styles.processingTimeline}>
              {['Yükleme', 'Metin çıkarma', 'AI çeviri', 'Kaydetme'].map((label, index) => (
                <span key={label} className={progress >= [10, 30, 55, 92][index] ? styles.timelineDone : ''}>
                  {label}
                </span>
              ))}
            </div>
          </motion.section>
        )}

        {step === 'result' && (
          <motion.section
            key="result"
            className={styles.resultPanel}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            {error ? (
              <>
                <div className={`${styles.resultIcon} ${styles.resultError}`}><AlertCircle size={34} /></div>
                <h2>Çeviri tamamlanamadı</h2>
                <p>{error}</p>
              </>
            ) : (
              <>
                <div className={`${styles.resultIcon} ${styles.resultSuccess}`}><Check size={34} /></div>
                <h2>Çeviri arşive eklendi</h2>
                <p>Belgeniz Türkçeye çevrildi. Şimdi görüntüleyebilir, indirebilir veya AI asistana sorabilirsiniz.</p>
              </>
            )}
            <div className={styles.resultActions}>
              <button type="button" onClick={clearFile}>Yeni Çeviri</button>
              {!error && (
                <>
                  <Link to="/documents" className={styles.resultPrimary}><Download size={16} /> Dokümanlarım</Link>
                  <Link to="/chat"><MessageSquare size={16} /> AI'a Sor</Link>
                </>
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
