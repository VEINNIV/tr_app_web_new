import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Brain,
  Building2,
  Check,
  Clock3,
  Download,
  FileSearch,
  FileText,
  GraduationCap,
  Languages,
  LockKeyhole,
  MessageSquareText,
  ScanText,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { PRICING_PLANS } from '../lib/constants';
import styles from '../styles/components/landing.module.css';

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: 'easeOut' as const },
  }),
};

const scrollTo = (id: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
  event.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const useCases = [
  {
    icon: <GraduationCap size={21} />,
    label: 'Akademik çalışma',
    title: 'Makale ve tezleri bağlamını kaybetmeden okuyun',
    desc: 'PDF metnini çıkarın, Türkçe çeviriyi alın ve belge üstünde not çıkarma ya da soru-cevap akışına geçin.',
    meta: 'Tez, makale, literatür',
    visual: ['Abstract', 'Methodology', 'Findings'],
  },
  {
    icon: <Building2 size={21} />,
    label: 'İş dokümanları',
    title: 'Sözleşme, teklif ve raporları ekip diline taşıyın',
    desc: 'Teknik terimleri koruyan, okunabilir ve paylaşılabilir çeviri çıktılarıyla manuel kopyala-yapıştır yükünü azaltın.',
    meta: 'Sözleşme, rapor, teklif',
    visual: ['Terms', 'Scope', 'Risk notes'],
  },
  {
    icon: <BookOpen size={21} />,
    label: 'Uzun PDF inceleme',
    title: 'Büyük belgeleri çalışma alanına dönüştürün',
    desc: 'Çeviri, doküman arşivi ve AI asistanı aynı yerde kullanarak belgeyle tekrar tekrar çalışın.',
    meta: 'Kitap, kılavuz, doküman',
    visual: ['Chapter 04', 'Summary', 'Questions'],
  },
];

const assuranceItems = [
  { icon: <Languages size={18} />, title: '12 kaynak dil', desc: 'İngilizce, Almanca, Fransızca, Arapça ve daha fazlasından Türkçe’ye çeviri.' },
  { icon: <FileText size={18} />, title: 'PDF odaklı akış', desc: 'Yükleme, metin çıkarma, çeviri ve çıktı alma adımları tek çalışma alanında.' },
  { icon: <MessageSquareText size={18} />, title: 'Belge üstü asistan', desc: 'Çevrilen doküman hakkında soru sorarak özet, açıklama ve çalışma notu alın.' },
  { icon: <LockKeyhole size={18} />, title: 'Hesap kontrollü kullanım', desc: 'Kredi, plan ve doküman geçmişi kullanıcı dashboard’unda takip edilir.' },
];

const workflow = [
  { icon: <Upload size={20} />, title: 'Belgeyi yükle', desc: 'PDF veya metin dosyanı çalışma alanına ekle.', detail: 'Dosya adı, kaynak dil ve kredi ihtiyacı tek ekranda görünür.' },
  { icon: <ScanText size={20} />, title: 'Metni çıkar', desc: 'Kaynak içerik çeviri için hazırlanır.', detail: 'Sayfalar okunur, metin bölümleri temizlenir ve çeviri kuyruğu hazırlanır.' },
  { icon: <Brain size={20} />, title: 'Çeviriyi üret', desc: 'AI modeli metni Türkçe’ye dönüştürür.', detail: 'Bağlam, paragraf yapısı ve okunabilirlik aynı akışta takip edilir.' },
  { icon: <Download size={20} />, title: 'Kullanıma al', desc: 'Sonucu indir, arşivle veya asistanla incele.', detail: 'Çıktıyı indirip doküman geçmişinden tekrar açabilirsiniz.' },
];

const getPlanMeta = (credits: number) => {
  if (credits < 0) return { label: 'Özel kota', meter: 100 };
  if (credits === 0) return { label: 'Başlangıç', meter: 12 };
  if (credits <= 5) return { label: `${credits} kredi`, meter: 16 };
  if (credits <= 50) return { label: `${credits} kredi`, meter: 42 };
  return { label: `${credits} kredi`, meter: 78 };
};

export default function LandingPage() {
  return (
    <div className={styles.landing}>
      <section className={styles.hero}>
        <div className={styles.heroGrid} aria-hidden="true" />
        <div className={styles.heroInner}>
          <motion.div
            className={styles.heroLead}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          >
            <div className={styles.eyebrow}>
              <ShieldCheck size={15} />
              Profesyonel PDF çeviri çalışma alanı
            </div>
            <h1>Yabancı belgeleri Türkçe çalışma dosyasına dönüştürün.</h1>
            <p>
              TransLingua, PDF odaklı çeviri, doküman arşivi ve belge üstü AI asistanı tek bir akışta birleştirir.
              Akademik, teknik ve iş belgelerini daha kontrollü şekilde Türkçe okuyun.
            </p>
            <div className={styles.heroActions}>
              <Link to="/auth?mode=register" className={styles.primaryCta}>
                Ücretsiz başla
                <ArrowRight size={17} />
              </Link>
              <a href="#how-it-works" className={styles.secondaryCta} onClick={scrollTo('how-it-works')}>
                Akışı gör
              </a>
            </div>
          </motion.div>

          <motion.div
            className={styles.productStage}
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.12, ease: 'easeOut' }}
          >
            <div className={styles.stageChrome}>
              <div className={styles.windowDots}>
                <span />
                <span />
                <span />
              </div>
              <div className={styles.stagePath}>translingua.app/workspace</div>
              <div className={styles.stageStatus}>Canlı önizleme</div>
            </div>

            <div className={styles.workspacePreview}>
              <aside className={styles.previewSidebar}>
                <div className={styles.sidebarLogo}>TL</div>
                <span className={styles.sidebarActive}>Çeviri</span>
                <span>Belgeler</span>
                <span>Asistan</span>
              </aside>

              <div className={styles.sourcePanel}>
                <div className={styles.panelHeader}>
                  <FileSearch size={17} />
                  <span>Kaynak PDF</span>
                </div>
                <div className={styles.documentSheet}>
                  <div className={styles.pageTag}>Sayfa 12 / 48</div>
                  <div className={styles.sheetLineWide} />
                  <div className={styles.sheetLine} />
                  <div className={styles.sheetLineShort} />
                  <div className={styles.annotationRow}>
                    <span>EN</span>
                    <strong>Research brief</strong>
                  </div>
                  <div className={styles.sheetBlock} />
                  <div className={styles.pageThumbs}>
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>

              <div className={styles.translationRail}>
                <div className={styles.railStepActive}>
                  <Upload size={15} />
                  Yüklendi
                </div>
                <div className={styles.railStepActive}>
                  <ScanText size={15} />
                  Metin çıkarıldı
                </div>
                <div className={styles.railStepCurrent}>
                  <Languages size={15} />
                  Türkçe çeviri
                </div>
                <div className={styles.railMeta}>
                  <strong>TR</strong>
                  <span>Paragraf yapısı korunuyor</span>
                </div>
              </div>

              <div className={styles.resultPanel}>
                <div className={styles.panelHeader}>
                  <Languages size={17} />
                  <span>Türkçe çıktı</span>
                </div>
                <div className={styles.translationText}>
                  <strong>Yönetici özeti</strong>
                  <p>
                    Belge, pazar dinamiklerini ve karar kriterlerini Türkçe olarak okunabilir bir yapıya taşır.
                  </p>
                </div>
                <div className={styles.assistantCard}>
                  <Brain size={17} />
                  <div>
                    <span>AI asistan</span>
                    <strong>“Bu bölümün risklerini özetle.”</strong>
                  </div>
                </div>
                <div className={styles.reviewRow}>
                  <span>Terim kontrolü</span>
                  <strong>7 öneri</strong>
                </div>
                <div className={styles.reviewRow}>
                  <span>Okunabilirlik</span>
                  <strong>Net</strong>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            className={styles.trustRail}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.32, ease: 'easeOut' }}
          >
            <div>
              <strong>12</strong>
              <span>kaynak dil</span>
            </div>
            <div>
              <strong>PDF</strong>
              <span>odaklı çeviri</span>
            </div>
            <div>
              <strong>AI</strong>
              <span>belge asistanı</span>
            </div>
            <div>
              <strong>Kredi</strong>
              <span>kontrollü kullanım</span>
            </div>
          </motion.div>
        </div>
      </section>

      <section className={styles.section} id="features">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>Kullanım alanları</span>
          <h2>Çeviri ekranı değil, belgeyle çalışma sistemi.</h2>
          <p>
            TransLingua, dosyayı yüklediğiniz anda çeviri, arşiv ve belge üstü inceleme adımlarını aynı üründe toplar.
          </p>
        </div>

        <div className={styles.useCaseGrid}>
          {useCases.map((item, index) => (
            <motion.article
              key={item.title}
              className={styles.useCaseCard}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-80px' }}
              custom={index}
            >
              <div className={styles.useCaseTop}>
                <span className={styles.useCaseIcon}>{item.icon}</span>
                <span>{item.label}</span>
              </div>
              <div className={styles.useCaseVisual}>
                <div className={styles.visualHeader}>
                  <span>{item.meta}</span>
                  <strong>TR</strong>
                </div>
                {item.visual.map((row) => (
                  <div key={row} className={styles.visualRow}>
                    <span>{row}</span>
                    <i />
                  </div>
                ))}
              </div>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </motion.article>
          ))}
        </div>

        <div className={styles.assuranceGrid}>
          {assuranceItems.map((item, index) => (
            <motion.div
              key={item.title}
              className={styles.assuranceItem}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-80px' }}
              custom={index}
            >
              <span>{item.icon}</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className={styles.workflowSection} id="how-it-works">
        <div className={styles.workflowInner}>
          <div className={styles.workflowIntro}>
            <span className={styles.sectionLabel}>Nasıl çalışır</span>
            <h2>Tekrarlanabilir ve kontrollü bir çeviri akışı.</h2>
            <p>
              Her adım, kullanıcı dashboard’unda devam edebileceğiniz bir belge geçmişi oluşturmak için tasarlandı.
            </p>
          </div>

          <div className={styles.workflowGrid}>
            {workflow.map((step, index) => (
              <motion.div
                key={step.title}
                className={styles.workflowCard}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-80px' }}
                custom={index}
              >
                <div className={styles.workflowTop}>
                  <div className={styles.workflowNumber}>0{index + 1}</div>
                  <div className={styles.workflowIcon}>{step.icon}</div>
                </div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
                <div className={styles.workflowDetail}>{step.detail}</div>
              </motion.div>
            ))}
          </div>

          <div className={styles.qualityStrip}>
            <div>
              <Clock3 size={18} />
              <span>Hızlı önizleme ve çıktı alma</span>
            </div>
            <div>
              <ShieldCheck size={18} />
              <span>Hesap ve kredi bazlı erişim</span>
            </div>
            <div>
              <Brain size={18} />
              <span>Çeviri sonrası AI inceleme</span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} id="pricing">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>Fiyatlandırma</span>
          <h2>Başlangıçtan yoğun kullanıma kadar net planlar.</h2>
          <p>
            Ücretsiz deneyin, belge hacminiz arttıkça daha yüksek kredi ve destek seçeneklerine geçin.
          </p>
        </div>

        <div className={styles.pricingGrid}>
          {PRICING_PLANS.map((plan, index) => (
            (() => {
              const meta = getPlanMeta(plan.credits);
              return (
                <motion.article
                  key={plan.id}
                  className={`${styles.pricingCard} ${plan.popular ? styles.pricingPopular : ''}`}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: '-80px' }}
                  custom={index}
                >
                  {plan.popular && <div className={styles.popularBadge}>Önerilen</div>}
                  <div className={styles.pricingTop}>
                    <h3>{plan.name}</h3>
                    <div className={styles.pricingPrice}>{plan.priceLabel}</div>
                    <span>{meta.label}</span>
                  </div>
                  <div className={styles.creditMeter} style={{ '--meter': `${meta.meter}%` } as React.CSSProperties}>
                    <div />
                  </div>
                  <ul className={styles.pricingFeatures}>
                    {plan.features.map((feature) => (
                      <li key={feature}>
                        <Check size={14} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/auth?mode=register"
                    className={`${styles.pricingCta} ${plan.popular ? styles.pricingCtaPrimary : ''}`}
                  >
                    {plan.price === 0 ? 'Ücretsiz başla' : plan.price === -1 ? 'İletişime geçin' : 'Plan seç'}
                  </Link>
                </motion.article>
              );
            })()
          ))}
        </div>
        <div className={styles.pricingNote}>
          <span>Kredi kullanımı belge sayfasına göre hesaplanır.</span>
          <strong>Planlar ürün içinden yükseltilebilir.</strong>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <div className={styles.footerLogo}>TL</div>
            <span>TransLingua</span>
          </div>
          <p>© {new Date().getFullYear()} TransLingua. Tüm hakları saklıdır.</p>
        </div>
      </footer>
    </div>
  );
}
