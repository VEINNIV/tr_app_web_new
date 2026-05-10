/**
 * TransLingua — DashboardPage
 */
import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FileText, Languages, MessageSquare, Clock,
  Zap, BookOpen, Shield, ArrowRight, ChevronRight,
  Activity, Coins, CheckCircle2, LayoutDashboard,
} from 'lucide-react';
import { useAuth } from '../context/auth';
import { supabase } from '../lib/supabase';
import { STATUS_LABELS } from '../lib/constants';
import type { Document } from '../types';
import styles from '../styles/components/dashboard.module.css';

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

function useAnimatedCounter(target: number, duration = 900) {
  const [count, setCount] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    if (target === prev.current) return;
    prev.current = target;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(target * e));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return count;
}

export default function DashboardPage() {
  const { profile, isAdmin, loading: authLoading, refreshProfile } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [totalTranslations, setTotalTranslations] = useState(0);
  const [loading, setLoading] = useState(true);

  const cDocs = useAnimatedCounter(documents.length);
  const cTrans = useAnimatedCounter(totalTranslations);
  const cCredits = useAnimatedCounter(profile?.credits_remaining ?? 0);
  const cUsed = useAnimatedCounter((profile?.credits_monthly_limit ?? 0) - (profile?.credits_remaining ?? 0));

  useEffect(() => {
    if (!profile) return;
    const fetch = async () => {
      setLoading(true);
      const { data: docs } = await supabase.from('documents').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(5);
      const { count } = await supabase.from('translations').select('*', { count: 'exact', head: true }).eq('user_id', profile.id).eq('status', 'completed');
      if (docs) setDocuments(docs as Document[]);
      if (count !== null) setTotalTranslations(count);
      setLoading(false);
    };
    fetch();
  }, [profile]);

  if (authLoading || !profile) {
    return (
      <div className={styles.dashboard} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          {authLoading ? (
            <>
              <div style={{ width: 36, height: 36, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Yükleniyor...</p>
            </>
          ) : (
            <>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>Profil yüklenemedi.</p>
              <button onClick={refreshProfile} style={{ padding: '0.5rem 1.25rem', background: 'var(--color-accent)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Yeniden Dene</button>
            </>
          )}
        </div>
      </div>
    );
  }

  const creditPercent = profile.credits_monthly_limit > 0
    ? Math.round((profile.credits_remaining / profile.credits_monthly_limit) * 100)
    : 0;
  const displayName = profile.full_name || profile.email.split('@')[0];
  const firstName = displayName.split(' ')[0];
  const isFirstTime = !loading && documents.length === 0;

  const stats = [
    { icon: FileText, value: cDocs, label: 'Belge', color: '#6366f1' },
    { icon: CheckCircle2, value: cTrans, label: 'Çeviri', color: '#10b981' },
    { icon: Coins, value: cCredits, label: 'Kredi', color: '#f59e0b' },
    { icon: Activity, value: cUsed, label: 'Kullanılan', color: '#ec4899' },
  ];

  const actions = [
    { to: '/translate', Icon: Languages, label: 'Yeni Çeviri', desc: 'PDF yükle, dil seç', accent: '#6366f1' },
    { to: '/documents', Icon: FileText, label: 'Belgelerim', desc: 'Tüm dosyalarım', accent: '#10b981' },
    { to: '/study-notes', Icon: BookOpen, label: 'Ders Notu', desc: 'Görsellerden not', accent: '#8b5cf6' },
    { to: '/chat', Icon: MessageSquare, label: 'AI Chat', desc: 'Belgeye soru sor', accent: '#0ea5e9' },
    ...(isAdmin ? [{ to: '/admin', Icon: Shield, label: 'Admin', desc: 'Kullanıcı yönet', accent: '#f43f5e' }] : []),
  ];

  return (
    <div className={styles.dashboard}>

      {/* ── Header row ── */}
      <motion.div
        className={styles.header}
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <LayoutDashboard size={18} />
          </div>
          <div>
            <h1 className={styles.headerTitle}>{firstName}</h1>
            <p className={styles.headerSub}>Kontrol panelinize hoş geldiniz</p>
          </div>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.planBadge}>{profile.plan.toUpperCase()}</span>
          <Link to="/translate" className={styles.primaryBtn}>
            <Zap size={14} />
            Çeviri Başlat
          </Link>
        </div>
      </motion.div>

      {/* ── Stats row ── */}
      <motion.div
        className={styles.statsRow}
        variants={stagger}
        initial="hidden"
        animate="visible"
      >
        {stats.map(({ icon: Icon, value, label, color }) => (
          <motion.div key={label} className={styles.statCard} variants={item}>
            <div className={styles.statTop}>
              <div className={styles.statIconWrap} style={{ color }}>
                <Icon size={16} strokeWidth={2.5} />
              </div>
              <span className={styles.statLabel}>{label}</span>
            </div>
            <div className={styles.statNum}>{value}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Credit bar ── */}
      <motion.div
        className={styles.creditCard}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        <div className={styles.creditTop}>
          <div>
            <div className={styles.creditTitle}>Aylık Kredi</div>
            {profile.credits_reset_at && (
              <div className={styles.creditSub}>
                {new Date(profile.credits_reset_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} tarihinde sıfırlanır
              </div>
            )}
          </div>
          <div className={styles.creditNum}>
            <span className={styles.creditRemain}>{profile.credits_remaining}</span>
            <span className={styles.creditTotal}> / {profile.credits_monthly_limit}</span>
          </div>
        </div>
        <div className={styles.creditTrack}>
          <motion.div
            className={styles.creditFill}
            style={{ '--pct': `${creditPercent}%` } as React.CSSProperties}
            initial={{ width: 0 }}
            animate={{ width: `${creditPercent}%` }}
            transition={{ duration: 1.1, ease: 'easeOut', delay: 0.3 }}
          />
        </div>
        <div className={styles.creditFooter}>
          <span>{profile.credits_monthly_limit - profile.credits_remaining} kredi kullanıldı</span>
          <span>%{creditPercent} kaldı</span>
        </div>
      </motion.div>

      {/* ── Two column layout ── */}
      <div className={styles.gridTwo}>

        {/* Quick actions */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          <h2 className={styles.sectionLabel}>
            <Zap size={13} />
            Hızlı Erişim
          </h2>
          <div className={styles.actionsList}>
            {actions.map(({ to, Icon, label, desc, accent }) => (
              <motion.div key={to} variants={item}>
                <Link to={to} className={styles.actionRow}>
                  <div className={styles.actionIcon} style={{ '--accent': accent } as React.CSSProperties}>
                    <Icon size={16} strokeWidth={2} />
                  </div>
                  <div className={styles.actionText}>
                    <span className={styles.actionLabel}>{label}</span>
                    <span className={styles.actionDesc}>{desc}</span>
                  </div>
                  <ChevronRight size={14} className={styles.actionChev} />
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Recent documents */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4 }}
        >
          <h2 className={styles.sectionLabel}>
            <Clock size={13} />
            Son Belgeler
          </h2>

          {isFirstTime ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <FileText size={22} strokeWidth={1.5} />
              </div>
              <p className={styles.emptyTitle}>Henüz belge yok</p>
              <p className={styles.emptyDesc}>İlk PDF belgenizi yükleyerek başlayın</p>
              <Link to="/translate" className={styles.emptyBtn}>
                Belge Yükle <ArrowRight size={13} />
              </Link>
            </div>
          ) : (
            <div className={styles.docList}>
              {documents.map(doc => (
                <div key={doc.id} className={styles.docRow}>
                  <div className={styles.docIconWrap}>
                    <FileText size={14} strokeWidth={2} />
                  </div>
                  <div className={styles.docMeta}>
                    <span className={styles.docName}>{doc.original_name}</span>
                    <span className={styles.docDate}>
                      {doc.page_count ? `${doc.page_count} sayfa · ` : ''}
                      {new Date(doc.created_at).toLocaleDateString('tr-TR')}
                    </span>
                  </div>
                  <span className={`${styles.docBadge} ${doc.status === 'completed' ? styles.done : doc.status === 'error' ? styles.err : styles.proc}`}>
                    {STATUS_LABELS[doc.status] || doc.status}
                  </span>
                </div>
              ))}
              <Link to="/documents" className={styles.viewAll}>
                Tümünü görüntüle <ArrowRight size={13} />
              </Link>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
