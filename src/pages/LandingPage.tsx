/**
 * LandingPage — "Porselen & Mavi Cam" redesign.
 *
 * Açık tema: süt beyazı porselen zemin, frosted-glass macOS pencereleri,
 * mavi cam vurgular, Apple/Tesla havasında yumuşak yuvarlak hatlar.
 * Tüm veri kaynakları korunur: app_config (fiyat/limit/indirim), kredi
 * maliyetleri, sepet, gerçek yorumlar (LandingReviews) ve gerçek SSS (LandingFaq).
 */
import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  motion, AnimatePresence as AP, useReducedMotion, useScroll, useSpring,
  useMotionValue, useTransform,
} from 'framer-motion';
import {
  ArrowRight, Check, Play, Languages, FileText, Sigma, Table2, Layers,
  Sparkles, MessageSquare, Brain, BookOpen, Zap, Loader, RotateCcw,
  Download, FileType, FileCode, Globe, Image as ImageIcon, Send, X,
  Flame, TrendingUp, Target, Award, Lock, CreditCard, RefreshCcw,
  ShieldCheck, Gift, Mail, Phone, MapPin, GraduationCap, FlaskConical, BookMarked,
} from 'lucide-react';
import { COMPANY } from '../content/legal';
import { PRICING_PLANS, CREDIT_COSTS, pdfPerCredits, fmtCredit } from '../lib/constants';
import { READY_FEATURES, UPCOMING_FEATURES } from '../lib/upcomingFeatures';
import { supabase } from '../lib/supabase';
import { Magnetic, useAnimatedNumber } from '../components/ui/motion';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/auth';
import Seo, { SITE_URL } from '../components/Seo';
import LandingReviews from '../components/landing/LandingReviews';
import LandingFaq from '../components/landing/LandingFaq';
import SectionHeader from '../components/landing/SectionHeader';
import toast from 'react-hot-toast';
import styles from '../styles/components/landing.module.css';

/* ── Ortak animasyon varyantları ─────────────────────────── */
const EASE = [0.22, 1, 0.36, 1] as const;

const rise = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.6, ease: EASE },
  }),
};

const scrollTo = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/* ── Hero başlığı: kelime kelime, blur'dan netleşerek ────── */
const TITLE_WORDS = ['Yükle.', 'Çevir.', 'Öğren.'];

/* ── Dil şeridi (marquee) ── */
const LANGS = [
  'İngilizce', 'Almanca', 'Fransızca', 'İspanyolca', 'Arapça', 'Çince',
  'Japonca', 'Korece', 'Rusça', 'Portekizce', 'İtalyanca', 'Felemenkçe',
];

/* ── Eski yöntem vs TransWordly ── */
const COMPARE_OLD = [
  'Sözlük, sekmeler, kopyala–yapıştır',
  'Tablolar ve formüller dağılır',
  'Tek makale saatler alır',
  'Özet ve tekrar için ayrı uygulamalar',
];
const COMPARE_NEW = [
  'Belgeyi yükle, Türkçesini indir',
  'Düzen %100 korunur',
  '150 sayfa dakikalar içinde',
  'Özet, soru-cevap ve ders notu dahil',
];

/* ── Kimler için — persona kartları (uydurma metrik yok) ── */
const PERSONAS = [
  {
    Icon: GraduationCap, accent: '#0066FF', title: 'Lisans öğrencisi',
    pain: 'İngilizce ders kitabı ve makaleler yüzünden vaktin konuya değil, çeviriye gidiyor.',
    flow: 'Bölüm PDF’ini yükle → Türkçesini oku → takıldığın yeri belgeye sor.',
    tools: ['Belge Çevirisi', 'AI Chat'],
  },
  {
    Icon: FlaskConical, accent: '#8B5CF6', title: 'Lisansüstü & doktora',
    pain: 'Literatür taraması onlarca yabancı makale demek; her biri saatlerini alıyor.',
    flow: 'Makaleleri çevir → özet çıkar → alanına özel terim sözlüğünü oluştur.',
    tools: ['Belge Çevirisi', 'Sözlük', 'AI Chat'],
  },
  {
    Icon: BookMarked, accent: '#F97316', title: 'Akademisyen & araştırmacı',
    pain: 'Yabancı yayınları takip etmek ve akademik dilde yazmak iki ayrı yük.',
    flow: 'Yayını çevir → notunu çıkar → metnini yazım asistanıyla akademikleştir.',
    tools: ['Belge Çevirisi', 'Yazım Asistanı'],
  },
  {
    Icon: Target, accent: '#14B8A6', title: 'Sınava hazırlanan',
    pain: 'Not çıkarmak ve tekrar planlamak, çalışmanın kendisinden uzun sürüyor.',
    flow: 'Görsellerden ders notu çıkar → flashcard’a çevir → aralıklı tekrarla pekiştir.',
    tools: ['Ders Notu', 'Aralıklı Tekrar'],
  },
];

/* ── Hero demo metinleri (typewriter) ────────────────────── */
const HERO_DEMOS = [
  {
    file: 'neuroplasticity_en.pdf',
    en: '"This study examines neuroplasticity and its effects on cognitive learning. Early interventions yield significant long-term cognitive benefits..."',
    tr: '"Bu çalışmada nöroplastisite ve bilişsel öğrenme süreçleri incelenmiştir. Erken müdahaleler uzun vadeli bilişsel faydalar sağlamaktadır..."',
  },
  {
    file: 'climate_report_2024.pdf',
    en: '"Global climate indicators show accelerating warming trends. Immediate decarbonization policies are critical to limiting temperature rise to 1.5°C..."',
    tr: '"Küresel iklim göstergeleri hızlanan ısınma eğilimi göstermektedir. Sıcaklık artışını 1.5°C ile sınırlamak için acil karbonsuzlaştırma politikaları kritik öneme sahiptir..."',
  },
  {
    file: 'quantum_computing.pdf',
    en: '"Quantum entanglement enables particles to be correlated regardless of distance. This principle forms the foundation of quantum cryptography..."',
    tr: '"Kuantum dolanıklığı, parçacıkların mesafeden bağımsız olarak ilişkilendirilmesini sağlar. Bu ilke, kuantum kriptografisinin temelini oluşturur..."',
  },
];

/* ── Typewriter hook ─────────────────────────────────────── */
function useTypewriter(texts: string[], speed = 28, pause = 2800) {
  const [displayed, setDisplayed] = useState('');
  const [demoIdx, setDemoIdx] = useState(0);
  const [phase, setPhase] = useState<'typing' | 'waiting' | 'erasing'>('typing');

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const target = texts[demoIdx];

    if (phase === 'typing') {
      if (displayed.length < target.length) {
        timeout = setTimeout(() => setDisplayed(target.slice(0, displayed.length + 1)), speed);
      } else {
        timeout = setTimeout(() => setPhase('erasing'), pause);
      }
    } else if (phase === 'erasing') {
      if (displayed.length > 0) {
        timeout = setTimeout(() => setDisplayed(d => d.slice(0, -1)), speed / 2);
      } else {
        setDemoIdx(i => (i + 1) % texts.length);
        setPhase('typing');
      }
    }
    return () => clearTimeout(timeout);
  }, [displayed, phase, demoIdx, texts, speed, pause]);

  return { displayed, demoIdx, isTyping: phase === 'typing' };
}

/* ── Hero penceresi için yumuşak 3D tilt ─────────────────── */
function useTilt(disabled: boolean) {
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(py, [0, 1], [4.5, -4.5]), { stiffness: 140, damping: 20 });
  const rotateY = useSpring(useTransform(px, [0, 1], [-6, 6]), { stiffness: 140, damping: 20 });

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  }, [disabled, px, py]);

  const onLeave = useCallback(() => { px.set(0.5); py.set(0.5); }, [px, py]);

  return { rotateX, rotateY, onMove, onLeave };
}

/* ── Bento: amiral gemisi = Çeviri; geri kalan araçlar karo ── */
const TOOL_CARDS = READY_FEATURES.filter(f => f.slug !== 'translate');

/* ── Habit / haftalık aktivite mock verisi ── */
const HABIT_WEEK = [
  { d: 'Pzt', h: 62, on: true },
  { d: 'Sal', h: 88, on: true },
  { d: 'Çar', h: 44, on: true },
  { d: 'Per', h: 100, on: true },
  { d: 'Cum', h: 70, on: true },
  { d: 'Cmt', h: 36, on: true },
  { d: 'Paz', h: 18, on: false },
];

/* ── Canlı demo metinleri ─────────────────────────────────── */
const DEMO_TR = `Bu çalışmada nöroplastisite kavramı ve bilişsel öğrenme süreçleri üzerindeki etkileri kapsamlı biçimde incelenmiştir. Araştırma bulguları, erken dönem müdahalelerin uzun vadeli bilişsel faydalar sağladığını ortaya koymaktadır.

Kullanılan yöntemler arasında boylamsal gözlem, bilişsel haritalama ve demografik değişkenler arası karşılaştırmalı analiz yer almaktadır. Çalışma, eğitim politikalarına yönelik somut öneriler sunmaktadır.`;

const DEMO_SUMMARY_BULLETS = [
  'Erken müdahale, uzun vadeli bilişsel kazanımları %38 artırıyor.',
  'Boylamsal gözlem + bilişsel haritalama yöntemleri kullanılmış.',
  '12 ülke ve 4.200 katılımcı üzerinde yürütülen bir meta-analiz.',
  'Eğitim politikaları için 3 somut öneriyle sonuçlanıyor.',
];

const DEMO_CHAT = [
  { role: 'user' as const, text: 'Erken müdahalenin etkisi nedir?' },
  { role: 'ai' as const,   text: 'Çalışmaya göre 0–5 yaş aralığında uygulanan müdahaleler, kontrol grubuna kıyasla uzun vadeli bilişsel performansı **%38 oranında** artırıyor (s. 4, Tablo 2).' },
];

type LivePhase = 'idle' | 'analyzing' | 'extracting' | 'translating' | 'composing' | 'complete';
type ResultTab  = 'translation' | 'summary' | 'ask';

const PHASE_INFO: Record<LivePhase, { label: string; sub: string }> = {
  idle:        { label: 'Hazır',                 sub: 'Çevir butonuna basın' },
  analyzing:   { label: 'Belge analiz ediliyor', sub: 'Yapı, dil ve sayfa sayısı tespiti' },
  extracting:  { label: 'Metin çıkarılıyor',     sub: 'Sayfa düzeni ve görseller korunuyor' },
  translating: { label: 'AI ile çevriliyor',     sub: 'Akademik terimler bağlama göre eşleniyor' },
  composing:   { label: 'PDF oluşturuluyor',     sub: 'Orijinal düzen üzerine yerleştiriliyor' },
  complete:    { label: 'Tamamlandı',            sub: 'Çeviri hazır' },
};

/* ── Görünürde sayarak gelen istatistik ── */
function CountStat({ value, suffix, label, duration = 1200 }: { value: number; suffix?: string; label: string; duration?: number }) {
  const [run, setRun] = useState(false);
  const n = useAnimatedNumber(run ? value : 0, duration);
  return (
    <motion.div
      className={styles.statItem}
      onViewportEnter={() => setRun(true)}
      viewport={{ once: true, amount: 0.6 }}
    >
      <div className={styles.statNum}>{n.toLocaleString('tr-TR')}{suffix && <em>{suffix}</em>}</div>
      <div className={styles.statLabel}>{label}</div>
    </motion.div>
  );
}

/* ── El çizimi dalgalı alt çizgi (kelimenin altını çizmiş gibi) ── */
function HandUnderline({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 8" fill="none" preserveAspectRatio="none" aria-hidden="true">
      <path d="M2 5C20 2 38 6 56 4S94 1 118 4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/* ── El çizimi kıvrık ok (bir şeyi işaret eder gibi) ── */
function HandArrow({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 70 52" fill="none" aria-hidden="true">
      <path d="M6 6C16 30 33 43 60 42" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M60 42L48 41M60 42L54 30" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  const { add: addToCart } = useCart();

  /* ── Scroll ilerleme çubuğu ── */
  const { scrollYProgress } = useScroll();
  const progressScaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });
  const demoStarted = useRef(false);

  /* ── Hero scroll parallax — pencere scroll'dan biraz geç gelir ── */
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress: heroProg } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const stageY     = useTransform(heroProg, [0, 1], [0, 110]);
  const stageScale = useTransform(heroProg, [0, 1], [1, 0.965]);
  const headY      = useTransform(heroProg, [0, 1], [0, 55]);

  /* ── Kartlarda imleci takip eden spot ışığı (--mx/--my) ── */
  const spotMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, []);

  /* ── Hero 3D tilt ── */
  const tilt = useTilt(!!reduced);


  /* ── Nazik kayıt hatırlatıcısı (oturumda bir kez, bir süre sonra) ── */
  const { user } = useAuth();
  const [showNudge, setShowNudge] = useState(false);
  useEffect(() => {
    if (user) return;
    try { if (sessionStorage.getItem('tw_signup_nudge') === 'dismissed') return; } catch { /* yoksay */ }
    const t = setTimeout(() => setShowNudge(true), 28000);
    return () => clearTimeout(t);
  }, [user]);
  const dismissNudge = useCallback(() => {
    setShowNudge(false);
    try { sessionStorage.setItem('tw_signup_nudge', 'dismissed'); } catch { /* yoksay */ }
  }, []);

  /* ── Hero typewriter ── */
  const trTexts = HERO_DEMOS.map(d => d.tr);
  const { displayed: twDisplayed, demoIdx: twIdx, isTyping: twIsTyping } = useTypewriter(
    trTexts, reduced ? 0 : 28,
  );

  /* ── Tüm app_config (fiyatlar, limitler, indirimler) ── */
  const [pricingCfg, setPricingCfg] = useState<Record<string, number>>({});
  const [isStudent, setIsStudent] = useState(false);
  useEffect(() => {
    supabase
      .from('app_config')
      .select('key, value')
      .then(({ data }) => {
        if (!data) return;
        const m: Record<string, number> = {};
        for (const row of data) m[row.key] = Number(row.value);
        setPricingCfg(m);
      });
  }, []);

  /* ── Dinamik plan verisi (app_config override'ı) ── */
  const effectivePlans = useMemo(() => {
    return PRICING_PLANS.map(plan => {
      const credits    = plan.credits > 0  ? (pricingCfg[`plan_limit.${plan.id}`]  ?? plan.credits) : plan.credits;
      const basePrice  = plan.price  > 0  ? (pricingCfg[`plan_price.${plan.id}`]  ?? plan.price)   : plan.price;
      const discountPct = plan.price > 0  ? (pricingCfg[`discount.${plan.id}`]    ?? 0)             : 0;
      const studentOff  = pricingCfg['discount.student_amount'] ?? 0;

      const afterPctDiscount = discountPct > 0
        ? Math.round(basePrice * (1 - discountPct / 100))
        : basePrice;

      const studentPrice = isStudent && plan.price > 0 && studentOff > 0
        ? Math.max(0, afterPctDiscount - studentOff)
        : afterPctDiscount;

      return {
        ...plan,
        credits,
        basePrice,
        discountPct,
        studentOff,
        afterPctDiscount,
        studentPrice,
        showOriginal: discountPct > 0 || (isStudent && plan.price > 0 && studentOff > 0),
        displayedPrice: isStudent && plan.price > 0 ? studentPrice : afterPctDiscount,
      };
    });
  }, [pricingCfg, isStudent]);

  /* ── Dinamik kredi maliyetleri ── */
  const credit = useMemo(() => ({
    perPage: pricingCfg['credit_cost.translation_per_page'] ?? CREDIT_COSTS.TRANSLATION_PER_PAGE,
    study:   pricingCfg['credit_cost.study_notes']          ?? CREDIT_COSTS.STUDY_NOTES_PER_SOURCE,
    chat:    pricingCfg['credit_cost.chat']                 ?? CREDIT_COSTS.CHAT_PER_QUESTION,
  }), [pricingCfg]);

  /* ── Canlı demo state ── */
  const [livePhase, setLivePhase] = useState<LivePhase>('idle');
  const [liveProgress, setLiveProgress] = useState(0);
  const [liveStreamed, setLiveStreamed] = useState('');
  const [livePage, setLivePage] = useState(1);
  const [resultTab, setResultTab] = useState<ResultTab>('translation');
  const [summaryShown, setSummaryShown] = useState<number>(0);
  const [chatStep, setChatStep] = useState<number>(0);
  const [chatTyped, setChatTyped] = useState('');

  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const summaryRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = useCallback(() => {
    if (progressRef.current) clearInterval(progressRef.current);
    if (streamRef.current)   clearInterval(streamRef.current);
    if (summaryRef.current)  clearInterval(summaryRef.current);
    if (chatRef.current)     clearInterval(chatRef.current);
    phaseTimers.current.forEach(t => clearTimeout(t));
    phaseTimers.current = [];
  }, []);

  const resetDemo = useCallback(() => {
    clearTimers();
    setLivePhase('idle');
    setLiveProgress(0);
    setLiveStreamed('');
    setLivePage(1);
    setResultTab('translation');
    setSummaryShown(0);
    setChatStep(0);
    setChatTyped('');
  }, [clearTimers]);

  const startDemo = useCallback(() => {
    if (livePhase !== 'idle') return;
    clearTimers();
    setLiveProgress(0);
    setLiveStreamed('');
    setLivePage(1);

    setLivePhase('analyzing');
    const t1 = setTimeout(() => {
      setLivePhase('extracting');
      const t2 = setTimeout(() => {
        setLivePhase('translating');

        let prog = 28;
        progressRef.current = setInterval(() => {
          prog += 0.8;
          setLiveProgress(prog);
          setLivePage(Math.max(1, Math.min(Math.ceil((prog - 28) / 7.5), 8)));
          if (prog >= 88) {
            clearInterval(progressRef.current!);
            setLivePhase('composing');
            let prog2 = 88;
            progressRef.current = setInterval(() => {
              prog2 += 2;
              setLiveProgress(prog2);
              if (prog2 >= 100) {
                clearInterval(progressRef.current!);
                const tDone = setTimeout(() => setLivePhase('complete'), 280);
                phaseTimers.current.push(tDone);
              }
            }, 50);
          }
        }, 30);

        let idx = 0;
        streamRef.current = setInterval(() => {
          idx += 5;
          if (idx <= DEMO_TR.length) {
            setLiveStreamed(DEMO_TR.slice(0, idx));
          } else {
            clearInterval(streamRef.current!);
            setLiveStreamed(DEMO_TR);
          }
        }, 26);
      }, 600);
      phaseTimers.current.push(t2);
    }, 700);
    phaseTimers.current.push(t1);
  }, [livePhase, clearTimers]);

  /* Özet sekmesi → maddeler tek tek belirir */
  useEffect(() => {
    if (livePhase !== 'complete') return;
    if (resultTab !== 'summary') return;
    if (summaryShown >= DEMO_SUMMARY_BULLETS.length) return;
    setSummaryShown(0);
    let i = 0;
    summaryRef.current = setInterval(() => {
      i += 1;
      setSummaryShown(i);
      if (i >= DEMO_SUMMARY_BULLETS.length) clearInterval(summaryRef.current!);
    }, 360);
    return () => { if (summaryRef.current) clearInterval(summaryRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultTab, livePhase]);

  /* Soru sekmesi → senaryolu soru-cevap */
  useEffect(() => {
    if (livePhase !== 'complete') return;
    if (resultTab !== 'ask') return;
    setChatStep(0);
    setChatTyped('');
    const tShowUser = setTimeout(() => setChatStep(1), 280);
    const tTyping   = setTimeout(() => setChatStep(2), 900);
    const tStream   = setTimeout(() => {
      setChatStep(3);
      let i = 0;
      chatRef.current = setInterval(() => {
        i += 4;
        if (i <= DEMO_CHAT[1].text.length) {
          setChatTyped(DEMO_CHAT[1].text.slice(0, i));
        } else {
          clearInterval(chatRef.current!);
          setChatTyped(DEMO_CHAT[1].text);
        }
      }, 22);
    }, 1700);
    phaseTimers.current.push(tShowUser, tTyping, tStream);
    return () => {
      clearTimeout(tShowUser); clearTimeout(tTyping); clearTimeout(tStream);
      if (chatRef.current) clearInterval(chatRef.current);
    };
  }, [resultTab, livePhase]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const phaseInfo = PHASE_INFO[livePhase];
  const isBusy = livePhase !== 'idle' && livePhase !== 'complete';

  /* Yol haritası rayını sürekli kaydırmak için iki kez tekrarla */
  const railItems = [...UPCOMING_FEATURES, ...UPCOMING_FEATURES];

  return (
    <div className={styles.page}>
      <motion.div className={styles.scrollProgress} style={{ scaleX: progressScaleX }} aria-hidden="true" />
      <Seo
        title="TransWordly — Akademik PDF & Belge Çevirisi (12 Dil → Türkçe)"
        description="Akademik makale, PDF, Word ve slaytlarınızı 12 dilden Türkçe'ye AI ile dakikalar içinde çevirin. Format korunur; ders notu çıkarın, belgelerinize AI ile soru sorun."
        canonical={`${SITE_URL}/`}
        ogType="website"
      />

      {/* ══════════════ HERO ══════════════ */}
      <section className={styles.hero} ref={heroRef}>
        {/* Aurora arka plan katmanları */}
        <div className={styles.aurora} aria-hidden="true">
          <span className={`${styles.auroraBlob} ${styles.auroraA}`} />
          <span className={`${styles.auroraBlob} ${styles.auroraB}`} />
          <span className={`${styles.auroraBlob} ${styles.auroraC}`} />
        </div>
        <div className={styles.heroGrid} aria-hidden="true" />

        <div className={styles.heroInner}>
          <motion.div className={styles.heroHead} style={reduced ? undefined : { y: headY }}>
          {/* El yazısı kicker — eski "dynamic island" (ai-slop) yerine
              kağıt-craft, elle yazılmış custom not + dalgalı alt çizgi. */}
          <motion.div
            className={styles.heroTag}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -14, rotate: -7 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, rotate: -2.5 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
          >
            <Sparkles className={styles.heroTagStar} aria-hidden="true" />
            <span className={styles.heroTagText}>
              12 dilden Türkçe’ye
              <HandUnderline className={styles.heroTagUnderline} />
            </span>
          </motion.div>

          {/* Dev başlık — kelime kelime belirir */}
          <h1 className={styles.heroTitle}>
            {TITLE_WORDS.map((w, i) => (
              <motion.span
                key={w}
                className={`${styles.heroWord} ${i === 2 ? styles.grad : ''}`}
                initial={{ opacity: 0, y: 38, filter: 'blur(14px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.75, delay: 0.15 + i * 0.14, ease: EASE }}
              >
                {w}
              </motion.span>
            ))}
          </h1>

          <motion.p
            className={styles.heroSub}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.55, ease: EASE }}
          >
            Makale, kitap, slayt — <strong>12 dilden Türkçe'ye</strong>, düzeni bozulmadan,
            dakikalar içinde. Sonra özet çıkar, belgene soru sor, ders notuna dönüştür.
          </motion.p>

          <motion.div
            className={styles.heroCtas}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.68, ease: EASE }}
          >
            <Magnetic strength={0.14}>
              <motion.div whileTap={reduced ? undefined : { scale: 0.97 }}>
                <Link to="/auth?mode=register" className={styles.ctaPrimary}>
                  <span className={styles.ctaShine} aria-hidden="true" />
                  Ücretsiz Başla
                  <ArrowRight size={17} />
                </Link>
              </motion.div>
            </Magnetic>
            <a href="#how-it-works" className={styles.ctaGhost} onClick={scrollTo('how-it-works')}>
              <span className={styles.ctaGhostIcon}><Play size={13} /></span>
              Canlı Demoyu İzle
            </a>
          </motion.div>

          <motion.div
            className={styles.heroMeta}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.82 }}
          >
            <span className={styles.heroMetaItem}><Check size={14} /> 10 kredi hediye</span>
            <span className={styles.heroMetaItem}><Check size={14} /> Kredi kartı gerekmez</span>
            <span className={styles.heroMetaItem}><Check size={14} /> 30 saniyede kayıt</span>
          </motion.div>
          </motion.div>

          {/* Hero penceresi — macOS tarzı, 3D tilt'li çeviri sahnesi.
              Dış katman scroll parallax'ı, iç katman giriş animasyonunu taşır. */}
          <motion.div
            className={styles.heroStageParallax}
            style={reduced ? undefined : { y: stageY, scale: stageScale }}
          >
          <motion.div
            className={styles.heroStage}
            initial={{ opacity: 0, y: 60, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.5, ease: EASE }}
          >
            <motion.div
              className={styles.heroWindow}
              style={reduced ? undefined : { rotateX: tilt.rotateX, rotateY: tilt.rotateY, transformPerspective: 1400 }}
              onMouseMove={tilt.onMove}
              onMouseLeave={tilt.onLeave}
            >
              <div className={styles.winBar}>
                <span className={styles.winDots} aria-hidden="true"><i /><i /><i /></span>
                <AP mode="wait">
                  <motion.span
                    key={twIdx}
                    className={styles.winFile}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.3 }}
                  >
                    <FileText size={11} /> {HERO_DEMOS[twIdx].file}
                  </motion.span>
                </AP>
                <span className={`${styles.winStatus} ${!twIsTyping ? styles.winStatusDone : ''}`}>
                  {twIsTyping ? 'Çevriliyor…' : <><Check size={11} /> Tamamlandı</>}
                </span>
              </div>

              <div className={styles.winBody}>
                <div className={`${styles.winPane} ${styles.winPaneEN}`}>
                  <span className={styles.winLang}>EN</span>
                  <AP mode="wait">
                    <motion.p
                      key={twIdx}
                      className={styles.winText}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4 }}
                    >
                      {HERO_DEMOS[twIdx].en}
                    </motion.p>
                  </AP>
                </div>

                <div className={styles.winCore} aria-hidden="true">
                  <span className={styles.winCoreRing} />
                  <span className={styles.winCoreOrb}><Languages size={18} /></span>
                </div>

                <div className={`${styles.winPane} ${styles.winPaneTR}`}>
                  <span className={`${styles.winLang} ${styles.winLangTR}`}>TR</span>
                  <p className={`${styles.winText} ${styles.winTextTR}`}>
                    {twDisplayed}
                    <span className={styles.typeCursor} aria-hidden="true" />
                  </p>
                  <div className={styles.winDl}>
                    <span className={styles.dlChip}><FileText size={10} /> PDF</span>
                    <span className={styles.dlChip}><FileType size={10} /> Word</span>
                    <span className={styles.dlChip}><FileCode size={10} /> TXT</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Yüzen güven çipleri */}
            <motion.span
              className={`${styles.floatChip} ${styles.floatChipA}`}
              animate={reduced ? undefined : { y: [0, -8, 0] }}
              transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Sigma size={13} /> LaTeX &amp; formüller korunur
            </motion.span>
            <motion.span
              className={`${styles.floatChip} ${styles.floatChipB}`}
              animate={reduced ? undefined : { y: [0, 9, 0] }}
              transition={{ duration: 6.2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
            >
              <Table2 size={13} /> Tablolar korunur
            </motion.span>
            <motion.span
              className={`${styles.floatChip} ${styles.floatChipC}`}
              animate={reduced ? undefined : { y: [0, -7, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1.1 }}
            >
              <Layers size={13} /> 150 sayfaya kadar
            </motion.span>
          </motion.div>
          </motion.div>
        </div>

        {/* Dil şeridi — sürekli kayan */}
        <div className={styles.langStrip} aria-hidden="true">
          <div className={styles.langRail}>
            {[...LANGS, ...LANGS].map((lang, i) => (
              <span key={`${lang}-${i}`} className={styles.langItem}>
                {lang} <ArrowRight size={11} /> <strong>Türkçe</strong>
              </span>
            ))}
          </div>
        </div>

        {/* İstatistik şeridi */}
        <motion.div
          className={styles.statsRow}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <CountStat value={7}   label="Araç · tek abonelik" />
          <CountStat value={12}  suffix="+" label="Kaynak dil" />
          <CountStat value={150} suffix="+" label="Sayfa kapasitesi" />
          <CountStat value={256} suffix="-bit" label="Şifreleme" />
        </motion.div>
      </section>

      {/* ══════════════ ARAÇ SETİ (#features) ══════════════ */}
      <section className={styles.toolsSection} id="features">
        <SectionHeader
          label="01 · Araç Seti"
          title={<>Tek abonelik. <span className={styles.grad}>Yedi araç.</span></>}
          note="hepsi bir arada!"
          desc={<>TransWordly yalnızca bir çevirmen değil — okumadan sınava kadar tüm akış için
            <strong> yedi araç</strong> bir arada. Ayrı uygulama, ayrı ücret yok.</>}
        />

        <div className={styles.bento}>
          {/* Amiral gemisi karo */}
          <motion.div
            className={styles.bentoFlag}
            initial={{ opacity: 0, y: 26 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.65, ease: EASE }}
          >
            <div className={styles.bentoFlagText}>
              <span className={styles.bentoFlagKicker}><Languages size={14} /> 01 · Amiral gemisi</span>
              <h3 className={styles.bentoFlagTitle}>Akademik belgeleri düzenini bozmadan çevir</h3>
              <p className={styles.bentoFlagDesc}>
                PDF, Word veya slaytını yükle; başlık hiyerarşisi, tablolar, LaTeX formülleri ve
                şekil başlıkları korunarak Türkçe'ye çevrilsin. 150 sayfaya kadar, dakikalar içinde.
              </p>
              <Link to="/auth?mode=register" className={styles.bentoFlagCta}>
                Hemen dene <ArrowRight size={16} />
              </Link>
            </div>
            <div className={styles.bentoFlagViz}>
              <div className={styles.vizCols}>
                <div className={styles.vizCol}>
                  <span className={styles.vizTag}>EN</span>
                  <span className={styles.vizLine} style={{ width: '92%' }} />
                  <span className={styles.vizLine} style={{ width: '70%' }} />
                  <span className={styles.vizLine} style={{ width: '83%' }} />
                  <span className={styles.vizLine} style={{ width: '56%' }} />
                </div>
                <div className={styles.vizColDiv} aria-hidden="true"><ArrowRight size={13} /></div>
                <div className={styles.vizCol}>
                  <span className={`${styles.vizTag} ${styles.vizTagTR}`}>TR</span>
                  <span className={`${styles.vizLine} ${styles.vizLineTR}`} style={{ width: '90%' }} />
                  <span className={`${styles.vizLine} ${styles.vizLineTR}`} style={{ width: '72%' }} />
                  <span className={`${styles.vizLine} ${styles.vizLineTR}`} style={{ width: '81%' }} />
                  <span className={`${styles.vizLine} ${styles.vizLineTR}`} style={{ width: '58%' }} />
                </div>
              </div>
              <div className={styles.vizFoot}><Check size={12} /> Düzen %100 korundu</div>
            </div>
          </motion.div>

          {/* Araç karoları — her biri kendi vurgu rengiyle */}
          {TOOL_CARDS.map((f, i) => (
            <motion.div
              key={f.slug}
              variants={rise}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i}
            >
              <Link
                to={f.to}
                className={styles.toolCard}
                style={{ '--ac': f.accent } as React.CSSProperties}
                onMouseMove={spotMove}
              >
                <div className={styles.toolTop}>
                  <div className={styles.toolIcon}><f.Icon size={20} /></div>
                  <span className={styles.toolNum}>{String(i + 2).padStart(2, '0')}</span>
                </div>
                <div className={styles.toolTitle}>{f.title}</div>
                <div className={styles.toolDesc}>{f.desc}</div>
                <span className={styles.toolLink}>
                  İncele <ArrowRight size={14} className={styles.toolArrow} />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Yol haritası rayı */}
        <div className={styles.roadWrap}>
          <div className={styles.roadHead}><span>Yol haritasında</span></div>
          <div className={styles.roadViewport}>
            <div className={styles.roadRail}>
              {railItems.map((f, i) => (
                <div className={styles.roadChip} key={`${f.slug}-${i}`}>
                  <f.Icon size={15} />
                  {f.title}
                  <span className={styles.roadSoon}>{f.status === 'building' ? 'Yapımda' : 'Yakında'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════ CANLI DEMO (#how-it-works) ══════════════ */}
      <section className={styles.demoSection} id="how-it-works">
        <SectionHeader
          label="02 · Nasıl Çalışır"
          title={<>Önce çevir, <span className={styles.grad}>sonra anla.</span></>}
          note="canlı izle!"
          desc={<>PDF'i orijinal düzeniyle çeviririz — sonra özet çıkarın veya belgeye sorular sorun.
            "Çevir" butonuna tıklayın ve canlı izleyin.</>}
        />

        <motion.div
          className={styles.demoWindow}
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.7, ease: EASE }}
          onViewportEnter={() => {
            if (!reduced && !demoStarted.current && livePhase === 'idle') {
              demoStarted.current = true;
              setTimeout(() => startDemo(), 450);
            }
          }}
        >
          <div className={styles.demoBar}>
            <span className={styles.winDots} aria-hidden="true"><i /><i /><i /></span>
            <span className={styles.demoBarFile}><FileText size={11} /> neuroplasticity_en.pdf</span>
            <div className={styles.demoBarBadge}>
              <motion.span
                className={styles.demoBarDot}
                animate={{ opacity: livePhase !== 'idle' ? [1, 0.3, 1] : 1 }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              Canlı Demo
            </div>
          </div>

          <div className={styles.demoBody}>
            {/* Sol kontrol paneli */}
            <div className={styles.demoLeft}>
              <div className={styles.demoFileCard}>
                <div className={`${styles.demoFileIcon} ${livePhase === 'complete' ? styles.demoFileIconDone : ''}`}>
                  {livePhase === 'complete' ? <Check size={18} /> : <FileText size={18} />}
                </div>
                <div>
                  <div className={styles.demoFileName}>neuroplasticity_en.pdf</div>
                  <div className={styles.demoFileMeta}>8 sayfa · 2.3 MB · İngilizce</div>
                </div>
              </div>

              <div className={styles.demoLangRow}>
                <div className={styles.demoLangChip}><Globe size={12} /> Otomatik</div>
                <ArrowRight size={13} className={styles.demoLangArrow} />
                <div className={`${styles.demoLangChip} ${styles.demoLangChipTR}`}>Türkçe</div>
              </div>
              <div className={styles.demoDomainChip}>
                <Sparkles size={11} />
                <span>Alan: <strong>Akademik / Tıp</strong></span>
              </div>

              <AP mode="wait">
                {isBusy && (
                  <motion.div
                    key="busy"
                    className={styles.demoPhaseBox}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className={styles.demoPhaseHead}>
                      <span className={styles.demoPhaseDot} />
                      <span className={styles.demoPhaseLabel}>{phaseInfo.label}</span>
                      <span className={styles.demoProgressPct}>{Math.round(liveProgress)}%</span>
                    </div>
                    <div className={styles.demoPhaseSub}>{phaseInfo.sub}</div>
                    <div className={styles.demoProgressTrack}>
                      <motion.div
                        className={styles.demoProgressFill}
                        animate={{ width: `${liveProgress}%` }}
                        transition={{ duration: 0.08 }}
                      />
                    </div>
                    {livePhase === 'translating' && (
                      <div className={styles.demoPageMeta}>
                        <Layers size={11} /> Sayfa {livePage} / 8
                      </div>
                    )}
                  </motion.div>
                )}
                {livePhase === 'complete' && (
                  <motion.div
                    key="done"
                    className={styles.demoCompleteBadge}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                  >
                    <Check size={13} />
                    Tamamlandı — 8 sayfa, ~1.8 dakika
                  </motion.div>
                )}
              </AP>

              <div className={styles.demoCreditNote}>
                <Zap size={11} />
                {livePhase === 'complete' ? '8 kredi kullanıldı' : '8 kredi kullanılacak'}
              </div>

              <Magnetic strength={0.1}>
                <motion.button
                  className={`${styles.demoBtn} ${
                    isBusy ? styles.demoBtnBusy
                    : livePhase === 'complete' ? styles.demoBtnReset
                    : styles.demoBtnActive
                  }`}
                  onClick={livePhase === 'complete' ? resetDemo : startDemo}
                  disabled={isBusy}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                >
                  {livePhase === 'idle' && (<><Zap size={15} /> Çevir</>)}
                  {isBusy && (<><Loader size={15} className={styles.spinIcon} /> İşleniyor…</>)}
                  {livePhase === 'complete' && (<><RotateCcw size={15} /> Tekrar Dene</>)}
                </motion.button>
              </Magnetic>

              <AP>
                {livePhase === 'complete' && (
                  <motion.div
                    className={styles.demoDlRow}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.3 }}
                  >
                    <button className={styles.demoDlBtn}><Download size={12} /> PDF</button>
                    <button className={styles.demoDlBtn}><FileType size={12} /> Word</button>
                    <button className={styles.demoDlBtn}><FileCode size={12} /> TXT</button>
                  </motion.div>
                )}
              </AP>
            </div>

            <div className={styles.demoDivider} aria-hidden="true" />

            {/* Sağ sonuç paneli */}
            <div className={styles.demoRight}>
              {livePhase === 'complete' ? (
                <div className={styles.demoTabs}>
                  {([
                    { id: 'translation', label: 'Çeviri',   icon: <Languages size={13} /> },
                    { id: 'summary',     label: 'Özet',     icon: <Sparkles  size={13} /> },
                    { id: 'ask',         label: 'Soru Sor', icon: <MessageSquare size={13} /> },
                  ] as { id: ResultTab; label: string; icon: React.ReactNode }[]).map(t => {
                    const active = resultTab === t.id;
                    return (
                      <button
                        key={t.id}
                        className={`${styles.demoTab} ${active ? styles.demoTabActive : ''}`}
                        onClick={() => setResultTab(t.id)}
                      >
                        {active && (
                          <motion.div
                            className={styles.demoTabIndicator}
                            layoutId="live-tab-indicator"
                            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                          />
                        )}
                        <span className={styles.demoTabContent}>{t.icon}{t.label}</span>
                      </button>
                    );
                  })}
                  <span className={styles.demoSourceTag}>
                    <FileText size={10} /> neuroplasticity_en.pdf
                  </span>
                </div>
              ) : (
                <div className={styles.demoRightHeader}>
                  <span className={styles.demoRightTitle}>
                    {livePhase === 'idle' ? 'Türkçe Çeviri' : phaseInfo.label}
                  </span>
                </div>
              )}

              <AP mode="wait">
                {livePhase === 'idle' && (
                  <motion.div
                    key="idle"
                    className={styles.demoEmptyState}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Languages size={28} className={styles.demoEmptyIcon} />
                    <p className={styles.demoEmptyTitle}>Çeviri burada görünecek</p>
                    <p className={styles.demoEmptyHint}>← Sol paneldeki "Çevir" butonuna tıklayın</p>
                  </motion.div>
                )}

                {(livePhase === 'analyzing' || livePhase === 'extracting' || livePhase === 'composing') && (
                  <motion.div
                    key={livePhase}
                    className={styles.demoAnalyzing}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className={styles.demoSkeleton} aria-hidden>
                      <div className={styles.demoSkelLine} style={{ width: '70%' }} />
                      <div className={styles.demoSkelLine} style={{ width: '92%' }} />
                      <div className={styles.demoSkelLine} style={{ width: '85%' }} />
                      <div className={styles.demoSkelImg}><ImageIcon size={18} /></div>
                      <div className={styles.demoSkelLine} style={{ width: '78%' }} />
                      <div className={styles.demoSkelLine} style={{ width: '88%' }} />
                    </div>
                    <p className={styles.demoAnalyzingText}>{phaseInfo.label}</p>
                    <p className={styles.demoAnalyzingHint}>{phaseInfo.sub}</p>
                  </motion.div>
                )}

                {livePhase === 'translating' && (
                  <motion.div
                    key="translating"
                    className={styles.demoTextOutput}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    {liveStreamed}
                    <motion.span
                      className={styles.demoCursor}
                      animate={{ opacity: [1, 0] }}
                      transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
                    />
                  </motion.div>
                )}

                {livePhase === 'complete' && resultTab === 'translation' && (
                  <motion.div
                    key="result-tr"
                    className={styles.demoTextOutput}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    {DEMO_TR}
                    <div className={styles.demoBadgeRow}>
                      <span className={styles.demoVerifiedBadge}><Check size={11} /> Düzen korundu</span>
                      <span className={styles.demoVerifiedBadge}><Brain size={11} /> Akademik bağlam</span>
                    </div>
                  </motion.div>
                )}

                {livePhase === 'complete' && resultTab === 'summary' && (
                  <motion.div
                    key="result-sum"
                    className={styles.demoSummary}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className={styles.demoSummaryHead}>
                      <Sparkles size={14} className={styles.demoSummaryHeadIcon} />
                      AI tarafından oluşturulan özet
                    </div>
                    <ul className={styles.demoSummaryList}>
                      {DEMO_SUMMARY_BULLETS.map((b, i) => (
                        <motion.li
                          key={i}
                          className={styles.demoSummaryItem}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: i < summaryShown ? 1 : 0, x: i < summaryShown ? 0 : -8 }}
                          transition={{ duration: 0.3 }}
                        >
                          <span className={styles.demoSummaryDot} />
                          <span>{b}</span>
                        </motion.li>
                      ))}
                    </ul>
                  </motion.div>
                )}

                {livePhase === 'complete' && resultTab === 'ask' && (
                  <motion.div
                    key="result-ask"
                    className={styles.demoAsk}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className={styles.demoAskMessages}>
                      <AP>
                        {chatStep >= 1 && (
                          <motion.div
                            key="user"
                            className={`${styles.demoBubble} ${styles.demoBubbleUser}`}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                          >
                            {DEMO_CHAT[0].text}
                          </motion.div>
                        )}
                      </AP>
                      <AP>
                        {chatStep === 2 && (
                          <motion.div
                            key="typing"
                            className={`${styles.demoBubble} ${styles.demoBubbleAi} ${styles.demoBubbleTyping}`}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                          >
                            {[0, 1, 2].map(i => (
                              <motion.span
                                key={i}
                                className={styles.demoTypingDot}
                                animate={{ y: [0, -4, 0], opacity: [0.3, 1, 0.3] }}
                                transition={{ duration: 0.7, delay: i * 0.12, repeat: Infinity }}
                              />
                            ))}
                          </motion.div>
                        )}
                      </AP>
                      <AP>
                        {chatStep >= 3 && (
                          <motion.div
                            key="ai"
                            className={`${styles.demoBubble} ${styles.demoBubbleAi}`}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                          >
                            <span dangerouslySetInnerHTML={{
                              __html: chatTyped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'),
                            }} />
                          </motion.div>
                        )}
                      </AP>
                    </div>
                    <div className={styles.demoAskInput} aria-hidden>
                      <input
                        type="text"
                        placeholder="Belgeye bir soru sor…"
                        readOnly
                        className={styles.demoAskInputField}
                      />
                      <button className={styles.demoAskSend} type="button" aria-label="Gönder">
                        <Send size={13} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AP>
            </div>
          </div>
        </motion.div>

        {/* Adımlar */}
        <div className={styles.steps}>
          {[
            { num: '1', icon: <FileText size={16} />, title: 'PDF Yükle',       desc: 'Sürükle bırak veya dosya seç' },
            { num: '2', icon: <Brain size={16} />,    title: 'AI Çevirir',      desc: 'Orijinal düzen ve grafikler korunur' },
            { num: '3', icon: <Sparkles size={16} />, title: 'Özetle veya Sor', desc: 'Belgenin içinden anında cevap al' },
          ].map((s, i) => (
            <motion.div
              key={s.num}
              className={styles.step}
              variants={rise}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i}
            >
              <div className={styles.stepNum}>{s.num}</div>
              <div>
                <div className={styles.stepTitle}>{s.title} {s.icon}</div>
                <div className={styles.stepDesc}>{s.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ══════════════ ESKİ YÖNTEM vs TRANSWORDLY ══════════════ */}
      <section className={styles.compareSection}>
        <SectionHeader
          label="03 · Karşılaştırma"
          title={<>Saatler süren işi <span className={styles.grad}>dakikaya indir.</span></>}
          note="cidden!"
        />

        <div className={styles.compareGrid}>
          <motion.div
            className={`${styles.compareCard} ${styles.compareCardOld}`}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.55, ease: EASE }}
          >
            <div className={styles.compareHead}>Eski yöntem</div>
            <ul className={styles.compareList}>
              {COMPARE_OLD.map((t, i) => (
                <motion.li
                  key={t}
                  className={styles.compareItemOld}
                  initial={{ opacity: 0, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 + i * 0.1, duration: 0.4 }}
                >
                  <X size={14} className={styles.compareX} />
                  <span className={styles.compareStrike}>{t}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          <div className={styles.compareVs} aria-hidden="true"><span>VS</span></div>

          <motion.div
            className={`${styles.compareCard} ${styles.compareCardNew}`}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.55, delay: 0.1, ease: EASE }}
          >
            <div className={`${styles.compareHead} ${styles.compareHeadNew}`}>TransWordly ile</div>
            <ul className={styles.compareList}>
              {COMPARE_NEW.map((t, i) => (
                <motion.li
                  key={t}
                  className={styles.compareItemNew}
                  initial={{ opacity: 0, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.35 + i * 0.1, duration: 0.4 }}
                >
                  <Check size={14} className={styles.compareCheck} />
                  <span>{t}</span>
                </motion.li>
              ))}
            </ul>
            <Link to="/auth?mode=register" className={styles.compareCta}>
              Farkı kendin gör <ArrowRight size={15} />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ══════════════ KİMLER İÇİN (personalar) ══════════════ */}
      <section className={styles.personaSection}>
        <SectionHeader
          label="04 · Kimler için"
          title={<>Hangisi <span className={styles.grad}>sensin?</span></>}
          desc={<>Lisanstan doktoraya, sınavdan yayına — ihtiyaç farklı, akış aynı:
            <strong> yükle, çevir, anla.</strong> Sana en yakın senaryoyu seç.</>}
        />

        <div className={styles.personaGrid}>
          {PERSONAS.map((p, i) => (
            <motion.div
              key={p.title}
              variants={rise}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i}
              style={{ height: '100%' }}
            >
              <div
                className={styles.personaCard}
                style={{ '--ac': p.accent } as React.CSSProperties}
                onMouseMove={spotMove}
              >
                <div className={styles.personaIcon}><p.Icon size={21} /></div>
                <h3 className={styles.personaTitle}>{p.title}</h3>
                <p className={styles.personaPain}>{p.pain}</p>
                <div className={styles.personaFlow}>
                  <ArrowRight size={13} />
                  <span>{p.flow}</span>
                </div>
                <div className={styles.personaTools}>
                  {p.tools.map(t => (
                    <span key={t} className={styles.personaToolChip}>{t}</span>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ══════════════ ALIŞKANLIK / MOTİVASYON ══════════════ */}
      <section className={styles.habitSection}>
        <div className={styles.habitInner}>
          <motion.div
            className={styles.habitText}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55, ease: EASE }}
          >
            <span className={styles.sectionLabel}>05 · Motivasyon</span>
            <h2 className={styles.habitTitle}>
              Çalışmayı bir <span className={styles.grad}>alışkanlığa</span> çevir
            </h2>
            <p className={styles.habitDesc}>
              Düzenli çalışan kazanır. Her gün biraz ilerle; serini koru, XP topla,
              haftalık hedefini gör. TransWordly seni masaya geri getiren küçük dürtmeler verir.
            </p>
            <ul className={styles.habitList}>
              {[
                { icon: <Flame size={18} />, t: 'Çalışma serisi', d: 'Her gün dön, serini büyüt — bırakmamak için bir sebep.' },
                { icon: <TrendingUp size={18} />, t: 'XP & seviye', d: 'Çevir, not çıkar, tekrar yap; ilerlemeni rakamla gör.' },
                { icon: <Target size={18} />, t: 'Haftalık hedef', d: 'Kendine ulaşılabilir hedef koy, takip et, tamamla.' },
              ].map(it => (
                <li key={it.t} className={styles.habitItem}>
                  <div className={styles.habitItemIcon}>{it.icon}</div>
                  <div>
                    <div className={styles.habitItemTitle}>{it.t}</div>
                    <div className={styles.habitItemDesc}>{it.d}</div>
                  </div>
                </li>
              ))}
            </ul>
            <Magnetic strength={0.12}>
              <motion.div whileTap={reduced ? undefined : { scale: 0.97 }} style={{ display: 'inline-block' }}>
                <Link to="/auth?mode=register" className={styles.ctaPrimary}>
                  <span className={styles.ctaShine} aria-hidden="true" />
                  Serini Başlat <ArrowRight size={16} />
                </Link>
              </motion.div>
            </Magnetic>
          </motion.div>

          <motion.div
            className={styles.habitMock}
            style={{ position: 'relative' }}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <motion.span
              className={styles.handNote}
              style={{ top: -28, right: 14, fontSize: '1.22rem', color: '#C2740B', textShadow: '0 1px 0 rgba(255,255,255,0.75)' }}
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.7, rotate: 15 }}
              whileInView={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: 7 }}
              viewport={{ once: true }}
              transition={{ type: 'spring', stiffness: 240, damping: 15, delay: 0.5 }}
            >
              bırakma sakın!
            </motion.span>
            <div className={styles.habitMockHead}>
              <div className={styles.habitStreak}>
                <div className={styles.habitFlame}><Flame size={22} /></div>
                <div>
                  <div className={styles.habitStreakNum}>7 gün</div>
                  <div className={styles.habitStreakLabel}>aktif seri</div>
                </div>
              </div>
              <span className={styles.habitLevel}>Seviye 4</span>
            </div>

            <div className={styles.habitWeek}>
              {HABIT_WEEK.map((d, i) => (
                <div key={d.d} className={styles.habitDay}>
                  <div className={styles.habitBarTrack}>
                    <motion.div
                      className={`${styles.habitBar} ${d.on ? '' : styles.habitBarMuted}`}
                      initial={{ height: 0 }}
                      whileInView={{ height: `${d.h}%` }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.15 + i * 0.07, duration: 0.6, ease: EASE }}
                    />
                  </div>
                  <span className={styles.habitDayLabel}>{d.d}</span>
                </div>
              ))}
            </div>

            <div className={styles.habitXpWrap}>
              <div className={styles.habitXpHead}>
                <span>Sonraki seviyeye</span>
                <span>720 / 1000 XP</span>
              </div>
              <div className={styles.habitXpTrack}>
                <motion.div
                  className={styles.habitXpFill}
                  initial={{ width: 0 }}
                  whileInView={{ width: '72%' }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4, duration: 0.9, ease: EASE }}
                />
              </div>
            </div>

            <div className={styles.habitBadges}>
              <div className={styles.habitBadge}>
                <Award size={20} className={styles.habitBadgeIcon} /> İlk Çeviri
              </div>
              <div className={styles.habitBadge}>
                <Flame size={20} className={styles.habitBadgeIcon} /> 7 Gün Seri
              </div>
              <div className={`${styles.habitBadge} ${styles.habitBadgeLocked}`}>
                <Lock size={20} className={styles.habitBadgeIcon} /> 30 Gün
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ══════════════ KULLANICI YORUMLARI ══════════════ */}
      <LandingReviews />

      {/* ══════════════ FİYATLANDIRMA (#pricing) ══════════════ */}
      <section className={styles.pricingSection} id="pricing">
        <SectionHeader
          label="06 · Fiyatlandırma"
          title={<>Ücretsiz başla, <span className={styles.grad}>ihtiyaç oldukça büyü.</span></>}
          note="kredi boşa gitmez"
          desc="Kredi asla boşa gitmez. İstediğin zaman planını değiştir veya iptal et."
        />

        <motion.div
          className={styles.creditExplainer}
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          {[
            { icon: <Languages size={13} />, text: `1 sayfa çeviri = ${fmtCredit(credit.perPage)} kredi` },
            { icon: <BookOpen size={13} />, text: `1 ders notu kaynağı = ${fmtCredit(credit.study)} kredi` },
            { icon: <MessageSquare size={13} />, text: `AI soru = ${fmtCredit(credit.chat)} kredi` },
          ].map((item, i) => (
            <div key={i} className={styles.creditPill}>{item.icon}<span>{item.text}</span></div>
          ))}
        </motion.div>

        {(pricingCfg['discount.student_amount'] ?? 0) > 0 && (
          <div className={styles.studentToggleWrap}>
            <button
              className={`${styles.studentToggleBtn} ${!isStudent ? styles.studentToggleBtnActive : ''}`}
              onClick={() => setIsStudent(false)}
            >
              Genel
            </button>
            <button
              className={`${styles.studentToggleBtn} ${isStudent ? styles.studentToggleBtnActive : ''}`}
              onClick={() => setIsStudent(true)}
            >
              🎓 Öğrenciyim
              <span className={styles.studentSaveBadge}>-{pricingCfg['discount.student_amount']}₺</span>
            </button>
          </div>
        )}

        <div className={styles.pricingGrid}>
          {effectivePlans.map((plan, i) => (
            <motion.div
              key={plan.id}
              className={`${styles.pricingCard} ${plan.popular ? styles.pricingCardPopular : ''}`}
              variants={rise}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i}
              whileHover={reduced ? undefined : { y: -5 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}
            >
              {plan.popular && (
                <div className={styles.popularBadge}>En Çok Tercih</div>
              )}
              {plan.popular && (
                <motion.span
                  className={styles.handNote}
                  style={{ top: -58, left: -44, fontSize: '1.32rem', zIndex: 4, display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }}
                  initial={{ opacity: 0, scale: 0.6, rotate: -22 }}
                  whileInView={{ opacity: 1, scale: 1, rotate: -13 }}
                  viewport={{ once: true }}
                  transition={{ type: 'spring', stiffness: 240, damping: 15, delay: 0.45 }}
                >
                  en dengeli ✦
                  <HandArrow className={styles.handNoteArrow} />
                </motion.span>
              )}
              {plan.discountPct > 0 && (
                <div className={styles.discountBadge}>-%{plan.discountPct}</div>
              )}
              <div className={styles.pricingName}>{plan.name}</div>
              <div className={styles.pricingPrice}>
                {plan.price > 0 ? (
                  <>
                    {plan.showOriginal && (
                      <span className={styles.pricingOriginal}>₺{plan.afterPctDiscount}</span>
                    )}
                    ₺{plan.displayedPrice}
                    <span className={styles.pricingPer}>/ay</span>
                  </>
                ) : plan.price === 0 ? (
                  <span>Ücretsiz</span>
                ) : (
                  <span style={{ fontSize: '1.4rem' }}>İletişime Geçin</span>
                )}
              </div>
              {plan.credits > 0 && (
                <div className={styles.pricingCredits}>
                  {plan.credits} kredi/ay · ≈{pdfPerCredits(plan.credits, credit.perPage)} sayfa çeviri
                </div>
              )}
              <ul className={styles.pricingFeatureList}>
                {plan.features.map((f, fi) => (
                  <li key={fi}><Check size={13} />{f}</li>
                ))}
              </ul>
              <button
                className={`${styles.pricingCta} ${plan.popular ? styles.pricingCtaPrimary : ''}`}
                onClick={() => {
                  if (plan.price === 0) navigate('/auth?mode=register');
                  else if (plan.price === -1) navigate('/contact');
                  else {
                    addToCart({ planId: plan.id, planName: plan.name, student: isStudent, price: plan.displayedPrice });
                    toast.success(`${plan.name} planı sepete eklendi`, { icon: '🛒' });
                  }
                }}
              >
                {plan.price === 0 ? 'Ücretsiz Başla' : plan.price === -1 ? 'İletişime Geçin' : 'Sepete Ekle'}
              </button>
            </motion.div>
          ))}
        </div>

        <div className={styles.pricingReassure}>
          <span className={styles.pricingReassureItem}><CreditCard size={15} /> Kayıt için kredi kartı gerekmez</span>
          <span className={styles.pricingReassureItem}><RefreshCcw size={15} /> İstediğin zaman iptal</span>
          <span className={styles.pricingReassureItem}><ShieldCheck size={15} /> Güvenli PayTR ödeme</span>
        </div>
      </section>

      {/* ══════════════ SSS ══════════════ */}
      <LandingFaq />

      {/* ══════════════ FİNAL CTA ══════════════ */}
      <section className={styles.ctaBand}>
        <div className={styles.ctaBandGlow} aria-hidden="true" />
        <motion.div
          className={styles.ctaBandInner}
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <motion.span
            className={`${styles.handNote} ${styles.handNoteLight}`}
            style={{ top: -54, left: '50%', transform: 'translateX(-50%) rotate(-4deg)', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}
            initial={{ opacity: 0, scale: 0.7, rotate: -16 }}
            whileInView={{ opacity: 1, scale: 1, rotate: -4 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 240, damping: 15, delay: 0.4 }}
          >
            söz, pişman olmayacaksın :)
            <HandUnderline className={styles.handUnderline} />
          </motion.span>
          <h2 className={styles.ctaBandTitle}>
            Bir dahaki ödevinden önce <span className={styles.ctaBandGrad}>dene.</span>
          </h2>
          <p className={styles.ctaBandSub}>10 kredi hediye. Kredi kartı gerekmez. 30 saniyede başla.</p>
          <div className={styles.ctaBandBtnWrap}>
            <Magnetic strength={0.12}>
              <motion.div whileTap={reduced ? undefined : { scale: 0.97 }} style={{ display: 'inline-block' }}>
                <Link to="/auth?mode=register" className={styles.ctaBandBtn}>
                  Ücretsiz Hesap Aç
                  <ArrowRight size={18} />
                </Link>
              </motion.div>
            </Magnetic>
            <span className={styles.ctaBandNote}>
              <Check size={13} /> kredi kartı yok, taahhüt yok
            </span>
          </div>
        </motion.div>
      </section>

      {/* ══════════════ FOOTER ══════════════ */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <div className={styles.footerLogo}>
              <img src="/trans_wordly.png" alt="" width={22} height={22} draggable={false} />
            </div>
            <span className={styles.footerBrandName}>TransWordly</span>
          </div>

          <div className={styles.footerCol}>
            <span className={styles.footerColLabel}>İletişim</span>
            <a href={`mailto:${COMPANY.email}`}><Mail size={13} /> {COMPANY.email}</a>
            <a href={`tel:${COMPANY.phoneHref}`}><Phone size={13} /> {COMPANY.phone}</a>
            <span className={styles.footerAddr}>
              <MapPin size={13} style={{ marginTop: 2, flexShrink: 0 }} /> Saimekadın Mah. Görgülü Cad. No:45, Mamak / Ankara
            </span>
          </div>

          <div className={styles.footerCol}>
            <span className={styles.footerColLabel}>Yasal</span>
            <Link to="/legal/mesafeli-satis">Mesafeli Satış Sözleşmesi</Link>
            <Link to="/legal/gizlilik-kvkk">Gizlilik &amp; KVKK</Link>
            <Link to="/legal/iptal-iade">İptal &amp; İade</Link>
            <Link to="/legal">Tüm yasal belgeler →</Link>
          </div>

          <div className={styles.footerCol}>
            <span className={styles.footerColLabel}>Keşfet</span>
            <a href="#features"  onClick={scrollTo('features')}>Özellikler</a>
            <a href="#how-it-works" onClick={scrollTo('how-it-works')}>Nasıl Çalışır</a>
            <a href="#pricing"   onClick={scrollTo('pricing')}>Fiyatlar</a>
            <Link to="/contact">İletişim</Link>
            <Link to="/auth">Giriş Yap</Link>
          </div>

          <p className={styles.footerCopy}>© {new Date().getFullYear()} TransWordly · {COMPANY.sellerShort} · Akademisyenler için ❤️ ile</p>
        </div>
      </footer>

      {/* ══════════════ NAZİK KAYIT HATIRLATICISI ══════════════ */}
      <AP>
        {showNudge && (
          <motion.div
            className={styles.nudge}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            role="dialog"
            aria-label="Ücretsiz kayıt hatırlatması"
          >
            <div className={styles.nudgeTop}>
              <div className={styles.nudgeIcon}><Gift size={19} /></div>
              <button className={styles.nudgeClose} onClick={dismissNudge} aria-label="Kapat">
                <X size={17} />
              </button>
            </div>
            <h3 className={styles.nudgeTitle}>Sana 10 kredi hediye</h3>
            <p className={styles.nudgeText}>
              Ücretsiz bir hesapla <strong>ilk çevirini hemen</strong> yap. Kredi kartı yok,
              30 saniyede hazırsın.
            </p>
            <Link to="/auth?mode=register" className={styles.nudgeCta} onClick={dismissNudge}>
              Ücretsiz Başla <ArrowRight size={16} />
            </Link>
          </motion.div>
        )}
      </AP>
    </div>
  );
}
