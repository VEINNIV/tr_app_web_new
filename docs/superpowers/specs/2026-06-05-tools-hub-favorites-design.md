# Araçlar Merkezi — Favoriler, Sık-Kullanılan & Redesign (Tasarım/Plan)

> Durum: **UYGULANDI (2026-06-05).** Kararlar: pin limiti 4, şerit kredi kartının üstünde.
> Dosyalar: `src/hooks/useToolPrefs.ts` (YENİ, useSyncExternalStore paylaşımlı store),
> `src/components/ui/QuickAccessStrip.tsx` (YENİ), ToolsPage redesign, UnderConstruction/Write
> paddingTop fix, DashboardPage entegrasyonu. Build + tsc temiz. Commit bekliyor.
> Kullanıcı isteği (2026-06-05): geri butonu bug'ı + üstte favori/sık-kullanılan araç ekleme
> sistemi (sınırlı), biz onlara sık kullandıklarını işaretleyelim, çok aracımız olduğunu
> keşfettirelim, **çok basit tut**, Araçlar sayfasını daha şık/profesyonel yap.

## Mevcut bağlam (bu oturumda eklendi)
- `src/lib/upcomingFeatures.ts` — tek kayıt (READY_FEATURES + UPCOMING_FEATURES, FeatureDef, STATUS_META, getFeatureBySlug).
- `src/pages/ToolsPage.tsx` (/tools), `src/pages/UnderConstructionPage.tsx` (slug prop).
- `src/pages/WritePage.tsx` (/write — F7 gerçek, çalışıyor).
- Hazır: translate, documents, study-notes, study, chat, glossary, **write**.
- Yolda: listen(building), highlight, mindmap, cite, projects(F4), achievements (hepsi soon).

---

## 1) BUG — "← Araçlar" geri butonu çalışmıyor (KÖK NEDEN DOĞRULANDI)
Navbar `position: fixed; height: var(--navbar-height)=64px; top:0` (navbar.module.css). Yeni
sayfalar üstte 64px boşluk bırakmıyor → sayfa içeriği (geri butonu dahil) navbar'ın ALTINA
giriyor, navbar tıklamayı yutuyor. Buton doğru (`Link to="/tools"`), sadece tıklanamıyor.

**Fix:** ToolsPage, UnderConstructionPage, WritePage'in en dış sarmalayıcısına navbar yüksekliği
kadar üst boşluk ekle. Öneri: `paddingTop: 'calc(var(--navbar-height) + 16px)'` (mevcut clamp
top padding'i bununla değiştir). Diğer çalışan sayfalar bunu CSS module padding'i ile yapıyor.
> Not: Aynı sorun ToolsPage/UnderConstruction'da da var (sadece orada görünür buton yok). Üçünü de düzelt.

---

## 2) Favori (pin) + Sık-Kullanılan sistemi — `localStorage` (DB YOK, kredisiz, anında)
Karar: cihaz-başı localStorage. Basit, sıfır backend, RLS yok. Cihazlar-arası senkron sonradan
`profiles.tool_prefs jsonb` ile eklenebilir (şimdilik gerek yok).

**Yeni hook: `src/hooks/useToolPrefs.ts`**
- Storage anahtarı: `tw:toolprefs:<userId>` (userId yoksa `guest`).
- Şema: `{ pinned: string[]; usage: Record<slug, number> }`.
- API:
  - `pinned: string[]` (sıralı, max **4**).
  - `usage: Record<string, number>`.
  - `isPinned(slug)`, `togglePin(slug)` — limit 4 dolu + yeni pin denenirse `toast` ("En fazla 4 araç sabitleyebilirsin") ve eklemez.
  - `recordUse(slug)` — sayaç +1 (yalnız status==='ready' araçlar).
  - `topUsed(n)` — en çok kullanılan n slug (usage>0), pinli olmayanları önerme için.
  - `FREQUENT_THRESHOLD = 5` → usage[slug] >= 5 ise "Sık" rozeti otomatik.
- React state + `useEffect` ile localStorage yaz; aynı sekmede anında güncelleme.

**Kullanım sayacı bağlama noktaları:**
- En temiz: ToolsPage FeatureCard'da ready karta tıklayınca `recordUse(slug)`.
- Ayrıca Dashboard hızlı erişim ve quick-access şeridi tıklamalarında da `recordUse`.
- (İleride istenirse her sayfa mount'unda recordUse; şimdilik tıklama yeterli, basit.)

---

## 3) Hızlı Erişim şeridi (üst) — basit, bulması kolay
Yerleşim: **Dashboard üstünde** (kredi kartının hemen üstü/altı) + **ToolsPage başında**.
- İçerik: kullanıcının `pinned` araçları (yatay kart/çip şeridi). Boşsa zarif ipucu:
  "⭐ Sık kullandığın araçları sabitle — Araçlar'da yıldıza dokun." + Araçlar'a kısa yol.
- Pinli yoksa **öneri:** `topUsed` ilk 1-2 araç "Şunu sabitle?" mini öneri çipi (opsiyonel, basit tut).
- Her çipte küçük ⭐ (dolu) → tıklayınca unpin. Tıklayınca araç açılır + `recordUse`.
- Limit görünür: "4/4" gibi küçük gösterge (opsiyonel).

**Basitlik ilkesi:** Tek satır, kaydırmasız (4 öğe sığar), ikon+isim. Sürükle-bırak YOK (karmaşık).
Pin/unpin tek tık ⭐. Yeni kullanıcıya tek cümle ipucu.

---

## 4) ToolsPage redesign (şık/profesyonel)
- **Hero başlık:** ikon + "Araçlar" + alt başlık + sağda **"12+ araç · dahası geliyor"** rozeti
  (çokluğu hissettir → keşif; sayı = ALL_FEATURES.length dinamik).
- **Bölümler (sırayla):**
  1. **Sık Kullandıkların** (pinned varsa) — yatay şerit / öne çıkan kartlar.
  2. **Hazır** — grid; her kartta sağ üstte ⭐ (pin/unpin) + otomatik **"Sık"** rozeti (usage≥5) + opsiyonel "Yeni" (write için).
  3. **Yolda** — placeholder kartlar (mevcut), "Önizle" + durum rozeti.
- **Kart anatomisi (geliştir):** accent renk parıltısı (var), daha iyi tipografi hiyerarşisi,
  hover yükselme, yumuşak gölge, köşe yarıçapı tutarlı, ⭐ köşede hover/aktif belirgin.
- Erişilebilirlik: ⭐ buton `aria-label="Sabitle/Kaldır"`, kart `Link`, ⭐ tıklaması `e.preventDefault/stopPropagation` ile navigasyonu engellesin.
- Tema değişkenleri (--color-*) + framer-motion + lucide; mevcut dil korunur.

---

## 5) Dashboard entegrasyonu
- Üste **Hızlı Erişim (favori) şeridi** (bkz. #3). Mevcut "Hızlı Erişim" action listesi kalır ama
  artık favoriler en üstte. "Araçlar" kartı zaten var (bu oturumda eklendi).
- (Opsiyonel) Mevcut quick action'larda da çok kullanılana küçük "Sık" işareti.

---

## Dokunulacak dosyalar (özet)
- `src/hooks/useToolPrefs.ts` (YENİ)
- `src/pages/ToolsPage.tsx` (redesign + ⭐ + sık rozeti + hero sayaç + favoriler bölümü + paddingTop fix)
- `src/pages/UnderConstructionPage.tsx` (paddingTop fix)
- `src/pages/WritePage.tsx` (paddingTop fix)
- `src/pages/DashboardPage.tsx` (favori şeridi)
- (Opsiyonel) küçük ortak `QuickAccessStrip.tsx` bileşeni — Dashboard + Tools paylaşır.

## İlkeler
- **Çok basit:** tek-tık pin, sürükle yok, max 4, tek satır şerit, net ipuçları.
- **Biz işaretleyelim:** usage≥5 otomatik "Sık" rozeti (kullanıcı çaba harcamadan anlar).
- **Keşif:** "12+ araç" rozeti + Yolda bölümü → çok aracın olduğunu hissettir.
- localStorage; cihazlar-arası gerekirse `profiles.tool_prefs jsonb`'a taşı.

## Açık karar (sonraki oturumda sor/uygula)
- Favori limiti 4 mü 5 mi? (öneri: 4 — üst şerit tek satır temiz.)
- Quick-access şeridi Dashboard'da kredi kartının üstünde mi altında mı? (öneri: üstünde, ilk göze çarpsın.)
