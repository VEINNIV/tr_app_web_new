# Belge Paylaşım Sistemi — Bugfix + Redesign (Tasarım/Plan)

> Durum: **KOD TAMAM — yalnızca production edge deploy bekliyor (kullanıcı "şimdilik bekle" dedi 2026-06-05).**
> Tüm frontend + edge kodu yazıldı, `tsc --noEmit` + `npm run build` temiz. `share_expires_at`
> ve `share_code` kolonları production'da zaten mevcut (migration GEREKMEDİ).
> **KALAN TEK İŞ:** `shared-access` edge function'ı production'a redeploy (verify_jwt:false). Deploy
> olmadan şifreli paylaşım canlıda hâlâ bozuk (canlı sürüm v3 = eski 401/403/404 kodları).
>
> Kullanıcı isteği (2026-06-05): şifreli paylaşım bozuk (kimse giremiyor); paylaşırken
> süre sor (max 1 ay) + şifreli mi sor; aktif paylaşım süresi dolana kadar tekrar
> paylaşılamasın, "Paylaş"a basınca mevcut paylaşım bilgisi görünsün (yük azaltma).

## 🔴 KÖK NEDEN (şifre bug'ı) — DOĞRULANDI
`shared-access` edge function kontrol yanıtlarını **non-2xx** ile dönüyordu
(needsCode→401, wrongCode→401, blocked→403, notFound→404). `SharedDocumentPage.request()`
ise `supabase.functions.invoke` non-2xx'inde gövdeyi `error.context.body` (ham ReadableStream)
ile okumaya çalışıyor — parse edilmiş JSON DEĞİL. Sonuç: `payload.needsCode/wrongCode` hep
`undefined` → `setPhase('error')`. Şifresiz=200 olduğu için çalışıyor; şifreli her kontrol
yanıtı okunamıyor → kimse giremiyor. Hash/şifre şeması ve tablo DOĞRU (frontend+edge ikisi de
`sha256(`${token}:${code.toUpperCase()}`)`, ikisi de `translations` tablosu). Deploy stale DEĞİL
(deploy edilen = repo). **Fix: edge kontrol yanıtları HTTP 200 + flag.**

## YAPILDI (dosyada, deploy/migration YOK)
`supabase/functions/shared-access/index.ts`:
- Header yorumu güncellendi (expired/notFound + 200 notu).
- select'e `share_expires_at` eklendi.
- `notFound` 404 → **200** yapıldı.
- **expired** kontrolü eklendi (`share_expires_at < now` → `{expired:true}`, 200).

## KALAN İŞLER (sırayla)
### 1. Edge `shared-access` — kalan status kodları → 200
- `{ blocked: true }, 403` → `200` (İKİ yer: lockout başında + 5. yanlışta).
- `{ needsCode: true }, 401` → `200`.
- `{ wrongCode: true, remaining }, 401` → `200`.
- Gerçek hatalar (400/405/500) AYNI kalır.
- **Sonra redeploy** (production; deploy_edge_function — onay gerekebilir).

### 2. Migration (production)
```sql
alter table public.translations add column if not exists share_expires_at timestamptz;
```
(Tip `Translation.share_expires_at` zaten var: src/types/index.ts:67.)

### 3. `DocumentsPage.tsx`
- **State:** `shareDuration: '1d'|'7d'|'30d'` (varsayılan '7d'); süre saniye map: 86400 / 604800 / 2592000 (max 1 ay).
- **`hasActiveShare(doc)`** = `doc.translation?.share_token` && (`!share_expires_at` || `expires>now`).
- **`createShareLink(doc, code?, duration)`**: `expires = now + durSec`; `createSignedUrl(path, durSec)` (1 yıl yerine süreyle hizalı); update'e `share_expires_at` ekle; **başarıda local `documents` state'ini güncelle** (re-share kilidi anında çalışsın).
- **`revokeShare(doc)`**: translations set share_token=null, shared_pdf_url=null, share_password_hash=null, share_expires_at=null; local state güncelle.
- **`copyShareLink(doc)`**: `${origin}/shared/${token}` panoya.
- **Modal (`shareModalDoc`):** iki mod —
  - **Aktif paylaşım varsa:** bilgi görünümü — link (kopyala), şifreli mi rozeti (hash var → "🔒 Şifreli", kod gösterilemez çünkü yalnız hash saklı), kalan süre (`share_expires_at` formatlı), "Paylaşımı iptal et" (revoke). **Yeni link ÜRETME.**
  - **Aktif paylaşım yoksa:** oluşturma formu — **süre seçici (1 gün / 1 hafta / 1 ay)** + mevcut şifre toggle + "Linki oluştur ve kopyala".
- `openShareModal` aynen modalı açar; mod içerde `hasActiveShare`'e göre.

### 4. `SharedDocumentPage.tsx`
- `request()` sadeleştir: edge artık hep 200 → `return res` (error.context.body hack'i kaldır; gerçek hatada res null → 'error').
- `expired` faz işle: `else if (p?.expired)` → 'notFound' (mesaj zaten "veya süresi dolmuş") ya da özel 'expired' fazı.

### 5. Doğrulama
- `npx tsc --noEmit` + `npm run build`.
- Migration uygula + `shared-access` redeploy (ikisi de production; onay gerekebilir).
- Şifreli + süreli + iptal akışını test.

## Notlar
- Tüm bu oturum işi (navbar/favoriler + güvenlik + bu paylaşım) `main`'de **commit edilmemiş**.
- Production: migration + edge deploy otomatik-mod sınıflandırıcısı tarafından açık onay isteyebilir.
- İlgili: [[transwordly-supabase-drift]], [[transwordly-credit-security-hardening]].
