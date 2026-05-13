/**
 * TransLingua — AI Servis Katmanı (v3)
 *
 * Gemini API üzerinden yürütülen tüm AI iş akışları.
 *
 * Özellikler:
 *  • Multimodal input: metin + görsel + PDF (hem sayısal hem taranmış)
 *  • Akıllı PDF modu: küçük/görsel-ağırlıklı PDF'ler doğrudan Gemini'ye gönderilir
 *  • Streaming (SSE) — kullanıcı yanıtı yazılır gibi görür
 *  • Chunk'lı paralel çeviri — 200 sayfa bile sorunsuz
 *  • Multi-turn sohbet geçmişi
 *  • Akademik format korunumu (formül, tablo, dipnot, şekil)
 */

const AI_API_KEY = import.meta.env.VITE_AI_API_KEY as string | undefined;
const AI_API_URL = (import.meta.env.VITE_AI_API_URL as string | undefined) || '';

// Streaming URL: :generateContent → :streamGenerateContent
const STREAM_URL = AI_API_URL.replace(':generateContent', ':streamGenerateContent');

// Multimodal için boyut sınırı: 15 MB altı PDF'ler doğrudan Gemini'ye gönderilir
const MULTIMODAL_PDF_LIMIT = 15 * 1024 * 1024; // 15 MB

// Metin çıkarma yoğunluğu eşiği: sayfa başına ortalama bu karakterden azsa "görsel ağırlıklı"
const TEXT_DENSITY_THRESHOLD = 80; // karakter / sayfa

// ─── Tipler ─────────────────────────────────────────────────────────────────
export type AIMessageRole = 'user' | 'model';

export interface AIPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export interface AIMessage {
  role: AIMessageRole;
  parts: AIPart[];
}

interface AIResponseRaw {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  error?: { message?: string; code?: number };
  usageMetadata?: { totalTokenCount?: number };
}

export function isAIAvailable(): boolean {
  return !!(AI_API_KEY && AI_API_KEY !== 'YOUR_AI_API_KEY_HERE' && AI_API_URL);
}

// ─── Düşük seviyeli API çağrısı ─────────────────────────────────────────────
interface CallOpts {
  contents: AIMessage[];
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

async function callGemini({
  contents,
  systemInstruction,
  temperature = 0.25,
  maxOutputTokens = 16384,
}: CallOpts): Promise<string> {
  if (!isAIAvailable()) return demoResponse(contents);

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { temperature, maxOutputTokens },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const res = await fetch(`${AI_API_URL}?key=${AI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    const msg = errData?.error?.message || `HTTP ${res.status}`;
    throw new Error(`AI API hatası: ${msg}`);
  }

  const data: AIResponseRaw = await res.json();
  if (data.error) throw new Error(`AI API hatası: ${data.error.message || 'Bilinmeyen hata'}`);

  const text =
    data.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
  if (!text) throw new Error('AI boş yanıt döndürdü. Lütfen tekrar deneyin.');
  return text;
}

// ─── Streaming (SSE) ────────────────────────────────────────────────────────
export async function streamGemini(
  opts: CallOpts & {
    onChunk?: (delta: string, full: string) => void;
    signal?: AbortSignal;
  },
): Promise<string> {
  if (!isAIAvailable()) {
    const fake = demoResponse(opts.contents);
    if (opts.onChunk) {
      let buf = '';
      for (const ch of fake) {
        buf += ch;
        opts.onChunk(ch, buf);
        await new Promise(r => setTimeout(r, 6));
      }
    }
    return fake;
  }

  const body: Record<string, unknown> = {
    contents: opts.contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.25,
      maxOutputTokens: opts.maxOutputTokens ?? 16384,
    },
  };
  if (opts.systemInstruction) {
    body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
  }

  const url = `${STREAM_URL}?alt=sse&key=${AI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => '');
    throw new Error(`AI stream hatası: ${res.status} — ${txt.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const ev of events) {
      const line = ev.trim();
      if (!line.startsWith('data:')) continue;
      const json = line.slice(5).trim();
      if (json === '[DONE]') continue;
      try {
        const parsed: AIResponseRaw = JSON.parse(json);
        const piece =
          parsed.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
        if (piece) {
          full += piece;
          opts.onChunk?.(piece, full);
        }
      } catch {
        // Yarım JSON — atla
      }
    }
  }

  if (!full) throw new Error('AI boş yanıt döndürdü. Lütfen tekrar deneyin.');
  return full;
}

// ─── Demo modu ──────────────────────────────────────────────────────────────
function demoResponse(contents: AIMessage[]): string {
  const last = contents[contents.length - 1];
  const txt = last?.parts.map(p => p.text ?? '').join(' ') ?? '';
  return (
    `**Demo Modu** — AI motoru yapılandırılmamış.\n\n` +
    `\`VITE_AI_API_KEY\` ve \`VITE_AI_API_URL\` ortam değişkenleri ayarlandığında ` +
    `gerçek yanıtlar burada görünecek.\n\n` +
    `Gönderilen içerik: "${txt.slice(0, 100).replace(/\n/g, ' ')}..."`
  );
}

// ─── Yardımcılar ────────────────────────────────────────────────────────────
const userText = (text: string): AIMessage => ({ role: 'user', parts: [{ text }] });

/** File → base64 (Gemini inlineData için) */
async function fileToInline(file: File): Promise<{ mimeType: string; data: string }> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return {
    mimeType: file.type || 'application/octet-stream',
    data: btoa(binary),
  };
}

// ─── 1) Akıllı PDF çevirisi ─────────────────────────────────────────────────

/**
 * PDF çevirisi için akıllı mod seçimi:
 *
 * A) Multimodal mod (küçük veya görsel-ağırlıklı PDF):
 *    PDF dosyası doğrudan Gemini'ye gönderilir. Model hem metni hem
 *    görselleri (diyagram, formül, tablo, taranmış sayfa) okur ve çevirir.
 *    Koşul: file.size < 15MB VE metinYoğunluğu < eşik
 *
 * B) Metin chunk modu (büyük veya metin-yoğun PDF):
 *    pdfjs ile çıkarılan metin 10K'lık parçalara bölünür,
 *    4 paralel worker ile çevrilir.
 */
export async function translatePDFSmart(
  file: File,
  extractedText: string,
  pageCount: number,
  opts: TranslateOpts,
): Promise<{ result: string; mode: 'multimodal' | 'text' }> {
  const avgCharsPerPage = pageCount > 0 ? extractedText.length / pageCount : 0;
  const useMultimodal =
    file.size < MULTIMODAL_PDF_LIMIT &&
    avgCharsPerPage < TEXT_DENSITY_THRESHOLD;

  if (useMultimodal) {
    // Görsel ağırlıklı veya taranmış PDF — doğrudan Gemini'ye gönder
    const result = await translateFileMultimodal(file, opts);
    return { result, mode: 'multimodal' };
  }

  // Metin yoğun PDF — chunk çevirisi
  const result = await translateLongText(extractedText, opts);
  return { result, mode: 'text' };
}

/** Küçük PDF'i doğrudan Gemini multimodal olarak çevir (metin + görsel) */
async function translateFileMultimodal(
  file: File,
  opts: TranslateOpts,
): Promise<string> {
  const { sourceLang, targetLang = 'tr', onProgress, signal } = opts;

  onProgress?.({ chunk: 0, totalChunks: 1, pct: 5 });

  const inline = await fileToInline(file);
  onProgress?.({ chunk: 0, totalChunks: 1, pct: 15 });

  const systemPrompt = buildTranslationSystemPrompt(sourceLang, targetLang);
  const userPrompt =
    `Bu PDF belgesinin TÜMÜNÜ ${targetLang === 'tr' ? 'Türkçeye' : targetLang + ' diline'} çevir.\n` +
    `• Metin içeriğini çevir\n` +
    `• Tablolar varsa Markdown tablosu olarak koru\n` +
    `• Formüller varsa LaTeX notasyonuyla ($ ... $) göster\n` +
    `• Görseller/şekiller için [Şekil N: kısa açıklama] etiketi ekle\n` +
    `• Başlık hiyerarşisini # ## ### ile koru\n` +
    `Sadece çevirilmiş Markdown'ı yaz, başka yorum ekleme.`;

  const contents: AIMessage[] = [{
    role: 'user',
    parts: [{ inlineData: inline }, { text: userPrompt }],
  }];

  let result: string;
  if (onProgress) {
    let lastPct = 15;
    result = await streamGemini({
      contents,
      systemInstruction: systemPrompt,
      maxOutputTokens: 32768,
      signal,
      onChunk: (_delta, full) => {
        // Tahmini ilerleme: çıktı uzunluğuna göre 15→95 arası
        const est = Math.min(95, 15 + Math.floor(full.length / 200));
        if (est > lastPct) {
          lastPct = est;
          onProgress({ chunk: 0, totalChunks: 1, pct: est });
        }
      },
    });
  } else {
    result = await callGemini({
      contents,
      systemInstruction: systemPrompt,
      maxOutputTokens: 32768,
    });
  }

  onProgress?.({ chunk: 1, totalChunks: 1, pct: 100 });
  return result;
}

/** Akademik çeviri için sistem promptu (tüm modlarda ortak) */
function buildTranslationSystemPrompt(sourceLang: string, targetLang: string): string {
  const target = targetLang === 'tr' ? 'Türkçe' : targetLang;
  return `Sen profesyonel bir akademik çevirmensin. Görevin ${sourceLang} dilindeki belgeleri ${target} diline çevirmek.

ÇEVİRİ KURALLARI:
1. Hedef dil: ${target} — doğal, akıcı ve akademik Türkçe kullan
2. Teknik terimler: İlk geçişte orijinal terimi parantez içinde ver (ör: "sinyal iletimi (signal transduction)")
3. Özel isimler, marka adları ve kısaltmalar (DNA, AI, NATO vb.) olduğu gibi bırak
4. Formüller: LaTeX notasyonunu koru ($ ... $ veya $$ ... $$)
5. Tablolar: Markdown tablosu formatını koru
6. Alıntılar / dipnotlar / kaynakça: Format değiştirmeden çevir
7. Şekil/Tablo başlıkları: "Şekil 1:", "Tablo 2:" gibi Türkçe etiketle başlat
8. Bölüm başlıkları: # ## ### Markdown başlık hiyerarşisiyle koru

FORMAT:
- Sadece Markdown çıktı üret
- Hiçbir açıklama, not veya yorum ekleme
- Orijinal yapıyı ve sırayı koru`;
}

// ─── 2) Metin chunk çevirisi (büyük/metin-yoğun PDF'ler) ────────────────────
const CHUNK_SIZE = 10_000; // karakter — ~2.5K token, kalite/hız dengesi
const CONCURRENCY = 4;    // paralel Gemini çağrısı

/** Büyük metni paragraf sınırlarında akıllıca böler */
export function chunkText(text: string, max = CHUNK_SIZE): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + max, text.length);
    if (end < text.length) {
      const half = i + max * 0.5;
      const para = text.lastIndexOf('\n\n', end);
      const sent = Math.max(
        text.lastIndexOf('. ', end),
        text.lastIndexOf('? ', end),
        text.lastIndexOf('! ', end),
        text.lastIndexOf('.\n', end),
      );
      const sp = text.lastIndexOf(' ', end);
      end = para > half ? para : sent > half ? sent + 1 : sp > half ? sp : end;
    }
    const chunk = text.slice(i, end).trim();
    if (chunk) chunks.push(chunk);
    i = end;
  }
  return chunks;
}

export interface TranslateOpts {
  sourceLang: string;
  targetLang?: string;
  glossary?: Record<string, string>;
  onProgress?: (info: { chunk: number; totalChunks: number; pct: number }) => void;
  signal?: AbortSignal;
}

/** Uzun metni paralel chunk'larla çevirir — 200 sayfa bile desteklenir */
export async function translateLongText(text: string, opts: TranslateOpts): Promise<string> {
  const { sourceLang, targetLang = 'tr', glossary, onProgress, signal } = opts;
  const chunks = chunkText(text);
  const totalChunks = chunks.length;

  const glossaryStr =
    glossary && Object.keys(glossary).length
      ? `\n\nSabit çeviri sözlüğü (kesinlikle uy):\n${Object.entries(glossary)
          .map(([k, v]) => `- "${k}" → "${v}"`)
          .join('\n')}`
      : '';

  const systemPrompt = buildTranslationSystemPrompt(sourceLang, targetLang) + glossaryStr;

  const results: string[] = new Array(totalChunks);
  let completed = 0;

  async function worker(index: number) {
    if (signal?.aborted) throw new Error('Çeviri iptal edildi.');
    results[index] = await callGemini({
      contents: [userText(chunks[index])],
      systemInstruction: systemPrompt,
      temperature: 0.15,  // çeviri için düşük yaratıcılık = daha tutarlı
      maxOutputTokens: 16384,
    });
    completed++;
    onProgress?.({
      chunk: completed,
      totalChunks,
      pct: Math.round((completed / totalChunks) * 100),
    });
  }

  // Promise havuzu
  const queue = chunks.map((_, i) => i);
  const poolWorker = async () => {
    while (queue.length) {
      const i = queue.shift()!;
      await worker(i);
    }
  };
  const pool: Promise<void>[] = [];
  for (let k = 0; k < Math.min(CONCURRENCY, totalChunks); k++) pool.push(poolWorker());
  await Promise.all(pool);

  return results.join('\n\n');
}

/** Geriye dönük uyumluluk */
export async function translateDocument(
  text: string,
  sourceLang: string,
  targetLang = 'tr',
): Promise<string> {
  return translateLongText(text, { sourceLang, targetLang });
}

// ─── 3) Dil tespiti ─────────────────────────────────────────────────────────
export async function detectLanguage(text: string): Promise<string> {
  const prompt =
    `Aşağıdaki metnin dilini tespit et. SADECE ISO 639-1 dil kodunu yaz (ör: en, de, fr, ar, zh). ` +
    `Açıklama, noktalama veya başka karakter ekleme.\n\nMetin:\n${text.slice(0, 600)}`;
  try {
    const result = await callGemini({
      contents: [userText(prompt)],
      temperature: 0,
      maxOutputTokens: 8,
    });
    return result.trim().toLowerCase().replace(/[^a-z]/g, '').slice(0, 2);
  } catch {
    return 'en'; // tespit başarısız → varsayılan İngilizce
  }
}

// ─── 4) Multimodal dosya işleme (genel) ─────────────────────────────────────
export async function processFilesMultimodal(
  files: File[],
  prompt: string,
  systemInstruction?: string,
  onChunk?: (delta: string, full: string) => void,
): Promise<string> {
  const inlineParts: AIPart[] = [];
  for (const f of files) {
    inlineParts.push({ inlineData: await fileToInline(f) });
  }
  const contents: AIMessage[] = [{
    role: 'user',
    parts: [...inlineParts, { text: prompt }],
  }];
  if (onChunk) {
    return streamGemini({ contents, systemInstruction, onChunk, maxOutputTokens: 16384 });
  }
  return callGemini({ contents, systemInstruction, maxOutputTokens: 16384 });
}

// ─── 5) AI Sohbet (multi-turn, streaming) ───────────────────────────────────
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  attachments?: { mimeType: string; data: string }[];
}

export async function streamDocumentChat(
  history: ChatTurn[],
  newMessage: string,
  documentText: string | null,
  attachments: File[] = [],
  onChunk?: (delta: string, full: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  // Belge bağlamı — büyük belgeler için son 60K karakter (yeterince büyük pencere)
  const docContext = documentText
    ? `\n\n---\nKULLANICININ BELGESİ (çeviri / not metni):\n${documentText.slice(0, 60_000)}\n---`
    : '';

  const systemPrompt =
    `Sen TransLingua'nın akıllı öğrenci asistanısın. Öğrencilere akademik konularda yardımcı oluyorsun.

DAVRANIŞIN:
• Konuşma geçmişini hatırlıyorsun ve önceki sorulara referans verebilirsin
• Açıklamalarını somut, anlaşılır ve örnek destekli yap
• Teknik terimleri açıklayarak kullan
• Gerektiğinde adım adım çöz, formül veya şema öner
• Sadece "evet/hayır" değil; nedenini ve kaynağını da belirt
• Türkçe yanıt ver, Markdown kullan (başlık, madde, **kalın**, tablo, \`\`\` kod)${docContext}`;

  // Geçmişi Gemini formatına dönüştür
  const contents: AIMessage[] = history.map(t => ({
    role: t.role === 'assistant' ? ('model' as const) : ('user' as const),
    parts: t.attachments?.length
      ? [...t.attachments.map(a => ({ inlineData: a })), { text: t.content }]
      : [{ text: t.content }],
  }));

  // Yeni mesaj + ekler
  const newParts: AIPart[] = [];
  for (const f of attachments) newParts.push({ inlineData: await fileToInline(f) });
  newParts.push({ text: newMessage });
  contents.push({ role: 'user', parts: newParts });

  if (onChunk) {
    return streamGemini({
      contents,
      systemInstruction: systemPrompt,
      maxOutputTokens: 8192,
      onChunk,
      signal,
    });
  }
  return callGemini({ contents, systemInstruction: systemPrompt, maxOutputTokens: 8192 });
}

// ─── 6) Ders Notu Üretimi (multimodal, öğrenci odaklı) ──────────────────────
export async function generateStudyNotes(
  files: File[],
  subject?: string,
  _title?: string,
  onChunk?: (delta: string, full: string) => void,
): Promise<string> {
  const subjectLine = subject ? `Ders/Konu: **${subject}**` : '';

  const systemPrompt =
    `Sen deneyimli bir eğitim asistanısın ve üniversite/lise öğrencileri için ders notu hazırlıyorsun.
${subjectLine}

MATERYALİ ANLAMA:
• Tahta fotoğrafı, slayt, kitap sayfası, el yazısı veya PDF olabilir
• Tüm metni, formülleri, şemaları, diyagramları ve tabloları oku
• El yazısı varsa dikkatle deşifre et
• Formülleri LaTeX notasyonuyla yaz ($ ... $)

DERS NOTU FORMATI (Markdown):
# [Konu Başlığı]

## Temel Kavramlar
- Her kavramı madde halinde açıkla
- **Kalın** ile anahtar terimleri vurgula
- Gerekirse alt maddelerle detaylandır

## Formüller ve Tanımlar
| Sembol | Açıklama |
|--------|----------|
| ... | ... |

$$formül$$

## Konu Anlatımı
- Konuyu adım adım, örnek vererek açıkla
- Sezgisel açıklamalar ekle ("Bunu şöyle düşünebilirsiniz...")

## Önemli Noktalar
> Ezber edilmesi gereken kritik bilgiler burada

## Özet
5-7 maddede konunun özeti

## Pratik Sorular
Her soru için:
**S:** Soru metni
**C:** Cevap

(3-5 soru — kolay, orta, zor karışık)

---
Türkçe yaz. Öğrencinin anlayacağı sadelikte ama akademik doğrulukta ol.`;

  const prompt =
    `${files.length} kaynaktan ders notu hazırla. ` +
    `Görsellerdeki TÜM yazıları, formülleri ve şemaları oku ve not haline getir. ` +
    `Konuyu anlamayı kolaylaştıracak şekilde yapılandır.`;

  return processFilesMultimodal(files, prompt, systemPrompt, onChunk);
}
