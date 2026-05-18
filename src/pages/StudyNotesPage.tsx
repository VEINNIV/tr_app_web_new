/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { generateStudyNotes } from '../lib/ai';
import { exportMarkdownToPDF, exportMarkdownToDOCX, exportMarkdownToTxt } from '../lib/exporters';
import { STUDY_SUBJECTS, CREDIT_COSTS } from '../lib/constants';
import toast from 'react-hot-toast';
import {
  BookOpen, Upload, File as FileIcon, X, Check,
  Image as ImageIcon, Copy, RefreshCw, FileText, FileType, FileCode, Wand2,
} from 'lucide-react';
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
  const [step, setStep] = useState<Step>('upload');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [subject, setSubject] = useState(STUDY_SUBJECTS[0]);
  const [isDragging, setIsDragging] = useState(false);
  const [generatedNotes, setGeneratedNotes] = useState<string>('');
  const [streamingText, setStreamingText] = useState<string>('');
  const [exporting, setExporting] = useState<null | 'pdf' | 'docx' | 'txt'>(null);

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

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const startProcessing = async () => {
    if (!profile) return;
    if (files.length === 0) {
      toast.error('Lütfen en az bir dosya yükleyin.');
      return;
    }

    const totalCost = files.length * CREDIT_COSTS.STUDY_NOTES_PER_SOURCE;
    if (profile.credits_remaining < totalCost) {
      toast.error(`Yetersiz kredi. Bu işlem ${totalCost} kredi gerektiriyor.`);
      return;
    }

    setStep('processing');
    setStreamingText('');

    try {
      // 1. Atomic kredi düşümü — server-side RPC (consume_credits)
      const { error: creditErr } = await supabase.rpc('consume_credits', {
        p_action: 'study_notes',
        p_amount: totalCost,
        p_reference: null,
      });
      if (creditErr) {
        const msg = /Yetersiz/.test(creditErr.message) ? 'Yetersiz kredi.' : 'Kredi düşürülemedi.';
        toast.error(msg);
        setStep('upload');
        return;
      }

      // 2. Session kaydı oluştur
      const { data: session } = await supabase.from('study_sessions').insert({
        user_id: profile.id,
        title: `${subject} Notları - ${new Date().toLocaleDateString('tr-TR')}`,
        subject: subject,
        source_count: files.length,
        status: 'processing',
        credits_used: totalCost,
      }).select().single();

      // 4. AI'a dosyaları DOĞRUDAN gönder — multimodal
      const rawFiles = files.map(f => f.file);
      const notes = await generateStudyNotes(
        rawFiles,
        subject,
        undefined,
        (_delta, full) => setStreamingText(full),
      );

      // 5. Sonucu kaydet
      if (session) {
        await supabase.from('study_sessions').update({
          generated_notes: notes,
          status: 'completed',
        }).eq('id', session.id);
      }

      setGeneratedNotes(notes);
      setStep('result');
      await refreshProfile();
      toast.success('Ders notu başarıyla oluşturuldu!');
    } catch (error) {
      console.error(error);
      toast.error('Notlar oluşturulurken bir hata oluştu.');
      setStep('upload');
    }
  };

  /** Notu seçilen formatta indir */
  const downloadAs = async (format: 'pdf' | 'docx' | 'txt') => {
    if (!generatedNotes) return;
    const baseName = `${subject}_Notlari_${new Date().toISOString().slice(0, 10)}`;
    const subtitle = `${subject} • ${new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    setExporting(format);
    try {
      if (format === 'pdf') {
        await exportMarkdownToPDF(generatedNotes, { filename: `${baseName}.pdf`, title: `${subject} Notları`, subtitle });
      } else if (format === 'docx') {
        await exportMarkdownToDOCX(generatedNotes, { filename: `${baseName}.docx`, title: `${subject} Notları`, subtitle });
      } else {
        exportMarkdownToTxt(generatedNotes, `${baseName}.txt`);
      }
      toast.success(`${format.toUpperCase()} indirildi`);
    } catch {
      toast.error('İndirme başarısız oldu');
    } finally {
      setExporting(null);
    }
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

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerIcon}><BookOpen size={24} /></div>
        <div>
          <h1 className={styles.title}>Ders Notu Çıkar</h1>
          <p className={styles.subtitle}>Sınıf tahtası, slaytlar veya kitap sayfalarından saniyeler içinde not oluşturun.</p>
        </div>
      </div>

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
                    ({files.length * CREDIT_COSTS.STUDY_NOTES_PER_SOURCE} Kredi)
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
    </div>
  );
}

