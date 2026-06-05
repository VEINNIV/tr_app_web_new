# Modüler Favori Navbar — max 8 pin, ilk 4 navbar'da (Tasarım/Plan)

> Durum: **UYGULANDI (2026-06-05).** tsc + build temiz. Commit bekliyor.
> Kullanıcı isteği: hızlı erişim pin limitini 4 → 8 yap; eklenen ilk 4 favori
> navbar'da (header bar) da yer alsın — orası **modüler** olsun, statik değil.
> Önceki iş: [[2026-06-05-tools-hub-favorites-design]] (favori sistemi + QuickAccessStrip).

## Kararlar (onaylı)
- Navbar kompozisyonu: **tam modüler** — Dashboard + Araçlar sabit; aradaki linkler =
  kullanıcının ilk 4 favorisi. Favori yoksa varsayılan 4 araç.
- Mobil drawer: **tüm araçlar** listelenir; pin varsa en üstte "⭐ Favoriler" grubu.
- ToolsPage/Dashboard favori şeridi: 8'e taşarsa **flex-wrap** ile alt satıra geçer (mevcut davranış).

## Mevcut bağlam
- `useToolPrefs.ts`: `useSyncExternalStore` paylaşımlı store; `pinned` sıralı, `MAX_PINNED=4`.
- `Navbar.tsx`: ortada **8 statik** `authLinks` (Dashboard·Çeviri·Dokümanlar·Sözlük·Ders Notu·Çalış·AI Chat·Araçlar).
- Favorilenebilir slug'lar yalnızca ready feature'lar: translate, documents, study-notes, study, chat, glossary, write.
  Dashboard ve "tools" birer feature değil → favori ile çakışmaz (dedup gerekmez).

---

## 1) `useToolPrefs.ts`
- `MAX_PINNED: 4 → 8`.
- Yeni export `NAV_PINNED_COUNT = 4` — navbar'da gösterilecek favori sayısı.
- Diğer API aynı. QuickAccessStrip ve ToolsPage `MAX_PINNED` sabitine bağlı olduğundan
  sayaç ("n/8") ve şerit otomatik uyum sağlar; o dosyalarda kod değişikliği yok.

## 2) Yeni `src/lib/navItems.ts` (navbar modeli — Navbar'dan ayrık)
Tek sorumluluk: navbar/drawer link listesini üretmek. `upcomingFeatures` tek kaynak kalır.

```ts
export interface NavLink {
  to: string;
  label: string;
  Icon: LucideIcon;
  isFavorite?: boolean;   // favoriden türemişse ⭐ göstermek için
}

// Sabit uçlar (feature değil)
const DASHBOARD_LINK: NavLink = { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard };
const TOOLS_LINK:     NavLink = { to: '/tools',     label: 'Araçlar',   Icon: Compass };

// Favori yokken gösterilecek varsayılan 4
export const DEFAULT_NAV_SLUGS = ['translate', 'documents', 'study-notes', 'chat'];

// Navbar üst sırası: [Dashboard, ...(ilk 4 favori | varsayılan), Araçlar]
export function buildNavLinks(navPinned: string[]): NavLink[] { ... }

// Drawer için tüm ready araçlar (upcomingFeatures READY_FEATURES → NavLink)
export const ALL_TOOL_LINKS: NavLink[] = ...;
```

- `buildNavLinks`: `navPinned` boşsa `DEFAULT_NAV_SLUGS` kullanılır; her slug `getFeatureBySlug`
  ile NavLink'e dönüştürülür (`isFavorite: true`). Bulunamayan slug atlanır (güvenli).

## 3) `Navbar.tsx`
- Statik `authLinks` kalkar. `const { pinned } = useToolPrefs();`
  `const navLinks = buildNavLinks(pinned.slice(0, NAV_PINNED_COUNT));`
- Desktop link render'ı `navLinks` üzerinden döner; `Icon` JSX olarak `<Icon size={16}/>`.
  `isFavorite` ise label yanında küçük ⭐ (12px, #f59e0b). Aktif gösterge (`navLinkIndicator`,
  `layoutId="nav-indicator"`), framer `layout` animasyonu ve hover korunur.
- Landing (`isLanding`) ve guest yolları **değişmez**.

## 4) Mobil drawer
- `user` bloğunda: pin varsa önce **"⭐ Favoriler"** başlığı + ilk 8 favori (NavLink),
  ardından ayraç, sonra **`ALL_TOOL_LINKS`** (tüm araçlar), sonra mevcut Ayarlar/Admin/Çıkış.
- Favori bölümü pin yoksa hiç render edilmez (yalnızca tam liste).

## 5) Davranış / kenar durumlar
- `useSyncExternalStore` paylaşımlı → ToolsPage'de pin/unpin navbar'ı **anında** günceller.
- Favori sıralaması = ekleme sırası; ilk 4 navbar'a yansır, 5–8 yalnızca şerit + drawer.
- Tema, sepet, profil dropdown'ı etkilenmez.

## Dokunulacak dosyalar
- `src/hooks/useToolPrefs.ts` — `MAX_PINNED=8`, `NAV_PINNED_COUNT=4` export.
- `src/lib/navItems.ts` — YENİ.
- `src/components/ui/Navbar.tsx` — dinamik desktop linkler + drawer favori grubu.
- (Otomatik uyum, değişiklik yok: `QuickAccessStrip.tsx`, `ToolsPage.tsx`.)

## İlkeler
- Tek kaynak: navbar linkleri `upcomingFeatures` + `navItems` üzerinden; metadata tekrar yok.
- Modüler: navbar orta sıra kullanıcı favorilerine göre değişir, statik değil.
- Erişilebilirlik korunur: drawer'da tüm araçlar her zaman erişilebilir; ⭐ dekoratif (aria-hidden).
