import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coins,
  FileText,
  Gauge,
  Languages,
  LayoutDashboard,
  MessageSquare,
  Shield,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/auth';
import { supabase } from '../lib/supabase';
import { STATUS_LABELS } from '../lib/constants';
import type { Document } from '../types';
import styles from '../styles/components/dashboard.module.css';

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const rise = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const } },
};

function useAnimatedCounter(target: number, duration = 850) {
  const [count, setCount] = useState(0);
  const previous = useRef(0);

  useEffect(() => {
    if (target === previous.current) return;
    const start = previous.current;
    previous.current = target;
    const startedAt = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(start + (target - start) * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return count;
}

function formatPlan(plan: string) {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

export default function DashboardPage() {
  const { profile, isAdmin, loading: authLoading, refreshProfile } = useAuth();
  const reducedMotion = useReducedMotion();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [totalTranslations, setTotalTranslations] = useState(0);
  const [loading, setLoading] = useState(true);
  const creditLimit = profile?.credits_monthly_limit || 0;
  const remainingCredits = profile?.credits_remaining || 0;
  const usedCredits = Math.max(0, creditLimit - remainingCredits);
  const cDocs = useAnimatedCounter(documents.length);
  const cTrans = useAnimatedCounter(totalTranslations);
  const cCredits = useAnimatedCounter(remainingCredits);
  const cUsed = useAnimatedCounter(usedCredits);

  useEffect(() => {
    if (!profile) return;

    const fetchDashboard = async () => {
      setLoading(true);
      const [{ data: docs }, { count }] = await Promise.all([
        supabase
          .from('documents')
          .select('*')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('translations')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', profile.id)
          .eq('status', 'completed'),
      ]);

      if (docs) setDocuments(docs as Document[]);
      if (count !== null) setTotalTranslations(count);
      setLoading(false);
    };

    fetchDashboard();
  }, [profile]);

  if (authLoading || !profile) {
    return (
      <div className={styles.dashboardShell}>
        <div className={styles.loadingState}>
          {authLoading ? (
            <>
              <div className={styles.loadingSpinner} />
              <p>Yükleniyor...</p>
            </>
          ) : (
            <>
              <p>Profil yüklenemedi.</p>
              <button onClick={refreshProfile}>Yeniden Dene</button>
            </>
          )}
        </div>
      </div>
    );
  }

  const creditPercent = creditLimit > 0 ? Math.min(100, Math.round((remainingCredits / creditLimit) * 100)) : 0;
  const usedPercent = creditLimit > 0 ? Math.min(100, Math.round((usedCredits / creditLimit) * 100)) : 0;
  const displayName = profile.full_name || profile.email.split('@')[0];
  const firstName = displayName.split(' ')[0];
  const isFirstTime = !loading && documents.length === 0;

  const metrics = [
    { icon: FileText, value: cDocs, label: 'Aktif belge', tone: 'indigo' },
    { icon: CheckCircle2, value: cTrans, label: 'Tamamlanan çeviri', tone: 'green' },
    { icon: Coins, value: cCredits, label: 'Kalan kredi', tone: 'amber' },
    { icon: Activity, value: cUsed, label: 'Bu ay kullanılan', tone: 'rose' },
  ];

  const actions = [
    { to: '/translate', Icon: Languages, label: 'Yeni Çeviri', desc: 'PDF yükle, dil algıla, Türkçeye çevir', accent: '#2454ff' },
    { to: '/documents', Icon: FileText, label: 'Belgelerim', desc: 'Arşiv, indirme ve görüntüleme', accent: '#0f9f6e' },
    { to: '/study-notes', Icon: BookOpen, label: 'Ders Notu', desc: 'Kaynaklardan düzenli not üret', accent: '#8b5cf6' },
    { to: '/chat', Icon: MessageSquare, label: 'AI Asistan', desc: 'Belge üstünde soru-cevap', accent: '#0284c7' },
    ...(isAdmin ? [{ to: '/admin', Icon: Shield, label: 'Admin', desc: 'Kullanıcı ve kredi yönetimi', accent: '#e11d48' }] : []),
  ];

  const nextBestAction = isFirstTime ? 'İlk PDF belgenizi yükleyin' : 'Son çevirilerinizi kontrol edin';

  return (
    <motion.div
      className={styles.dashboardShell}
      variants={container}
      initial="hidden"
      animate="visible"
    >
      <motion.section className={styles.commandPanel} variants={rise}>
        <div className={styles.commandCopy}>
          <div className={styles.eyebrow}>
            <LayoutDashboard size={14} />
            Çalışma merkezi
          </div>
          <h1>{firstName}, bugün neyi çevirelim?</h1>
          <p>
            Belgelerinizi çevirin, sonuçları arşivleyin ve aynı metin üzerinde AI asistanla çalışın.
          </p>
          <div className={styles.heroActions}>
            <Link to="/translate" className={styles.primaryAction}>
              <Zap size={16} />
              Çeviri Başlat
            </Link>
            <Link to="/documents" className={styles.secondaryAction}>
              Belgeleri Aç
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>

        <div className={styles.creditConsole}>
          <div className={styles.consoleTop}>
            <span>{formatPlan(profile.plan)} Plan</span>
            <Gauge size={18} />
          </div>
          <div className={styles.creditDial} style={{ '--credit': `${creditPercent}%` } as React.CSSProperties}>
            <div>
              <strong>{creditPercent}%</strong>
              <span>kredi kaldı</span>
            </div>
          </div>
          <div className={styles.creditNumbers}>
            <span>{remainingCredits} / {creditLimit}</span>
            <span>{usedPercent}% kullanıldı</span>
          </div>
          <div className={styles.consoleHint}>
            <Sparkles size={14} />
            {nextBestAction}
          </div>
        </div>
      </motion.section>

      <motion.section className={styles.metricsGrid} variants={container}>
        {metrics.map(({ icon: Icon, value, label, tone }) => (
          <motion.div
            key={label}
            className={`${styles.metricCard} ${styles[tone]}`}
            variants={rise}
            whileHover={reducedMotion ? undefined : { y: -4 }}
          >
            <div className={styles.metricIcon}><Icon size={17} /></div>
            <strong>{value}</strong>
            <span>{label}</span>
          </motion.div>
        ))}
      </motion.section>

      <div className={styles.workspaceGrid}>
        <motion.section className={styles.panel} variants={rise}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.panelKicker}>Hızlı akış</span>
              <h2>En sık kullanılan işler</h2>
            </div>
            <Clock size={18} />
          </div>

          <div className={styles.actionStack}>
            {actions.map(({ to, Icon, label, desc, accent }) => (
              <Link key={to} to={to} className={styles.actionRow} style={{ '--accent': accent } as React.CSSProperties}>
                <div className={styles.actionIcon}><Icon size={17} /></div>
                <div>
                  <strong>{label}</strong>
                  <span>{desc}</span>
                </div>
                <ChevronRight size={16} />
              </Link>
            ))}
          </div>
        </motion.section>

        <motion.section className={styles.panel} variants={rise}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.panelKicker}>Son durum</span>
              <h2>Son belgeler</h2>
            </div>
            <FileText size={18} />
          </div>

          {isFirstTime ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}><FileText size={24} /></div>
              <strong>Henüz belge yok</strong>
              <span>İlk PDF belgenizi yükleyerek çalışma alanınızı oluşturun.</span>
              <Link to="/translate">
                Belge yükle
                <ArrowRight size={14} />
              </Link>
            </div>
          ) : (
            <div className={styles.documentStack}>
              {documents.map(doc => (
                <div key={doc.id} className={styles.documentRow}>
                  <div className={styles.documentIcon}><FileText size={15} /></div>
                  <div className={styles.documentMeta}>
                    <strong title={doc.original_name}>{doc.original_name}</strong>
                    <span>
                      {doc.page_count ? `${doc.page_count} sayfa · ` : ''}
                      {new Date(doc.created_at).toLocaleDateString('tr-TR')}
                    </span>
                  </div>
                  <span className={`${styles.statusBadge} ${styles[doc.status]}`}>
                    {STATUS_LABELS[doc.status] || doc.status}
                  </span>
                </div>
              ))}
              <Link to="/documents" className={styles.viewAll}>
                Tümünü görüntüle
                <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </motion.section>
      </div>
    </motion.div>
  );
}
