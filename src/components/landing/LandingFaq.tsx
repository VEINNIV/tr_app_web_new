/**
 * LandingFaq — anasayfa Sıkça Sorulan Sorular bölümü.
 *
 * İçerik tamamen GERÇEK ve sitede görünür (kontrollü akordiyon; cevap DOM'da,
 * yalnızca yüksekliği animasyonlu). Bu yüzden FAQPage JSON-LD eklemek meşrudur
 * (görünmeyen içerik için schema = ban riski; burada yok). Soru/cevaplar mevcut
 * gerçek bilgilerden türetildi (fiyat, diller, limit, güvenlik, iade).
 */
import { useEffect, useState } from 'react';
import SectionHeader from './SectionHeader';
import styles from '../../styles/components/landing.module.css';

interface QA { q: string; a: string }

const FAQ: QA[] = [
  {
    q: 'TransWordly tam olarak ne yapıyor?',
    a: 'Akademik PDF, Word ve sunum dosyalarınızı yapay zekâ ile 12 dilden Türkçeye çevirir. Başlık, tablo, formül ve şekil düzenini korur; ayrıca ders notu çıkarma ve belgelerinize AI ile soru-cevap özellikleri sunar.',
  },
  {
    q: 'Hangi dilleri destekliyor?',
    a: 'İngilizce, Almanca, Fransızca, İspanyolca, Arapça, Çince, Japonca, Korece, Rusça, Portekizce, İtalyanca ve Felemenkçe dâhil 12 dilden Türkçeye çeviri yapar. Kaynak dil otomatik tanınır.',
  },
  {
    q: 'Ücretsiz kullanabilir miyim?',
    a: 'Evet. Ücretsiz planda 10 kredi ile başlarsınız. Daha fazlası için Öğrenci ve Profesyonel planları vardır; güncel fiyatları Fiyatlandırma bölümünde görebilirsiniz. İşlemler krediyle yapılır; kalan krediyi her zaman görebilirsiniz.',
  },
  {
    q: 'Yükleyebileceğim dosya boyutu sınırı nedir?',
    a: 'Ücretsiz planda 10 MB, Öğrenci planında 50 MB, Profesyonel planında 100 MB dosya yükleyebilirsiniz. Tek seferde 150 sayfaya kadar belge çevrilebilir.',
  },
  {
    q: 'Çeviride akademik format korunuyor mu?',
    a: 'Evet. Başlık hiyerarşisi, tablolar, matematiksel formüller (LaTeX), dipnotlar ve şekil başlıkları korunur. Çıktınızı PDF, Word veya düz metin olarak indirebilirsiniz.',
  },
  {
    q: 'Verilerim ve belgelerim güvende mi?',
    a: 'Belgeleriniz özel (private) depolamada tutulur ve yalnızca sizin erişiminize açıktır. İşleme KVKK’ya uygun yürütülür; hesabınızı sildiğinizde yüklediğiniz belgeler kaldırılır. Ayrıntılar Gizlilik Politikası sayfasındadır.',
  },
  {
    q: 'İade alabilir miyim?',
    a: 'Hiç kredisi kullanılmamış paketler için satın alımdan itibaren 14 gün içinde tam iade alabilirsiniz. Anında ifa edilen dijital hizmet olduğundan, kullanılmaya başlanan kredilerde cayma hakkı kullanılamaz. Ayrıntılar İptal, Cayma & İade sayfasındadır.',
  },
  {
    q: 'Nasıl başlarım?',
    a: 'Ücretsiz kayıt olun, belgenizi yükleyin ve "Çevir" deyin. Birkaç dakika içinde Türkçe çevirinizi indirebilirsiniz.',
  },
];

export default function LandingFaq() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  useEffect(() => {
    const node = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map(item => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-seo-jsonld', 'faq');
    script.textContent = JSON.stringify(node);
    document.head.appendChild(script);
    return () => { script.remove(); };
  }, []);

  return (
    <section className={styles.faqSection}>
      <SectionHeader label="07 · SSS" title="Aklınızdaki sorular" />

      <div className={styles.faqList}>
        {FAQ.map((item, i) => {
          const open = openIdx === i;
          return (
            <div key={i} className={`${styles.faqItem} ${open ? styles.faqItemOpen : ''}`}>
              <button
                type="button"
                className={styles.faqSummary}
                aria-expanded={open}
                onClick={() => setOpenIdx(open ? null : i)}
              >
                {item.q}
              </button>
              <div className={styles.faqAnswerWrap} aria-hidden={!open}>
                <div className={styles.faqAnswerInner}>
                  <div className={styles.faqAnswer}>{item.a}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
