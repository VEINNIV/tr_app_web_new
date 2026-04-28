/**
 * TransLingua — DashboardPage (Ana Panel)
 *
 * Kullanıcının giriş yaptıktan sonra yönlendirildiği merkezi sayfa.
 * Kullanıcı istatistiklerini, kredi durumunu, hızlı işlemleri
 * ve son belgeleri gerçek zamanlı olarak Supabase'den çeker.
 */
import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FileText, Languages, MessageSquare, Plus, Clock, TrendingUp,
  CreditCard, FolderOpen, ArrowRight, Sparkles, BookOpen, Shield,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { STATUS_LABELS } from '../lib/constants';
import type { Document } from '../types';
import styles from '../styles/components/dashboard.module.css';

/** Sıralı solma animasyonu — her kart için gecikme hesaplanır */
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: 'easeOut' as const },
  }),
};

/** Animated counter hook */
function useAnimatedCounter(target: number, duration = 800) {
  const [count, setCount] = useState(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    if (target === prevTarget.current) return;
    prevTarget.current = target;

    const start = 0;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(start + (target - start) * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [target, duration]);

  return count;
}

export default function DashboardPage() {
  const { profile, isAdmin } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [totalTranslations, setTotalTranslations] = useState(0);
  const [loading, setLoading] = useState(true);

  // Animated counters
  const animDocCount = useAnimatedCounter(documents.length);
  const animTransCount = useAnimatedCounter(totalTranslations);
  const animCreditsRemaining = useAnimatedCounter(profile?.credits_remaining ?? 0);
  const animCreditsUsed = useAnimatedCounter(
    (profile?.credits_monthly_limit ?? 0) - (profile?.credits_remaining ?? 0)
  );

  useEffect(() => {
    if (!profile) return;

    const fetchData = async () => {
      setLoading(true);

      // Son 5 belgeyi çek
      const { data: docs } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(5);

      // Toplam tamamlanan çeviri sayısını çek
      const { count } = await supabase
        .from('translations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('status', 'completed');

      if (docs) setDocuments(docs as Document[]);
      if (count !== null) setTotalTranslations(count);
      setLoading(false);
    };

    fetchData();
  }, [profile]);

  // Profil yüklenene kadar boş döndür
  if (!profile) return null;

  const creditPercent = profile.credits_monthly_limit > 0
    ? Math.round((profile.credits_remaining / profile.credits_monthly_limit) * 100)
    : 0;
  const displayName = profile.full_name || profile.email.split('@')[0];

  // İlk defa giriş yapıyorsa (hiç doküman yoksa) onboarding göster
  const isFirstTime = !loading && documents.length === 0;

  // Hızlı işlemler
  const quickActions = [
    { to: '/translate', icon: <Languages size={22} />, title: 'Yeni Çeviri', desc: 'PDF yükle ve çevir', bg: 'var(--color-accent-light)', color: 'var(--color-accent)' },
    { to: '/documents', icon: <FolderOpen size={22} />, title: 'Dokümanlarım', desc: 'Tüm belgelerini gör', bg: 'var(--color-success-bg)', color: 'var(--color-success)' },
    { to: '/study-notes', icon: <BookOpen size={22} />, title: 'Ders Notu', desc: 'Görsellerden not çıkar', bg: 'rgba(139,92,246,0.08)', color: '#8b5cf6' },
    { to: '/chat', icon: <MessageSquare size={22} />, title: 'AI Asistan', desc: 'Belgene soru sor', bg: 'var(--color-info-bg)', color: 'var(--color-info)' },
  ];

  if (isAdmin) {
    quickActions.push({
      to: '/admin', icon: <Shield size={22} />, title: 'Admin Panel', desc: 'Kullanıcıları yönet', bg: 'rgba(99,102,241,0.08)', color: '#6366f1',
    });
  }

  return (
    <div className={styles.dashboard}>

      {/* ── Karşılama Kartı ─────────────────────────────────── */}
      <motion.div
        className={styles.welcomeCard}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className={styles.welcomeMesh} aria-hidden="true" />
        <div className={styles.welcomeOrb} />
        <div className={styles.welcomeOrb2} />
        <div className={styles.welcomeContent}>
          <p className={styles.welcomeGreeting}>Hoş geldiniz 👋</p>
          <h1 className={styles.welcomeName}>{displayName}</h1>
          <span className={styles.welcomePlan}>{profile.plan.toUpperCase()} Plan</span>
        </div>
        <Link to="/translate" className={styles.welcomeCta}>
          Yeni Çeviri Başlat <ArrowRight size={16} />
        </Link>
      </motion.div>

      {/* ── İstatistik Kartları ──────────────────────────────── */}
      <div className={styles.statsGrid}>
        {[
          { icon: <FileText size={20} />, value: animDocCount, label: 'Toplam Doküman', bg: 'var(--color-accent-light)', color: 'var(--color-accent)' },
          { icon: <Languages size={20} />, value: animTransCount, label: 'Tamamlanan Çeviri', bg: 'var(--color-success-bg)', color: 'var(--color-success)' },
          { icon: <CreditCard size={20} />, value: animCreditsRemaining, label: 'Kalan Kredi', bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' },
          { icon: <TrendingUp size={20} />, value: animCreditsUsed, label: 'Kullanılan Kredi', bg: 'var(--color-info-bg)', color: 'var(--color-info)' },
        ].map((s, i) => (
          <motion.div key={i} className={styles.statCard} variants={fadeUp} initial="hidden" animate="visible" custom={i}>
            <div className={styles.statIcon} style={{ background: s.bg, color: s.color }}>{s.icon}</div>
            <div className={styles.statValue}>{s.value}</div>
            <div className={styles.statLabel}>{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* ── Aylık Kredi Kullanım Çubuğu ─────────────────────── */}
      <motion.div className={styles.creditBar} variants={fadeUp} initial="hidden" animate="visible" custom={4}>
        <div className={styles.creditHeader}>
          <span className={styles.creditLabel}>Aylık Kredi Kullanımı</span>
          <span className={styles.creditValue}>{profile.credits_remaining} / {profile.credits_monthly_limit} kalan</span>
        </div>
        <div className={styles.creditTrack}>
          <motion.div
            className={styles.creditFill}
            initial={{ width: 0 }}
            animate={{ width: `${creditPercent}%` }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.5 }}
          />
        </div>
        {profile.credits_reset_at && (
          <div className={styles.creditReset}>
            Sıfırlama: {new Date(profile.credits_reset_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
          </div>
        )}
      </motion.div>

      {/* ── Hızlı İşlemler ──────────────────────────────────── */}
      <h2 className={styles.sectionTitle}><Plus size={18} /> Hızlı İşlemler</h2>
      <div className={styles.quickActions}>
        {quickActions.map((a, i) => (
          <motion.div key={i} variants={fadeUp} initial="hidden" animate="visible" custom={i + 5}>
            <Link to={a.to} className={styles.actionCard}>
              <div className={styles.actionIcon} style={{ background: a.bg, color: a.color }}>{a.icon}</div>
              <div>
                <div className={styles.actionTitle}>{a.title}</div>
                <div className={styles.actionDesc}>{a.desc}</div>
              </div>
              <ArrowRight size={16} className={styles.actionArrow} />
            </Link>
          </motion.div>
        ))}
      </div>

      {/* ── Son Belgeler / Onboarding ─────────────────────────── */}
      <h2 className={styles.sectionTitle}><Clock size={18} /> Son Belgeler</h2>

      {isFirstTime ? (
        // İlk giriş — kullanıcıyı yönlendiren güzel onboarding kartı
        <motion.div className={styles.onboardingCard} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <div className={styles.onboardingIcon}><Sparkles size={28} /></div>
          <h3 className={styles.onboardingTitle}>Başlamaya hazır mısınız?</h3>
          <p className={styles.onboardingDesc}>
            Platformumuza hoş geldiniz! İlk belgenizi yükleyerek
            yapay zeka destekli çeviri deneyimini keşfedebilirsiniz.
            Ücretsiz planınızda {profile.credits_monthly_limit} sayfa çeviri hakkınız mevcut.
          </p>
          <Link to="/translate" className={styles.onboardingCta}>
            İlk Çevirime Başla <ArrowRight size={16} />
          </Link>
        </motion.div>
      ) : (
        // Mevcut belgeler listesi
        <div className={styles.docsList}>
          {documents.map(doc => (
            <div key={doc.id} className={styles.docItem}>
              <div className={styles.docIcon}><FileText size={18} /></div>
              <div className={styles.docInfo}>
                <div className={styles.docName}>{doc.original_name}</div>
                <div className={styles.docMeta}>
                  {doc.page_count} sayfa • {new Date(doc.created_at).toLocaleDateString('tr-TR')}
                </div>
              </div>
              <span className={`${styles.docStatus} ${doc.status === 'completed' ? styles.statusCompleted : doc.status === 'error' ? styles.statusError : styles.statusProcessing}`}>
                {STATUS_LABELS[doc.status] || doc.status}
              </span>
            </div>
          ))}
          <Link to="/documents" className={styles.docsViewAll}>
            Tümünü Gör <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}
