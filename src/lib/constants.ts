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
      '10 kredi/ay (≈2 PDF çeviri)',
      'Otomatik dil tespiti',
      '10 MB dosya limiti',
      'PDF · Word · TXT export',
      'AI Soru-Cevap',
    ],
  },
  {
    id: 'starter', name: 'Öğrenci', price: 49, priceLabel: '₺49/ay', credits: 120,
    features: [
      '120 kredi/ay (≈24 PDF çeviri)',
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
      '600 kredi/ay (≈120 PDF çeviri)',
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

export const CREDIT_COSTS = {
  TRANSLATION_PER_PAGE: 1,
  CHAT_PER_QUESTION: 0.5,
  STUDY_NOTES_PER_SOURCE: 0.5,
  GLOSSARY_SUGGEST: 0.5,
};

export const APP_NAME = 'TransWordly';
export const APP_TAGLINE = 'Gelişmiş AI ile Belge Çevirisi';
export const APP_DESCRIPTION = 'Belgelerinizi yapay zeka ile saniyeler içinde Türkçe\'ye çevirin.';

export const STUDY_SUBJECTS = [
  'Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya',
  'Edebiyat', 'Felsefe', 'İngilizce', 'Hukuk', 'Tıp', 'Mühendislik',
  'Ekonomi', 'İşletme', 'Psikoloji', 'Sosyoloji', 'Diğer',
];
