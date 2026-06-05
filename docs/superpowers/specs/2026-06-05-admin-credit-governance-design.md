# Admin Paneli — Kredi Yönetişimi & Rol Güvenliği · Tasarım

**Tarih:** 2026-06-05 · **Durum:** Onaylandı (kullanıcı tam yetki verdi, "yaratıcı ol") · **Önceki iş:** F1.1 flashcard kart tipleri (bitti, commit bekliyor)

> Bu spec, YENİ/temiz bir oturumda ucuza başlamak için yazıldı. Önce "Doğrulanacaklar"ı oku.

## Amaç (kullanıcının istekleri)
1. **Kullanıcı başına kredi şeffaflığı:** kim ne kadar harcamış, ne kadar **satın almış**, ne kadar kalmış.
2. **Kredi kaynağı (provenance):** bir kullanıcının kredisi **satın alma** mı, **admin grant** mı, **aylık reset** mi — net görünsün.
3. **Rol değişiminde kaza koruması:** rol değiştirmeden önce admin bir **onay metni yazsın** (doğru yazınca uygulansın), yanlışlıkla rol değişmesin.
4. **Sıkı/doğru kredi yönetimi panelden ayarlanabilsin:** bir kredi sana **ne kadara mal oluyor** (girdi/çıktı token) vs **ne kadara satıyorsun** → kâr marjı; hem tüketim maliyeti hem satış fiyatı panelden değişsin (zaten kısmen var, genişlet).

## Mevcut durum (değiştirmeden önce oku)
- **Sayfa:** [src/pages/AdminDashboardPage.tsx](../../../src/pages/AdminDashboardPage.tsx) — 4 sekme: `overview | credits | users | security`. CSS: `src/styles/components/admin.module.css`.
- **Var olan RPC'ler (istemciden çağrılıyor):**
  - `update_app_config(p_key, p_value)` — app_config günceller.
  - `update_user_plan(p_user_id, p_plan)`
  - `update_user_role(p_user_id, p_role)`  ← role onay metni bunu sarmalayacak (RPC değişmez, UI gate eklenir).
  - `grant_credits(p_user_id, p_amount, p_reason)` — reason 'admin_grant'.
  - `begin_ai_operation` / `refund_ai_operation` (kredi rezervasyon/iade — F1'de kullanıldı).
- **app_config (category → key'ler), canlı değerler (2026-06-05):**
  - `credit_cost.*`: translation_per_page=1, chat=1, glossary=1, study_notes=2, **flashcards=2 (label NULL — eklenecek)**.
  - `plan_price.*`: starter=149, pro=499 (₺/ay).
  - `plan_limit.*`: free=10, starter=120, pro=500, enterprise=4000.
  - `discount.*`: starter=0, pro=0, student_amount=10.
  - `pricing.*`: usd_try=50, flash_input_usd_per_1m=0.25, flash_output_usd_per_1m=1.50, pro_input=2.00, pro_output=12.00, credit_revenue_try=0.5, avg_tokens_per_page=1800, avg_tokens_per_chat=1500, avg_tokens_per_note=4000. **(avg_tokens_per_flashcards YOK — eklenecek)**
- **credit_transactions** tablosu: `user_id, amount (numeric; + alış / − harcama), action, reference_id, created_at`. action CHECK: `translation, chat, monthly_reset, purchase, admin_grant, study_notes, glossary, flashcards`.
  - Pozitif amount = kredi girişi (purchase / admin_grant / monthly_reset). Negatif = harcama (action = işlemin türü).
- **payment_orders** tablosu: `user_id, merchant_oid, plan, amount_kurus, currency, status('pending|paid|failed'), credits_granted, payment_type, created_at` — gerçek ₺ gelir buradan (PayTR).
- **profiles:** `role ('user|subscriber|admin')`, `plan`, `credits_remaining`, `credits_monthly_limit`, `credits_reset_at`.
- Güvenlik sekmesi `credit_transactions`'tan bugünkü harcamayı OKUYABİLİYOR → **admin'in tüm kullanıcıların credit_transactions'ını okumasına izin veren bir RLS politikası VAR** (per-user ledger için bu kritik; ekstra RPC gerekmeyebilir).

## Doğrulanacaklar (yeni oturumda ilk iş — ucuz)
1. `update_user_role`, `grant_credits`, `update_app_config` RPC'leri **SECURITY DEFINER + admin rol kontrolü** içeriyor mu? (Güvenlik sekmesi öyle iddia ediyor; `list_migrations` / `get_advisors` veya pg_proc'tan teyit et.) Admin değilse reddetmeli.
2. `credit_transactions` üzerinde **admin SELECT policy** gerçekten var mı (başka kullanıcının satırlarını okuyabiliyor mu)? Yoksa per-user ledger için `admin_user_ledger(p_user_id)` SECURITY DEFINER RPC ekle.
3. `payment_orders` üzerinde admin SELECT policy var mı (gelir paneli için)? Yoksa RPC ya da policy ekle.

## Yapılacaklar

### 1) Kullanıcı kredi defteri (Users sekmesi — genişletilen kartın içine)
Kart açılınca o kullanıcı için `credit_transactions`'ı çek (`.eq('user_id', id).order('created_at desc').limit(50)`), ve özetle:
- **Satın alınan** = Σ amount where action='purchase'
- **Admin verdiği** = Σ amount where action='admin_grant'
- **Aylık reset** = Σ amount where action='monthly_reset'
- **Toplam harcanan** = Σ |amount| where amount<0, ayrıca **tür bazında kırılım** (translation/chat/study_notes/glossary/flashcards)
- **Mevcut bakiye** = profiles.credits_remaining (zaten kartta var)
UI: özet rozet satırı (Satın aldı X · Admin Y · Harcadı Z) + altında kompakt işlem listesi; her satırda **kaynak rozeti** (🛒 Satın alma / 🎁 Admin verdi / 🔄 Aylık / ⚡ Harcama-<tip>), tarih, ±miktar (yeşil/kırmızı). Bu, "kim ne almış, kendi mi aldı admin mi verdi, ne harcamış" sorusunu birebir karşılar.

### 2) Rol değişiminde onay metni (kaza koruması)
- Farklı role tıklayınca **doğrudan uygulama**, bir **onay modalı** aç:
  - Başlık: "‹kullanıcı› rolünü **‹YENİ ROL›** yapmak üzeresin."
  - Onay metni alanı: **kullanıcının e-postasını birebir yaz** (case-insensitive) → eşleşmezse buton kilitli.
  - `admin` rolüne yükseltmede ekstra kırmızı uyarı: "Admin tüm kullanıcıları ve kredileri yönetebilir."
  - Doğru yazınca → `update_user_role` çağrılır.
- (Aynı deseni opsiyonel olarak **enterprise plan**'a geçişte de kullanabilirsin; istek yalnızca rol için.)

### 3) Kredi maliyet/kâr yönetişimi (Credits sekmesi)
- **flashcards'ı CostCalculator'a ekle:** ops listesine `{ key:'credit_cost.flashcards', label:'Flashcard (üretim)', tokens: cfg['pricing.avg_tokens_per_flashcards'] }`.
- **Yeni app_config satırları (migration ile ekle):**
  - `pricing.avg_tokens_per_flashcards` = 3500, category='pricing', label='Flashcard: üretim başına ort. token'
  - `credit_cost.flashcards` label güncelle = 'Flashcard (üretim başına)'
- **Gelir/Maliyet/Kâr paneli (yeni — Overview veya Credits üstüne):** son 30 gün için:
  - **Gerçek gelir** = Σ payment_orders.amount_kurus/100 where status='paid'.
  - **Tahmini AI maliyeti** = Σ (harcanan kredi × o işlemin tahmini ₺ Gemini maliyeti) — CostCalculator'daki splitCost mantığını credit_transactions üzerinden uygula.
  - **Kâr ≈ gelir − maliyet**, marj %. Bu "para kaybetmeyeyim" ihtiyacını karşılar.
- Mevcut maliyet parametreleri (token fiyatı, kur, plan fiyat/limit, işlem kredisi) zaten panelden düzenlenebiliyor — **dokunma, sadece flashcards'ı kapsa.**

### 4) (Opsiyonel, Faz 2) Gerçek token ölçümü
Şu an maliyet `pricing.avg_tokens_*` varsayımlarıyla tahmini. Gerçek için `ai_operations`'a `input_tokens/output_tokens` kolonları + ai-proxy edge function'ın usage metadata'sını yazması gerekir. Büyük iş — ayrı oturum. Spec'te işaretli kalsın.

## Güvenlik / kredi notları
- **F1.1 doğrulandı (bitti):** kart üretimi `beginAiOperation` ile server-side atomik rezervasyon (calls:1), review ücretsiz; RLS user_id=auth.uid(); options/answer düz metin (XSS yok). Kredi sızıntısı/açığı yok.
- Yeni admin işlerinde **tüm yazma yolları mevcut admin RPC'lerinden** geçmeli (doğrudan `from('profiles').update` YOK). Onay metni yalnızca **UI kapısı**; gerçek otorite RPC'deki admin kontrolü.
- Per-user ledger ve gelir paneli **yalnızca okuma**; admin RLS yoksa SECURITY DEFINER RPC ile sağla.

## Dosya listesi (özet)
**Değişen:** [src/pages/AdminDashboardPage.tsx](../../../src/pages/AdminDashboardPage.tsx) (ledger + rol onay modalı + gelir/kâr paneli + flashcards calc), `src/styles/components/admin.module.css` (yeni bölümler).
**Yeni (gerekirse):** `admin_user_ledger` / `admin_revenue_summary` RPC (yalnızca RLS izin vermiyorsa).
**DB (apply_migration):** `pricing.avg_tokens_per_flashcards` ekle + `credit_cost.flashcards` label güncelle; (gerekirse) admin SELECT policy'leri.
**Build:** `npx tsc -b` temiz olmalı; tasarım dili (admin.module.css) korunur.
