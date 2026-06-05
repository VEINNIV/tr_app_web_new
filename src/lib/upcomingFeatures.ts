/**
 * TransWordly — Özellik kayıt defteri (tek kaynak).
 *
 * Uygulamadaki tüm "sistemler" burada listelenir. Araçlar merkezi (/tools),
 * yapım-aşamasında sayfaları ve dashboard "Yakında" bölümü bu listeden beslenir.
 *
 * Yeni bir özellik gerçek implementasyona geçtiğinde:
 *   1. status'ü 'ready' yap ve route'unu gerçek sayfaya bağla (App.tsx).
 *   2. Gerekiyorsa Navbar/BottomNav'a ekle.
 * Placeholder → gerçek geçişi için başka yeri elle güncellemeye gerek yok.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Languages, FileText, BookOpen, Brain, MessageSquare, ScrollText,
  Headphones, MousePointerClick, Network, Quote, PenLine, Trophy, Layers,
} from 'lucide-react';

/** Bir özelliğin yaşam döngüsü durumu. */
export type FeatureStatus = 'ready' | 'building' | 'soon';

export interface FeatureDef {
  /** URL slug ve kayıt anahtarı (benzersiz). */
  slug: string;
  /** Uygulama içi route (örn. /listen). */
  to: string;
  title: string;
  /** Kısa açıklama — kart altında ve sayfa başında kullanılır. */
  desc: string;
  /** Yapım-aşamasında sayfasında gösterilen daha uzun "ne işe yarayacak" metni. */
  detail?: string;
  Icon: LucideIcon;
  /** Tema rengi (vurgular). */
  accent: string;
  status: FeatureStatus;
  /** Tahmini çıkış (yalnızca soon/building). Örn. "Yakında". */
  eta?: string;
}

/** Hazır (çalışan) sistemler. */
const READY: FeatureDef[] = [
  { slug: 'translate',    to: '/translate',    title: 'Belge Çevirisi',  desc: 'PDF yükle, saniyeler içinde Türkçe',     Icon: Languages,      accent: '#6366f1', status: 'ready' },
  { slug: 'documents',    to: '/documents',    title: 'Belgelerim',      desc: 'Tüm dosyaların tek yerde',               Icon: FileText,       accent: '#10b981', status: 'ready' },
  { slug: 'study-notes',  to: '/study-notes',  title: 'Ders Notu',       desc: 'Görsellerden yapılandırılmış not',       Icon: BookOpen,       accent: '#8b5cf6', status: 'ready' },
  { slug: 'study',        to: '/study',        title: 'Aralıklı Tekrar', desc: 'SRS ile kalıcı öğrenme (flashcard)',     Icon: Brain,          accent: '#14b8a6', status: 'ready' },
  { slug: 'chat',         to: '/chat',         title: 'AI Chat',         desc: 'Belgene soru sor, anında cevap',         Icon: MessageSquare,  accent: '#0ea5e9', status: 'ready' },
  { slug: 'glossary',     to: '/glossary',     title: 'Sözlük',          desc: 'Alanına özel terim sözlüğü',             Icon: ScrollText,     accent: '#f59e0b', status: 'ready' },
  { slug: 'write',        to: '/write',        title: 'Yazım Asistanı',  desc: 'Akademikleştir, parafraz, dil bilgisi',  Icon: PenLine,        accent: '#f97316', status: 'ready' },
];

/** Yapım aşamasındaki / yakında gelecek sistemler. */
const UPCOMING: FeatureDef[] = [
  {
    slug: 'listen', to: '/listen', title: 'Dinleyerek Çalış', accent: '#ec4899',
    desc: 'Çeviri ve notlarını sese çevir, yolda dinle',
    detail: 'Çevirilerini, ders notlarını ve özetlerini sesli dinle. Oynat/duraklat, 0.75–2× hız, cümle vurgulama (karaoke) ve arkaplan oynatma. İlk sürüm cihaz sesiyle ücretsiz; premium’da doğal sesler ve indirilebilir MP3 “podcast”.',
    Icon: Headphones, status: 'building', eta: 'Yapım aşamasında',
  },
  {
    slug: 'highlight', to: '/highlight', title: 'Seç-Sor', accent: '#0ea5e9',
    desc: 'Metni seç → açıkla, çevir, örnek ver, soru üret',
    detail: 'PDF veya çeviri görünümünde herhangi bir metni seç; yanında çıkan baloncuktan “Açıkla / Çevir / Örnek ver / Soru üret” de. Seçili metin bağlam olarak yapay zekâya gider.',
    Icon: MousePointerClick, status: 'soon', eta: 'Yakında',
  },
  {
    slug: 'projects', to: '/projects', title: 'Çoklu Belge Sohbeti', accent: '#6366f1',
    desc: 'Birden çok PDF’i bir projede topla, hepsini birlikte konuştur',
    detail: 'Birden çok belgeyi bir “projeye” ekle ve tek sohbette hepsini birlikte konuştur, karşılaştır, sentezle. Literatür taraması ve tez yazımı için ideal. İleride embedding tabanlı akıllı bağlam (RAG) ile büyük kütüphaneler.',
    Icon: Layers, status: 'soon', eta: 'Yakında',
  },
  {
    slug: 'mindmap', to: '/mindmap', title: 'Zihin Haritası', accent: '#22c55e',
    desc: 'Belgeyi tek sayfalık görsel haritaya dönüştür',
    detail: 'Belgeni yapay zekâ ile yapısal bir başlık ağacına çıkar, etkileşimli zihin haritası olarak gör ve PNG/PDF indir. Çalışma görseli + paylaşılabilir özet.',
    Icon: Network, status: 'soon', eta: 'Yakında',
  },
  {
    slug: 'cite', to: '/cite', title: 'Kaynakça & Atıf', accent: '#a855f7',
    desc: 'Referansları çıkar, APA/MLA/IEEE biçimle',
    detail: 'Belgedeki kaynakları otomatik çıkar, APA/MLA/IEEE formatında biçimlendir, kopyala veya dışa aktar. Akademik yazım için doğrudan iş değeri.',
    Icon: Quote, status: 'soon', eta: 'Yakında',
  },
  {
    slug: 'achievements', to: '/achievements', title: 'Başarılar & Seri', accent: '#eab308',
    desc: 'Günlük seri, XP, rozetler ve haftalık hedef',
    detail: 'Çalışma serini sürdür, XP topla, rozet kazan ve haftalık hedefini takip et. Günlük dönüş alışkanlığını güçlendiren oyunlaştırma katmanı.',
    Icon: Trophy, status: 'soon', eta: 'Yakında',
  },
];

export const ALL_FEATURES: FeatureDef[] = [...READY, ...UPCOMING];
export const READY_FEATURES = READY;
export const UPCOMING_FEATURES = UPCOMING;

/** Slug'a göre özelliği bul (yapım-aşamasında sayfası için). */
export function getFeatureBySlug(slug: string): FeatureDef | undefined {
  return ALL_FEATURES.find(f => f.slug === slug);
}

/** Durum rozeti için etiket + renk. */
export const STATUS_META: Record<FeatureStatus, { label: string; color: string; bg: string }> = {
  ready:    { label: 'Hazır',             color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  building: { label: 'Yapım aşamasında',  color: '#ec4899', bg: 'rgba(236,72,153,0.12)' },
  soon:     { label: 'Yakında',           color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
};
