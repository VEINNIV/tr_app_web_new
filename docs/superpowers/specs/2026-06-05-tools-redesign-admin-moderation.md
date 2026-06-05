# Araçlar Redesign (Apple/Tesla) + Admin Kullanıcı Moderasyonu — DEVİR NOTU

> ✅ **TAMAMLANDI (2026-06-05).** Her iki iş de kodlandı; tsc + build temiz.
> KALAN: (1) moderasyon SQL'i ELLE çalıştır → `supabase/manual/2026-06-05-admin-moderation.sql`
> (Supabase Dashboard → SQL Editor). (2) Tümü main'de commit EDİLMEMİŞ — kullanıcı pushlayacak.
>
> ## Ne yapıldı
> - **İŞ 1 — Araçlar redesign:** Apple-rafine-renkli yön seçildi (önizlemeli AskUserQuestion).
>   `src/pages/ToolsPage.tsx` baştan yazıldı: flagship hero kartı (Belge Çevirisi, 2-kolon,
>   gradient-mesh + 3D ikon + CTA), editöryel başlık tipografisi, 3-stop app-icon tile'lar,
>   spring hover (lift + accent gölge bloom + tile rotate), recessed "Yolda", dark-mode token uyumlu.
> - **İŞ 2 — Admin moderasyon:** Backend SQL `supabase/manual/2026-06-05-admin-moderation.sql`:
>   `profiles.banned_until/ban_reason` kolonları + `admin_set_ban(uuid,timestamptz,text)` +
>   `admin_delete_users(uuid[])` (auth.users cascade → tüm veri; edge GEREKMEZ — postgres'in
>   auth.users DELETE yetkisi DOĞRULANDI) + `begin_ai_operation`'a ban kontrolü.
>   Frontend: `types/index.ts` (+`isBanActive` helper), `AuthContext.tsx` (yasaklı→signOut+toast),
>   `AdminDashboardPage.tsx` (toplu seçim checkbox + bulk sil çubuğu + satır YASAKLI rozeti +
>   genişletilmiş panelde Yasakla/Yasağı-kaldır/Sil + ban modalı süre seçici[1g/7g/30g/kalıcı]+sebep +
>   sil modalı onay-metni[tekli=e-posta, toplu="SİL N"]). Self & admin koruması her katmanda.

---
## (Aşağısı orijinal devir planı — referans)

## Önce: ÇÖZÜLMEMİŞ canlı iş (push'tan önce!)
- `shared-access` edge function production'a **deploy EDİLMEDİ** (auto-mode 2 kez bloke etti; kullanıcı elle yapacak).
- Komut: `supabase functions deploy shared-access --no-verify-jwt --project-ref oxgnrhgaodtvywpjguku`
- Deploy olmadan şifreli paylaşım canlıda çalışmaz. Kod hazır + build temiz. Detay: [[2026-06-05-document-share-redesign]] spec.
- Tüm bu oturum işi (share + navbar/favoriler + güvenlik + ToolsPage redesign tur-1) `main`'de **commit EDİLMEMİŞ** — kullanıcı kendisi pushlayacak.

## İŞ 1 — Araçlar sayfası: Apple/Tesla seviyesi redesign
- Dosya: `src/pages/ToolsPage.tsx` (veri: `src/lib/upcomingFeatures.ts`; favori şeridi: `src/components/ui/QuickAccessStrip.tsx`; pin hook: `src/hooks/useToolPrefs.ts`).
- Tur-1 yapıldı (marka-mavisi disiplini, app-icon tile, :hover, recessed "Yolda", hero band). Kullanıcı: "güzel ama tam istediğim gibi değil; Apple/Tesla usta designer eli istiyorum."
- **Tasarım sistemi** (src/styles/global.css): accent `#0057FF` + `#5AC8FA`; surface #FFF, bg #FAFAFA, bg-alt #F5F5F7; radius sm6/md10/lg14/xl20/2xl28; shadow-xs…xl + glow; --navbar-height 64px; dark mode var. Inline-style sayfası (module CSS değil).
- **Daha pro için denenecekler (öneri):**
  - Tipografi-öncelikli hiyerarşi: daha büyük/tight-tracked başlık, gerçek tip ölçeği, nefes alan whitespace (8px grid).
  - **Featured (hero) araç kartı**: flagship "Belge Çevirisi" 2 kolon kaplayan zengin kart → grid'de net hiyerarşi (Apple hero+grid paterni).
  - İkon tile'larını daha rafine/tutarlı; belki monokroma daha yakın, accent'i daha az ama daha kasıtlı kullan (Tesla restraint).
  - Frosted-glass / çok ince gradient mesh ile katmanlı derinlik; hairline border'lar; çok yumuşak gölge.
  - Spring tabanlı mikro-etkileşimler (ikon hover, ok kayması, kart scale + accent gölge bloom).
  - Favori şeridini "recents/jump back in" satırı gibi daha rafine kur.
  - Dark mode'da da test et.
  - **KARAR GEREKEBİLİR**: Tesla-monokrom (renksiz, tek accent, dramatik whitespace) mi yoksa Apple-rafine-renkli mi? Kullanıcı ikisini de söyledi; tek soruyla yön netleştirilebilir (önizlemeli AskUserQuestion).

## İŞ 2 — Admin panel: kullanıcı silme + yasaklama/moderasyon
- Dosya: `src/pages/AdminDashboardPage.tsx` (mevcut: kredi defteri + rol onay modalı + kâr paneli + 2 admin RPC — bkz [[transwordly-admin-credit-governance.md]]).
- İstenen: kullanıcı **silme (tekli + toplu)**, **yasaklama/ban** (yanlış davranan kullanıcılar için), kullanıcı arama/filtre. Kullanıcı "yaratıcı ol, gerekeni ekle" dedi.
- **Backend gerekir (service_role):**
  - Silme: `auth.admin.deleteUser(id)` + ilişkili veri (cascade veya elle) → edge function VEYA admin RPC (SECURITY DEFINER + admin rol kontrolü).
  - Ban: Supabase auth `ban_duration` (admin API) ya da profiles'a `banned_until/is_banned` kolonu + RLS ile erişim engeli.
  - **GÜVENLİK**: her admin işlemi server-side rol doğrulaması (mevcut admin RPC paternini izle — credit-governance'taki gibi). Kendini silme/banlama koruması. Toplu işlemde onay modalı.
  - Edge deploy yine auto-mode'a takılır → kod yaz + kullanıcıya deploy komutu ver.
- Önce `AdminDashboardPage.tsx` + profiles şeması + mevcut admin RPC'leri OKU (henüz okunmadı), sonra plan/uygula. supabase-skill kullan.
- Project ref: `oxgnrhgaodtvywpjguku` (TransWordly, ACTIVE_HEALTHY).

## Uyarılar
- Supabase canlı DB elle yönetiliyor; repo migration'ları stale, `db push` YOK ([[transwordly-supabase-drift]]).
- Yeni oturumda gereksiz büyük dosya okumalarından kaçın (maliyet). Hedef dosyaları doğrudan aç.
