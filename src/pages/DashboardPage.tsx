/**
 * TransWordly — DashboardPage · "Çalışma Stüdyosu"
 *
 * Karşılama + yönlendirme odaklı, sadeleştirilmiş redesign. Landing'in
 * "Porselen & kağıt" diliyle uyumlu: Caveat el yazısı notları, elle çizilmiş
 * kıvrık oklar, yapışkan-not ipucu. Kalabalığı azaltmak için favori şeridi
 * (navbar'da zaten var) ve "yakında" rayı (Araçlar sayfasında var) kaldırıldı.
 * Veri katmanı DEĞİŞMEDİ: documents / translations / dueCards sorguları,
 * kredi yapılandırması ve onboarding tur hedefleri (#tour-*) birebir korunur.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  FileText, Languages, MessageSquare, Clock, Zap, Shield, ArrowRight,
  ChevronRight, Coins, CheckCircle2, Sunrise, Sun, Sunset, Moon, Brain,
  Play, Compass, Sparkles, Lightbulb, Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { countDueTotal } from '../lib/decks';
import { STATUS_LABELS, CREDIT_COSTS, pdfPerCredits } from '../lib/constants';
import { getCreditCosts } from '../lib/creditConfig';
import { formatTrDate } from '../lib/utils';
import type { Document } from '../types';
import { useAnimatedNumber, SPRING_TIGHT } from '../components/ui/motion';
import { useOnboardingTour } from '../hooks/useOnboardingTour';
import { useToolPrefs } from '../hooks/useToolPrefs';
import { getFeatureBySlug, READY_FEATURES } from '../lib/upcomingFeatures';
import OnboardingTour from '../components/OnboardingTour';
import styles from '../styles/components/dashboard.module.css';

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

/* Çeviri dışındaki hazır araçlar → galeri karoları */
const GALLERY_FEATURES = READY_FEATURES.filter(f => f.slug !== 'translate');

/* Günün ipucu — gerçek özelliklere işaret eder, gün gün döner */
const TIPS = [
  'Çeviri sayfasında PDF’ini sürükleyip bırakman yeterli — kaynak dil otomatik algılanır.',
  'AI Chat’te cevaplar belgenin içinden gelir; sayfa referansıyla doğrulayabilirsin.',
  'Ders Notu aracı, fotoğraflardan bile yapılandırılmış not çıkarır.',
  'Araçlar sayfasında yıldıza dokunarak sık kullandıklarını üst menüye sabitleyebilirsin.',
  'Sözlük aracı, alanına özel terimlerin çevirilerde tutarlı kullanılmasını sağlar.',
  'Yazım Asistanı metnini akademikleştirir, parafraz eder ve dil bilgisini düzeltir.',
];

/* Kredi halkası geometrisi */
const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;

/* Elle çizilmiş kıvrık ok — kağıt-craft aksanı (renk currentColor'dan gelir) */
function DoodleArrow({ dir = 'down' }: { dir?: 'down' | 'downRight' }) {
  if (dir === 'downRight') {
    return (
      <svg viewBox="0 0 40 32" fill="none" aria-hidden="true">
        <path d="M3 4C6 19 16 27 34 24" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M25 28l9-4-2-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 30 30" fill="none" aria-hidden="true">
      <path d="M21 2C9 4 3 12 8 26" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M2 18l6 9 9-3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function DashboardPage() {
  const { profile, isAdmin, loading: authLoading, refreshProfile } = useAuth();
  const reduced = useReducedMotion();
  // Tur yalnızca kurulum sihirbazı tamamlandıktan SONRA başlar (ikisi sırayla aksın)
  const { runTour, finishTour } = useOnboardingTour(profile?.onboarding_completed === true);
  const { recordUse, pinned, usage } = useToolPrefs();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [totalTranslations, setTotalTranslations] = useState(0);
  const [dueCards, setDueCards] = useState(0);
  const [loading, setLoading] = useState(true);
  // Sayfa başı çeviri maliyeti (canlı app_config) → "≈ X sayfa" gösterimi için
  const [perPage, setPerPage] = useState<number>(CREDIT_COSTS.TRANSLATION_PER_PAGE);

  useEffect(() => {
    getCreditCosts().then(c => setPerPage(c.translationPerPage)).catch(() => {});
  }, []);

  const cDocs = useAnimatedNumber(documents.length);
  const cTrans = useAnimatedNumber(totalTranslations);
  const cCredits = useAnimatedNumber(profile?.credits_remaining ?? 0);
  const cDue = useAnimatedNumber(dueCards);

  useEffect(() => {
    if (!profile) return;
    const fetch = async () => {
      setLoading(true);
      const { data: docs } = await supabase.from('documents').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(5);
      const { count } = await supabase.from('translations').select('*', { count: 'exact', head: true }).eq('user_id', profile.id).eq('status', 'completed');
      if (docs) setDocuments(docs as Document[]);
      if (count !== null) setTotalTranslations(count);
      countDueTotal(profile.id).then(setDueCards).catch(() => {});
      setLoading(false);
    };
    fetch();
  }, [profile]);

  if (authLoading || !profile) {
    return (
      <div className={`${styles.dashboard} ${styles.centerWrap}`}>
        <div className={styles.centerBox}>
          {authLoading ? (
            <>
              <div className={styles.spinner} />
              <p className={styles.centerText}>Yükleniyor...</p>
            </>
          ) : (
            <>
              <p className={styles.centerText}>Profil yüklenemedi.</p>
              <button onClick={refreshProfile} className={styles.retryBtn}>Yeniden Dene</button>
            </>
          )}
        </div>
      </div>
    );
  }

  const creditPercent = profile.credits_monthly_limit > 0
    ? Math.round((profile.credits_remaining / profile.credits_monthly_limit) * 100)
    : 0;
  const ringPct = Math.max(0, Math.min(100, creditPercent));
  const displayName = profile.nickname || profile.full_name || profile.email.split('@')[0];
  const firstName = displayName.split(' ')[0];
  const isFirstTime = !loading && documents.length === 0;

  const hour = new Date().getHours();
  const greeting =
    hour < 5 ? 'İyi geceler' :
    hour < 12 ? 'Günaydın' :
    hour < 18 ? 'İyi günler' :
    hour < 22 ? 'İyi akşamlar' : 'İyi geceler';
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

  const todayLabel = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });

  /* Duruma göre akıllı alt başlık — kullanıcıyı bir sonraki adıma yönlendirir */
  const heroSub = isFirstTime
    ? 'Her şey hazır — ilk PDF’ini yükle, düzeni bozmadan Türkçeleştirelim.'
    : dueCards > 0
      ? `Bugün seni ${dueCards} tekrar kartı bekliyor. Önce kısa bir tekrarla ısınmak ister misin?`
      : 'Kaldığın yerden devam edelim. Bugün ne çevirelim?';

  /* CTA üstündeki el yazısı not — bağlama göre değişir */
  const ctaNote = isFirstTime ? 'ilk adım burada' : 'hadi başlayalım';

  /* Kredi artık hero'daki halkada gösterildiği için stat şeridinde yok — tekrar etmesin */
  const stats = [
    { icon: FileText,     value: cDocs,  label: 'Belge',        color: '#6366f1' },
    { icon: CheckCircle2, value: cTrans, label: 'Çeviri',       color: '#10b981' },
    { icon: Brain,        value: cDue,   label: 'Bugün Tekrar', color: '#14b8a6' },
  ];

  /* Başlangıç rehberi — tamamı gerçek durumdan hesaplanır (sunucu + cihaz kullanımı) */
  const checklist = [
    { key: 'translate',   label: 'İlk belgeni çevir',       to: '/translate',   done: documents.length > 0 || totalTranslations > 0 },
    { key: 'chat',        label: 'Belgene soru sor',        to: '/chat',        done: (usage['chat'] ?? 0) > 0 },
    { key: 'study-notes', label: 'Ders notu çıkar',         to: '/study-notes', done: (usage['study-notes'] ?? 0) > 0 },
    { key: 'study',       label: 'Aralıklı tekrara başla',  to: '/study',       done: (usage['study'] ?? 0) > 0 || dueCards > 0 },
    { key: 'pin',         label: 'Favori aracını sabitle',  to: '/tools',       done: pinned.length > 0 },
  ];
  const doneCount = checklist.filter(c => c.done).length;
  const showChecklist = !loading && doneCount < checklist.length;

  const galleryItems = [
    ...GALLERY_FEATURES.map(f => ({ slug: f.slug, to: f.to, title: f.title, desc: f.desc, Icon: f.Icon, accent: f.accent })),
    { slug: 'tools', to: '/tools', title: 'Tüm Araçlar', desc: 'Hazır + yakında gelecek her şey', Icon: Compass, accent: '#6366f1' },
    ...(isAdmin ? [{ slug: 'admin', to: '/admin', title: 'Admin', desc: 'Kullanıcı ve kredi yönetimi', Icon: Shield, accent: '#f43f5e' }] : []),
  ];

  const tip = TIPS[new Date().getDate() % TIPS.length];

  return (
    <div className={styles.dashboard}>
      <OnboardingTour run={runTour} onFinish={finishTour} />

      {/* ── KOMUTA PANELİ: karşılama + krediler + sayılar tek yüzeyde ── */}
      <motion.section
        id="tour-header"
        className={styles.hero}
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className={styles.heroGlowA} aria-hidden="true" />
        <div className={styles.heroGlowB} aria-hidden="true" />

        <div className={styles.heroBody}>
          <div className={styles.heroLeft}>
            <span className={styles.heroKicker}>
              <motion.span
                style={{ display: 'inline-flex', color: greetIconColor }}
                initial={reduced ? false : { rotate: -12, scale: 0.6, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.15 }}
              >
                <GreetIcon size={15} strokeWidth={2.2} />
              </motion.span>
              {todayLabel}
            </span>
            <h1 className={styles.heroTitle}>
              {greeting}, <span className={styles.heroName}>{firstName}</span>
            </h1>
            <p className={styles.heroSub}>{heroSub}</p>

            <div className={styles.heroCtas}>
              <motion.span
                className={styles.ctaDoodle}
                initial={reduced ? false : { opacity: 0, rotate: -16, scale: 0.7 }}
                animate={{ opacity: 1, rotate: -4, scale: 1 }}
                transition={{ type: 'spring', stiffness: 240, damping: 15, delay: 0.55 }}
                aria-hidden="true"
              >
                {ctaNote} <DoodleArrow />
              </motion.span>
              <motion.div whileHover={reduced ? undefined : { y: -2 }} whileTap={reduced ? undefined : { scale: 0.97 }} transition={SPRING_TIGHT}>
                <Link to="/translate" className={styles.heroPrimary} onClick={() => recordUse('translate')}>
                  <Zap size={15} /> Çeviri Başlat
                </Link>
              </motion.div>
              <motion.div whileHover={reduced ? undefined : { y: -2 }} whileTap={reduced ? undefined : { scale: 0.97 }} transition={SPRING_TIGHT}>
                <Link to="/chat" className={styles.heroGhost} onClick={() => recordUse('chat')}>
                  <MessageSquare size={15} /> Belgene Soru Sor
                </Link>
              </motion.div>
            </div>
          </div>

          {/* Kredi paneli — kimlik bilgisinin hemen yanında */}
          <div className={styles.heroCredit} id="tour-credits">
            <div className={styles.heroCreditTop}>
              <span className={styles.heroCreditLabel}><Coins size={13} /> Aylık kredin</span>
              <span className={styles.planBadge}>{profile.plan.toUpperCase()}</span>
            </div>
            <div className={styles.ringWrap}>
              <svg viewBox="0 0 128 128" className={styles.ringSvg} role="img" aria-label={`Kredi: ${profile.credits_remaining} / ${profile.credits_monthly_limit}`}>
                <defs>
                  <linearGradient id="twRingGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#38B6FF" />
                    <stop offset="100%" stopColor="#0057FF" />
                  </linearGradient>
                </defs>
                <circle cx="64" cy="64" r={RING_R} className={styles.ringTrack} />
                <motion.circle
                  cx="64" cy="64" r={RING_R}
                  className={styles.ringFill}
                  stroke="url(#twRingGrad)"
                  strokeDasharray={RING_C}
                  initial={{ strokeDashoffset: RING_C }}
                  animate={{ strokeDashoffset: RING_C * (1 - ringPct / 100) }}
                  transition={{ duration: 1.2, ease: 'easeOut', delay: 0.35 }}
                  transform="rotate(-90 64 64)"
                />
              </svg>
              <div className={styles.ringCenter}>
                <span className={styles.ringNum}>{cCredits}</span>
                <span className={styles.ringTotal}>/ {profile.credits_monthly_limit}</span>
              </div>
            </div>
            <span className={styles.ringMetaLine}>
              <Languages size={13} />
              ≈ <strong>{pdfPerCredits(profile.credits_remaining, perPage)} sayfa</strong> kaldı
            </span>
            {profile.credits_reset_at && (
              <span className={styles.ringReset}>
                <Clock size={12} /> {new Date(profile.credits_reset_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} yenilenir
              </span>
            )}
            {creditPercent <= 20 && (
              <Link to="/#pricing" className={styles.ringUpgrade}>
                <Zap size={13} /> Kredi Yükle
              </Link>
            )}
          </div>
        </div>

        {/* Stat şeridi — panelin alt bandı, ince çizgiyle ayrık */}
        <motion.div
          id="tour-stats"
          className={styles.heroStats}
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          {stats.map(({ icon: Icon, value, label, color }) => (
            <motion.div
              key={label}
              className={styles.statCard}
              style={{ '--c': color } as React.CSSProperties}
              variants={item}
              whileHover={reduced ? undefined : { y: -3 }}
              transition={SPRING_TIGHT}
            >
              <div className={styles.statIcon}><Icon size={16} strokeWidth={2.4} /></div>
              <div className={styles.statBody}>
                <span className={styles.statNum}>{value}</span>
                <span className={styles.statLabel}>{label}</span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </motion.section>

      {/* ── Bugün tekrar (SRS) bandı ── */}
      {dueCards > 0 && (
        <motion.div
          className={styles.srsBand}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <div className={styles.srsIcon}><Brain size={20} /></div>
          <div className={styles.srsText}>
            <span className={styles.srsTitle}>Bugün {dueCards} kart tekrar edilecek</span>
            <span className={styles.srsSub}>Aralıklı tekrar serini sürdür — birkaç dakika yeter.</span>
          </div>
          <span className={styles.srsHand}>seriyi bozma!</span>
          <Link to="/study" className={styles.srsBtn} onClick={() => recordUse('study')}>
            <Play size={14} /> Çalış
          </Link>
        </motion.div>
      )}

      {/* ── Başlangıç rehberi — ne yapabileceğini adım adım öğretir ── */}
      {showChecklist && (
        <motion.div
          className={styles.guide}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4 }}
        >
          <div className={styles.guideHead}>
            <span className={styles.guideTitle}><Sparkles size={14} /> Başlangıç rehberi</span>
            <span className={styles.guideCount}>{doneCount}/{checklist.length}</span>
          </div>
          <div className={styles.guideTrack}>
            <motion.div
              className={styles.guideFill}
              initial={{ width: 0 }}
              animate={{ width: `${(doneCount / checklist.length) * 100}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.4 }}
            />
          </div>
          <div className={styles.guideItems}>
            {checklist.map(c => (
              <Link
                key={c.key}
                to={c.to}
                className={`${styles.guideItem} ${c.done ? styles.guideItemDone : ''}`}
              >
                <span className={styles.guideDot}>{c.done && <Check size={11} strokeWidth={3} />}</span>
                {c.label}
              </Link>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Ana ızgara: stüdyo (sol) + durum (sağ) ── */}
      <div className={styles.gridMain}>

        {/* Sol: araç galerisi */}
        <motion.div variants={stagger} initial="hidden" animate="visible">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionLabel}><Compass size={13} /> Stüdyo — neler yapabilirsin?</h2>
            <span className={styles.handAside}>en güçlü araç <DoodleArrow dir="downRight" /></span>
          </div>

          <div id="tour-actions" className={styles.gallery}>
            {/* Amiral gemisi: Belge Çevirisi */}
            <motion.div variants={item}>
              <Link to="/translate" className={styles.flagCard} onClick={() => recordUse('translate')}>
                <div className={styles.flagText}>
                  <span className={styles.flagKicker}><Languages size={13} /> Amiral gemisi</span>
                  <span className={styles.flagTitle}>Belge Çevirisi</span>
                  <span className={styles.flagDesc}>
                    PDF, Word veya slayt yükle; tablolar, formüller ve düzen korunarak Türkçeye çevrilsin.
                  </span>
                  <span className={styles.flagCta}>Çeviriye başla <ArrowRight size={14} /></span>
                  <span className={styles.flagHand}>✦ düzen birebir korunur</span>
                </div>
                <div className={styles.flagViz} aria-hidden="true">
                  <div className={styles.flagVizCol}>
                    <span className={styles.flagVizTag}>EN</span>
                    <span className={styles.flagVizLine} style={{ width: '90%' }} />
                    <span className={styles.flagVizLine} style={{ width: '68%' }} />
                    <span className={styles.flagVizLine} style={{ width: '80%' }} />
                  </div>
                  <ArrowRight size={13} className={styles.flagVizArrow} />
                  <div className={styles.flagVizCol}>
                    <span className={`${styles.flagVizTag} ${styles.flagVizTagTR}`}>TR</span>
                    <span className={`${styles.flagVizLine} ${styles.flagVizLineTR}`} style={{ width: '88%' }} />
                    <span className={`${styles.flagVizLine} ${styles.flagVizLineTR}`} style={{ width: '70%' }} />
                    <span className={`${styles.flagVizLine} ${styles.flagVizLineTR}`} style={{ width: '78%' }} />
                  </div>
                </div>
              </Link>
            </motion.div>

            {/* Diğer araç karoları */}
            <div className={styles.toolGrid}>
              {galleryItems.map(({ slug, to, title, desc, Icon, accent }) => (
                <motion.div key={slug} variants={item}>
                  <Link
                    to={to}
                    className={styles.toolCard}
                    style={{ '--ac': accent } as React.CSSProperties}
                    onClick={() => {
                      if (getFeatureBySlug(slug)?.status === 'ready') recordUse(slug);
                    }}
                  >
                    <div className={styles.toolIcon}><Icon size={18} strokeWidth={2.1} /></div>
                    <div className={styles.toolText}>
                      <span className={styles.toolTitle}>{title}</span>
                      <span className={styles.toolDesc}>{desc}</span>
                    </div>
                    <ChevronRight size={15} className={styles.toolChev} />
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Sağ: son belgeler + ipucu (krediler artık komuta panelinde) */}
        <div className={styles.sideCol}>

          {/* Son belgeler */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.4 }}
          >
            <h2 className={styles.sectionLabel}><Clock size={13} /> Son Belgeler</h2>

            {isFirstTime ? (
              <div className={styles.emptyState}>
                <motion.div
                  className={styles.emptyIcon}
                  animate={reduced ? undefined : { y: [0, -4, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <FileText size={22} strokeWidth={1.5} />
                </motion.div>
                <p className={styles.emptyTitle}>Henüz belge yok</p>
                <p className={styles.emptyDesc}>İlk PDF belgeni yükle — çeviri, özet ve soru-cevap buradan başlıyor.</p>
                <Link to="/translate" className={styles.emptyBtn} onClick={() => recordUse('translate')}>
                  Belge Yükle <ArrowRight size={13} />
                </Link>
              </div>
            ) : (
              <div className={styles.docList}>
                {documents.map(doc => (
                  <div key={doc.id} className={styles.docRow}>
                    <div className={styles.docIcon}><FileText size={14} strokeWidth={2} /></div>
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
                  </div>
                ))}
                <Link to="/documents" className={styles.viewAll} onClick={() => recordUse('documents')}>
                  Tümünü görüntüle <ArrowRight size={13} />
                </Link>
              </div>
            )}
          </motion.div>

          {/* Günün ipucu — yapışkan not */}
          <motion.div
            className={styles.tipCard}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            <div className={styles.tipIcon}><Lightbulb size={16} /></div>
            <div className={styles.tipText}>
              <span className={styles.tipTitle}>Biliyor muydun?</span>
              <span className={styles.tipBody}>{tip}</span>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
