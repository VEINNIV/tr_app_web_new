/**
 * LandingFaq — anasayfa Sıkça Sorulan Sorular bölümü.
 *
 * İçerik tamamen GERÇEK ve sitede görünür (native <details> ile). Bu yüzden FAQPage
 * JSON-LD eklemek meşrudur (görünmeyen içerik için schema = ban riski; burada yok).
 * Soru/cevaplar mevcut gerçek bilgilerden türetildi (fiyat, diller, limit, güvenlik, iade).
 */
import { useEffect } from 'react';
import { HelpCircle, ChevronDown } from 'lucide-react';

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
    a: 'Evet. Ücretsiz planda 10 kredi ile başlarsınız. Daha fazlası için Öğrenci (₺49/ay) ve Profesyonel (₺149/ay) planları vardır. İşlemler krediyle yapılır; kalan krediyi her zaman görebilirsiniz.',
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

const wrap: React.CSSProperties = {
  maxWidth: 820, margin: '0 auto', padding: '0 22px',
};

export default function LandingFaq() {
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
    <section style={{ padding: 'clamp(56px, 9vw, 96px) 0' }}>
      <div style={{ textAlign: 'center', marginBottom: 'clamp(28px, 5vw, 44px)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 13px', borderRadius: 999, fontSize: '0.74rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-accent)', background: 'var(--color-accent-light)', border: '1px solid var(--color-accent-medium)' }}>
          <HelpCircle size={13} /> Sıkça Sorulan Sorular
        </span>
        <h2 style={{ fontSize: 'clamp(1.7rem, 4.5vw, 2.5rem)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.08, margin: '15px 0 0', color: 'var(--color-text-primary)' }}>
          Aklınızdaki sorular
        </h2>
      </div>

      <div style={{ ...wrap, display: 'grid', gap: 12 }}>
        {FAQ.map((item, i) => (
          <details
            key={i}
            style={{ borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}
          >
            <summary
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '18px 20px', cursor: 'pointer', listStyle: 'none', fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}
            >
              {item.q}
              <ChevronDown size={18} style={{ flexShrink: 0, color: 'var(--color-text-tertiary)' }} />
            </summary>
            <div style={{ padding: '0 20px 18px', fontSize: '0.92rem', lineHeight: 1.65, color: 'var(--color-text-secondary)' }}>
              {item.a}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
