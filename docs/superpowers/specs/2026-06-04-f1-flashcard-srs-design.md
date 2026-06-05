# F1 — Flashcard + SRS (Aralıklı Tekrar) · Tasarım

**Tarih:** 2026-06-04 · **Durum:** Onaylandı (kullanıcı tam yetki verdi) · **Roadmap:** [FEATURE-ROADMAP.md](../../FEATURE-ROADMAP.md) F1

## Amaç
Tek başına günlük geri dönüş sebebi (en yüksek retention kaldıracı). Belge/ders notundan
AI ile soru-cevap & kavram kartları üret → SM-2 aralıklı tekrar ile "Bugün çalış".

## Kapsam (MVP)
- **VAR:** Flashcard (ön/arka + ipucu/etiket), SM-2 SRS, kaynak = Belgeler + Ders Notları,
  `/study` sekmesi, hafif dashboard widget'ı ("Bugün tekrar: N kart").
- **YOK (sonraki sürüm):** Quiz/çoktan seçmeli, sohbetten kart, serbest-metin deck, manuel
  kart ekleme/düzenleme, "AI tekrar açıklaması", ücretsiz/premium kart limiti.

## Mimari

### Veritabanı (Supabase — `apply_migration` ile, RLS dahil; `db push` YOK)
```
study_decks
  id uuid pk default gen_random_uuid()
  user_id uuid not null            -- auth.uid()
  title text not null
  source_type text not null        -- 'document' | 'study_note' | 'manual'
  source_ref uuid                  -- ilgili document/study_note id (nullable)
  created_at timestamptz default now()

flashcards
  id uuid pk default gen_random_uuid()
  deck_id uuid not null references study_decks(id) on delete cascade
  user_id uuid not null
  front text not null
  back text not null
  hint text
  tag text
  ease real not null default 2.5
  interval int not null default 0   -- gün
  repetitions int not null default 0
  due_at timestamptz not null default now()
  created_at timestamptz default now()
```
RLS (her iki tablo): `user_id = auth.uid()` — select/insert/update/delete.
İndeks: `flashcards(user_id, due_at)` (due sorgu), `flashcards(deck_id)`.

### `src/lib/srs.ts` — saf SM-2 (DB'siz, test edilebilir)
```ts
type Grade = 'again' | 'hard' | 'good' | 'easy';
interface SrsState { ease: number; interval: number; repetitions: number; }
interface SrsResult extends SrsState { dueAt: Date; }
function review(state: SrsState, grade: Grade, now?: Date): SrsResult;
```
SM-2 davranışı:
- `again`: repetitions=0, interval=0 (≈10 dk içinde tekrar → `dueAt = now + 10dk`), ease −0.20 (min 1.3).
- `hard`: interval = max(1, round(interval*1.2)), ease −0.15.
- `good`: rep 0→interval 1, rep 1→6, sonra round(interval*ease); ease sabit.
- `easy`: good gibi ama *1.3 bonus, ease +0.15.
- ease alt sınır 1.3.

### `src/lib/ai.ts` → `generateFlashcards`
```ts
generateFlashcards(
  text: string,
  opts?: { count?: number; operationId?: string; signal?: AbortSignal },
): Promise<{ front: string; back: string; hint?: string; tag?: string }[]>
```
- `detectImageText` JSON protokolünü örnek alır: `callGemini` + Türkçe sistem promptu
  ("SADECE geçerli JSON döndür") + `result.match(/\{[\s\S]*\}/)` + doğrulama/filtre.
- Çıktı şeması: `{"cards":[{"front":"...","back":"...","hint":"...","tag":"..."}]}`.
- `count` varsayılan ~12, metin uzunluğuna göre üst sınır. Metin `slice(0, 48_000)`.
- Türkçe kartlar üretir; front = kısa soru/kavram, back = net cevap.

### Kredi
- [aiOperation.ts](../../../src/lib/aiOperation.ts) `AiAction` birliğine `'flashcards'` eklenir.
- [creditConfig.ts](../../../src/lib/creditConfig.ts) `CreditCosts.flashcards` + `constants.ts`
  `CREDIT_COSTS.FLASHCARDS` fallback + `app_config` satırı `credit_cost.flashcards` (öneri: 6).
- Üretim akışı: `useAiOperation().run({ action:'flashcards', amount:(await getCreditCosts()).flashcards,
  calls:1, reference:sourceId, run:(opId)=>generateFlashcards(text,{operationId:opId}) })`.
- Tekrar çalışması (review) ÜCRETSİZ — yalnızca DB update.

### `src/lib/decks.ts` — veri erişim katmanı (UI ↔ supabase ayrımı)
- `createDeckWithCards(title, source, cards) → deckId`
- `listDecks() → Deck[]` (her deck için kart sayısı + due sayısı)
- `getDueCards(deckId?) → Flashcard[]` (due_at <= now, deck filtreli/global)
- `applyReview(cardId, grade) → void` (srs.review → update)
- `deleteDeck(deckId)`, `countDueTotal() → number` (dashboard widget).

### UI
- **`src/pages/StudyDeckPage.tsx`** (`/study`): üstte "Bugün çalış: N kart" CTA, altında deck
  kartları (başlık, kart sayısı, due rozeti, sil). Boş durum → "Belgeler/Ders Notları'ndan
  kart üret" yönlendirmesi. CSS Modules + framer-motion.
- **`src/components/study/FlashcardReviewer.tsx`**: tam-ekran çalışma modu. Flip animasyonu
  (framer-motion), boşluk=çevir, klavye 1/2/3/4 = Again/Hard/Good/Easy, ilerleme çubuğu,
  bitince özet ("N kart tamamlandı"). Her derece → `decks.applyReview` → sıradaki due kart.
- **`StudyDeckPage.module.css`**, **`FlashcardReviewer.module.css`**.

### Kaynak entegrasyonu (v1)
- [DocumentsPage.tsx](../../../src/pages/DocumentsPage.tsx) ve
  [StudyNotesPage.tsx](../../../src/pages/StudyNotesPage.tsx) çıktısına **"Kart üret"** aksiyonu:
  metni `generateFlashcards`'e ver → `decks.createDeckWithCards` → `/study`'ye git (toast).

### Navigasyon
- [App.tsx](../../../src/App.tsx): `/study` route (lazy + `ProtectedRoute` + `PageTransition`).
- `Navbar` + `BottomNav`: "Çalış" sekmesi (lucide `Brain` / `Layers`).

### Dashboard kancası (hafif)
- [DashboardPage.tsx](../../../src/pages/DashboardPage.tsx): `decks.countDueTotal()` ile
  "Bugün tekrar: N kart → Çalış" küçük kart. (Tam stil redesign oturumuna bırakılır.)

## Hata yönetimi
- AI JSON parse başarısız / boş `cards` → toast "Kart üretilemedi, tekrar deneyin", kredi iade
  (useAiOperation `refundOnError`).
- Boş/çok kısa kaynak metin → üretim engellenir (uyarı).
- DB hataları → toast + güvenli geri dönüş; review hatasında kart sırada kalır.

## Test / doğrulama
- Test runner kurulu DEĞİL → `srs.ts` saf ve dikkatli yazılır; mantık spec'teki tabloyla
  elle doğrulanır. (Vitest eklemek bu işin kapsamı dışında.)
- `npm run build` (`tsc -b`) temiz olmalı. Mevcut tasarım dili korunur.

## Dosya listesi (özet)
**Yeni:** `src/lib/srs.ts`, `src/lib/decks.ts`, `src/pages/StudyDeckPage.tsx`,
`src/components/study/FlashcardReviewer.tsx` (+ 2 css module).
**Değişen:** `src/lib/ai.ts` (+generateFlashcards), `src/lib/aiOperation.ts` (AiAction),
`src/lib/creditConfig.ts` + `src/lib/constants.ts` (kredi), `src/App.tsx` (route),
`Navbar`/`BottomNav` (sekme), `DocumentsPage.tsx` + `StudyNotesPage.tsx` ("Kart üret"),
`DashboardPage.tsx` (widget).
**DB:** `apply_migration` → study_decks + flashcards + RLS + indeksler; `app_config` kredi satırı.
