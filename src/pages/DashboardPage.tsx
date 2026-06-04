/**
 * TransLingua — DashboardPage
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  FileText, Languages, MessageSquare, Clock,
  Zap, BookOpen, Shield, ArrowRight, ChevronRight,
  Activity, Coins, CheckCircle2, Sunrise, Sun, Sunset, Moon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { STATUS_LABELS, CREDIT_COSTS, pdfPerCredits } from '../lib/constants';
import { getCreditCosts } from '../lib/creditConfig';
import { formatTrDate } from '../lib/utils';
import type { Document } from '../types';
import { useAnimatedNumber, SPRING_TIGHT } from '../components/ui/motion';
import { useOnboardingTour } from '../hooks/useOnboardingTour';
import OnboardingTour from '../components/OnboardingTour';
import styles from '../styles/components/dashboard.module.css';

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

export default function DashboardPage() {
  const { profile, isAdmin, loading: authLoading, refreshProfile } = useAuth();
  const reduced = useReducedMotion();
  // Tur yalnızca kurulum sihirbazı tamamlandıktan SONRA başlar (ikisi sırayla aksın)
  const { runTour, finishTour } = useOnboardingTour(profile?.onboarding_completed === true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [totalTranslations, setTotalTranslations] = useState(0);
  const [loading, setLoading] = useState(true);
  // Sayfa başı çeviri maliyeti (canlı app_config) → "≈ X PDF" gösterimi için
  const [perPage, setPerPage] = useState<number>(CREDIT_COSTS.TRANSLATION_PER_PAGE);

  useEffect(() => {
    getCreditCosts().then(c => setPerPage(c.translationPerPage)).catch(() => {});
  }, []);

  const cDocs = useAnimatedNumber(documents.length);
  const cTrans = useAnimatedNumber(totalTranslations);
  const cCredits = useAnimatedNumber(profile?.credits_remaining ?? 0);
  const cUsed = useAnimatedNumber((profile?.credits_monthly_limit ?? 0) - (profile?.credits_remaining ?? 0));

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
  const displayName = profile.nickname || profile.full_name || profile.email.split('@')[0];
  const firstName = displayName.split(' ')[0];
  const isFirstTime = !loading && documents.length === 0;

  const hour = new Date().getHours();
  const greeting =
    hour < 5 ? 'İyi geceler' :
    hour < 12 ? 'Günaydın' :
    hour < 18 ? 'İyi günler' :
    hour < 22 ? 'İyi akşamlar' : 'İyi geceler';
  // Zaman dilimine göre zarif ikon (ai-slop emoji yerine tutarlı lucide ikonu)
  const GreetIcon =
    hour < 5 ? Moon :
    hour < 12 ? Sunrise :
    hour < 18 ? Sun :
    hour < 22 ? Sunset : Moon;
  const greetIconColor =
    hour < 5 ? '#818cf8' :
    hour < 12 ? '#f59e0b' :
    hour < 18 ? '#f59e0b' :
    hour < 22 ? '#fb7185' : '#818cf8';

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
      <OnboardingTour run={runTour} onFinish={finishTour} />

      {/* ── Header row ── */}
      <motion.div
        id="tour-header"
        className={styles.header}
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className={styles.headerLeft}>
          <motion.div
            className={styles.headerIcon}
            whileHover={reduced ? undefined : { rotate: -6, scale: 1.05 }}
            transition={SPRING_TIGHT}
          >
            <img src="/trans_wordly.png" alt="" width={26} height={26} draggable={false} />
          </motion.div>
          <div>
            <h1 className={styles.headerTitle}>
              {greeting}, <span className={styles.headerName}>{firstName}</span>
              <motion.span
                style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: 8, color: greetIconColor }}
                initial={reduced ? false : { rotate: -12, scale: 0.6, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.15 }}
              >
                <GreetIcon size={20} strokeWidth={2.2} />
              </motion.span>
            </h1>
            <p className={styles.headerSub}>Bugün ne çevirelim?</p>
          </div>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.planBadge}>{profile.plan.toUpperCase()}</span>
          <motion.div
            whileHover={reduced ? undefined : { y: -2 }}
            whileTap={reduced ? undefined : { scale: 0.96 }}
            transition={SPRING_TIGHT}
          >
            <Link to="/translate" className={styles.primaryBtn}>
              <motion.span
                style={{ display: 'inline-flex' }}
                animate={reduced ? undefined : { rotate: [0, -8, 8, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 4, ease: 'easeInOut' }}
              >
                <Zap size={14} />
              </motion.span>
              Çeviri Başlat
            </Link>
          </motion.div>
        </div>
      </motion.div>

      {/* ── Stats row ── */}
      <motion.div
        id="tour-stats"
        className={styles.statsRow}
        variants={stagger}
        initial="hidden"
        animate="visible"
      >
        {stats.map(({ icon: Icon, value, label, color }) => (
          <motion.div
            key={label}
            className={styles.statCard}
            variants={item}
            whileHover={reduced ? undefined : { y: -3 }}
            transition={SPRING_TIGHT}
          >
            <div className={styles.statTop}>
              <motion.div
                className={styles.statIconWrap}
                style={{ color }}
                whileHover={reduced ? undefined : { rotate: -8, scale: 1.1 }}
                transition={SPRING_TIGHT}
              >
                <Icon size={16} strokeWidth={2.5} />
              </motion.div>
              <span className={styles.statLabel}>{label}</span>
            </div>
            <div className={styles.statNum}>{value}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Credit bar ── */}
      <motion.div
        id="tour-credits"
        className={styles.creditCard}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        <div className={styles.creditTop}>
          <span className={styles.creditTitle}>Aylık Kredi</span>
          <div className={styles.creditNum}>
            <span className={styles.creditRemain}>{profile.credits_remaining}</span>
            <span className={styles.creditTotal}> / {profile.credits_monthly_limit}</span>
          </div>
        </div>
        {profile.credits_reset_at && (
          <div className={styles.creditSub}>
            {new Date(profile.credits_reset_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} tarihinde sıfırlanır
          </div>
        )}
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

        {/* Dinamik değer + düşük kredi yükseltmesi (sepet/ödeme akışına bağlanır) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Languages size={14} style={{ color: 'var(--color-accent)' }} />
            Kalan krediyle <strong style={{ color: 'var(--color-text-primary)' }}>≈ {pdfPerCredits(profile.credits_remaining, perPage)} sayfa</strong> çevirebilirsin
          </span>
          {creditPercent <= 20 && (
            <Link
              to="/#pricing"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 13px', borderRadius: 999, background: 'var(--color-accent)', color: '#fff', fontSize: '0.78rem', fontWeight: 700, textDecoration: 'none' }}
            >
              <Zap size={13} /> Kredi yükle
            </Link>
          )}
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
          <div id="tour-actions" className={styles.actionsList}>
            {actions.map(({ to, Icon, label, desc, accent }) => (
              <motion.div
                key={to}
                variants={item}
                whileHover={reduced ? undefined : { x: 4 }}
                whileTap={reduced ? undefined : { scale: 0.985 }}
                transition={SPRING_TIGHT}
              >
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
            <motion.div
              className={styles.emptyState}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.div
                className={styles.emptyIcon}
                animate={reduced ? undefined : { y: [0, -4, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                <FileText size={22} strokeWidth={1.5} />
              </motion.div>
              <p className={styles.emptyTitle}>Henüz belge yok</p>
              <p className={styles.emptyDesc}>İlk PDF belgenizi yükleyerek başlayın</p>
              <motion.div
                whileHover={reduced ? undefined : { y: -2 }}
                whileTap={reduced ? undefined : { scale: 0.96 }}
                transition={SPRING_TIGHT}
                style={{ display: 'inline-block' }}
              >
                <Link to="/translate" className={styles.emptyBtn}>
                  Belge Yükle <ArrowRight size={13} />
                </Link>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              className={styles.docList}
              variants={stagger}
              initial="hidden"
              animate="visible"
            >
              {documents.map(doc => (
                <motion.div
                  key={doc.id}
                  className={styles.docRow}
                  variants={item}
                  whileHover={reduced ? undefined : { x: 3 }}
                  transition={SPRING_TIGHT}
                >
                  <div className={styles.docIconWrap}>
                    <FileText size={14} strokeWidth={2} />
                  </div>
                  <div className={styles.docMeta}>
                    <span className={styles.docName}>{doc.original_name}</span>
                    <span className={styles.docDate}>
                      {doc.page_count ? `${doc.page_count} sayfa · ` : ''}
                      {formatTrDate(doc.created_at)}
                    </span>
                  </div>
                  <span className={`${styles.docBadge} ${doc.status === 'completed' ? styles.done : doc.status === 'error' ? styles.err : styles.proc}`}>
                    {STATUS_LABELS[doc.status] || doc.status}
                  </span>
                </motion.div>
              ))}
              <Link to="/documents" className={styles.viewAll}>
                Tümünü görüntüle
                <motion.span
                  style={{ display: 'inline-flex' }}
                  initial={{ x: 0 }}
                  whileHover={reduced ? undefined : { x: 4 }}
                  transition={SPRING_TIGHT}
                >
                  <ArrowRight size={13} />
                </motion.span>
              </Link>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
