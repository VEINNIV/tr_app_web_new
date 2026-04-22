import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText, MessageSquare, Trash2, FolderOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { STATUS_LABELS } from '../lib/constants';
import type { Document } from '../types';

const pageStyles: Record<string, React.CSSProperties> = {
  page: { padding: 'calc(64px + 2rem) 1.5rem 3rem', maxWidth: '1000px', margin: '0 auto' },
  title: { fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.5rem' },
  desc: { fontSize: '0.9375rem', color: 'var(--color-text-secondary)', marginBottom: '2rem' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' },
  card: { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '20px', padding: '1.5rem', transition: 'all 0.3s ease' },
  cardHeader: { display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' },
  cardIcon: { width: '40px', height: '40px', borderRadius: '10px', background: 'var(--color-accent-light)', display: 'grid', placeItems: 'center', color: 'var(--color-accent)', flexShrink: 0 },
  cardName: { fontSize: '0.9375rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  cardMeta: { fontSize: '0.75rem', color: 'var(--color-text-tertiary)', marginTop: '2px' },
  cardActions: { display: 'flex', gap: '0.5rem', marginTop: '1rem' },
  cardBtn: { flex: 1, padding: '0.5rem', borderRadius: '10px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'var(--font-family)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', color: 'var(--color-text-primary)', textDecoration: 'none', transition: 'all 0.15s ease' },
  status: { display: 'inline-flex', padding: '2px 10px', borderRadius: '999px', fontSize: '0.6875rem', fontWeight: 600 },
  empty: { textAlign: 'center' as const, padding: '4rem 2rem', color: 'var(--color-text-tertiary)' },
};

export default function DocumentsPage() {
  const { profile } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);

  useEffect(() => {
    if (!profile) return;
    supabase.from('documents').select('*').eq('user_id', profile.id).order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setDocuments(data as Document[]); });
  }, [profile]);

  const statusColor = (s: string) => {
    if (s === 'completed') return { background: 'var(--color-success-bg)', color: 'var(--color-success)' };
    if (s === 'error') return { background: 'var(--color-error-bg)', color: 'var(--color-error)' };
    return { background: 'var(--color-warning-bg)', color: 'var(--color-warning)' };
  };

  const handleDelete = async (id: string) => {
    await supabase.from('documents').delete().eq('id', id);
    setDocuments(prev => prev.filter(d => d.id !== id));
  };

  return (
    <div style={pageStyles.page}>
      <h1 style={pageStyles.title}>Dokümanlarım</h1>
      <p style={pageStyles.desc}>Yüklediğiniz ve çevirdiğiniz tüm belgeler burada.</p>

      {documents.length === 0 ? (
        <div style={pageStyles.empty}>
          <FolderOpen size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
          <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Henüz doküman yok</p>
          <p style={{ fontSize: '0.8125rem', marginTop: '0.5rem' }}>İlk belgenizi çevirmek için <Link to="/translate" style={{ color: 'var(--color-accent)' }}>çeviri sayfasına</Link> gidin.</p>
        </div>
      ) : (
        <div style={pageStyles.grid}>
          {documents.map((doc, i) => (
            <motion.div key={doc.id} style={pageStyles.card} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <div style={pageStyles.cardHeader}>
                <div style={pageStyles.cardIcon}><FileText size={20} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={pageStyles.cardName}>{doc.original_name}</div>
                  <div style={pageStyles.cardMeta}>{doc.page_count || '?'} sayfa • {(doc.file_size_bytes / 1024 / 1024).toFixed(1)} MB</div>
                </div>
                <span style={{ ...pageStyles.status, ...statusColor(doc.status) }}>{STATUS_LABELS[doc.status]}</span>
              </div>
              <div style={pageStyles.cardMeta}>{new Date(doc.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              <div style={pageStyles.cardActions}>
                <Link to={`/chat`} style={pageStyles.cardBtn}><MessageSquare size={14} /> AI Sor</Link>
                <button style={{ ...pageStyles.cardBtn, color: 'var(--color-error)', borderColor: 'rgba(255,59,48,0.2)' }} onClick={() => handleDelete(doc.id)}>
                  <Trash2 size={14} /> Sil
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
