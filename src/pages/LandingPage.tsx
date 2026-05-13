import { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence as AP, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';
import {
  Languages, FileText, Brain, ArrowRight, Check,
  Upload, Cpu, Download, Sparkles, Shield, Clock,
  BookOpen, Quote, Star, Zap, FileType, MessageSquare,
  Globe, FileCode,
} from 'lucide-react';
import { PRICING_PLANS } from '../lib/constants';
import { Magnetic, Tilt } from '../components/ui/motion';
import styles from '../styles/components/landing.module.css';

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const scrollTo = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const TESTIMONIALS = [
  {
    quote: 'Bir haftada 3 makale okudum — hepsini TransLingua ile çevirdim. Normalde birkaç günümü alırdı.',
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
    color: '#4f46e5',
    bg: 'rgba(79,70,229,0.08)',
    title: 'Akıllı Dil Tespiti',
    desc: 'İngilizce, Almanca, Arapça, Çince ve 8 dil daha — belgenizin dilini otomatik algılar, siz sadece yükleyin.',
  },
  {
    icon: <FileText size={22} />,
    color: '#10b981',
    bg: 'rgba(16,185,129,0.08)',
    title: '150+ Sayfa Desteği',
    desc: 'Akademik makaleler, ders kitabı bölümleri ve uzun raporları bile eksiksiz çevirir.',
  },
  {
    icon: <BookOpen size={22} />,
    color: '#8b5cf6',
    bg: 'rgba(139,92,246,0.08)',
    title: 'Ders Notu Çıkar',
    desc: 'Sınıf tahtası fotoğrafı, slayt veya PDF yükle — yapay zeka organize ders notu oluşturur.',
  },
  {
    icon: <Brain size={22} />,
    color: '#0ea5e9',
    bg: 'rgba(14,165,233,0.08)',
    title: 'AI Soru-Cevap',
    desc: 'Çevirdiğin makaleye direkt soru sor. "Bu yöntemin sınırlılıkları ne?" gibi sorulara anında yanıt.',
  },
  {
    icon: <FileType size={22} />,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.08)',
    title: 'PDF · Word · TXT',
    desc: 'Çevirinizi istediğiniz formatta indirin. Profesyonel PDF, düzenlenebilir Word veya düz metin.',
  },
  {
    icon: <Shield size={22} />,
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.08)',
    title: 'Güvenli & Özel',
    desc: 'Belgeleriniz şifrelenmiş altyapıda saklanır, hiçbir üçüncü tarafla paylaşılmaz.',
  },
];

export default function LandingPage() {
  const heroRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const [demoStep, setDemoStep] = useState(0);
  const [demoAuto, setDemoAuto] = useState(true);

  useEffect(() => {
    if (!demoAuto) return;
    const t = setInterval(() => setDemoStep(s => (s + 1) % 3), 3800);
    return () => clearInterval(t);
  }, [demoAuto]);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const smx = useSpring(mx, { stiffness: 80, damping: 18, mass: 0.6 });
  const smy = useSpring(my, { stiffness: 80, damping: 18, mass: 0.6 });
  const heroX = useTransform(smx, [-0.5, 0.5], [-14, 14]);
  const heroY = useTransform(smy, [-0.5, 0.5], [-8, 8]);

  const onHeroMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (reduced || !heroRef.current) return;
    const r = heroRef.current.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };

  return (
    <div>

      {/* ── HERO ──────────────────────────────────────────────── */}
      <section ref={heroRef} className={styles.hero} onMouseMove={onHeroMouseMove}>
        {/* Animated background mesh */}
        <motion.div className={styles.heroMesh} style={{ x: heroX, y: heroY }} aria-hidden="true">
          <div className={`${styles.meshOrb} ${styles.meshOrb1}`} />
          <div className={`${styles.meshOrb} ${styles.meshOrb2}`} />
          <div className={`${styles.meshOrb} ${styles.meshOrb3}`} />
        </motion.div>

        <div className={styles.heroContent}>
          <motion.div
            className={styles.heroBadge}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className={styles.heroBadgeDot} />
            Öğrenciler ve Araştırmacılar için AI Asistanı
          </motion.div>

          <motion.h1
            className={styles.heroTitle}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            Yabancı Kaynakları{' '}
            <span className="text-gradient">Saniyeler İçinde</span>{' '}
            Anla
          </motion.h1>

          <motion.p
            className={styles.heroSubtitle}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.22 }}
          >
            Akademik makaleler, ders kitapları ve araştırma raporlarını 12 dilden Türkçe'ye çevirin.
            Ders notu çıkarın, AI'a soru sorun.
          </motion.p>

          <motion.div
            className={styles.heroCtas}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.34 }}
          >
            <Magnetic strength={0.18}>
              <motion.div whileTap={reduced ? undefined : { scale: 0.96 }} transition={{ type: 'spring', stiffness: 520, damping: 28 }}>
                <Link to="/auth?mode=register" className={styles.ctaPrimary}>
                  Ücretsiz Başla
                  <motion.span style={{ display: 'inline-flex' }} whileHover={reduced ? undefined : { x: 4 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}>
                    <ArrowRight size={17} />
                  </motion.span>
                </Link>
              </motion.div>
            </Magnetic>
            <motion.a
              href="#features"
              className={styles.ctaSecondary}
              onClick={scrollTo('features')}
              whileHover={reduced ? undefined : { y: -2 }}
              whileTap={reduced ? undefined : { scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 520, damping: 28 }}
            >
              Özellikleri Gör
            </motion.a>
          </motion.div>

          {/* Stats strip */}
          <motion.div
            className={styles.heroStats}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            {[
              { num: '12+', label: 'Kaynak Dil' },
              { num: '150+', label: 'Sayfa Kapasitesi' },
              { num: '3 Format', label: 'PDF · Word · TXT' },
              { num: '256-bit', label: 'Şifreleme' },
            ].map(s => (
              <div key={s.label} className={styles.statItem}>
                <div className={styles.statNumber}>{s.num}</div>
                <div className={styles.statLabel}>{s.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────── */}
      <section className={styles.section} id="features">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>Özellikler</span>
          <h2 className={styles.sectionTitle}>Akademik çalışmana özel araçlar</h2>
          <p className={styles.sectionDesc}>
            Tek platformda çeviri, not çıkarma ve kaynak analizi — ayrı araçlara gerek yok.
          </p>
        </div>
        <div className={styles.featuresGrid}>
          {FEATURES.map((f, i) => (
            <motion.div key={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={i}>
              <Tilt max={4} scale={1.015} className={styles.featureCard} style={{ height: '100%' }}>
                <motion.div
                  className={styles.featureIcon}
                  style={{ background: f.bg, color: f.color }}
                  whileHover={reduced ? undefined : { rotate: -6, scale: 1.1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 18 }}
                >
                  {f.icon}
                </motion.div>
                <h3 className={styles.featureTitle}>{f.title}</h3>
                <p className={styles.featureDesc}>{f.desc}</p>
              </Tilt>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── TESTIMONIALS ──────────────────────────────────────── */}
      <section className={styles.testimonialSection}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>Kullanıcı Yorumları</span>
          <h2 className={styles.sectionTitle}>Öğrenciler ne diyor?</h2>
        </div>
        <div className={styles.testimonialGrid}>
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={i}
              className={styles.testimonialCard}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i}
              whileHover={reduced ? undefined : { y: -4 }}
              transition={{ type: 'spring', stiffness: 340, damping: 26 }}
            >
              <Quote size={20} className={styles.testimonialQuoteIcon} />
              <p className={styles.testimonialText}>"{t.quote}"</p>
              <div className={styles.testimonialFooter}>
                <div className={styles.testimonialAvatar}>
                  {t.name[0]}
                </div>
                <div>
                  <div className={styles.testimonialName}>{t.name}</div>
                  <div className={styles.testimonialRole}>{t.role}</div>
                </div>
                <div className={styles.testimonialStars}>
                  {Array.from({ length: t.stars }).map((_, si) => (
                    <Star key={si} size={12} fill="currentColor" />
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────── */}
      <section className={styles.howItWorks} id="how-it-works">
        <div className={styles.howItWorksBg} aria-hidden="true" />
        <div className={styles.howItWorksGlow} aria-hidden="true" />
        <div className={`${styles.howItWorksGlow} ${styles.howItWorksGlowRight}`} aria-hidden="true" />

        <div className={styles.howItWorksHeader}>
          <span className={styles.howItWorksLabel}>Nasıl Çalışır</span>
          <h2 className={styles.howItWorksTitle}>3 Adımda Profesyonel Çeviri</h2>
          <p className={styles.howItWorksDesc}>
            Dosyanızı yükleyin, gerisini yapay zekanıza bırakın.
          </p>
        </div>

        {/* ── Live Demo Widget ── */}
        <motion.div
          className={styles.demoContainer}
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          onMouseEnter={() => setDemoAuto(false)}
          onMouseLeave={() => setDemoAuto(true)}
        >
          {/* Step tabs */}
          <div className={styles.demoTabs}>
            {[
              { label: 'Dosya Yükle', icon: <Upload size={13} /> },
              { label: 'AI Çevirsin', icon: <Cpu size={13} /> },
              { label: 'İndir & Kullan', icon: <Download size={13} /> },
            ].map((tab, i) => (
              <button
                key={i}
                className={`${styles.demoTab} ${demoStep === i ? styles.demoTabActive : ''}`}
                onClick={() => { setDemoStep(i); setDemoAuto(false); }}
              >
                <span className={styles.demoTabNum}>{i + 1}</span>
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Browser window */}
          <div className={styles.demoWindow}>
            <div className={styles.demoWindowBar}>
              <div className={styles.demoWindowDots}>
                <div className={styles.demoWindowDot} />
                <div className={styles.demoWindowDot} />
                <div className={styles.demoWindowDot} />
              </div>
              <div className={styles.demoWindowUrl}>translingua.app/translate</div>
            </div>

            <AP mode="wait">
              <motion.div
                key={`demo-${demoStep}`}
                className={styles.demoWindowBody}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22 }}
              >

                {/* ── Step 1: Upload ── */}
                {demoStep === 0 && (
                  <div className={styles.demoUpload}>
                    <div className={styles.demoDropzone}>
                      <FileText size={30} style={{ color: 'rgba(255,255,255,0.18)' }} />
                      <div className={styles.demoDropzoneTitle}>PDF veya görsel yüklemek için sürükleyin</div>
                      <div className={styles.demoDropzoneSub}>veya seçmek için tıklayın · Max 100 MB</div>
                    </div>
                    <div className={styles.demoFileItem}>
                      <FileText size={14} style={{ color: '#a5b4fc', flexShrink: 0 }} />
                      <span className={styles.demoFileName}>makale_en.pdf</span>
                      <span className={styles.demoFileMeta}>2.3 MB · 8 sayfa</span>
                      <Check size={13} style={{ color: '#10b981', flexShrink: 0 }} />
                    </div>
                    <div className={styles.demoLangRow}>
                      <Globe size={13} style={{ color: 'rgba(255,255,255,0.25)' }} />
                      <span className={styles.demoLangText}>Dil tespiti:</span>
                      <div className={styles.demoLangTag}>English</div>
                      <ArrowRight size={11} style={{ color: 'rgba(255,255,255,0.18)' }} />
                      <div className={`${styles.demoLangTag} ${styles.demoLangTagTR}`}>Türkçe</div>
                    </div>
                    <div className={styles.demoActionBar}>
                      <div className={styles.demoCreditBadge}>8 kredi · 8 sayfa</div>
                      <div className={styles.demoBtnFake}>Çevir <ArrowRight size={13} /></div>
                    </div>
                  </div>
                )}

                {/* ── Step 2: Processing ── */}
                {demoStep === 1 && (
                  <div className={styles.demoProcessing}>
                    <div className={styles.demoProcessHeader}>
                      <div className={styles.demoSpinner} />
                      <span className={styles.demoProcessTitle}>Yapay Zeka Çalışıyor</span>
                      <span className={styles.demoProcessCount}>5 / 8 sayfa</span>
                    </div>
                    <div className={styles.demoProgressBar}>
                      <motion.div
                        className={styles.demoProgressFill}
                        initial={{ width: '12%' }}
                        animate={{ width: '62%' }}
                        transition={{ duration: 1.4, ease: 'easeOut' }}
                      />
                    </div>
                    <div className={styles.demoProcessStatus}>
                      Akademik terminoloji analiz ediliyor...
                    </div>
                    <div className={styles.demoStreamBox}>
                      <div className={styles.demoStreamLine}>Bu çalışmada, nöroplastisite kavramı ve öğrenme süreçlerine</div>
                      <div className={styles.demoStreamLine}>olan etkileri kapsamlı biçimde ele alınmıştır. Araştırma</div>
                      <div className={styles.demoStreamLine}>bulguları, erken dönem müdahalelerin uzun vadeli bilişsel</div>
                      <motion.span
                        className={styles.demoCursor}
                        animate={{ opacity: [1, 0] }}
                        transition={{ duration: 0.7, repeat: Infinity, repeatType: 'reverse' }}
                      />
                    </div>
                  </div>
                )}

                {/* ── Step 3: Result ── */}
                {demoStep === 2 && (
                  <div className={styles.demoResult}>
                    <div className={styles.demoResultHeader}>
                      <Check size={14} style={{ color: '#10b981', flexShrink: 0 }} />
                      <span className={styles.demoResultTitle}>Çeviri Tamamlandı · makale_en.pdf</span>
                      <div className={styles.demoResultBtns}>
                        <div className={styles.demoResultBtn}><FileText size={10} />PDF</div>
                        <div className={`${styles.demoResultBtn} ${styles.demoResultBtnAccent}`}><FileType size={10} />Word</div>
                        <div className={styles.demoResultBtn}><FileCode size={10} />TXT</div>
                      </div>
                    </div>
                    <div className={styles.demoResultColumns}>
                      <div className={styles.demoResultCol}>
                        <div className={styles.demoResultColLabel}>English</div>
                        <p className={styles.demoResultText}>
                          This study comprehensively examines neuroplasticity and its effects on learning processes. The findings suggest that early interventions have significant long-term cognitive benefits across all age groups...
                        </p>
                      </div>
                      <div className={styles.demoResultDivider} />
                      <div className={styles.demoResultCol}>
                        <div className={`${styles.demoResultColLabel} ${styles.demoResultColLabelTR}`}>Türkçe</div>
                        <p className={`${styles.demoResultText} ${styles.demoResultTextTR}`}>
                          Bu çalışmada nöroplastisite ve öğrenme süreçlerine etkileri kapsamlı biçimde incelenmiştir. Bulgular, erken dönem müdahalelerin tüm yaş gruplarında uzun vadeli önemli bilişsel faydalar sağladığını ortaya koymaktadır...
                        </p>
                      </div>
                    </div>
                  </div>
                )}

              </motion.div>
            </AP>
          </div>

          {/* Progress dots */}
          <div className={styles.demoDots}>
            {[0, 1, 2].map(i => (
              <button
                key={i}
                className={`${styles.demoDot} ${demoStep === i ? styles.demoDotActive : ''}`}
                onClick={() => { setDemoStep(i); setDemoAuto(false); }}
                aria-label={`Adım ${i + 1}`}
              />
            ))}
          </div>
        </motion.div>

        <motion.div
          className={styles.howItWorksMetrics}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          {[
            { value: '< 2 dk', label: 'Ortalama Çeviri Süresi' },
            { value: '12 Dil', label: 'Desteklenen Kaynak Dil' },
            { value: 'Bağlam', label: 'Odaklı AI Çeviri' },
            { value: '256-bit', label: 'Şifreleme Standardı' },
          ].map((m, i) => (
            <div key={i} className={styles.metric}>
              <div className={styles.metricValue}>{m.value}</div>
              <div className={styles.metricLabel}>{m.label}</div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ── PRICING ───────────────────────────────────────────── */}
      <section className={styles.section} id="pricing">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>Fiyatlandırma</span>
          <h2 className={styles.sectionTitle}>İhtiyacınıza Uygun Plan</h2>
          <p className={styles.sectionDesc}>
            Ücretsiz başlayın, ihtiyaçlarınız büyüdükçe plan değiştirin. Kredi asla boşa gitmez — her işlem için kullanırsınız.
          </p>
        </div>

        {/* Credit cost explainer */}
        <motion.div
          className={styles.creditExplainer}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          {[
            { icon: <Languages size={14} />, text: '1 sayfa çeviri = 1 kredi' },
            { icon: <BookOpen size={14} />, text: '1 ders notu kaynağı = 1 kredi' },
            { icon: <MessageSquare size={14} />, text: 'AI soru = 0.5 kredi' },
          ].map((item, i) => (
            <div key={i} className={styles.creditPill}>
              {item.icon}
              <span>{item.text}</span>
            </div>
          ))}
        </motion.div>

        <div className={styles.pricingGrid}>
          {PRICING_PLANS.map((plan, i) => (
            <motion.div
              key={plan.id}
              className={`${styles.pricingCard} ${plan.popular ? styles.pricingPopular : ''}`}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i}
              whileHover={reduced ? undefined : { y: -6 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}
            >
              {plan.popular && (
                <div className={styles.popularBadge}>
                  <Zap size={10} /> En Çok Tercih Edilen
                </div>
              )}
              <h3 className={styles.pricingName}>{plan.name}</h3>
              <div className={styles.pricingPrice}>
                {plan.priceLabel}
                {plan.price > 0 && <span className={styles.pricingPer}> /ay</span>}
              </div>
              {plan.credits > 0 && (
                <div className={styles.pricingCredits}>{plan.credits} kredi/ay</div>
              )}
              <ul className={styles.pricingFeatures}>
                {plan.features.map((f, fi) => (
                  <li key={fi} className={styles.pricingFeature}><Check size={14} />{f}</li>
                ))}
              </ul>
              <motion.div whileTap={reduced ? undefined : { scale: 0.97 }} transition={{ type: 'spring', stiffness: 520, damping: 28 }}>
                <Link
                  to="/auth?mode=register"
                  className={`${styles.pricingCta} ${plan.popular ? styles.pricingCtaPrimary : ''}`}
                >
                  {plan.price === 0 ? 'Ücretsiz Başla' : plan.price === -1 ? 'İletişime Geçin' : 'Plan Seç'}
                </Link>
              </motion.div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── CTA BAND ──────────────────────────────────────────── */}
      <section className={styles.ctaBand}>
        <motion.div
          className={styles.ctaBandInner}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className={styles.ctaBandTitle}>Bir dahaki ödevinizden önce deneyin</h2>
          <p className={styles.ctaBandDesc}>Kayıt olmak ücretsiz, kredi kartı gerekmez.</p>
          <Magnetic strength={0.14}>
            <motion.div whileTap={reduced ? undefined : { scale: 0.96 }} transition={{ type: 'spring', stiffness: 520, damping: 28 }}>
              <Link to="/auth?mode=register" className={styles.ctaPrimary} style={{ fontSize: '1rem', padding: '15px 36px' }}>
                Ücretsiz Hesap Aç
                <motion.span style={{ display: 'inline-flex' }} whileHover={reduced ? undefined : { x: 4 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}>
                  <ArrowRight size={18} />
                </motion.span>
              </Link>
            </motion.div>
          </Magnetic>
        </motion.div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <div className={styles.footerLogo}>TL</div>
            <span className={styles.footerBrandName}>TransLingua</span>
          </div>
          <nav className={styles.footerLinks}>
            <a href="#features" onClick={scrollTo('features')}>Özellikler</a>
            <a href="#pricing" onClick={scrollTo('pricing')}>Fiyatlar</a>
            <a href="#how-it-works" onClick={scrollTo('how-it-works')}>Nasıl Çalışır</a>
            <Link to="/auth">Giriş Yap</Link>
          </nav>
          <p className={styles.footerText}>© {new Date().getFullYear()} TransLingua. Tüm hakları saklıdır.</p>
        </div>
      </footer>
    </div>
  );
}
