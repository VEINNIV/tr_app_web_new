# PayTR Ödeme Entegrasyonu — Kurulum

TransWordly ödeme altyapısı PayTR **iFrame API** ile çalışır. İki edge function +
bir DB tablosu + bir frontend akışından oluşur.

## Bileşenler

| Parça | Yer | Görev |
|-------|-----|-------|
| `payment_orders` tablosu | DB (canlı) | Sipariş durumu (pending/paid/failed), idempotency |
| `complete_payment_order` / `fail_payment_order` | DB RPC (SECURITY DEFINER) | Ödeme onayında plan+kredi yükler (guard-bypass'li) |
| `paytr-init` | `functions/paytr-init` | JWT'li; tutarı server-side hesaplar, sipariş açar, PayTR token üretir |
| `paytr-callback` | `functions/paytr-callback` | PayTR webhook'u; hash doğrular, krediyi yükler, "OK" döner |
| CheckoutPage | `src/pages/CheckoutPage.tsx` | `paytr-init`'i çağırır, dönen `iframeUrl`'e yönlendirir |

## 1) Edge Function secret'ları

Supabase Dashboard → Project Settings → Edge Functions → Secrets (veya CLI):

```bash
supabase secrets set \
  PAYTR_MERCHANT_ID=xxxxxx \
  PAYTR_MERCHANT_KEY=xxxxxxxxxxxxxxxx \
  PAYTR_MERCHANT_SALT=xxxxxxxxxxxxxxxx \
  PAYTR_TEST_MODE=1 \
  APP_BASE_URL=https://transwordly.com
```

- `PAYTR_TEST_MODE=1` → test kartlarıyla deneme. Canlıya geçince `0` yapın.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` otomatik mevcuttur.
- Secret eklenmeden `paytr-init` **503 "Ödeme altyapısı henüz yapılandırılmadı"** döner (güvenli varsayılan).

## 2) Deploy

```bash
supabase functions deploy paytr-init                 # verify_jwt: true (varsayılan)
supabase functions deploy paytr-callback --no-verify-jwt   # PayTR JWT göndermez
```

> `paytr-callback` **mutlaka** `--no-verify-jwt` ile deploy edilmeli; aksi halde
> PayTR'nin bildirimi 401 alır.

## 3) PayTR mağaza paneli ayarları

- **Bildirim URL'i (callback):** `https://<proje>.supabase.co/functions/v1/paytr-callback`
- Mağaza tipi: iFrame API.

## 4) Akış

1. Kullanıcı CheckoutPage'de "Güvenli Öde" → frontend `paytr-init`'e POST eder
   (`{plan, student, name, phone}`; tutar **server'da** `app_config.plan_price.*`'ten okunur).
2. `paytr-init` bir `pending` sipariş açar, PayTR `get-token`'dan token alır,
   `iframeUrl` döner → kullanıcı `https://www.paytr.com/odeme/guvenli/<token>`'a gider.
3. Ödeme bitince PayTR `paytr-callback`'e POST eder. Hash doğrulanır →
   `complete_payment_order` plan+krediyi yükler (idempotent). "OK" döner.
4. Kullanıcı `APP_BASE_URL/checkout?status=success` (veya `fail`) sayfasına döner.

## Güvenlik notları

- Tutar asla istemciden alınmaz; `app_config`'ten okunur (fiyat manipülasyonu engellenir).
- Callback hash doğrulaması zorunlu (sahte "ödendi" bildirimi engellenir).
- Kredi yükleme idempotenttir (`status='paid'` ise tekrar yüklenmez).
- `payment_orders` RLS: kullanıcı yalnızca kendi siparişlerini görür; yazma yalnızca
  service_role/RPC üzerinden.

## Notlar / sonraki adımlar

- **Abonelik yenileme:** Bu kurulum tek seferlik ödeme + 30 günlük kredi yükler.
  Otomatik aylık yenileme için PayTR Tekrarlayan Ödeme (Recurring) API'si gerekir.
- İsteğe bağlı: ödeme sonrası kullanıcıya e-posta/bildirim.
