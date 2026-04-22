import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Languages, FileText, Brain, Zap, ArrowRight, Check, Upload, Cpu, Download } from 'lucide-react';
import { PRICING_PLANS } from '../lib/constants';
import styles from '../styles/components/landing.module.css';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.55, ease: 'easeOut' as const } }),
};

// Smooth scroll helper
const scrollTo = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export default function LandingPage() {
  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroMesh}>
          <div className={styles.meshOrb} />
          <div className={styles.meshOrb} />
          <div className={styles.meshOrb} />
        </div>
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>
            <span className={styles.heroBadgeDot} />
            Gemini 2.5 Flash ile Güçlendirildi
          </div>
          <h1 className={styles.heroTitle}>
            Belgelerinizi{' '}
            <span className="text-gradient">Saniyeler İçinde</span>
            {' '}Türkçe'ye Çevirin
          </h1>
          <p className={styles.heroSubtitle}>
            PDF'ler, kitaplar ve dokümanları 12 dilden yapay zeka ile profesyonel kalitede çevirin.
            150+ sayfalık belgeleri bile sorunsuz işleyin.
          </p>
          <div className={styles.heroCtas}>
            <Link to="/auth?mode=register" className={styles.ctaPrimary}>
              Ücretsiz Başla
              <ArrowRight size={17} />
            </Link>
            <a href="#how-it-works" className={styles.ctaSecondary} onClick={scrollTo('how-it-works')}>
              Nasıl Çalışır?
            </a>
          </div>
          <div className={styles.heroStats}>
            <div className={styles.statItem}>
              <div className={styles.statNumber}>12+</div>
              <div className={styles.statLabel}>Desteklenen Dil</div>
            </div>
            <div className={styles.statItem}>
              <div className={styles.statNumber}>150+</div>
              <div className={styles.statLabel}>Sayfa Kapasitesi</div>
            </div>
            <div className={styles.statItem}>
              <div className={styles.statNumber}>%99</div>
              <div className={styles.statLabel}>Doğruluk Oranı</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────── */}
      <section className={styles.section} id="features">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>Özellikler</span>
          <h2 className={styles.sectionTitle}>Her Şey Tek Platformda</h2>
          <p className={styles.sectionDesc}>Yapay zeka destekli çeviri motorumuz belgelerinizi anlayarak profesyonel kalitede çevirir.</p>
        </div>
        <div className={styles.featuresGrid}>
          {[
            { icon: <Languages size={22} />, title: 'Akıllı Dil Tespiti', desc: 'Belgenizin dilini otomatik algılar. İngilizce, Arapça, Almanca, Çince ve 8 dil daha desteklenir.' },
            { icon: <FileText size={22} />, title: '150+ Sayfa Desteği', desc: 'Akademik makaleler, teknik kılavuzlar ve uzun raporlar için optimize edilmiş çeviri motoru.' },
            { icon: <Brain size={22} />, title: 'AI Soru-Cevap', desc: 'Çevirdiğiniz belge hakkında yapay zekaya sorular sorun ve detaylı açıklamalar alın.' },
            { icon: <Zap size={22} />, title: 'Hızlı ve Güvenli', desc: 'Gemini AI ile yüksek hızda çeviri. Belgeleriniz şifrelenmiş altyapıda güvenle korunur.' },
          ].map((f, i) => (
            <motion.div key={i} className={styles.featureCard} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={i}>
              <div className={styles.featureIcon}>{f.icon}</div>
              <h3 className={styles.featureTitle}>{f.title}</h3>
              <p className={styles.featureDesc}>{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── How It Works — Premium Dark Section ──────────── */}
      <section className={styles.howItWorks} id="how-it-works">
        <div className={styles.howItWorksBg} />
        <div className={styles.howItWorksHeader}>
          <span className={styles.howItWorksLabel}>Nasıl Çalışır</span>
          <h2 className={styles.howItWorksTitle}>3 Adımda Profesyonel Çeviri</h2>
          <p className={styles.howItWorksDesc}>
            Dosyanızı yükleyin, gerisi bize kalsın. Yapay zeka saniyeler içinde çalışmaya başlar.
          </p>
        </div>
        <div className={styles.stepsContainer}>
          {/* Step 1 */}
          <motion.div className={styles.stepCard} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={0}>
            <div className={styles.stepNumber}>1</div>
            <div className={styles.stepIcon}><Upload size={20} /></div>
            <h3 className={styles.stepTitle}>PDF'inizi Yükleyin</h3>
            <p className={styles.stepDesc}>Sürükle-bırak ile belgenizi yükleyin. PDF, Word ve metin dosyalarını destekliyoruz.</p>
          </motion.div>

          {/* Connector */}
          <div className={styles.stepConnector}>
            <div className={styles.stepConnectorLine} />
            <ArrowRight size={14} color="rgba(255,255,255,0.25)" />
          </div>

          {/* Step 2 */}
          <motion.div className={styles.stepCard} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={1}>
            <div className={styles.stepNumber}>2</div>
            <div className={styles.stepIcon}><Cpu size={20} /></div>
            <h3 className={styles.stepTitle}>AI Çevirsin</h3>
            <p className={styles.stepDesc}>Gemini 2.5 Flash belgenizdeki her kelimeyi bağlamıyla birlikte anlayarak çevirir.</p>
          </motion.div>

          {/* Connector */}
          <div className={styles.stepConnector}>
            <div className={styles.stepConnectorLine} />
            <ArrowRight size={14} color="rgba(255,255,255,0.25)" />
          </div>

          {/* Step 3 */}
          <motion.div className={styles.stepCard} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={2}>
            <div className={styles.stepNumber}>3</div>
            <div className={styles.stepIcon}><Download size={20} /></div>
            <h3 className={styles.stepTitle}>İndirin ve Kullanın</h3>
            <p className={styles.stepDesc}>Çevirinizi indirin. İstediğiniz zaman AI asistanına belge hakkında sorular sorabilirsiniz.</p>
          </motion.div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────── */}
      <section className={styles.section} id="pricing">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>Fiyatlandırma</span>
          <h2 className={styles.sectionTitle}>İhtiyacınıza Uygun Plan</h2>
          <p className={styles.sectionDesc}>Ücretsiz başlayın, ihtiyaçlarınız büyüdükçe plan değiştirin.</p>
        </div>
        <div className={styles.pricingGrid}>
          {PRICING_PLANS.map((plan, i) => (
            <motion.div key={plan.id} className={`${styles.pricingCard} ${plan.popular ? styles.pricingPopular : ''}`} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={i}>
              {plan.popular && <div className={styles.popularBadge}>Popüler</div>}
              <h3 className={styles.pricingName}>{plan.name}</h3>
              <div className={styles.pricingPrice}>{plan.priceLabel}</div>
              <ul className={styles.pricingFeatures}>
                {plan.features.map((f, fi) => (
                  <li key={fi} className={styles.pricingFeature}><Check size={14} />{f}</li>
                ))}
              </ul>
              <Link to="/auth?mode=register" className={`${styles.pricingCta} ${plan.popular ? styles.pricingCtaPrimary : ''}`}>
                {plan.price === 0 ? 'Ücretsiz Başla' : plan.price === -1 ? 'İletişime Geçin' : 'Plan Seç'}
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <div className={styles.footerLogo}>TL</div>
            <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>TransLingua</span>
          </div>
          <p className={styles.footerText}>© {new Date().getFullYear()} TransLingua. Tüm hakları saklıdır.</p>
        </div>
      </footer>
    </div>
  );
}
