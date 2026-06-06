# Yasal Sayfalar + Çerez Onayı + Admin Moderasyon Merkezi

**Tarih:** 2026-06-06
**Durum:** Onaylandı (tasarım) — implementasyona hazır
**Tetikleyen:** PayTR, sitede telefon/adres/teslimat/satış politikası/iptal-iade bilgi sayfaları
talep etti. Site yayında (müşteri alıyor) → üyelik sözleşmesi, kullanım şartları, gizlilik/KVKK,
çerez politikası zorunlu. Ek olarak admin tarafında sebepli silme + yeniden-kayıt engeli + moderasyon
merkezi istendi.

## Künye (sözleşmelerde kullanılacak)
- **Satıcı / Veri Sorumlusu:** Cadeft (Cadeft Digital Agency)
- **Adres:** Saimekadın Mah. Görgülü Cad. No:45, Mamak / Ankara
- **Telefon:** 0544 327 4396
- **E-posta:** cadeftdev@gmail.com
- **Ürün:** TransWordly — akademik AI çeviri/çalışma platformu (kredi paketleri = dijital ürün)
- Vergi dairesi / Vergi no / MERSIS: henüz verilmedi → metinlerde net "[doldurulacak]" satırı bırakılır.

---

## A) Yasal / bilgi sayfaları

**Mimari:** İçerik veri olarak `src/content/legal.tsx` içinde (her belge: `slug`, `title`, `summary`,
`sections: { heading, body }[]`, `updated`). Tek `LegalLayout` bileşeni render eder. `LEGAL_DOCS`
dizisi `/legal` hub'ında listelenir.

**Rotalar (public, auth yok):**
- `/legal` → LegalHubPage (tüm belgeleri kart olarak listeler)
- `/legal/:slug` → LegalDocPage (slug ile belge bulur, yoksa NotFound)

**Belgeler:**
1. `kullanim-sartlari` — Kullanım Şartları
2. `uyelik-sozlesmesi` — Üyelik (Kullanıcı) Sözleşmesi
3. `mesafeli-satis` — Mesafeli Satış Sözleşmesi
4. `teslimat` — Teslimat & İfa Koşulları (dijital, anında teslim)
5. `iptal-iade` — İptal, Cayma & İade Prosedürü
6. `gizlilik-kvkk` — Gizlilik Politikası & KVKK Aydınlatma Metni
7. `cerez-politikasi` — Çerez Politikası

**İade politikası (onaylanan):** Dijital ürün standardı — Mesafeli Sözleşmeler Yönetmeliği m.15:
anında ifa edilen dijital içerikte AI işlemi/kullanım başladıktan sonra cayma hakkı yoktur; hiç
kullanılmamış kredi paketi 14 gün içinde iade edilebilir.

**Stil:** Projenin inline-style + framer-motion deseni. Hero + okunur "prose" bölümleri + geri linki +
"son güncelleme" tarihi. CSS değişkenleri (`--color-*`) kullanılır, dark/light uyumlu.

## B) İletişim bilgileri
- **ContactPage:** Adres kartı → gerçek adres; yeni **Telefon kartı** (`tel:` link). "Uzaktan ekip"
  ifadesi kaldırılır.
- **LandingPage footer:** adres + telefon satırı; yeni "Yasal" link sütunu (Mesafeli Satış, Gizlilik/KVKK,
  Çerez, Kullanım Şartları, İade) → `/legal/*`.

## C) Çerez onay popup'ı
- Yeni `src/components/ui/CookieConsent.tsx`. Sol-altta kart, 🍪 ikon, spring giriş, `useReducedMotion`
  saygılı. Butonlar: **Kabul Et / Reddet / Tercihler**. "Tercihler" → analitik toggle (zorunlu çerezler
  hep açık, pasif). Çerez Politikası'na link.
- Kalıcılık: `localStorage["tw_cookie_consent"] = { necessary:true, analytics:boolean, ts }`.
  Değer varsa banner gösterilmez.
- `AppLayout` içine mount; `/auth` dahil her yerde (ilk seçime kadar).

## D) Admin: sebepli silme + yeniden-kayıt engeli + moderasyon merkezi

### DB (manuel SQL: `supabase/manual/2026-06-06-account-tombstones.sql`)
1. **`public.deleted_accounts`** tombstone tablosu:
   - `id uuid pk default gen_random_uuid()`
   - `email text not null` (normalize: lower)
   - `full_name text`, `original_user_id uuid`
   - `reason text` (opsiyonel — kullanıcıya gösterilecek mesaj)
   - `deleted_by uuid`, `deleted_by_email text`, `created_at timestamptz default now()`
   - `create unique index on lower(email)`
   - RLS: SELECT sadece `is_admin()`; INSERT/DELETE yalnızca SECURITY DEFINER fonksiyonları üzerinden.
2. **`admin_delete_users(p_user_ids uuid[], p_reason text default null)`** (mevcut güncellenir):
   self/admin korumaları aynı; silmeden önce her kullanıcı için tombstone INSERT
   (email lower, full_name, original_user_id, reason, deleted_by=auth.uid(), deleted_by_email);
   sonra `delete from auth.users`. `on conflict (lower(email)) do update` ile sebep güncellenir.
3. **`auth.users` BEFORE INSERT trigger** `block_deleted_email()`: `lower(NEW.email)` tombstone'daysa
   `raise exception` (kayıt engellenir). GGTrue mesajı maskeleyebilir → asıl engel trigger; dostça mesaj
   frontend'de.
4. **`public.check_blocked_email(p_email text)`** (SECURITY DEFINER, anon çağırabilir):
   `returns table(blocked boolean, reason text)` — tombstone varsa true + reason.
5. **`admin_deleted_accounts(p_limit int, p_search text)`** (admin): tombstone satırlarını döndürür.
6. **`admin_unblock_email(p_id uuid)`** (admin): tombstone satırını siler → yeniden kayda izin.

### Frontend
- **AdminDashboardPage:**
  - Silme modalına opsiyonel **"Silme sebebi (kullanıcıya gösterilir)"** alanı → `admin_delete_users`'a
    `p_reason` geçilir.
  - Yeni **"Moderasyon"** sekmesi: (a) Yasaklı kullanıcılar (profiles, aktif `banned_until`; sebep, bitiş,
    yasağı kaldır), (b) Silinen hesaplar (`admin_deleted_accounts`: e-posta, sebep, silen admin, tarih +
    "yeniden kayda izin ver").
  - Ban modalı kopyası: "kullanıcıya gösterilmez" → "kullanıcıya gösterilir".
- **AuthPage:** signUp hatasında `check_blocked_email(email)` çağrılır; blocked ise dostça mesaj
  ("Hesabınız kaldırıldı: {sebep}" / sebep yoksa genel mesaj).
- **AuthContext:** aktif ban tespitinde `ban_reason` varsa toast'a eklenir
  ("Hesabınız askıya alındı: {sebep}").

## E) Checkout yasal onayı
- **CheckoutPage:** ödeme butonundan önce zorunlu onay kutusu — "Mesafeli Satış Sözleşmesi'ni ve
  Gizlilik Politikası'nı okudum ve onaylıyorum" (linkler `/legal/mesafeli-satis`, `/legal/gizlilik-kvkk`).
  İşaretlenmeden ödeme/sepet onayı pasif.

---

## Test / doğrulama
- `tsc --noEmit` + `vite build` temiz.
- Manuel: /legal hub + her belge açılır; çerez banner görünür/kaybolur; admin silme sebep alanı +
  moderasyon sekmesi; silinen e-posta ile kayıt denemesi engellenir + mesaj; checkout onay kutusu kilidi.

## Kapsam dışı (YAGNI)
- Gerçek analitik entegrasyonu (sadece tercih saklanır).
- Vergi/MERSIS otomatik doldurma (elle eklenecek).
- Ban geçmişi audit log tablosu (mevcut profiles alanları yeterli).
