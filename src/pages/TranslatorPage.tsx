/**
 * TransLingua — TranslatorPage (Çeviri Sayfası)
 *
 * Kullanıcının PDF belgelerini yükleyip çeviriye gönderdiği
 * adım adım sihirbaz arayüzü. Supabase Storage + DB entegrasyonu vardır.
 * AI motoru: bağlandığında translateDocument() ve detectLanguage() devreye girer.
 */
import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, X, Check, AlertCircle, Download, MessageSquare, ArrowRight, Globe, Sparkles, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { translateDocument, detectLanguage } from '../lib/ai';
import * as pdfjsLib from 'pdfjs-dist';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
import { SUPPORTED_LANGUAGES, TARGET_LANGUAGE } from '../lib/constants';
import type { TranslationStep } from '../types';
import styles from '../styles/components/translator.module.css';

export default function TranslatorPage() {
  const { profile } = useAuth();
  const [step, setStep] = useState<TranslationStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [sourceLang, setSourceLang] = useState('auto');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [detailText, setDetailText] = useState('');
  const [error, setError] = useState('');
  const [_resultDocId, setResultDocId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  // ── Sürükle-bırak yöneticileri ──────────────────────────────
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type === 'application/pdf') setFile(f);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  /** Byte cinsinden boyutu okunabilir formata çevirir */
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  /**
   * Ana çeviri akışı:
   * 1. Dosyayı Supabase Storage'a yükle
   * 2. Veritabanında doküman kaydı oluştur
   * 3. Metin çıkar
   * 4. Dil tespiti yap (veya kullanıcı seçimini kullan)
   * 5. AI ile çevir
   * 6. Çeviri kaydını oluştur
   * 7. Doküman durumunu güncelle ve krediyi düş
   */
  const startTranslation = async () => {
    if (!file || !profile) return;
    setStep('progress'); setProgress(0); setError('');

    try {
      // Adım 1: Supabase Storage'a yükle
      setStatusText('Dosya yükleniyor'); setDetailText(file.name); setProgress(10);
      const filePath = `${profile.id}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage.from('originals').upload(filePath, file);
      if (uploadErr) throw new Error('Dosya yüklenemedi: ' + uploadErr.message);

      // Adım 2: Doküman kaydı oluştur
      setStatusText('Doküman kaydediliyor'); setProgress(20);
      const { data: docData, error: docErr } = await supabase.from('documents').insert({
        user_id: profile.id,
        original_name: file.name,
        original_storage_path: filePath,
        file_size_bytes: file.size,
        status: 'processing',
      }).select().single();
      if (docErr) throw new Error('Doküman oluşturulamadı');
      const docId = docData.id;

      // Adım 3: Metin çıkar (PDF Parsing)
      setStatusText('Metin çıkarılıyor'); setDetailText('PDF analiz ediliyor...'); setProgress(30);
      
      let text = '';
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += pageText + '\n\n';
        }
        text = fullText.trim();
        
        if (!text) throw new Error('PDF içinde okunabilir metin bulunamadı.');
      } catch (pdfErr) {
        throw new Error('PDF okuma hatası: ' + (pdfErr instanceof Error ? pdfErr.message : 'Bilinmeyen hata'));
      }

      // Adım 4: Dil tespiti
      setStatusText('Dil tespit ediliyor'); setProgress(40);
      let detectedLang = sourceLang;
      if (sourceLang === 'auto') {
        detectedLang = await detectLanguage(text.slice(0, 1000));
        setDetailText(`Tespit edilen dil: ${detectedLang}`);
      }

      // Adım 5: AI ile çevir
      setStatusText('Çevriliyor'); setDetailText('AI çevirisi devam ediyor...'); setProgress(50);
      const translated = await translateDocument(text.slice(0, 10000), detectedLang, TARGET_LANGUAGE.code);
      setProgress(80);

      // Adım 6: Çeviri kaydı oluştur
      setStatusText('Sonuç kaydediliyor'); setProgress(90);
      await supabase.from('translations').insert({
        document_id: docId, user_id: profile.id,
        target_language: TARGET_LANGUAGE.code,
        translated_text: { pages: [translated] },
        progress: 100, status: 'completed',
        credits_used: 1,
      });

      // Adım 7: Dokümanı güncelle ve krediyi düş
      await supabase.from('documents').update({ status: 'completed', original_language: detectedLang }).eq('id', docId);
      await supabase.from('profiles').update({ credits_remaining: Math.max(0, profile.credits_remaining - 1) }).eq('id', profile.id);

      setProgress(100); setResultDocId(docId); setStep('result');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Çeviri sırasında hata oluştu';
      setError(msg); setStep('result');
    }
  };

  const stepIndex = ['upload', 'config', 'progress', 'result'].indexOf(step);
  const circumference = 2 * Math.PI * 52;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className={styles.translator}>
      <h1 className={styles.pageTitle}>Belge Çevir</h1>
      <p className={styles.pageDesc}>PDF belgenizi yükleyin, AI ile profesyonel çeviri alın.</p>

      {/* İlerleme adım çubuğu */}
      <div className={styles.steps}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`${styles.step} ${i < stepIndex ? styles.stepDone : ''} ${i === stepIndex ? styles.stepActive : ''}`} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* Yükleme ve Yapılandırma Adımı */}
        {(step === 'upload' || step === 'config') && (
          <motion.div key="upload" className={styles.card} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <div
              className={`${styles.dropzone} ${dragActive ? styles.dropzoneActive : ''}`}
              onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileSelect} hidden />
              <div className={styles.dropIcon}><Upload size={28} /></div>
              <div className={styles.dropTitle}>PDF dosyanızı sürükleyin veya seçin</div>
              <div className={styles.dropHint}>Sadece PDF • Maks. 100 MB</div>
            </div>

            {file && (
              <div className={styles.fileInfo}>
                <div className={styles.fileInfoIcon}><FileText size={20} /></div>
                <div className={styles.fileInfoText}>
                  <div className={styles.fileInfoName}>{file.name}</div>
                  <div className={styles.fileInfoSize}>{formatSize(file.size)}</div>
                </div>
                <button className={styles.fileRemove} onClick={() => setFile(null)}><X size={18} /></button>
              </div>
            )}

            {file && (
              <div className={styles.configSection}>
                <div className={styles.configLabel}><Globe size={16} /> Kaynak Dil</div>
                <div className={styles.langGrid}>
                  <button className={`${styles.langOption} ${styles.langAuto} ${sourceLang === 'auto' ? styles.langSelected : ''}`} onClick={() => setSourceLang('auto')}>
                    <Search size={14} /> Otomatik Algıla
                  </button>
                  {SUPPORTED_LANGUAGES.map(l => (
                    <button key={l.code} className={`${styles.langOption} ${sourceLang === l.code ? styles.langSelected : ''}`} onClick={() => setSourceLang(l.code)}>
                      {l.flag} {l.name}
                    </button>
                  ))}
                </div>
                <div className={styles.configLabel} style={{ marginTop: 'var(--space-5)' }}><ArrowRight size={16} /> Hedef Dil</div>
                <div className={styles.targetLang}>
                  <span className={styles.targetFlag}>{TARGET_LANGUAGE.flag}</span>
                  <span className={styles.targetText}>{TARGET_LANGUAGE.nativeName} ({TARGET_LANGUAGE.name})</span>
                </div>
              </div>
            )}

            {/* Demo modu bildirimi */}
            <div className={styles.demoNotice}>
              <Sparkles size={14} />
              <span>AI motoru entegrasyon aşamasında. Dosya yükleme ve kayıt işlemleri aktif.</span>
            </div>

            <div className={styles.actions}>
              <button className={styles.btnPrimary} onClick={startTranslation} disabled={!file}>
                Çeviriyi Başlat
              </button>
            </div>
          </motion.div>
        )}

        {/* İşlem Adımı */}
        {step === 'progress' && (
          <motion.div key="progress" className={styles.card} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <div className={styles.progressSection}>
              <div className={styles.progressRing}>
                <svg width="120" height="120" viewBox="0 0 120 120">
                  <defs><linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#667EEA" /><stop offset="100%" stopColor="#764BA2" /></linearGradient></defs>
                  <circle className={styles.progressCircleBg} cx="60" cy="60" r="52" />
                  <circle className={styles.progressCircle} cx="60" cy="60" r="52" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} />
                </svg>
                <div className={styles.progressPercent}>{progress}%</div>
              </div>
              <div className={styles.progressStatus}>{statusText}</div>
              <div className={styles.progressDetail}>{detailText}</div>
            </div>
          </motion.div>
        )}

        {/* Sonuç Adımı */}
        {step === 'result' && (
          <motion.div key="result" className={styles.card} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <div className={styles.resultSection}>
              {error ? (
                <>
                  <div className={`${styles.resultIcon} ${styles.resultError}`}><AlertCircle size={32} /></div>
                  <h2 className={styles.resultTitle}>Çeviri Başarısız</h2>
                  <p className={styles.resultDesc}>{error}</p>
                </>
              ) : (
                <>
                  <div className={`${styles.resultIcon} ${styles.resultSuccess}`}><Check size={32} /></div>
                  <h2 className={styles.resultTitle}>Çeviri Tamamlandı!</h2>
                  <p className={styles.resultDesc}>Belgeniz başarıyla Türkçe'ye çevrildi.</p>
                </>
              )}
              <div className={styles.resultActions}>
                <button className={styles.resultBtn} onClick={() => { setStep('upload'); setFile(null); setError(''); }}>
                  Yeni Çeviri
                </button>
                {!error && (
                  <>
                    <Link to="/documents" className={`${styles.resultBtn} ${styles.resultBtnPrimary}`}><Download size={16} /> Dokümanlarım</Link>
                    <Link to="/chat" className={styles.resultBtn}><MessageSquare size={16} /> AI'a Sor</Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
