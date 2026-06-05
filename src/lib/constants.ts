import type { PricingPlan, SupportedLanguage } from '../types';

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en', name: 'English',    nativeName: 'English',    flag: '🇬🇧' },
  { code: 'ar', name: 'Arabic',     nativeName: 'العربية',    flag: '🇸🇦' },
  { code: 'de', name: 'German',     nativeName: 'Deutsch',    flag: '🇩🇪' },
  { code: 'fr', name: 'French',     nativeName: 'Français',   flag: '🇫🇷' },
  { code: 'es', name: 'Spanish',    nativeName: 'Español',    flag: '🇪🇸' },
  { code: 'ru', name: 'Russian',    nativeName: 'Русский',    flag: '🇷🇺' },
  { code: 'zh', name: 'Chinese',    nativeName: '中文',        flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese',   nativeName: '日本語',      flag: '🇯🇵' },
  { code: 'ko', name: 'Korean',     nativeName: '한국어',      flag: '🇰🇷' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português',  flag: '🇧🇷' },
  { code: 'it', name: 'Italian',    nativeName: 'Italiano',   flag: '🇮🇹' },
  { code: 'nl', name: 'Dutch',      nativeName: 'Nederlands', flag: '🇳🇱' },
];

export const TARGET_LANGUAGE: SupportedLanguage = {
  code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷'
};

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'free', name: 'Ücretsiz', price: 0, priceLabel: 'Ücretsiz', credits: 10,
    features: [
      'Otomatik dil tespiti',
      '10 MB dosya limiti',
      'PDF · Word · TXT export',
      'AI Soru-Cevap',
    ],
  },
  {
    id: 'starter', name: 'Öğrenci', price: 49, priceLabel: '₺49/ay', credits: 110,
    features: [
      'Otomatik dil tespiti',
      '50 MB dosya limiti',
      'PDF · Word · TXT export',
      'Sınırsız AI Soru-Cevap',
      'Ders notu çıkarma',
      'E-posta destek',
    ],
  },
  {
    id: 'pro', name: 'Profesyonel', price: 149, priceLabel: '₺149/ay', credits: 600, popular: true,
    features: [
      'Otomatik dil tespiti',
      '100 MB dosya limiti',
      'PDF · Word · TXT export',
      'Sınırsız AI Soru-Cevap',
      'Ders notu çıkarma',
      'Öncelikli çeviri kuyruğu',
      'Öncelikli destek',
    ],
  },
  {
    id: 'enterprise', name: 'Kurumsal', price: -1, priceLabel: 'İletişime Geçin', credits: -1,
    features: [
      'Sınırsız çeviri',
      'Tüm diller + özel dil desteği',
      'Sınırsız dosya boyutu',
      'API erişimi',
      'Toplu işlem (batch)',
      'Beyaz etiket seçeneği',
      'SLA garantisi',
      'Özel hesap yöneticisi',
    ],
  },
];

export const MAX_FILE_SIZE: Record<string, number> = {
  free: 10 * 1024 * 1024, starter: 50 * 1024 * 1024,
  pro: 100 * 1024 * 1024, enterprise: 500 * 1024 * 1024,
};

export const STATUS_LABELS: Record<string, string> = {
  pending: 'Beklemede', extracting: 'Metin çıkarılıyor', translating: 'Çevriliyor',
  generating: 'PDF oluşturuluyor', completed: 'Tamamlandı', error: 'Hata',
  uploaded: 'Yüklendi', processing: 'İşleniyor',
  draft: 'Taslak',
};

// NOT: Bunlar yalnızca DB (app_config → credit_cost.*) okunamadığında kullanılan
// fail-safe fallback'lerdir. Gerçek/canlı değerler her zaman app_config'ten gelir
// ve admin panelinden yönetilir. Değerler "son bilinen canlı" ile senkron tutulur.
export const CREDIT_COSTS = {
  TRANSLATION_PER_PAGE: 3.5,
  CHAT_PER_QUESTION: 3,
  STUDY_NOTES_PER_SOURCE: 8,
  GLOSSARY_SUGGEST: 3,
  FLASHCARDS: 2,
};

/**
 * Kredi sayısından kabaca kaç PDF (sayfa) çevrilebileceğini hesaplar.
 * Tek kaynak: sayfa başı kredi maliyeti (app_config → credit_cost.translation_per_page).
 * Anasayfa, checkout vb. "≈X PDF" gösterimleri buradan türetilir; sabit kodlanmaz.
 */
export const pdfPerCredits = (credits: number, perPage: number): number =>
  perPage > 0 ? Math.max(1, Math.round(credits / perPage)) : credits;

/** Sayı biçimlemesi: 1 → "1", 0.5 → "0,5" (TR). Kredi maliyetlerini göstermek için. */
export const fmtCredit = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

export const APP_NAME = 'TransWordly';
export const APP_TAGLINE = 'Gelişmiş AI ile Belge Çevirisi';
export const APP_DESCRIPTION = 'Belgelerinizi yapay zeka ile saniyeler içinde Türkçe\'ye çevirin.';

export const STUDY_SUBJECTS = [
  'Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya',
  'Edebiyat', 'Felsefe', 'İngilizce', 'Hukuk', 'Tıp', 'Mühendislik',
  'Ekonomi', 'İşletme', 'Psikoloji', 'Sosyoloji', 'Diğer',
];
