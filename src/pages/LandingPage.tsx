import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence as AP, useReducedMotion } from 'framer-motion';
import {
  Languages, FileText, Brain, ArrowRight, Check,
  Shield, BookOpen, Star, Zap, FileType, MessageSquare,
  Globe, FileCode, Loader, RotateCcw, Layers, Sparkles,
  Image as ImageIcon, Send, Download,
} from 'lucide-react';
import { PRICING_PLANS, CREDIT_COSTS, pdfPerCredits, fmtCredit } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { Magnetic } from '../components/ui/motion';
import { useCart } from '../context/CartContext';
import toast from 'react-hot-toast';
import styles from '../styles/components/landing.module.css';

/* ── Animation variants ───────────────────────────────────── */
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

const scrollTo = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

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

/* ── Data ─────────────────────────────────────────────────── */
const TESTIMONIALS = [
  {
    quote: 'Bir haftada 3 makale okudum — hepsini TransWordly ile çevirdim. Normalde birkaç günümü alırdı.',
    name: 'Zeynep A.',
    role: 'Tıp Fakültesi, 4. Sınıf',
    stars: 5,
  },
  {
    quote: 'İngilizce slaytlarımı yükleyip ders notuna dönüştürdüm. Sınavda çok işe yaradı.',
    name: 'Emre K.',
    role: 'Makine Mühendisliği, Y.Lisans',
    stars: 5,
  },
  {
    quote: 'Almanca kaynaklarla araştırma yapıyorum. Artık sözlüğe gerek kalmıyor, bağlamı da anlıyor.',
    name: 'Selin T.',
    role: 'Hukuk Fakültesi, 3. Sınıf',
    stars: 5,
  },
];

const FEATURES = [
  {
    icon: <Languages size={22} />,
    title: 'Akıllı Dil Tespiti',
    desc: 'İngilizce, Almanca, Arapça, Çince dahil 12 dili otomatik tanır. Siz sadece yükleyin.',
  },
  {
    icon: <FileText size={22} />,
    title: '150+ Sayfa Desteği',
    desc: 'Tek seferde 150 sayfaya kadar belge. Akademik makaleler, kitap bölümleri, raporlar.',
  },
  {
    icon: <BookOpen size={22} />,
    title: 'Ders Notu Çıkar',
    desc: 'Slayt veya fotoğraf yükle, AI organize ders notu oluşturur. Sınav hazırlığı kolaylaşır.',
  },
  {
    icon: <Brain size={22} />,
    title: 'AI Soru-Cevap',
    desc: 'Çevirdiğin belgeye soru sor. Akademik bağlamı anlayan anlık cevaplar alırsın.',
  },
  {
    icon: <FileType size={22} />,
    title: 'PDF · Word · TXT',
    desc: 'Çevirinizi PDF, Word veya düz metin olarak indirin. Profesyonel formatlama dahil.',
  },
  {
    icon: <Shield size={22} />,
    title: 'Güvenli & Özel',
    desc: '256-bit şifreleme. Belgeleriniz üçüncü taraflarla asla paylaşılmaz.',
  },
];

/* ── Live demo copy ───────────────────────────────────────── */
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

const PHASE_INFO: Record<LivePhase, { label: string; sub: string; pct: [number, number] }> = {
  idle:        { label: 'Hazır',                sub: 'Çevir butonuna basın',              pct: [0, 0] },
  analyzing:   { label: 'Belge analiz ediliyor', sub: 'Yapı, dil ve sayfa sayısı tespiti', pct: [0, 8] },
  extracting:  { label: 'Metin çıkarılıyor',     sub: 'Sayfa düzeni ve görseller korunuyor', pct: [8, 28] },
  translating: { label: 'AI ile çevriliyor',     sub: 'Akademik terimler bağlama göre eşleniyor', pct: [28, 88] },
  composing:   { label: 'PDF oluşturuluyor',     sub: 'Orijinal düzen üzerine yerleştiriliyor', pct: [88, 100] },
  complete:    { label: 'Tamamlandı',           sub: 'Çeviri hazır',                      pct: [100, 100] },
};

/* ════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  const { add: addToCart } = useCart();

  /* ── Hero typewriter ── */
  const trTexts = HERO_DEMOS.map(d => d.tr);
  const { displayed: twDisplayed, demoIdx: twIdx, isTyping: twIsTyping } = useTypewriter(
    reduced ? trTexts : trTexts,
    reduced ? 0 : 28,
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

      // Yüzde indirim uygula (ör. discount.pro = 20 → %20)
      const afterPctDiscount = discountPct > 0
        ? Math.round(basePrice * (1 - discountPct / 100))
        : basePrice;

      // Öğrenci indirimi üstüne ek
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

  /* ── Dinamik kredi maliyetleri (tek kaynak: app_config → credit_cost.*) ── */
  const credit = useMemo(() => ({
    perPage: pricingCfg['credit_cost.translation_per_page'] ?? CREDIT_COSTS.TRANSLATION_PER_PAGE,
    study:   pricingCfg['credit_cost.study_notes']          ?? CREDIT_COSTS.STUDY_NOTES_PER_SOURCE,
    chat:    pricingCfg['credit_cost.chat']                 ?? CREDIT_COSTS.CHAT_PER_QUESTION,
  }), [pricingCfg]);

  /* ── Live demo state ── */
  const [livePhase, setLivePhase] = useState<LivePhase>('idle');
  const [liveProgress, setLiveProgress] = useState(0);
  const [liveStreamed, setLiveStreamed] = useState('');
  const [livePage, setLivePage] = useState(1);
  const [resultTab, setResultTab] = useState<ResultTab>('translation');
  const [summaryShown, setSummaryShown] = useState<number>(0);
  const [chatStep, setChatStep] = useState<number>(0); // 0 idle, 1 user, 2 typing, 3 done
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

    // Phase 1: analyze (0 → 8 %, ~700 ms)
    setLivePhase('analyzing');
    const t1 = setTimeout(() => {
      // Phase 2: extracting (8 → 28 %, ~600 ms)
      setLivePhase('extracting');
      const t2 = setTimeout(() => {
        // Phase 3: translating (28 → 88 %, ~3 s, streams text & advances pages)
        setLivePhase('translating');

        let prog = 28;
        progressRef.current = setInterval(() => {
          prog += 0.8;
          setLiveProgress(prog);
          setLivePage(Math.max(1, Math.min(Math.ceil((prog - 28) / 7.5), 8)));
          if (prog >= 88) {
            clearInterval(progressRef.current!);
            // Phase 4: composing PDF (88 → 100 %, ~700 ms)
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

        // Stream the translated text alongside translating phase
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

  /* When user switches to Summary tab → reveal bullets one by one */
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

  /* When user switches to Ask tab → run a tiny scripted Q&A */
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

  return (
    <div className={styles.page}>

      {/* ══════════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════════ */}
      <section className={styles.hero}>
        <div className={styles.heroBg} aria-hidden="true" />

        <div className={styles.heroContent}>
          <motion.div
            className={styles.heroBadge}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <span className={styles.heroBadgeDot} />
            Öğrenciler ve Araştırmacılar için AI
          </motion.div>

          <motion.h1
            className={styles.heroTitle}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            Yabancı Kaynakları<br />
            <span className={styles.heroTitleAccent}>Saniyeler İçinde</span> Anla
          </motion.h1>

          <motion.p
            className={styles.heroSubtitle}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18 }}
          >
            Akademik makaleler, ders kitapları ve araştırma raporlarını 12 dilden Türkçe'ye çevirin.
            Ders notu çıkarın, AI'a soru sorun. Dakikalar içinde.
          </motion.p>

          <motion.div
            className={styles.heroCtas}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.28 }}
          >
            <Magnetic strength={0.14}>
              <motion.div whileTap={reduced ? undefined : { scale: 0.97 }}>
                <Link to="/auth?mode=register" className={styles.ctaPrimary}>
                  Ücretsiz Başla
                  <motion.span style={{ display: 'inline-flex' }}
                    whileHover={reduced ? undefined : { x: 3 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  >
                    <ArrowRight size={16} />
                  </motion.span>
                </Link>
              </motion.div>
            </Magnetic>
            <motion.a
              href="#how-it-works"
              className={styles.ctaSecondary}
              onClick={scrollTo('how-it-works')}
              whileHover={reduced ? undefined : { y: -1 }}
              whileTap={reduced ? undefined : { scale: 0.97 }}
            >
              Canlı Demoyu Dene
            </motion.a>
          </motion.div>
        </div>

        {/* Product mockup */}
        <motion.div
          className={styles.heroMockup}
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.38, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <div className={styles.mockupWindow}>
            <div className={styles.mockupBar}>
              <div className={styles.mockupDots}>
                <span /><span /><span />
              </div>
              <div className={styles.mockupUrl}>transwordly.com/translate</div>
              <div className={styles.mockupActions}>
                <div className={styles.mockupActionBtn} />
                <div className={styles.mockupActionBtn} />
              </div>
            </div>
            <div className={styles.mockupBody}>
              {/* Left pane */}
              <div className={styles.mockupPane}>
                <div className={styles.mockupPaneHeader}>
                  <div className={styles.mockupPaneLang}>EN</div>
                  <AP mode="wait">
                    <motion.div
                      key={twIdx}
                      className={styles.mockupPaneFile}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <FileText size={11} />
                      {HERO_DEMOS[twIdx].file}
                    </motion.div>
                  </AP>
                </div>
                <AP mode="wait">
                  <motion.p
                    key={twIdx}
                    className={styles.mockupPaneText}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                  >
                    {HERO_DEMOS[twIdx].en}
                  </motion.p>
                </AP>
              </div>
              {/* Divider */}
              <div className={styles.mockupPaneDivider} />
              {/* Right pane */}
              <div className={styles.mockupPane}>
                <div className={styles.mockupPaneHeader}>
                  <div className={`${styles.mockupPaneLang} ${styles.mockupPaneLangTR}`}>TR</div>
                  <div className={styles.mockupPaneBadge}>
                    <Check size={10} />
                    {twIsTyping ? 'Çevriliyor…' : 'Tamamlandı'}
                  </div>
                </div>
                <p className={`${styles.mockupPaneText} ${styles.mockupPaneTextTR}`}>
                  {twDisplayed}
                  <span className={styles.typewriterCursor} aria-hidden="true">|</span>
                </p>
                <div className={styles.mockupDownloads}>
                  <button className={styles.mockupDlBtn}><FileText size={10} /> PDF</button>
                  <button className={styles.mockupDlBtn}><FileType size={10} /> Word</button>
                  <button className={styles.mockupDlBtn}><FileCode size={10} /> TXT</button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── Stats strip ── */}
      <motion.div
        className={styles.statsStrip}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.6 }}
      >
        {[
          { num: '12+',    label: 'Kaynak Dil' },
          { num: '150+',   label: 'Sayfa Kapasitesi' },
          { num: '3',      label: 'Export Formatı' },
          { num: '256-bit', label: 'Şifreleme' },
        ].map(s => (
          <div key={s.label} className={styles.statItem}>
            <div className={styles.statNum}>{s.num}</div>
            <div className={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </motion.div>

      {/* ══════════════════════════════════════════════════════
          FEATURES
      ══════════════════════════════════════════════════════ */}
      <section className={styles.featuresSection} id="features">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>Özellikler</span>
          <h2 className={styles.sectionTitle}>Akademik çalışmana özel araçlar</h2>
          <p className={styles.sectionDesc}>
            Tek platformda çeviri, not çıkarma ve kaynak analizi — ayrı araçlara gerek yok.
          </p>
        </div>

        <div className={styles.featuresGrid}>
          {FEATURES.map((f, i) => (
            <motion.div
              key={i}
              className={styles.featureCard}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i}
              whileHover={reduced ? undefined : { y: -3 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            >
              <div className={styles.featureIconWrap}>{f.icon}</div>
              <h3 className={styles.featureTitle}>{f.title}</h3>
              <p className={styles.featureDesc}>{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          LIVE DEMO (advanced — translation-first, summary & ask)
      ══════════════════════════════════════════════════════ */}
      <section className={styles.liveDemoSection} id="how-it-works">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>Nasıl Çalışır</span>
          <h2 className={styles.sectionTitle}>Önce çevir, sonra anla</h2>
          <p className={styles.sectionDesc}>
            PDF'i orijinal düzeniyle çeviririz — sonra özet çıkarın veya belgeye sorular sorun.
            "Çevir" butonuna tıklayın ve canlı izleyin.
          </p>
        </div>

        <motion.div
          className={styles.liveBox}
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.65, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* Window chrome */}
          <div className={styles.liveBoxBar}>
            <div className={styles.liveBoxDots}>
              <span /><span /><span />
            </div>
            <span className={styles.liveBoxUrl}>transwordly.com/translate</span>
            <div className={styles.liveBoxBadge}>
              <motion.span
                className={styles.liveBoxBadgeDot}
                animate={{ opacity: livePhase !== 'idle' ? [1, 0.3, 1] : 1 }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              Canlı Demo
            </div>
          </div>

          <div className={styles.liveInterface}>
            {/* ── Left control panel ── */}
            <div className={styles.liveLeft}>
              {/* File card */}
              <div className={styles.liveFileCard}>
                <div className={`${styles.liveFileIcon} ${livePhase === 'complete' ? styles.liveFileIconDone : ''}`}>
                  {livePhase === 'complete' ? <Check size={18} /> : <FileText size={18} />}
                </div>
                <div className={styles.liveFileInfo}>
                  <div className={styles.liveFileName}>neuroplasticity_en.pdf</div>
                  <div className={styles.liveFileMeta}>8 sayfa · 2.3 MB · İngilizce</div>
                </div>
              </div>

              {/* Language + domain row */}
              <div className={styles.liveLangRow}>
                <div className={styles.liveLangChip}>
                  <Globe size={12} />
                  Otomatik
                </div>
                <ArrowRight size={13} className={styles.liveLangArrow} />
                <div className={`${styles.liveLangChip} ${styles.liveLangChipTR}`}>
                  Türkçe
                </div>
              </div>
              <div className={styles.liveDomainChip}>
                <Sparkles size={11} />
                <span>Alan: <strong>Akademik / Tıp</strong></span>
              </div>

              {/* Phase status — replaces simple progress */}
              <AP mode="wait">
                {isBusy && (
                  <motion.div
                    key="busy"
                    className={styles.livePhaseBox}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className={styles.livePhaseHead}>
                      <span className={styles.livePhaseDot} />
                      <span className={styles.livePhaseLabel}>{phaseInfo.label}</span>
                      <span className={styles.liveProgressPct}>{Math.round(liveProgress)}%</span>
                    </div>
                    <div className={styles.livePhaseSub}>{phaseInfo.sub}</div>
                    <div className={styles.liveProgressTrack}>
                      <motion.div
                        className={styles.liveProgressFill}
                        animate={{ width: `${liveProgress}%` }}
                        transition={{ duration: 0.08 }}
                      />
                    </div>
                    {livePhase === 'translating' && (
                      <div className={styles.livePageMeta}>
                        <Layers size={11} /> Sayfa {livePage} / 8
                      </div>
                    )}
                  </motion.div>
                )}
                {livePhase === 'complete' && (
                  <motion.div
                    key="done"
                    className={styles.liveCompleteBadge}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                  >
                    <Check size={13} />
                    Tamamlandı — 8 sayfa, ~1.8 dakika
                  </motion.div>
                )}
              </AP>

              {/* Credit note */}
              <div className={styles.liveCreditNote}>
                <Zap size={11} />
                {livePhase === 'complete' ? '8 kredi kullanıldı' : '8 kredi kullanılacak'}
              </div>

              {/* CTA button */}
              <Magnetic strength={0.1}>
                <motion.button
                  className={`${styles.liveBtn} ${
                    isBusy
                      ? styles.liveBtnBusy
                      : livePhase === 'complete'
                      ? styles.liveBtnReset
                      : styles.liveBtnActive
                  }`}
                  onClick={livePhase === 'complete' ? resetDemo : startDemo}
                  disabled={isBusy}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                >
                  {livePhase === 'idle' && (
                    <><Zap size={15} /> Çevir</>
                  )}
                  {isBusy && (
                    <><Loader size={15} className={styles.spinIcon} /> İşleniyor…</>
                  )}
                  {livePhase === 'complete' && (
                    <><RotateCcw size={15} /> Tekrar Dene</>
                  )}
                </motion.button>
              </Magnetic>

              {/* Download / share row */}
              <AP>
                {livePhase === 'complete' && (
                  <motion.div
                    className={styles.liveDlRow}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.3 }}
                  >
                    <button className={styles.liveDlBtn}><Download size={12} /> PDF</button>
                    <button className={styles.liveDlBtn}><FileType size={12} /> Word</button>
                    <button className={styles.liveDlBtn}><FileCode size={12} /> TXT</button>
                  </motion.div>
                )}
              </AP>
            </div>

            {/* ── Divider ── */}
            <div className={styles.liveDivider} />

            {/* ── Right result panel ── */}
            <div className={styles.liveRight}>
              {/* Tabs (visible only when complete) */}
              {livePhase === 'complete' ? (
                <div className={styles.liveTabs}>
                  {([
                    { id: 'translation', label: 'Çeviri',   icon: <Languages size={13} /> },
                    { id: 'summary',     label: 'Özet',     icon: <Sparkles  size={13} /> },
                    { id: 'ask',         label: 'Soru Sor', icon: <MessageSquare size={13} /> },
                  ] as { id: ResultTab; label: string; icon: React.ReactNode }[]).map(t => {
                    const active = resultTab === t.id;
                    return (
                      <button
                        key={t.id}
                        className={`${styles.liveTab} ${active ? styles.liveTabActive : ''}`}
                        onClick={() => setResultTab(t.id)}
                      >
                        {active && (
                          <motion.div
                            className={styles.liveTabIndicator}
                            layoutId="live-tab-indicator"
                            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                          />
                        )}
                        <span className={styles.liveTabContent}>{t.icon}{t.label}</span>
                      </button>
                    );
                  })}
                  <span className={styles.liveSourceTag}>
                    <FileText size={10} /> neuroplasticity_en.pdf
                  </span>
                </div>
              ) : (
                <div className={styles.liveRightHeader}>
                  <span className={styles.liveRightTitle}>
                    {livePhase === 'idle' ? 'Türkçe Çeviri' : phaseInfo.label}
                  </span>
                </div>
              )}

              <AP mode="wait">
                {/* ─ Idle ─ */}
                {livePhase === 'idle' && (
                  <motion.div
                    key="idle"
                    className={styles.liveEmptyState}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Languages size={28} className={styles.liveEmptyIcon} />
                    <p className={styles.liveEmptyTitle}>Çeviri burada görünecek</p>
                    <p className={styles.liveEmptyHint}>← Sol paneldeki "Çevir" butonuna tıklayın</p>
                  </motion.div>
                )}

                {/* ─ Analyzing / Extracting / Composing → fancy loader ─ */}
                {(livePhase === 'analyzing' || livePhase === 'extracting' || livePhase === 'composing') && (
                  <motion.div
                    key={livePhase}
                    className={styles.liveAnalyzingState}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className={styles.livePageSkeleton} aria-hidden>
                      <div className={styles.livePageSkelLine} style={{ width: '70%' }} />
                      <div className={styles.livePageSkelLine} style={{ width: '92%' }} />
                      <div className={styles.livePageSkelLine} style={{ width: '85%' }} />
                      <div className={styles.livePageSkelImg}>
                        <ImageIcon size={18} />
                      </div>
                      <div className={styles.livePageSkelLine} style={{ width: '78%' }} />
                      <div className={styles.livePageSkelLine} style={{ width: '88%' }} />
                    </div>
                    <p className={styles.liveAnalyzingText}>{phaseInfo.label}</p>
                    <p className={styles.liveAnalyzingHint}>{phaseInfo.sub}</p>
                  </motion.div>
                )}

                {/* ─ Translating: streaming text ─ */}
                {livePhase === 'translating' && (
                  <motion.div
                    key="translating"
                    className={styles.liveTextOutput}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    {liveStreamed}
                    <motion.span
                      className={styles.liveCursor}
                      animate={{ opacity: [1, 0] }}
                      transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
                    />
                  </motion.div>
                )}

                {/* ─ Complete: tab content ─ */}
                {livePhase === 'complete' && resultTab === 'translation' && (
                  <motion.div
                    key="result-tr"
                    className={styles.liveTextOutput}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    {DEMO_TR}
                    <div className={styles.liveBadgeRow}>
                      <span className={styles.liveVerifiedBadge}>
                        <Check size={11} /> Düzen korundu
                      </span>
                      <span className={styles.liveVerifiedBadge}>
                        <Brain size={11} /> Akademik bağlam
                      </span>
                    </div>
                  </motion.div>
                )}

                {livePhase === 'complete' && resultTab === 'summary' && (
                  <motion.div
                    key="result-sum"
                    className={styles.liveSummary}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className={styles.liveSummaryHead}>
                      <Sparkles size={14} className={styles.liveSummaryHeadIcon} />
                      AI tarafından oluşturulan özet
                    </div>
                    <ul className={styles.liveSummaryList}>
                      {DEMO_SUMMARY_BULLETS.map((b, i) => (
                        <motion.li
                          key={i}
                          className={styles.liveSummaryItem}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: i < summaryShown ? 1 : 0, x: i < summaryShown ? 0 : -8 }}
                          transition={{ duration: 0.3 }}
                        >
                          <span className={styles.liveSummaryDot} />
                          <span>{b}</span>
                        </motion.li>
                      ))}
                    </ul>
                  </motion.div>
                )}

                {livePhase === 'complete' && resultTab === 'ask' && (
                  <motion.div
                    key="result-ask"
                    className={styles.liveAsk}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className={styles.liveAskMessages}>
                      <AP>
                        {chatStep >= 1 && (
                          <motion.div
                            key="user"
                            className={`${styles.liveBubble} ${styles.liveBubbleUser}`}
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
                            className={`${styles.liveBubble} ${styles.liveBubbleAi} ${styles.liveBubbleTyping}`}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                          >
                            {[0, 1, 2].map(i => (
                              <motion.span
                                key={i}
                                className={styles.liveTypingDot}
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
                            className={`${styles.liveBubble} ${styles.liveBubbleAi}`}
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
                    <div className={styles.liveAskInput} aria-hidden>
                      <input
                        type="text"
                        placeholder="Belgeye bir soru sor…"
                        readOnly
                        className={styles.liveAskInputField}
                      />
                      <button className={styles.liveAskSend} type="button" aria-label="Gönder">
                        <Send size={13} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AP>
            </div>
          </div>
        </motion.div>

        {/* Steps below — now reflect new translation-first flow */}
        <div className={styles.liveSteps}>
          {[
            { num: '01', icon: <FileText size={18} />, title: 'PDF Yükle',        desc: 'Sürükle bırak veya dosya seç' },
            { num: '02', icon: <Brain size={18} />,     title: 'AI Çevirir',       desc: 'Orijinal düzen ve grafikler korunur' },
            { num: '03', icon: <Sparkles size={18} />,  title: 'Özetle veya Sor',  desc: 'Belgenin içinden anında cevap al' },
          ].map((s, i) => (
            <motion.div
              key={s.num}
              className={styles.liveStep}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i}
            >
              <div className={styles.liveStepIcon}>{s.icon}</div>
              <div className={styles.liveStepNum}>{s.num}</div>
              <div className={styles.liveStepTitle}>{s.title}</div>
              <div className={styles.liveStepDesc}>{s.desc}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          TESTIMONIALS
      ══════════════════════════════════════════════════════ */}
      <section className={styles.testimonialsSection}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>Kullanıcı Yorumları</span>
          <h2 className={styles.sectionTitle}>Öğrenciler ne diyor?</h2>
        </div>
        <div className={styles.testimonialsGrid}>
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={i}
              className={styles.testimonialCard}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i}
              whileHover={reduced ? undefined : { y: -3 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            >
              <div className={styles.testimonialStars}>
                {Array.from({ length: t.stars }).map((_, si) => (
                  <Star key={si} size={13} fill="currentColor" />
                ))}
              </div>
              <p className={styles.testimonialText}>"{t.quote}"</p>
              <div className={styles.testimonialAuthor}>
                <div className={styles.testimonialAvatar}>{t.name[0]}</div>
                <div>
                  <div className={styles.testimonialName}>{t.name}</div>
                  <div className={styles.testimonialRole}>{t.role}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          PRICING
      ══════════════════════════════════════════════════════ */}
      <section className={styles.pricingSection} id="pricing">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>Fiyatlandırma</span>
          <h2 className={styles.sectionTitle}>İhtiyacınıza uygun plan</h2>
          <p className={styles.sectionDesc}>
            Ücretsiz başlayın. Kredi asla boşa gitmez.
          </p>
        </div>

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
            <div key={i} className={styles.creditPill}>
              {item.icon}<span>{item.text}</span>
            </div>
          ))}
        </motion.div>

        {/* Öğrenci / Genel Toggle */}
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
              {(pricingCfg['discount.student_amount'] ?? 0) > 0 && (
                <span className={styles.studentSaveBadge}>
                  -{pricingCfg['discount.student_amount']}₺
                </span>
              )}
            </button>
          </div>
        )}

        <div className={styles.pricingGrid}>
          {effectivePlans.map((plan, i) => (
            <motion.div
              key={plan.id}
              className={`${styles.pricingCard} ${plan.popular ? styles.pricingCardPopular : ''}`}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i}
              whileHover={reduced ? undefined : { y: -4 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}
            >
              {plan.popular && (
                <div className={styles.popularBadge}>
                  <Zap size={9} /> En Çok Tercih
                </div>
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
                  else if (plan.price === -1) navigate('/auth?mode=register');
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
      </section>

      {/* ══════════════════════════════════════════════════════
          CTA BAND
      ══════════════════════════════════════════════════════ */}
      <section className={styles.ctaBand}>
        <motion.div
          className={styles.ctaBandInner}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55 }}
        >
          <h2 className={styles.ctaBandTitle}>Bir dahaki ödevinizden önce deneyin</h2>
          <p className={styles.ctaBandSub}>Kayıt ücretsiz. Kredi kartı gerekmez.</p>
          <Magnetic strength={0.12}>
            <motion.div whileTap={reduced ? undefined : { scale: 0.97 }}>
              <Link to="/auth?mode=register" className={styles.ctaPrimary} style={{ padding: '14px 36px', fontSize: '15px' }}>
                Ücretsiz Hesap Aç
                <motion.span style={{ display: 'inline-flex' }}
                  whileHover={reduced ? undefined : { x: 3 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                >
                  <ArrowRight size={17} />
                </motion.span>
              </Link>
            </motion.div>
          </Magnetic>
        </motion.div>
      </section>

      {/* ══════════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════════ */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <div className={styles.footerLogo}>
              <img src="/trans_wordly.png" alt="" width={22} height={22} draggable={false} />
            </div>
            <span className={styles.footerBrandName}>TransWordly</span>
          </div>
          <nav className={styles.footerLinks}>
            <a href="#features"  onClick={scrollTo('features')}>Özellikler</a>
            <a href="#pricing"   onClick={scrollTo('pricing')}>Fiyatlar</a>
            <a href="#how-it-works" onClick={scrollTo('how-it-works')}>Nasıl Çalışır</a>
            <Link to="/auth">Giriş Yap</Link>
          </nav>
          <p className={styles.footerCopy}>© {new Date().getFullYear()} TransWordly · Akademisyenler için ❤️ ile</p>
        </div>
      </footer>
    </div>
  );
}
