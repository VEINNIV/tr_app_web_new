/**
 * TransWordly — Navbar link modeli (Navbar'dan ayrık).
 *
 * Tek sorumluluk: navbar üst sırası ve mobil drawer için link listelerini üretmek.
 * Araç metadata'sı tek kaynaktan (upcomingFeatures) gelir — burada tekrar edilmez.
 *
 * Navbar üst sırası modülerdir: Dashboard + (ilk 4 favori | varsayılan 4) + Araçlar.
 */
import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Compass } from 'lucide-react';
import { READY_FEATURES, getFeatureBySlug } from './upcomingFeatures';

export interface NavLink {
  to: string;
  label: string;
  Icon: LucideIcon;
  /** Favoriden türemişse navbar'da küçük ⭐ gösterilir. */
  isFavorite?: boolean;
}

/** Sabit uçlar — bunlar birer "feature" değil, her zaman görünür. */
export const DASHBOARD_LINK: NavLink = { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard };
export const TOOLS_LINK: NavLink = { to: '/tools', label: 'Araçlar', Icon: Compass };

/** Favori yokken navbar ortasında gösterilecek varsayılan 4 araç. */
export const DEFAULT_NAV_SLUGS = ['translate', 'documents', 'study-notes', 'chat'];

/** Tüm hazır araçlar (mobil drawer tam listesi için). */
export const ALL_TOOL_LINKS: NavLink[] = READY_FEATURES.map(f => ({
  to: f.to,
  label: f.title,
  Icon: f.Icon,
}));

/** Bir slug listesini NavLink'e çevirir (bulunamayanları atlar). */
export function slugsToLinks(slugs: string[], asFavorite = false): NavLink[] {
  return slugs
    .map(getFeatureBySlug)
    .filter((f): f is NonNullable<typeof f> => Boolean(f))
    .map(f => ({ to: f.to, label: f.title, Icon: f.Icon, isFavorite: asFavorite }));
}

/**
 * Navbar üst sırası: [Dashboard, ...(ilk N favori | varsayılan), Araçlar].
 * navPinned boşsa DEFAULT_NAV_SLUGS kullanılır.
 */
export function buildNavLinks(navPinned: string[]): NavLink[] {
  const middle = navPinned.length > 0
    ? slugsToLinks(navPinned, true)
    : slugsToLinks(DEFAULT_NAV_SLUGS, false);
  return [DASHBOARD_LINK, ...middle, TOOLS_LINK];
}
