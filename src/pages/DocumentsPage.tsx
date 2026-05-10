/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Archive,
  CalendarDays,
  DownloadCloud,
  Eye,
  FileText,
  Languages,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '../context/auth';
import { supabase } from '../lib/supabase';
import { STATUS_LABELS } from '../lib/constants';
import type { Document, Translation } from '../types';
import { downloadElementAsPdf } from '../lib/downloadPdf';
import styles from '../styles/components/documents.module.css';

interface DocumentWithTranslation extends Document {
  translation?: Translation | null;
}

type FilterKey = 'all' | 'completed' | 'processing' | 'error';

export default function DocumentsPage() {
  const { profile } = useAuth();
  const [documents, setDocuments] = useState<DocumentWithTranslation[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DocumentWithTranslation | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const modalContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile) return;

    const fetchDocuments = async () => {
      const { data: docs } = await supabase
        .from('documents')
        .select(`
          *,
          translation:translations(*)
        `)
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });

      if (docs) {
        const mapped = docs.map((doc: DocumentWithTranslation & { translation: Translation[] }) => ({
          ...doc,
          translation: Array.isArray(doc.translation) ? doc.translation[0] ?? null : doc.translation,
        }));
        setDocuments(mapped as DocumentWithTranslation[]);
      }
    };

    fetchDocuments();
  }, [profile]);

  const stats = useMemo(() => {
    const completed = documents.filter(doc => doc.status === 'completed').length;
    const translated = documents.filter(doc => doc.translation?.translated_text).length;
    const pages = documents.reduce((sum, doc) => sum + (doc.page_count || 0), 0);
    return { completed, translated, pages };
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => {
      const matchesFilter = filter === 'all' || doc.status === filter;
      const matchesQuery = doc.original_name.toLowerCase().includes(query.trim().toLowerCase());
      return matchesFilter && matchesQuery;
    });
  }, [documents, filter, query]);

  const statusClass = (status: string) => {
    if (status === 'completed') return styles.statusCompleted;
    if (status === 'error') return styles.statusError;
    return styles.statusProcessing;
  };

  const handleDelete = async (id: string) => {
    await supabase.from('documents').delete().eq('id', id);
    setDocuments(prev => prev.filter(doc => doc.id !== id));
    if (selectedDoc?.id === id) setSelectedDoc(null);
  };

  const handleDownloadPDF = async () => {
    if (!modalContentRef.current || !selectedDoc) return;
    await downloadElementAsPdf(modalContentRef.current, {
      margin: 15,
      filename: `${selectedDoc.original_name.replace('.pdf', '')}_ceviri.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    });
  };

  const filterItems: Array<{ key: FilterKey; label: string }> = [
    { key: 'all', label: 'Tümü' },
    { key: 'completed', label: 'Tamamlandı' },
    { key: 'processing', label: 'İşleniyor' },
    { key: 'error', label: 'Hata' },
  ];

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}><Archive size={14} /> Doküman kasası</span>
          <h1>Çevirdiğiniz her belge düzenli, erişilebilir ve aksiyona hazır.</h1>
          <p>Sonuçları görüntüleyin, PDF olarak indirin ya da AI asistanla belge üzerinde çalışmaya devam edin.</p>
        </div>
        <Link to="/translate" className={styles.newBtn}>
          <Plus size={16} />
          Yeni Çeviri
        </Link>
      </section>

      <section className={styles.statsBar}>
        <div><strong>{documents.length}</strong><span>Toplam belge</span></div>
        <div><strong>{stats.completed}</strong><span>Tamamlanan</span></div>
        <div><strong>{stats.translated}</strong><span>Çeviri hazır</span></div>
        <div><strong>{stats.pages}</strong><span>Sayfa</span></div>
      </section>

      <section className={styles.toolbar}>
        <label className={styles.searchBox}>
          <Search size={16} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Belge adı ara" />
        </label>
        <div className={styles.filters}>
          {filterItems.map(item => (
            <button
              key={item.key}
              type="button"
              className={filter === item.key ? styles.filterActive : ''}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {filteredDocuments.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}><Archive size={30} /></div>
          <strong>{documents.length === 0 ? 'Henüz doküman yok' : 'Eşleşen doküman bulunamadı'}</strong>
          <span>Yeni bir çeviri başlatın veya arama/filtre seçiminizi değiştirin.</span>
          <Link to="/translate">Çeviri sayfasına git</Link>
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredDocuments.map((doc, index) => (
            <motion.article
              key={doc.id}
              className={styles.card}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
            >
              <div className={styles.cardTop}>
                <div className={styles.cardIcon}><FileText size={20} /></div>
                <span className={`${styles.status} ${statusClass(doc.status)}`}>
                  {STATUS_LABELS[doc.status] || doc.status}
                </span>
              </div>

              <h2 title={doc.original_name}>{doc.original_name}</h2>

              <div className={styles.metaGrid}>
                <span><CalendarDays size={14} /> {new Date(doc.created_at).toLocaleDateString('tr-TR')}</span>
                <span><FileText size={14} /> {doc.page_count || '?'} sayfa</span>
                <span><Archive size={14} /> {(doc.file_size_bytes / 1024 / 1024).toFixed(1)} MB</span>
              </div>

              {doc.translation && (
                <div className={styles.translationRow}>
                  <Languages size={14} />
                  Türkçe çeviri hazır
                </div>
              )}

              <div className={styles.cardActions}>
                {doc.translation?.translated_text && (
                  <button type="button" className={styles.btnView} onClick={() => setSelectedDoc(doc)}>
                    <Eye size={14} /> Görüntüle
                  </button>
                )}
                <Link to="/chat" className={styles.btnChat}>
                  <MessageSquare size={14} /> AI Sor
                </Link>
                <button type="button" className={styles.btnDelete} onClick={() => handleDelete(doc.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </motion.article>
          ))}
        </div>
      )}

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
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={event => event.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <div>
                  <span className={styles.modalKicker}>Türkçe Çeviri</span>
                  <h2>{selectedDoc.original_name}</h2>
                </div>
                <div className={styles.modalActions}>
                  <button type="button" onClick={handleDownloadPDF}>
                    <DownloadCloud size={16} /> PDF İndir
                  </button>
                  <button type="button" className={styles.modalClose} onClick={() => setSelectedDoc(null)}>
                    <X size={20} />
                  </button>
                </div>
              </div>
              <div className={`${styles.modalBody} markdown-body`} ref={modalContentRef}>
                <ReactMarkdown remarkPlugins={[remarkGfm as any]}>
                  {selectedDoc.translation?.translated_text?.pages.join('\n\n') || ''}
                </ReactMarkdown>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
