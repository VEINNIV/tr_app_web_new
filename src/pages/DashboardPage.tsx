import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText, Languages, MessageSquare, Plus, Clock, TrendingUp, CreditCard, FolderOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { STATUS_LABELS } from '../lib/constants';
import type { Document } from '../types';
import styles from '../styles/components/dashboard.module.css';

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5, ease: 'easeOut' as const } }) };

export default function DashboardPage() {
  const { profile } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [stats, setStats] = useState({ totalDocs: 0, totalPages: 0, creditsUsed: 0 });

  useEffect(() => {
    if (!profile) return;
    const fetchData = async () => {
      const { data: docs } = await supabase.from('documents').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(5);
      if (docs) {
        setDocuments(docs as Document[]);
        setStats({
          totalDocs: docs.length,
          totalPages: docs.reduce((acc, d) => acc + (d.page_count || 0), 0),
          creditsUsed: (profile.credits_monthly_limit || 5) - (profile.credits_remaining || 0),
        });
      }
    };
    fetchData();
  }, [profile]);

  if (!profile) return null;

  const creditPercent = profile.credits_monthly_limit > 0 ? Math.round((profile.credits_remaining / profile.credits_monthly_limit) * 100) : 0;
  const displayName = profile.full_name || profile.email.split('@')[0];

  return (
    <div className={styles.dashboard}>
      {/* Welcome Card */}
      <motion.div className={styles.welcomeCard} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
        <div className={styles.welcomeOrb} />
        <div className={styles.welcomeContent}>
          <p className={styles.welcomeGreeting}>Hoş geldiniz 👋</p>
          <h1 className={styles.welcomeName}>{displayName}</h1>
          <span className={styles.welcomePlan}>{profile.plan.toUpperCase()} Plan</span>
        </div>
      </motion.div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        {[
          { icon: <FileText size={20} />, value: stats.totalDocs, label: 'Toplam Doküman', bg: 'var(--color-accent-light)', color: 'var(--color-accent)' },
          { icon: <Languages size={20} />, value: stats.totalPages, label: 'Çevrilen Sayfa', bg: 'var(--color-success-bg)', color: 'var(--color-success)' },
          { icon: <CreditCard size={20} />, value: profile.credits_remaining, label: 'Kalan Kredi', bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' },
          { icon: <TrendingUp size={20} />, value: stats.creditsUsed, label: 'Kullanılan Kredi', bg: 'var(--color-info-bg)', color: 'var(--color-info)' },
        ].map((s, i) => (
          <motion.div key={i} className={styles.statCard} variants={fadeUp} initial="hidden" animate="visible" custom={i}>
            <div className={styles.statIcon} style={{ background: s.bg, color: s.color }}>{s.icon}</div>
            <div className={styles.statValue}>{s.value}</div>
            <div className={styles.statLabel}>{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Credit Bar */}
      <motion.div className={styles.creditBar} variants={fadeUp} initial="hidden" animate="visible" custom={4}>
        <div className={styles.creditHeader}>
          <span className={styles.creditLabel}>Aylık Kredi Kullanımı</span>
          <span className={styles.creditValue}>{profile.credits_remaining} / {profile.credits_monthly_limit}</span>
        </div>
        <div className={styles.creditTrack}><div className={styles.creditFill} style={{ width: `${creditPercent}%` }} /></div>
      </motion.div>

      {/* Quick Actions */}
      <h2 className={styles.sectionTitle}><Plus size={18} /> Hızlı İşlemler</h2>
      <div className={styles.quickActions}>
        {[
          { to: '/translate', icon: <Languages size={22} />, title: 'Yeni Çeviri', desc: 'PDF yükle ve çevir', bg: 'var(--color-accent-light)', color: 'var(--color-accent)' },
          { to: '/documents', icon: <FolderOpen size={22} />, title: 'Dokümanlarım', desc: 'Tüm belgelerini gör', bg: 'var(--color-success-bg)', color: 'var(--color-success)' },
          { to: '/chat', icon: <MessageSquare size={22} />, title: 'AI Chat', desc: 'Belgene soru sor', bg: 'var(--color-info-bg)', color: 'var(--color-info)' },
        ].map((a, i) => (
          <motion.div key={i} variants={fadeUp} initial="hidden" animate="visible" custom={i + 5}>
            <Link to={a.to} className={styles.actionCard}>
              <div className={styles.actionIcon} style={{ background: a.bg, color: a.color }}>{a.icon}</div>
              <div><div className={styles.actionTitle}>{a.title}</div><div className={styles.actionDesc}>{a.desc}</div></div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Recent Documents */}
      <h2 className={styles.sectionTitle}><Clock size={18} /> Son Dokümanlar</h2>
      <div className={styles.docsList}>
        {documents.length === 0 ? (
          <div className={styles.emptyState}>
            <FileText size={40} className={styles.emptyIcon} />
            <p className={styles.emptyText}>Henüz bir doküman yüklemediniz.</p>
          </div>
        ) : documents.map(doc => (
          <div key={doc.id} className={styles.docItem}>
            <div className={styles.docIcon}><FileText size={18} /></div>
            <div className={styles.docInfo}>
              <div className={styles.docName}>{doc.original_name}</div>
              <div className={styles.docMeta}>{doc.page_count} sayfa • {new Date(doc.created_at).toLocaleDateString('tr-TR')}</div>
            </div>
            <span className={`${styles.docStatus} ${doc.status === 'completed' ? styles.statusCompleted : doc.status === 'error' ? styles.statusError : styles.statusProcessing}`}>
              {STATUS_LABELS[doc.status] || doc.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
