# Spec: Paylaşılan AI-Operasyon / Kredi Helper'ı

**Tarih:** 2026-06-04
**Sub-proje:** Kredi temeli (FEATURE-ROADMAP.md → tüm F1–F8'in zemini)
**Durum:** Tasarım — uygulama planı (writing-plans) öncesi

## Amaç

Her AI özelliği bugün aynı ~25 satırlık kredi ritüelini elle tekrar ediyor:
`getCreditCosts()` → `begin_ai_operation` RPC → `operation_id` ayrıştır → 3 standart
hata toast'ı → `refreshProfile()` → AI çağrısına `operationId` geçir → hatada
`refund_ai_operation` + refresh. Bu blok 7 yerde kopyalanmış (aşağıdaki tablo).

**Hedef:** Bu ritüeli **tek bir yere** topla; her sayfa import etsin. Böylece:
- Yeni özellik (F1 Flashcard, F2 TTS, …) eklemek ~5 satır olur (KISS).
- Kredi mantığı değişince 7+ yer değil, 1 yer düzenlenir.
- Hata sınıflandırma / mesaj regex'leri tek kaynak olur.

**Kapsam dışı (YAGNI):** Server-side RPC'ler (`begin_ai_operation` / `claim_ai_call` /
`refund_ai_operation`) ve `ai-proxy` edge function — bunlar zaten sağlam ve atomik;
**dokunulmayacak**. Bu sub-proje yalnızca istemci tarafı tekrarı ortadan kaldırır.

## Mevcut çağrı yerleri (hepsi taşınacak)

| Çağrı yeri | action | amount | calls | refund (hata) | tip |
|---|---|---|---|---|---|
| `src/hooks/useChatSession.ts` | chat | CHAT_COST | 5 | yok | stream |
| `src/context/TranslationContext.tsx` | translation | pages×perPage | pages×6+30 | ref + beforeunload | arka plan |
| `src/pages/DocumentsPage.tsx` (özet) | chat | chat | 3 | catch | stream |
| `src/pages/StudyNotesPage.tsx` (üret) | study_notes | cost | sources×2+5 | catch | stream |
| `src/pages/StudyNotesPage.tsx` (çevir) | study_notes | cost | 3 | catch | non-stream |
| `src/pages/GlossaryPage.tsx` | glossary | glossary | 2 | yok | non-stream |
| `src/components/OnboardingModal.tsx` | glossary | glossary | 2 | yok | non-stream |

Değişen yalnızca: `action`, `amount`, `calls`, `reference`, "hatada iade?". Şekil aynı.

## Mimari — İki küçük katman (Hibrit)

### Katman 1 — Primitives: `src/lib/aiOperation.ts` (saf, React yok)

Her yerde (lib, context, hook) kullanılabilir. Tek hata-sınıflandırma kaynağı.

```ts
export type AiAction = 'chat' | 'translation' | 'study_notes' | 'glossary' | (string & {});

export interface BeginAiOpInput {
  action: AiAction;
  amount: number;            // ayrılacak kredi (getCreditCosts'tan çağıran çözer)
  calls: number;             // proxy çağrı bütçesi
  reference?: string | null; // ilgili kayıt (docId vb.)
}

export type CreditErrorReason = 'insufficient' | 'rate_limit' | 'error';

export type BeginAiOpResult =
  | { ok: true; operationId: string }
  | { ok: false; reason: CreditErrorReason; message: string };

/** begin_ai_operation RPC + operationId ayrıştırma + hata sınıflandırma. */
export async function beginAiOperation(input: BeginAiOpInput): Promise<BeginAiOpResult>;

/** refund_ai_operation RPC — hatayı yutar (yalnızca hiç çağrı yapılmadıysa sunucu iade eder). */
export async function refundAiOperation(operationId: string): Promise<void>;
```

**Hata sınıflandırma (tek kaynak):** `/Yetersiz/` → `insufficient`,
`/fazla istek/` → `rate_limit`, aksi halde `error`. Regex'ler yalnızca bu dosyada.

### Katman 2 — Hook: `src/hooks/useAiOperation.ts`

Ortak durumun (begin→çalış→hatada iade) tamamını sarar; `refreshProfile`'ı
`useAuth()`'tan kendisi alır. Sayfalar/hook'lar bunu kullanır.

```ts
export interface RunAiOpInput<T> {
  action: AiAction;
  amount: number;
  calls: number;
  reference?: string | null;
  run: (operationId: string) => Promise<T>;            // asıl AI işi
  messages?: Partial<Record<CreditErrorReason, string>>; // reason başına toast metni override
  toastId?: string;                                     // yükleniyor-toast'ını değiştirmek için (GlossaryPage)
  showErrorToast?: boolean;                             // varsayılan: true
  refundOnError?: boolean;                              // varsayılan: true
  silentAbort?: boolean;                                // varsayılan: true (iptalde toast yok)
}

export type RunAiOpResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: CreditErrorReason | 'aborted' };

export function useAiOperation(): {
  run: <T>(input: RunAiOpInput<T>) => Promise<RunAiOpResult<T>>;
};
```

**`run()` akışı:**
1. `beginAiOperation(...)`. Başarısızsa ve `showErrorToast` ise: `reason`'a göre toast
   (`messages?.[reason]` varsa o, yoksa varsayılan: `insufficient`→"Krediniz yetersiz.",
   `rate_limit`→"Çok fazla istek — birkaç saniye bekleyin.", `error`→"İşlem başlatılamadı,
   tekrar deneyin."), `toastId` verildiyse `{ id: toastId }` ile. `{ok:false, reason}` dön.
2. `refreshProfile()` (kredi şimdi atomik düşüldü).
3. `try`: `data = await run(operationId)` → `{ok:true, data}`.
4. `catch e`: `isAbort = e.name==='AbortError' || /İptal/.test(e.message)`.
   - `refundOnError` ise: `refundAiOperation(operationId)` + `refreshProfile()`.
   - `isAbort && silentAbort` → toast yok, `{ok:false, reason:'aborted'}`.
   - aksi halde `toast.error(e.message || genel)`, `{ok:false, reason:'error'}`.

## Migrasyon planı (7 çağrı yeri)

**İlke:** Primitives (`beginAiOperation`/`refundAiOperation`) **evrensel** kısımdır —
7 çağrı yerinin hepsi inline `supabase.rpc(...)` + operationId ayrıştırma + hata
regex'lerini bunlarla değiştirir (tek kaynak). Akışı standart desene **birebir uyan**
yerler ayrıca tam-orkestrasyonlu `run()` hook'unu kullanır. Bu, "hepsini taşı"yı
karşılar (hepsi paylaşılan modülden geçer) ama her sitenin kendine özgü UI
davranışını yeniden yazmaz → düşük risk.

**Hook (`run()`) kullananlar — standart akış birebir uyuyor:**
- `DocumentsPage` (özet) — begin → refresh → run → hatada refund+refresh+toast (abort sessiz).
- `StudyNotesPage` (çevir) — aynı standart akış.
- `GlossaryPage` — aynı; `toastId:'ai-gloss'` ile mevcut yükleniyor-toast'ını değiştirir.

**Yalnızca primitives kullananlar — akış özgün, UI mantığı korunmalı:**
- `useChatSession` — hata sohbet balonuna **inline** yazılır (toast değil), iade yok.
  Sadece begin bloğu (rpc+parse+regex+toast) `beginAiOperation`'a iner; streaming/catch
  olduğu gibi kalır.
- `TranslationContext` — arka plan işi + `beforeunload` iadesi; `opIdRef` + beforeunload
  mantığı olduğu gibi. Inline begin → `beginAiOperation`; `tryRefund` içi → `refundAiOperation`.
- `StudyNotesPage` (üret) — catch'te `study_sessions` durum güncellemesi + iade birlikte;
  begin → `beginAiOperation`, iade → `refundAiOperation`, session bookkeeping korunur.
- `OnboardingModal` — sözlük üretimi **opsiyonel** alt adım; begin başarısızsa **sessiz**
  geçer (toast yok, iade yok). begin → `beginAiOperation` (`ok` değilse `suggestions=[]`).

Davranış birebir korunur: aynı action/amount/calls/reference, aynı toast metinleri.

## Yeni özelliklerde kullanım (KISS kazancı)

Gelecekte F1 Flashcard örneği — kredi için tek blok:

```ts
const { run } = useAiOperation();
const res = await run({
  action: 'flashcards',
  amount: (await getCreditCosts()).flashcards, // creditConfig'e eklenecek
  calls: 3,
  reference: deckId,
  run: (operationId) => generateFlashcards(source, { operationId }),
});
if (res.ok) setCards(res.data.cards);
```

Yeni bir AI özelliği için kredi entegrasyonu = `creditConfig`'e maliyet anahtarı
ekle + `run({...})` çağır. Başka boilerplate yok.

> Not: Yeni maliyet anahtarları (`flashcards`, `tts`, `mindmap`, `citations`,
> `writing`) ilgili özellik geldiğinde `CreditCosts` arayüzü + `constants.ts`
> fallback + `app_config` satırı olarak eklenir. Bu sub-projede yeni anahtar **yok**;
> yalnızca mevcut 4 maliyet (translation/chat/study_notes/glossary) kullanılır.

## Hata yönetimi & güvenlik

- Sunucu otoritesi değişmez: kredi düşümü/iadesi atomik RPC'lerde kalır; helper
  yalnızca onları çağırır. "Bedava AI" (proxy bypass) koruması aynen sürer.
- İade en-çok-bir-kez/güvenli: `refundAiOperation` hatayı yutar; sunucu yalnızca hiç
  çağrı yapılmadıysa gerçekten iade eder (mevcut davranış).
- İptal (AbortError) iade tetikler ama toast üretmez (mevcut davranış korunur).

## Doğrulama

- `npx tsc -b` temiz (sıfır tip hatası).
- Manuel duman testi (her taşınan yol için, kritik kredi yolu olduğundan):
  1. **Başarı:** işlem çalışır, krediler bir kez düşer, UI günceller.
  2. **Yetersiz kredi:** doğru toast, RPC reddi, kredi düşmez.
  3. **Çalışma sırasında hata/iptal:** kredi iade edilir, `refreshProfile` ile UI
     eski bakiyeye döner, iptalde toast çıkmaz.
- Davranış eşitliği: taşımadan önce/sonra aynı action/amount/calls/reference/toast.

## Dosya değişiklikleri özeti

- **Yeni:** `src/lib/aiOperation.ts` (primitives), `src/hooks/useAiOperation.ts` (hook).
- **Düzenle:** `useChatSession.ts`, `TranslationContext.tsx`, `DocumentsPage.tsx`,
  `StudyNotesPage.tsx`, `GlossaryPage.tsx`, `OnboardingModal.tsx` — inline blokları
  helper çağrılarıyla değiştir.
- **Dokunma:** Supabase RPC'leri, `ai-proxy`, `creditConfig.ts` (bu sub-projede),
  `ai.ts` AI fonksiyonları (zaten `operationId` parametresi alıyorlar).
