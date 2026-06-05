# TransWordly — Özellik Yol Haritası

> "Ben TransWordly alayım, hepsi var" dedirtecek özellikler. Öğrenci + akademisyen
> kitlesi için **retention (günlük dönüş)**, **acquisition (wow)** ve
> **monetization (akademik güven)** ekseninde önceliklendirildi.
>
> Her özellik bağımsız bir oturumda uygulanacak şekilde planlandı. Sıra: P1 → P4.

## Mevcut mimari (referans — yeni oturumların hızlı bağlanması için)
- **Stack:** React 19 + Vite + TypeScript, CSS Modules, framer-motion, lucide-react.
- **Backend:** Supabase (Postgres + Storage `originals` + RLS) + Edge Functions.
  - AI: `ai-proxy` (Gemini 3.1 flash-lite, streaming SSE). Kod: [src/lib/ai.ts](../src/lib/ai.ts).
  - Kredi: `begin_ai_operation` → `claim_ai_call` → `refund_ai_operation` RPC akışı (atomik).
  - PDF: pdf-lib + backend PyMuPDF servisi ([src/lib/pdfWriter.ts](../src/lib/pdfWriter.ts)).
- **Tablolar (bilinen):** `documents`, `translations` (`translated_text={pages, overlay}`),
  `chat_messages`, `study_sessions`, `profiles` (kredi).
- **Önemli:** Canlı DB elle yönetiliyor; repo migration'ları güncel değil → şema
  değişikliklerini `apply_migration`/MCP ile dikkatle uygula, `db push` yapma.
- **AI dayanıklılık:** `streamOrFallback` + `fetchWithRetry` (QUIC retry) zaten mevcut;
  yeni AI fonksiyonları da `callGemini`/`streamOrFallback` üzerinden gitmeli ve
  `operationId` (kredi jetonu) taşımalı.

---

## P1 — Retention çekirdeği (günlük dönüş sağlayan)

### F1. Quiz + Flashcard → Aralıklı Tekrar (SRS / Anki tarzı)
**Amaç:** Tek başına günlük geri dönüş sebebi. En yüksek retention kaldıracı.
**Mantık / akış:**
1. Belge / ders notu / sohbetten "Kart üret" → AI soru-cevap & kavram kartları çıkarır.
2. Kartlar bir desteye (deck) kaydedilir; her kartın SRS durumu tutulur (SM-2: ease,
   interval, due_date, repetitions).
3. Kullanıcı "Bugün çalış" akışında due olan kartları görür → Kolay/Orta/Zor ile
   değerlendirir → bir sonraki due tarihi hesaplanır.
4. Dashboard'da "Bugün tekrar edilecek: N kart" widget'ı (→ dashboard redesign ile birleşir).
**Teknik plan:**
- `src/lib/ai.ts`: `generateFlashcards(source, opts)` — JSON çıktı `{cards:[{front,back,hint?,tag?}]}`,
  `callGemini` + `operationId`. (Mevcut `translateTextBlocks` JSON protokolünü örnek al.)
- `src/lib/srs.ts`: saf SM-2 zamanlayıcı (`review(card, grade) → {ease, interval, dueAt}`).
- Sayfa: `src/pages/StudyDeckPage.tsx` (`/study`), deck listesi + çalışma modu.
- Bileşen: `FlashcardReviewer.tsx` (flip animasyonu, klavye 1-2-3 derecelendirme).
**Veritabanı:** `study_decks(id,user_id,title,source_document_id?,created_at)`,
`flashcards(id,deck_id,user_id,front,back,hint,tag, ease,interval,repetitions,due_at,created_at)`.
RLS: `user_id = auth.uid()`.
**Kredi:** Kart üretimi 1 AI işlemi (begin_ai_operation `p_action='flashcards'`). Tekrar çalışması ücretsiz.
**Efor:** Orta-büyük. **Monetizasyon:** Ücretsizde deck/kart limiti, premium sınırsız + "AI tekrar açıklaması".

### F2. Dinleyerek Çalış (TTS / mini-podcast)
**Amaç:** "Yolda/işte çalışma" — büyük algılanan değer, düşük maliyetli MVP.
**Mantık / akış:** Çeviri, ders notu veya özet için "Dinle" → metin sese dönüşür; oynat/duraklat,
hız (0.75–2x), cümle vurgulama (karaoke), arkaplan oynatma.
**Teknik plan:**
- MVP: tarayıcı **Web Speech API** (`speechSynthesis`) — ücretsiz, anında, tr-TR sesi.
  `src/lib/tts.ts` (chunk'lara böl, sıradan oku, vurgulamayı `onboundary` ile yap).
- Bileşen: `AudioPlayer.tsx` — Documents/StudyNotes görünümüne entegre.
- V2 (premium): bulut TTS (Gemini TTS / ElevenLabs) → indirilebilir MP3 "podcast".
**Veritabanı:** MVP'de yok (anlık). V2: `audio_assets` (cache + indirme).
**Kredi:** MVP ücretsiz. Bulut TTS premium/krediye bağlı.
**Efor:** MVP küçük. **Monetizasyon:** Doğal sesler + MP3 indirme premium.

---

## P2 — Wow & yeni kullanıcı çekme (acquisition)

### F3. Seç-Sor (Highlight-to-Ask)
**Amaç:** Demo'da "vay" dedirten, satın aldıran özellik.
**Mantık / akış:** PDF/çeviri görünümünde metin seç → yanında baloncuk
("Açıkla / Çevir / Örnek ver / Soru üret") → seçim sohbete bağlam olarak gider.
**Teknik plan:**
- pdfjs **text layer** render et (şu an sayfa resim olarak basılıyor — seçilebilir metin katmanı gerekli)
  veya çeviri metin görünümünde `window.getSelection()` ile popover.
- Bileşen: `SelectionPopover.tsx`; aksiyonlar `streamDocumentChat`/`callGemini`'ye seçili metni iletir.
- Entegrasyon: `PDFOverlayViewer.tsx`, `SharedDocumentPage.tsx`, metin okuyucu.
**Kredi:** Her aksiyon 1 AI işlemi.
**Efor:** Orta (text layer en zor kısım). **Monetizasyon:** Sınırsız seç-sor premium.

### F4. Çoklu Belge Sohbeti (Proje / Klasör)
**Amaç:** Literatür taraması, tez yazımı — akademisyen için "olmazsa olmaz".
**Mantık / akış:** Birden çok PDF'i bir "projeye" ekle → tek sohbette hepsini konuştur,
karşılaştır, sentezle.
**Teknik plan:**
- `useChatSession` kapsamını `documentId` yerine `projectId` destekleyecek şekilde genişlet.
- MVP bağlam: seçili belgelerin metinlerini akıllı birleştir + truncate (mevcut `documentText` mantığı).
- V2: embedding tabanlı RAG (pgvector) — yalnızca ilgili parçalar bağlama girer (büyük kütüphaneler için).
**Veritabanı:** `projects(id,user_id,title,created_at)`,
`project_documents(project_id,document_id)`. `chat_messages`'a `project_id` kolonu ekle.
**Kredi:** Sohbet maliyeti mevcut akışla aynı.
**Efor:** Büyük (özellikle V2 RAG). **Monetizasyon:** Proje sayısı / belge sayısı premium limiti.

### F5. Tek Sayfalık Görsel Özet / Zihin Haritası
**Amaç:** Paylaşılabilir, viral, "çalışma görseli".
**Mantık / akış:** Belge → AI yapısal taslak (markdown başlık ağacı) → mindmap render → PNG/PDF indir.
**Teknik plan:**
- `src/lib/ai.ts`: `generateMindmap(text)` → iç içe markdown / JSON ağaç.
- Render: `markmap` veya `react-flow` (markmap daha hafif).
- "Görsel indir" (mevcut `downloadBytes` / canvas→png).
**Kredi:** 1 AI işlemi.
**Efor:** Orta. **Monetizasyon:** HD/markasız indirme premium.

---

## P3 — Akademik güven & monetizasyon

### F6. Kaynakça / Atıf Üretici + Entegrasyonlar
**Amaç:** Akademisyen/öğrenci için doğrudan iş değeri → ödeme isteği yüksek.
**Mantık / akış:** Belgedeki referansları çıkar → APA/MLA/IEEE biçimlendir → kopyala/dışa aktar.
**Teknik plan:**
- `src/lib/ai.ts`: `extractCitations(text, style)` → yapısal JSON (author, year, title, source).
- Biçimlendirici: `src/lib/citations.ts` (stil şablonları).
- V2: Zotero / Notion / Google Drive export (mevcut `exporters.ts` deseni).
**Kredi:** 1 AI işlemi.
**Efor:** Orta. **Monetizasyon:** Sınırsız + entegrasyon export premium.

### F7. Akademik Yazım Asistanı
**Amaç:** Parafraz, dil bilgisi, ton (tez/makale şablonları).
**Mantık / akış:** Metin yapıştır/yaz → "Akademikleştir / Parafraz / Dil bilgisi / Kısalt-uzat".
Tez, lab raporu, özet şablonları.
**Teknik plan:** Chat'e yeni mod veya `src/pages/WritePage.tsx`. `streamOrFallback` + sistem promptları.
**Kredi:** İşlem başına AI çağrısı.
**Efor:** Orta. **Monetizasyon:** Premium çekirdek aracı.

### F8. Gamification & İlerleme (Dashboard ile birleşir)
**Amaç:** Alışkanlık + günlük seri (streak) → retention çarpanı.
**Mantık / akış:** Çalışma serisi, rozetler, haftalık hedef, XP; "bugün X dakika çalıştın".
**Teknik plan:**
- `user_stats`/activity log (çeviri, sohbet, kart tekrarı olaylarını topla).
- Streak/XP hesabı (saf util) + dashboard widget'ları.
**Veritabanı:** `user_activity(id,user_id,type,ref_id,created_at)`, `user_stats(user_id,streak,longest_streak,xp,last_active)`.
**Efor:** Orta. **Monetizasyon:** Dolaylı (retention).

---

## P4 — Platform & erişim (sonra)
- **PWA / mobil:** offline kart çalışması, ana ekrana ekle. (PWA önce, native sonra.)
- **Tarayıcı uzantısı:** herhangi bir sayfa/PDF'te anında çeviri + seç-sor. (Ayrı repo.)
- **Çevrimiçi okuma modu:** iki dilli senkron kaydırmalı görünüm.

---

## Önerilen uygulama sırası
1. **Dashboard redesign** (zemin + F8 gamification widget'larına yer açar) — *ayrı oturum.*
2. **F1 Flashcard/SRS** — en yüksek retention.
3. **F2 TTS (MVP, Web Speech)** — hızlı kazanç.
4. **F3 Seç-Sor** — wow/acquisition.
5. **F4 Çoklu belge sohbeti (MVP)**.
6. **F6 Kaynakça** → **F7 Yazım asistanı** → **F5 Mindmap** → **F8 tam gamification**.
7. **P4** platform işleri.

## Her oturum için checklist
- [ ] Şema değişikliği gerekiyorsa: canlı DB elle yönetiliyor — `apply_migration` ile, RLS ekleyerek.
- [ ] AI fonksiyonu: `operationId` (kredi) taşı, `streamOrFallback`/`callGemini` kullan.
- [ ] Kredi maliyeti `creditConfig` + `begin_ai_operation` action'ına eklensin.
- [ ] `tsc -b` temiz; mevcut tasarım dili (CSS Modules + framer-motion) korunsun.
