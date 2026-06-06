/**
 * TransWordly — Yasal belge içerikleri (tek kaynak)
 *
 * PayTR uyumu + yayın sonrası zorunlu sözleşmeler. Tüm metinler buradan beslenir;
 * `LegalLayout` render eder, `/legal` hub'ı `LEGAL_DOCS`'u listeler.
 *
 * ⚠️ Vergi dairesi / Vergi no / MERSIS henüz verilmedi → "[doldurulacak]" satırları
 *    bilerek bırakıldı; bilgi gelince burada güncellenir.
 */
import type { ReactNode } from 'react';
import {
  FileText, UserCheck, ShoppingBag, Truck, RotateCcw, ShieldCheck, Cookie,
} from 'lucide-react';

/** Şirket / satıcı künyesi — sözleşmeler ve iletişim alanları bunu paylaşır. */
export const COMPANY = {
  brand: 'TransWordly',
  /** Sözleşmelerde "Satıcı / Hizmet Sağlayıcı / Veri Sorumlusu" olarak görünür. */
  seller: 'Cadeft (Cadeft Digital Agency)',
  sellerShort: 'Cadeft',
  address: 'Saimekadın Mah. Görgülü Cad. No:45, Mamak / Ankara',
  phone: '0544 327 4396',
  phoneHref: '+905443274396',
  email: 'cadeftdev@gmail.com',
  website: 'https://cadeft.com',
  /** Bilgi gelince doldurulacak resmi tescil alanları. */
  taxOffice: '[doldurulacak]',
  taxNo: '[doldurulacak]',
  mersis: '[doldurulacak]',
} as const;

export const LEGAL_UPDATED = '6 Haziran 2026';

// ── İçerik blok modeli ────────────────────────────────────────────────────────
export type Block =
  | { t: 'p'; text: ReactNode }
  | { t: 'list'; items: ReactNode[] }
  | { t: 'sub'; text: string };

export interface LegalSection {
  heading: string;
  blocks: Block[];
}

export interface LegalDoc {
  slug: string;
  title: string;
  summary: string;
  icon: ReactNode;
  updated: string;
  sections: LegalSection[];
}

// Kısa yollar
const p = (text: ReactNode): Block => ({ t: 'p', text });
const list = (items: ReactNode[]): Block => ({ t: 'list', items });
const sub = (text: string): Block => ({ t: 'sub', text });

const IDENTITY_BLOCK: Block = list([
  <>Unvan: <strong>{COMPANY.seller}</strong></>,
  <>Adres: {COMPANY.address}</>,
  <>Telefon: {COMPANY.phone}</>,
  <>E-posta: {COMPANY.email}</>,
  <>Web: cadeft.com · {COMPANY.brand} ({'transwordly'})</>,
]);

// ── Belgeler ──────────────────────────────────────────────────────────────────

const kullanimSartlari: LegalDoc = {
  slug: 'kullanim-sartlari',
  title: 'Kullanım Şartları',
  summary: 'Platformu kullanırken uymanız gereken kurallar ve hizmetin sınırları.',
  icon: <FileText size={20} />,
  updated: LEGAL_UPDATED,
  sections: [
    {
      heading: '1. Taraflar ve Kapsam',
      blocks: [
        p(`Bu Kullanım Şartları, ${COMPANY.brand} platformunu ("Platform") işleten ${COMPANY.seller} ("Şirket", "biz") ile Platform'u kullanan gerçek veya tüzel kişi ("Kullanıcı", "siz") arasındaki ilişkiyi düzenler. Platform'a kayıt olarak veya kullanarak bu şartları kabul etmiş sayılırsınız.`),
        IDENTITY_BLOCK,
      ],
    },
    {
      heading: '2. Hizmetin Tanımı',
      blocks: [
        p(`${COMPANY.brand}, akademik metin ve belgelerin yapay zekâ destekli çevirisi, özetlenmesi, ders notu/flashcard üretimi ve ilgili çalışma araçlarını sunan bir çevrim içi yazılım hizmetidir. Hizmetler kredi tabanlıdır; bazı işlemler kredi harcar.`),
        p('Yapay zekâ çıktıları otomatik üretilir ve hata içerebilir. Çıktıların doğruluğu, akademik/hukuki/tıbbi yeterliliği garanti edilmez; nihai sorumluluk Kullanıcıya aittir.'),
      ],
    },
    {
      heading: '3. Hesap ve Güvenlik',
      blocks: [
        list([
          'Kayıt sırasında doğru ve güncel bilgi vermekle yükümlüsünüz.',
          'Hesap güvenliğinden (şifre dâhil) ve hesabınızdan yapılan tüm işlemlerden siz sorumlusunuz.',
          '13 yaşından küçükler Platform’u kullanamaz; 18 yaş altı kullanıcılar veli/vasi onayı ile kullanmalıdır.',
          'Bir kişi yalnızca makul sayıda hesap açabilir; sahte/çoklu hesap ile ücretsiz kredi suistimali yasaktır.',
        ]),
      ],
    },
    {
      heading: '4. Kabul Edilebilir Kullanım',
      blocks: [
        p('Aşağıdaki davranışlar yasaktır ve hesabınızın askıya alınması veya kalıcı olarak kapatılması ile sonuçlanabilir:'),
        list([
          'Yasa dışı, telif hakkını ihlal eden, nefret söylemi içeren veya zararlı içerik üretmek/çevirmek,',
          'Platform’u tersine mühendislik, otomasyon (bot), kazıma (scraping) veya aşırı yüklenme amacıyla kullanmak,',
          'Kredi/ödeme sistemini, oran sınırlarını veya güvenlik mekanizmalarını atlatmaya çalışmak,',
          'Başkasının kişisel verilerini izinsiz işlemek veya üçüncü kişilerin haklarını ihlal etmek.',
        ]),
      ],
    },
    {
      heading: '5. Fikri Mülkiyet',
      blocks: [
        p(`Platform’un yazılımı, tasarımı, markaları ve içeriği ${COMPANY.seller}’e aittir. Kullanıcı, kendi yüklediği belgelerin ve ürettiği çıktıların kullanım hakkını korur; bunları yalnızca hizmetin sunulması amacıyla işlememize izin verir.`),
      ],
    },
    {
      heading: '6. Hizmet Değişiklikleri ve Askıya Alma',
      blocks: [
        p('Hizmeti geliştirmek, değiştirmek veya kısmen/tamamen durdurmak hakkımızı saklı tutarız. Bu şartların ihlali hâlinde hesabınızı önceden bildirimde bulunmaksızın askıya alabilir veya kapatabiliriz.'),
      ],
    },
    {
      heading: '7. Sorumluluğun Sınırlandırılması',
      blocks: [
        p('Hizmet "olduğu gibi" sunulur. Yürürlükteki hukukun izin verdiği ölçüde, dolaylı zararlardan ve yapay zekâ çıktılarının kullanımından doğan sonuçlardan sorumlu değiliz. Toplam sorumluluğumuz, ilgili işlem için ödediğiniz tutarla sınırlıdır.'),
      ],
    },
    {
      heading: '8. Uygulanacak Hukuk ve Yürürlük',
      blocks: [
        p('Bu şartlara Türkiye Cumhuriyeti hukuku uygulanır. Uyuşmazlıklarda Ankara Mahkemeleri ve İcra Daireleri yetkilidir. Şartlar güncellenebilir; güncel sürüm bu sayfada yayımlandığı anda yürürlüğe girer.'),
        p(<>Sorularınız için: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></>),
      ],
    },
  ],
};

const uyelikSozlesmesi: LegalDoc = {
  slug: 'uyelik-sozlesmesi',
  title: 'Üyelik Sözleşmesi',
  summary: 'Üyelik oluşturma, üyelik hakları, yükümlülükler ve üyeliğin sona ermesi.',
  icon: <UserCheck size={20} />,
  updated: LEGAL_UPDATED,
  sections: [
    {
      heading: '1. Sözleşmenin Konusu',
      blocks: [
        p(`İşbu Üyelik Sözleşmesi, ${COMPANY.brand} platformuna üye olan Kullanıcı ile ${COMPANY.seller} arasında, üyeliğin koşullarını ve tarafların karşılıklı hak ve yükümlülüklerini düzenler.`),
      ],
    },
    {
      heading: '2. Üyeliğin Oluşması',
      blocks: [
        p('Üyelik, kayıt formunun doldurulması veya Google ile giriş yapılması ve bu sözleşme ile Kullanım Şartları’nın elektronik ortamda onaylanmasıyla kurulur. Üyelik kişiye özeldir ve devredilemez.'),
      ],
    },
    {
      heading: '3. Üyenin Hak ve Yükümlülükleri',
      blocks: [
        list([
          'Üye, sağladığı bilgilerin doğru ve güncel olduğunu kabul eder.',
          'Üye, hesabını ve giriş bilgilerini gizli tutmakla yükümlüdür.',
          'Üye, kredi bakiyesini hizmet karşılığında kullanır; krediler nakde çevrilemez ve devredilemez.',
          'Üye, Platform’u hukuka ve Kullanım Şartları’na uygun kullanmayı taahhüt eder.',
        ]),
      ],
    },
    {
      heading: '4. Şirketin Hak ve Yükümlülükleri',
      blocks: [
        list([
          'Şirket, hizmeti kesintisiz sunmak için makul çabayı gösterir; ancak bakım, güncelleme veya zorunlu nedenlerle geçici kesintiler olabilir.',
          'Şirket, kişisel verileri Gizlilik Politikası ve KVKK Aydınlatma Metni’ne uygun işler.',
          'Şirket, sözleşmeye aykırılık hâlinde üyeliği askıya alma veya sonlandırma hakkını saklı tutar.',
        ]),
      ],
    },
    {
      heading: '5. Üyeliğin Sona Ermesi',
      blocks: [
        p(<>Üye, dilediği zaman hesabını silmeyi talep ederek üyeliğini sonlandırabilir (Ayarlar üzerinden veya <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> ile). Sözleşmeye veya yasalara aykırılık hâlinde Şirket üyeliği tek taraflı sonlandırabilir.</>),
        p('Üyeliği yöneticilerce kapatılan (silinen) kullanıcılar, aynı e-posta/bilgilerle yeniden kayıt olamayabilir. Kapatma gerekçesi, varsa, Kullanıcıya iletilir.'),
      ],
    },
    {
      heading: '6. Yürürlük',
      blocks: [
        p('Bu sözleşme, üyeliğin oluştuğu anda yürürlüğe girer ve üyelik devam ettiği sürece geçerlidir. Uyuşmazlıklarda Ankara Mahkemeleri ve İcra Daireleri yetkilidir.'),
      ],
    },
  ],
};

const mesafeliSatis: LegalDoc = {
  slug: 'mesafeli-satis',
  title: 'Mesafeli Satış Sözleşmesi',
  summary: 'Kredi/abonelik satın alımlarına ilişkin mesafeli satış koşulları (6502 sayılı Kanun).',
  icon: <ShoppingBag size={20} />,
  updated: LEGAL_UPDATED,
  sections: [
    {
      heading: '1. Taraflar',
      blocks: [
        sub('SATICI'),
        IDENTITY_BLOCK,
        sub('ALICI'),
        p('Platform üzerinden ödeme yaparak hizmet satın alan ve ödeme adımında bilgileri kayıt altına alınan üye.'),
      ],
    },
    {
      heading: '2. Sözleşmenin Konusu',
      blocks: [
        p(`İşbu sözleşmenin konusu, ALICI’nın ${COMPANY.brand} üzerinden elektronik ortamda sipariş verdiği, aşağıda nitelikleri ve satış fiyatı belirtilen dijital hizmetin (kredi paketi / abonelik) satışı ve ifasıdır. 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği hükümleri uygulanır.`),
      ],
    },
    {
      heading: '3. Hizmetin Nitelikleri ve Fiyat',
      blocks: [
        list([
          'Ürün türü: Dijital içerik / yazılım hizmeti (kredi paketi veya aylık abonelik).',
          'Temel özellik: AI çeviri, özet, ders notu ve çalışma araçlarında kullanılabilen kredi.',
          'Satış fiyatı (KDV dâhil) ödeme sayfasında ve sipariş özetinde gösterilir; tüm vergiler dâhildir.',
          'Ödeme yöntemi: Kredi/banka kartı — ödeme altyapısı PayTR aracılığıyla 3D Secure ile yürütülür.',
        ]),
        p('SATICI, kart bilgilerini görmez ve saklamaz; ödeme verileri yetkili ödeme kuruluşu tarafından işlenir.'),
      ],
    },
    {
      heading: '4. İfa / Teslimat',
      blocks: [
        p('Hizmet dijitaldir ve ödemenin onaylanmasının ardından krediler ALICI’nın hesabına anında (genellikle birkaç saniye–dakika içinde) tanımlanır. Fiziksel teslimat yoktur; teslimat masrafı bulunmaz.'),
        p(<>Ayrıntı için <a href="/legal/teslimat">Teslimat &amp; İfa Koşulları</a> sayfasına bakınız.</>),
      ],
    },
    {
      heading: '5. Cayma Hakkı ve İade',
      blocks: [
        p('Mesafeli Sözleşmeler Yönetmeliği m.15/1-(ğ) uyarınca, elektronik ortamda anında ifa edilen ve gayri maddi mallara ilişkin hizmetlerde, ifaya/kullanıma başlandıktan sonra cayma hakkı kullanılamaz. ALICI, satın alımdan hemen sonra hizmetin ifasına başlanmasını ve bu nedenle cayma hakkının ortadan kalkacağını kabul eder.'),
        p(<>Henüz hiç kredisi kullanılmamış paketler için koşullar ve iade prosedürü <a href="/legal/iptal-iade">İptal, Cayma &amp; İade</a> sayfasında düzenlenmiştir.</>),
      ],
    },
    {
      heading: '6. Genel Hükümler',
      blocks: [
        list([
          'ALICI, sözleşme konusu hizmetin temel niteliklerini, fiyatını ve ödeme şeklini okuyup bilgi sahibi olduğunu ve elektronik ortamda onay verdiğini kabul eder.',
          'ALICI’nın verdiği bilgiler doğru kabul edilir; yanlış/eksik bilgiden doğan zararlardan ALICI sorumludur.',
          'Mücbir sebep hâllerinde SATICI yükümlülüklerini yerine getiremezse ALICI’yı bilgilendirir.',
        ]),
      ],
    },
    {
      heading: '7. Uyuşmazlık ve Yetkili Merci',
      blocks: [
        p('ALICI, şikâyet ve itirazlarını Ticaret Bakanlığı’nca her yıl belirlenen parasal sınırlar dâhilinde, mal/hizmeti satın aldığı veya ikametgâhının bulunduğu yerdeki Tüketici Hakem Heyetine veya Tüketici Mahkemesine yapabilir. İşbu sözleşme Türkiye Cumhuriyeti hukukuna tabidir.'),
      ],
    },
  ],
};

const teslimat: LegalDoc = {
  slug: 'teslimat',
  title: 'Teslimat & İfa Koşulları',
  summary: 'Dijital ürün nasıl ve ne zaman teslim edilir; teslimat masrafı var mı?',
  icon: <Truck size={20} />,
  updated: LEGAL_UPDATED,
  sections: [
    {
      heading: '1. Ürünün Niteliği',
      blocks: [
        p(`${COMPANY.brand} üzerinden satın alınan tüm ürünler dijitaldir (kredi paketleri / abonelikler). Fiziksel bir ürün gönderimi yapılmaz; kargo veya teslimat masrafı bulunmaz.`),
      ],
    },
    {
      heading: '2. İfa / Teslim Süresi',
      blocks: [
        p('Ödeme, PayTR 3D Secure altyapısında onaylandığı anda krediler otomatik olarak hesabınıza tanımlanır. Bu süreç normal şartlarda birkaç saniye ile birkaç dakika arasındadır.'),
        list([
          'Krediler doğrudan üyelik hesabınıza yüklenir; ayrı bir teslim adresi gerekmez.',
          'Aboneliklerde, ilgili dönemin kredisi her yenilemede otomatik tanımlanır.',
          'Ödeme onaylandığı hâlde kredi 15 dakika içinde yansımazsa destek ile iletişime geçin.',
        ]),
      ],
    },
    {
      heading: '3. Gecikme ve Sorun Çözümü',
      blocks: [
        p(<>Banka/ödeme kuruluşu kaynaklı doğrulama gecikmeleri olabilir. Krediniz yansımadıysa, ödeme onayınızla birlikte <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresine veya {COMPANY.phone} numarasına ulaşın; işlem en kısa sürede manuel olarak tamamlanır.</>),
      ],
    },
  ],
};

const iptalIade: LegalDoc = {
  slug: 'iptal-iade',
  title: 'İptal, Cayma & İade Prosedürü',
  summary: 'Hangi durumda iade alabilirsiniz, nasıl talep edilir, ne kadar sürede ödenir?',
  icon: <RotateCcw size={20} />,
  updated: LEGAL_UPDATED,
  sections: [
    {
      heading: '1. Genel İlke (Dijital Ürün)',
      blocks: [
        p('Sattığımız krediler/abonelikler, anında ifa edilen dijital içeriktir. Mesafeli Sözleşmeler Yönetmeliği m.15/1-(ğ) uyarınca, kredinin kullanımına (herhangi bir AI işleminin başlatılmasına) başlandıktan sonra cayma hakkı kullanılamaz.'),
      ],
    },
    {
      heading: '2. İade Edilebilir Durumlar',
      blocks: [
        p('Aşağıdaki hâllerde iade talebiniz değerlendirmeye alınır:'),
        list([
          <>Satın aldığınız paketteki <strong>hiçbir kredi henüz kullanılmamışsa</strong>: satın alımdan itibaren 14 gün içinde tam iade.</>,
          'Çift çekim, hatalı tutar veya teknik nedenle hizmetin hiç sunulamaması gibi bizden kaynaklanan durumlarda tam iade.',
          'Aboneliğin yenilenmemesini, dönem bitiminden önce talep edebilirsiniz; bir sonraki dönem ücretlendirilmez (kullanılan dönem iade edilmez).',
        ]),
      ],
    },
    {
      heading: '3. İade Edilemeyen Durumlar',
      blocks: [
        list([
          'Kısmen veya tamamen kullanılmış kredi paketleri,',
          'Kullanıcı kaynaklı hatalı sonuç beklentisi (AI çıktısının beğenilmemesi tek başına iade nedeni değildir),',
          'Kullanım Şartları ihlali nedeniyle kapatılan hesaplardaki bakiyeler.',
        ]),
      ],
    },
    {
      heading: '4. İade Talebi Nasıl Yapılır?',
      blocks: [
        p(<>İade talebinizi, sipariş/ödeme bilgilerinizle birlikte <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresine iletin veya {COMPANY.phone} numarasından ulaşın. Talebiniz en geç 3 iş günü içinde değerlendirilir.</>),
      ],
    },
    {
      heading: '5. İade Süresi ve Yöntemi',
      blocks: [
        p('Onaylanan iadeler, ödemenin yapıldığı karta/yönteme iade edilir. İade tutarı, onaydan itibaren yasal süre olan 14 gün içinde ve genellikle daha kısa sürede bankanıza aktarılır; kartınıza yansıma süresi bankanıza bağlıdır.'),
      ],
    },
  ],
};

const gizlilikKvkk: LegalDoc = {
  slug: 'gizlilik-kvkk',
  title: 'Gizlilik Politikası & KVKK Aydınlatma Metni',
  summary: 'Hangi verileri, neden ve nasıl işliyoruz; KVKK kapsamındaki haklarınız.',
  icon: <ShieldCheck size={20} />,
  updated: LEGAL_UPDATED,
  sections: [
    {
      heading: '1. Veri Sorumlusu',
      blocks: [
        p('6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca veri sorumlusu:'),
        IDENTITY_BLOCK,
      ],
    },
    {
      heading: '2. İşlenen Kişisel Veriler',
      blocks: [
        list([
          <><strong>Kimlik & iletişim:</strong> ad-soyad, e-posta, (ödeme sırasında) telefon.</>,
          <><strong>Hesap & kullanım:</strong> üyelik bilgileri, kredi bakiyesi, işlem geçmişi, tercih ayarları.</>,
          <><strong>İçerik:</strong> çeviri/çalışma için yüklediğiniz belgeler ve ürettiğiniz çıktılar.</>,
          <><strong>Ödeme:</strong> ödeme PayTR tarafından işlenir; kart verisi tarafımızca görülmez/saklanmaz, yalnızca işlem sonucu/sipariş bilgisi tutulur.</>,
          <><strong>Teknik:</strong> IP, oturum/çerez verileri, cihaz/tarayıcı bilgisi (güvenlik ve hizmetin çalışması için).</>,
        ]),
      ],
    },
    {
      heading: '3. İşleme Amaçları ve Hukuki Sebepler',
      blocks: [
        list([
          'Hizmetin sunulması ve sözleşmenin ifası (KVKK m.5/2-c),',
          'Üyelik, faturalandırma ve yasal yükümlülüklerin yerine getirilmesi (m.5/2-ç),',
          'Güvenlik, dolandırıcılık/suistimal önleme ve meşru menfaat (m.5/2-f),',
          'Açık rızanıza dayalı isteğe bağlı işlemler (örn. pazarlama, isteğe bağlı çerezler) (m.5/1).',
        ]),
      ],
    },
    {
      heading: '4. Aktarım ve Yurt Dışı',
      blocks: [
        p('Verileriniz; barındırma (Supabase), ödeme (PayTR) ve yapay zekâ işleme (Google Gemini) gibi hizmet sağlayıcılarla, yalnızca hizmetin sunulması için ve ilgili mevzuata uygun şekilde paylaşılabilir. Yapay zekâ ile çeviri/işleme sırasında içerik, sağlayıcının sunucularında (yurt dışı dâhil) işlenebilir. Veriler hukuken zorunlu hâller dışında üçüncü kişilere satılmaz.'),
      ],
    },
    {
      heading: '5. Saklama Süresi',
      blocks: [
        p('Kişisel veriler, ilgili amaç için gerekli süre ve yasal saklama süreleri boyunca tutulur; sürenin sonunda silinir, yok edilir veya anonim hâle getirilir. Yüklediğiniz belgeler hesabınızı sildiğinizde kaldırılır.'),
      ],
    },
    {
      heading: '6. KVKK Kapsamındaki Haklarınız (m.11)',
      blocks: [
        list([
          'Kişisel verinizin işlenip işlenmediğini öğrenme ve bilgi talep etme,',
          'İşleme amacını ve verilerin aktarıldığı kişileri öğrenme,',
          'Eksik/yanlış işlenmişse düzeltilmesini, şartlar oluşmuşsa silinmesini isteme,',
          'İşlemenin sınırlanmasına/itiraza, otomatik analizden doğan sonuca itiraz etme,',
          'Hukuka aykırı işleme nedeniyle zararın giderilmesini talep etme.',
        ]),
        p(<>Haklarınızı kullanmak için <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresine başvurabilirsiniz. Başvurular en geç 30 gün içinde sonuçlandırılır.</>),
      ],
    },
    {
      heading: '7. Çerezler',
      blocks: [
        p(<>Çerez kullanımı hakkında ayrıntı için <a href="/legal/cerez-politikasi">Çerez Politikası</a>’na bakınız.</>),
      ],
    },
  ],
};

const cerezPolitikasi: LegalDoc = {
  slug: 'cerez-politikasi',
  title: 'Çerez Politikası',
  summary: 'Hangi çerezleri neden kullanıyoruz ve tercihlerinizi nasıl yönetebilirsiniz?',
  icon: <Cookie size={20} />,
  updated: LEGAL_UPDATED,
  sections: [
    {
      heading: '1. Çerez Nedir?',
      blocks: [
        p('Çerezler, web sitelerini ziyaret ettiğinizde tarayıcınıza kaydedilen küçük metin dosyalarıdır. Oturumunuzu sürdürmek, tercihlerinizi hatırlamak ve hizmeti güvenli biçimde sunmak için kullanılır.'),
      ],
    },
    {
      heading: '2. Kullandığımız Çerez Türleri',
      blocks: [
        list([
          <><strong>Zorunlu çerezler:</strong> Oturum açma, kimlik doğrulama ve güvenlik için gereklidir. Bunlar olmadan Platform çalışmaz; kapatılamaz.</>,
          <><strong>Tercih çerezleri:</strong> Tema (açık/koyu) ve dil gibi seçimlerinizi hatırlar.</>,
          <><strong>İsteğe bağlı / analitik çerezler:</strong> Hizmeti iyileştirmek için kullanım istatistiği toplayabilir. Yalnızca onayınızla etkinleşir.</>,
        ]),
      ],
    },
    {
      heading: '3. Tercihlerinizi Yönetme',
      blocks: [
        p('Siteye ilk girişte gösterilen çerez bildirimi üzerinden isteğe bağlı çerezleri kabul edebilir veya reddedebilirsiniz. Seçiminizi dilediğiniz zaman tarayıcı ayarlarınızdan çerezleri silerek yeniden yapabilirsiniz. Zorunlu çerezler, hizmetin çalışması için her hâlükârda kullanılır.'),
      ],
    },
    {
      heading: '4. İletişim',
      blocks: [
        p(<>Çerezlerle ilgili sorularınız için: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></>),
      ],
    },
  ],
};

/** Hub'da ve rota çözümünde kullanılan sıralı belge listesi. */
export const LEGAL_DOCS: LegalDoc[] = [
  kullanimSartlari,
  uyelikSozlesmesi,
  mesafeliSatis,
  teslimat,
  iptalIade,
  gizlilikKvkk,
  cerezPolitikasi,
];

export function getLegalDoc(slug: string | undefined): LegalDoc | undefined {
  return LEGAL_DOCS.find(d => d.slug === slug);
}
