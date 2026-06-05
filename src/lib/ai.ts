/**
 * TransLingua — AI Servis Katmanı (v4 — secure proxy)
 *
 * Tüm Gemini çağrıları Supabase Edge Function `ai-proxy` üzerinden gider.
 * API anahtarı artık taraf-istemciye gönderilmez — sadece sunucuda kalır.
 *
 * Özellikler:
 *  • Multimodal input: metin + görsel + PDF (hem sayısal hem taranmış)
 *  • Akıllı PDF modu: küçük/görsel-ağırlıklı PDF'ler doğrudan Gemini'ye gönderilir
 *  • Streaming (SSE) — kullanıcı yanıtı yazılır gibi görür
 *  • Chunk'lı paralel çeviri — 200 sayfa bile sorunsuz
 *  • Multi-turn sohbet geçmişi
 *  • Akademik format korunumu (formül, tablo, dipnot, şekil)
 */

import { supabase } from './supabase';

// Aktif modeller — edge function whitelist'iyle aynı olmalı.
// NOT: Maliyet nedeniyle Pro modeli KULLANILMIYOR; tüm işlemler Flash-Lite üzerinden gider.
// MODEL_PRO bilerek Flash-Lite'a eşitlendi → eski `_useProModel` çağrıları da Flash kullanır (güvenlik ağı).
const MODEL_FLASH = 'gemini-3.1-flash-lite';
const MODEL_PRO   = MODEL_FLASH;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const PROXY_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ai-proxy` : '';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(SUPABASE_ANON_KEY ? { 'apikey': SUPABASE_ANON_KEY } : {}),
  };
}

/**
 * Ağ-seviyesi hata tespiti (HTTP hatası DEĞİL — bağlantının hiç kurulamaması).
 * Chrome'un HTTP/3 (QUIC) bağlantısı koptuğunda fetch bir `TypeError` fırlatır
 * (ör. "Failed to fetch", net::ERR_QUIC_PROTOCOL_ERROR.QUIC_TOO_MANY_RTOS).
 * Bu tür hatalar sunucuya ulaşmadan oluştuğu için kredi harcanmaz → güvenle
 * tekrar denenebilir.
 */
function isNetworkError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === 'AbortError') return false;
  if (e instanceof TypeError) return true; // fetch ağ hataları TypeError olarak gelir
  const msg = ((e as Error)?.message ?? '').toLowerCase();
  return /failed to fetch|network|quic|err_|load failed|connection|stream/.test(msg);
}

/**
 * fetch + ağ hatasına dayanıklılık. Yalnızca AĞ hatalarında (bağlantı kurulamadı)
 * üstel beklemeyle tekrar dener; HTTP 4xx/5xx yanıtları olduğu gibi döner.
 * Abort (kullanıcı iptali) asla yeniden denenmez.
 */
async function fetchWithRetry(url: string, init: RequestInit, retries = 2): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      if ((init.signal as AbortSignal | undefined)?.aborted) throw e;
      if (!isNetworkError(e) || attempt === retries) throw e;
      lastErr = e;
      await new Promise(r => setTimeout(r, 600 * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

// Multimodal için boyut sınırı: 15 MB altı PDF'ler doğrudan Gemini'ye gönderilir
const MULTIMODAL_PDF_LIMIT = 15 * 1024 * 1024; // 15 MB

// Metin çıkarma yoğunluğu eşiği: sayfa başına ortalama bu karakterden azsa "görsel ağırlıklı"
const TEXT_DENSITY_THRESHOLD = 80; // karakter / sayfa

// Görsel modda işlenecek maksimum sayfa (üstü metin moduna düşer)
const MAX_VISUAL_PAGES = 40;

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
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
    safetyRatings?: Array<{ category: string; probability: string }>;
  }>;
  error?: { message?: string; code?: number };
  usageMetadata?: { totalTokenCount?: number };
}

/**
 * finishReason değerlendirmesi.
 *  • SAFETY / RECITATION → içerik engellendi, kullanılabilir metin YOK → fırlat.
 *  • MAX_TOKENS → yanıt kesildi AMA elde metin varsa kullanılabilir; bu durumda
 *    `hasContent=true` ile çağrılır ve fırlatılmaz (kısmi yanıt korunur).
 *    Metin yoksa (model tüm bütçeyi "düşünme"de harcadı) anlamlı hata ver.
 */
function checkFinishReason(reason?: string, hasContent = false) {
  if (reason === 'SAFETY') throw new Error('İçerik güvenlik filtresi tarafından engellendi. Farklı bir ifade deneyin.');
  if (reason === 'RECITATION') throw new Error('İçerik alıntı kısıtlamasına takıldı. Lütfen sorguyu değiştirin.');
  if (reason === 'MAX_TOKENS' && !hasContent) {
    throw new Error('Model çıktı üretmeden token sınırına ulaştı. Lütfen tekrar deneyin veya kaynağı küçültün.');
  }
}

/**
 * Gemini 3.x "düşünme" (thinking) seviyesi.
 * 'minimal' → düşünme neredeyse kapalı: en hızlı + en ucuz yanıt, çıktı token
 * bütçesi metne ayrılır. Çeviri/sohbet/not gibi doğrudan görevler için idealdir
 * (Google önerisi). Düşünme açık kalırsa hem gecikme artar hem de çıktı bütçesi
 * tükenip MAX_TOKENS ile boş yanıt dönebilir.
 */
export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

function buildGenerationConfig(
  temperature: number,
  maxOutputTokens: number,
  thinkingLevel?: ThinkingLevel,
): Record<string, unknown> {
  const cfg: Record<string, unknown> = { temperature, maxOutputTokens };
  if (thinkingLevel) cfg.thinkingConfig = { thinkingLevel };
  return cfg;
}

export function isAIAvailable(): boolean {
  return !!PROXY_URL;
}

// ─── Düşük seviyeli API çağrısı ─────────────────────────────────────────────
interface CallOpts {
  contents: AIMessage[];
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Gemini 3.x düşünme seviyesi (varsayılan: minimal — hız + maliyet için). */
  thinkingLevel?: ThinkingLevel;
  /** begin_ai_operation ile alınan operasyon jetonu — proxy kredi/limit zorlaması için zorunlu. */
  operationId?: string;
  /** Kullanıcı iptali — fetch'e iletilir (non-streaming çağrılar da iptal edilebilir). */
  signal?: AbortSignal;
}

async function callGemini({
  contents,
  systemInstruction,
  temperature = 0.25,
  maxOutputTokens = 16384,
  thinkingLevel = 'minimal',
  operationId,
  signal,
  _useProModel = false,
}: CallOpts & { _useProModel?: boolean }): Promise<string> {
  if (!isAIAvailable()) return demoResponse(contents);

  const body: Record<string, unknown> = {
    mode: 'generate',
    model: _useProModel ? MODEL_PRO : MODEL_FLASH,
    contents,
    generationConfig: buildGenerationConfig(temperature, maxOutputTokens, thinkingLevel),
    ...(operationId ? { operationId } : {}),
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const res = await fetchWithRetry(PROXY_URL, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    const msg = errData?.error || `HTTP ${res.status}`;
    if (res.status === 401) throw new Error('Oturum süresi dolmuş — tekrar giriş yapın.');
    if (res.status === 429) throw new Error('Çok fazla istek — birkaç saniye bekleyin.');
    if (res.status === 503) throw new Error('AI servisi geçici olarak kullanılamıyor — lütfen bekleyin.');
    throw new Error(`AI hatası (${res.status}): ${msg}`);
  }

  const data: AIResponseRaw = await res.json();
  if (data.error) throw new Error(`AI hatası: ${data.error.message || 'Bilinmeyen hata'}`);

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
  // Önce metni al; MAX_TOKENS olsa bile metin varsa kullanılabilir (kısmi yanıt korunur).
  checkFinishReason(candidate?.finishReason, !!text);
  if (!text) throw new Error('Model yanıt üretemedi. Lütfen soruyu farklı bir şekilde deneyin.');
  return text;
}

// ─── Streaming (SSE) ────────────────────────────────────────────────────────
export async function streamGemini(
  opts: CallOpts & {
    onChunk?: (delta: string, full: string) => void;
    signal?: AbortSignal;
    _useProModel?: boolean;
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
    mode: 'stream',
    model: opts._useProModel ? MODEL_PRO : MODEL_FLASH,
    contents: opts.contents,
    generationConfig: buildGenerationConfig(
      opts.temperature ?? 0.25,
      opts.maxOutputTokens ?? 16384,
      opts.thinkingLevel ?? 'minimal',
    ),
    ...(opts.operationId ? { operationId: opts.operationId } : {}),
  };
  if (opts.systemInstruction) {
    body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
  }

  const res = await fetchWithRetry(PROXY_URL, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    if (res.status === 401) throw new Error('Oturum süresi dolmuş — tekrar giriş yapın.');
    if (res.status === 429) throw new Error('Çok fazla istek — birkaç saniye bekleyin.');
    if (res.status === 503) throw new Error('AI servisi geçici olarak kullanılamıyor — lütfen bekleyin.');
    const errJson = await res.json().catch(() => null);
    const errMsg = errJson?.error || '';
    throw new Error(`AI stream hatası (${res.status})${errMsg ? ': ' + errMsg : ''}`);
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
        const candidate = parsed.candidates?.[0];
        const piece = candidate?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
        if (piece) {
          full += piece;
          opts.onChunk?.(piece, full);
        }
        // Son chunk'ta finishReason kontrolü — MAX_TOKENS olsa bile elde metin
        // varsa fırlatma (kısmi yanıt korunur), yalnızca SAFETY/RECITATION'da kes.
        if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
          checkFinishReason(candidate.finishReason, !!full);
        }
      } catch (e) {
        if ((e as Error)?.message?.includes('filtresi') || (e as Error)?.message?.includes('kısıtlama') || (e as Error)?.message?.includes('uzun')) throw e;
        // Yarım JSON — atla
      }
    }
  }

  if (!full) throw new Error('Model yanıt üretemedi. Lütfen soruyu farklı bir şekilde deneyin.');
  return full;
}

/**
 * Streaming dene; ağ/boş-yanıt hatalarında non-streaming `callGemini`'ye düş.
 * QUIC (HTTP/3) bağlantısı uzun streaming isteklerinde sık koptuğu için bu
 * fallback, kullanıcıya hata göstermek yerine yanıtı tek seferde getirir.
 * Kullanıcı iptali ve güvenlik/alıntı filtreleri yeniden denenmez — fırlatılır.
 */
async function streamOrFallback(
  opts: CallOpts & {
    onChunk?: (delta: string, full: string) => void;
    _useProModel?: boolean;
  },
): Promise<string> {
  if (opts.onChunk) {
    try {
      const result = await streamGemini(opts);
      if (result) return result;
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (
        opts.signal?.aborted || err instanceof DOMException ||
        msg.includes('İptal') || msg.includes('filtresi') || msg.includes('kısıtlama')
      ) throw err;
      // Ağ hatası / boş yanıt → non-streaming fallback'e geç (kredi bütçesi kapsar).
    }
  }
  return callGemini(opts);
}

// ─── Demo modu ──────────────────────────────────────────────────────────────
function demoResponse(contents: AIMessage[]): string {
  const last = contents[contents.length - 1];
  const txt = last?.parts.map(p => p.text ?? '').join(' ') ?? '';
  return (
    `**Demo Modu** — Supabase yapılandırması eksik.\n\n` +
    `\`VITE_SUPABASE_URL\` ve \`VITE_SUPABASE_ANON_KEY\` ortam değişkenleri ayarlandığında ` +
    `gerçek AI yanıtları burada görünecek.\n\n` +
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
    try {
      const result = await translateFileMultimodal(file, opts);
      if (result) return { result, mode: 'multimodal' };
    } catch {
      // Multimodal başarısız (model desteklemiyor / dosya büyük) → metin moduna düş
    }
  }

  // Metin yoğun PDF veya multimodal fallback — chunk çevirisi
  const textToTranslate = extractedText || `PDF dosyası: ${file.name}`;
  const result = await translateLongText(textToTranslate, opts);
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
1. Hedef dil: ${target} — doğal, akıcı ve akademik ${target} kullan. Kelimesi kelimesine değil, anlamı kavrayıp yeniden ifade ederek çevir.
2. Teknik terimler: İlk geçişte orijinal terimi parantez içinde ver (ör: "sinyal iletimi (signal transduction)"). Türkçe karşılığı yerleşmemiş terimlerde özgün terimi koruyup parantezde kısa açıklama ver.
3. Özel isimler, marka adları ve kısaltmalar (DNA, AI, NATO vb.) olduğu gibi bırak
4. Formüller: LaTeX notasyonunu koru ($ ... $ veya $$ ... $$)
5. Tablolar: Markdown tablosu formatını koru
6. Alıntılar / dipnotlar / kaynakça: Format değiştirmeden çevir
7. Şekil/Tablo başlıkları: "Şekil 1:", "Tablo 2:" gibi Türkçe etiketle başlat
8. Bölüm başlıkları: # ## ### Markdown başlık hiyerarşisiyle koru
9. EKSİKSİZLİK: Hiçbir cümleyi, başlığı veya ifadeyi atlamadan çevir. Kaynakta İngilizce kalmış hiçbir cümle bırakma — kısa/belirsiz ifadeleri bile en yakın anlamıyla Türkçeleştir.
10. Tutarlılık: Aynı terimi belge boyunca aynı şekilde çevir.

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

// ─── 2b) Görsel (sayfa-görüntü) tabanlı çeviri ──────────────────────────────

/**
 * Her PDF sayfasını JPEG görüntüsü olarak Gemini Pro'ya gönderir.
 * Grafikler, formüller ve özel semboller görsel olarak korunur.
 * pageDataURLs: pdfRenderer.renderPageToDataURL ile üretilen data URL'ler (JPEG).
 * MAX_VISUAL_PAGES aşılırsa metin moduna düşülmesi için caller yönetir.
 */
export async function translatePDFByPages(
  pageDataURLs: string[],
  opts: TranslateOpts,
): Promise<string[]> {
  const { sourceLang, targetLang = 'tr', onProgress, signal } = opts;
  const total = pageDataURLs.length;
  const results: string[] = new Array(total);
  let completed = 0;

  const systemPrompt = buildTranslationSystemPrompt(sourceLang, targetLang);

  const userPromptTemplate = (lang: string) =>
    `Bu PDF sayfasındaki TÜM metni ${lang === 'tr' ? 'Türkçeye' : lang + ' diline'} çevir.\n` +
    `• Matematiksel formüller: LaTeX notasyonuyla koru ($ ... $ veya $$ ... $$)\n` +
    `• Tablolar: Markdown tablosu formatında koru\n` +
    `• Başlık hiyerarşisini # ## ### ile koru\n` +
    `• Grafik, diyagram veya şekil varsa "[Şekil: kısa açıklama]" etiketi bırak\n` +
    `• Sadece çevirilmiş Markdown çıktısı ver, başka yorum ekleme`;

  async function translatePage(index: number) {
    if (signal?.aborted) throw new Error('Çeviri iptal edildi.');
    const dataURL = pageDataURLs[index];
    const [header, b64] = dataURL.split(',');
    const mimeType = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';

    const result = await callGemini({
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: b64 } },
          { text: userPromptTemplate(targetLang) },
        ],
      }],
      systemInstruction: systemPrompt,
      temperature: 0.15,
      maxOutputTokens: 8192,
      _useProModel: false,
    });

    results[index] = result;
    completed++;
    onProgress?.({ chunk: completed, totalChunks: total, pct: Math.round((completed / total) * 100) });
  }

  // 4 paralel worker
  const queue = pageDataURLs.map((_, i) => i);
  const poolWorker = async () => {
    while (queue.length) {
      const i = queue.shift()!;
      await translatePage(i);
    }
  };
  const pool: Promise<void>[] = [];
  for (let k = 0; k < Math.min(CONCURRENCY, total); k++) pool.push(poolWorker());
  await Promise.all(pool);

  return results;
}

export { MAX_VISUAL_PAGES };

/** Geriye dönük uyumluluk */
export async function translateDocument(
  text: string,
  sourceLang: string,
  targetLang = 'tr',
): Promise<string> {
  return translateLongText(text, { sourceLang, targetLang });
}

// ─── 3) Dil tespiti ─────────────────────────────────────────────────────────
export async function detectLanguage(text: string, operationId?: string): Promise<string> {
  const prompt =
    `Aşağıdaki metnin dilini tespit et. SADECE ISO 639-1 dil kodunu yaz (ör: en, de, fr, ar, zh). ` +
    `Açıklama, noktalama veya başka karakter ekleme.\n\nMetin:\n${text.slice(0, 600)}`;
  try {
    const result = await callGemini({
      contents: [userText(prompt)],
      temperature: 0,
      maxOutputTokens: 8,
      operationId,
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
  operationId?: string,
  maxOutputTokens = 16384,
): Promise<string> {
  const inlineParts: AIPart[] = [];
  for (const f of files) {
    inlineParts.push({ inlineData: await fileToInline(f) });
  }
  const contents: AIMessage[] = [{
    role: 'user',
    parts: [...inlineParts, { text: prompt }],
  }];
  return streamOrFallback({ contents, systemInstruction, onChunk, maxOutputTokens, operationId });
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
  operationId?: string,
): Promise<string> {
  const systemPrompt =
    `Sen TransWordly'nin öğrenci asistanısın. Akademik sorulara doğrudan, net ve sade yanıt ver.

Kesin kurallar:
- Emoji kullanma. Hiç.
- "Merhaba", "Tabii ki", "Yardımcı olmaktan memnuniyet duyarım" gibi kalıp girişler yapma
- Soruya hemen gir — giriş cümlesi, karşılama veya özet giriş paragrafı yazma
- Markdown kullan ama gereksiz başlık zinciri oluşturma; başlık yalnızca gerçekten bölüm varsa kullan
- Liste yerine düz metin yeterliyse liste yapma
- Konuşma geçmişini hatırla; önceki sorulara referans verebilirsin
- Türkçe yaz`;

  const contents: AIMessage[] = [];

  // Belge bağlamını conversation turn olarak ekle (system instruction değil)
  // Bu yaklaşım tüm Gemini modelleriyle uyumludur
  if (documentText) {
    const truncated = documentText.slice(0, 50_000);
    contents.push({
      role: 'user',
      parts: [{ text: `Aşağıdaki belgeyi analiz et. Soru-cevap sırasında bu belgeyi referans alacaksın:\n\n---\n${truncated}\n---` }],
    });
    contents.push({
      role: 'model',
      parts: [{ text: 'Belgeyi okudum ve analiz ettim. Belge hakkındaki sorularınızı yanıtlamaya hazırım.' }],
    });
  }

  // Konuşma geçmişini ekle
  for (const t of history) {
    contents.push({
      role: t.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: t.attachments?.length
        ? [...t.attachments.map(a => ({ inlineData: a })), { text: t.content }]
        : [{ text: t.content }],
    });
  }

  // Yeni mesaj + ekler
  const newParts: AIPart[] = [];
  for (const f of attachments) newParts.push({ inlineData: await fileToInline(f) });
  newParts.push({ text: newMessage });
  contents.push({ role: 'user', parts: newParts });

  // Streaming dene; ağ/boş-yanıt hatalarında non-streaming'e düş (streamOrFallback).
  return streamOrFallback({
    contents,
    systemInstruction: systemPrompt,
    maxOutputTokens: 8192,
    onChunk,
    signal,
    operationId,
  });
}

// ─── Retry yardımcısı ────────────────────────────────────────────────────────

/**
 * Geçici API hatalarında (rate limit, timeout, ağ sorunu) üstel beklemeyle tekrar dener.
 * Abort, güvenlik filtresi ve alıntı hataları yeniden denenmez — hemen fırlatılır.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  baseDelayMs = 1500,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = (e as Error)?.message ?? '';
      if (
        msg.includes('İptal') || msg.includes('filtresi') ||
        msg.includes('kısıtlama') || e instanceof DOMException
      ) throw e;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

// ─── 7) Sayfa metin bloklarını konumlu olarak çevir ─────────────────────────

/**
 * Bir PDF sayfasındaki metin bloklarını sıralı olarak çevirir.
 * Bloklar numaralı liste olarak gönderilir, aynı sırada çeviri alınır.
 * Formüller, semboller ve sayılar aynen korunur.
 * Tek API çağrısıyla tüm sayfa işlenir (verimli + bağlam korunur).
 */
const DOMAIN_HINTS: Record<string, string> = {
  medical:     'Alan: Tıp / Sağlık. İlaç adları, hastalık terimleri ve anatomi kelimeleri doğru çevrilmeli.',
  legal:       'Alan: Hukuk. Hukuki terimler ve mevzuat referansları korunmalı.',
  math:        'Alan: Matematik / İstatistik. Matematiksel kavramlar ve semboller doğru çevrilmeli.',
  engineering: 'Alan: Mühendislik / Teknik. Teknik terimler doğru çevrilmeli.',
  cs:          'Alan: Bilgisayar Bilimi / Yazılım. Teknik terimler çevrilmeli; kod, API adları ve değişken isimleri değiştirilmez.',
  economics:   'Alan: İktisat / Finans. Ekonomik terimler doğru çevrilmeli.',
  general:     '',
};

export async function translateTextBlocks(
  blocks: string[],
  sourceLang: string,
  targetLang = 'tr',
  signal?: AbortSignal,
  domain = 'general',
  glossary?: Record<string, string>,
  operationId?: string,
): Promise<string[]> {
  if (blocks.length === 0) return [];

  // 60'tan fazla blok varsa gruplara böl
  const BATCH = 60;
  if (blocks.length > BATCH) {
    const results: string[] = [];
    for (let i = 0; i < blocks.length; i += BATCH) {
      const batch = blocks.slice(i, i + BATCH);
      const translated = await translateTextBlocks(batch, sourceLang, targetLang, signal, domain, glossary, operationId);
      results.push(...translated);
    }
    return results;
  }

  const targetName = targetLang === 'tr' ? 'Türkçe' : targetLang;
  const domainHint = DOMAIN_HINTS[domain] ?? '';

  // ── ANAHTARLI-JSON protokolü ───────────────────────────────────────────────
  // Bloklar {"0":"...","1":"..."} biçiminde gönderilir; model AYNI anahtarlarla
  // bir JSON nesnesi döndürür. Bu, "numaralı liste"ye göre çok daha sağlamdır:
  //  • Model sırayı/numarayı KAYDIRAMAZ (eşleme anahtarla yapılır).
  //  • Tekrarlı değerler ("Vanguard" iki hücrede) ayrı anahtar olduğu için
  //    birleştirilmez/atlanmaz.
  //  • Kısa tablo hücrelerinde yanlış hücreye yazma sorunu ortadan kalkar.
  const inputObj: Record<string, string> = {};
  blocks.forEach((b, i) => { inputObj[String(i)] = b; });

  const glossarySection =
    glossary && Object.keys(glossary).length > 0
      ? `\nTerim sözlüğü (daima bu karşılıkları kullan):\n${Object.entries(glossary).map(([k, v]) => `- "${k}" → "${v}"`).join('\n')}`
      : '';

  const prompt = [
    `Aşağıda anahtar→metin eşlemesi içeren bir JSON nesnesi var. Her metni ${targetName} diline çevir.`,
    domainHint,
    glossarySection,
    `Çıktı KURALLARI (kesin):
- SADECE geçerli bir JSON nesnesi döndür. Markdown, açıklama, kod bloğu YOK.
- Girişteki TÜM anahtarları AYNEN koru; anahtar ekleme/çıkarma/sıra değiştirme YOK.
- Her anahtarın değeri, o metnin ${targetName} çevirisi olsun.
- Anlamı koru, doğal çevir (kelime kelime değil). Tek kelimelik/etiket metinler de çevrilmeli.
- Özel adlar/marka/kurum (ör. "Vanguard", "S&P 500"), sayılar, tarihler, formüller,
  birimler (mg, Hz), URL/DOI olduğu gibi kalsın.
- Bir metin zaten ${targetName} ise veya çevrilemezse aynen geri ver.`,
    '',
    JSON.stringify(inputObj),
  ].filter(Boolean).join('\n');

  const result = await callGemini({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    temperature: 0.05,
    maxOutputTokens: 8192,
    operationId,
  });

  // JSON nesnesini yanıttan çıkar (kod bloğu/önek olsa bile)
  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const out = blocks.map((orig, i) => {
        const v = parsed[String(i)];
        const s = typeof v === 'string' ? v.trim() : '';
        return s || orig;   // anahtar eksik/boşsa orijinali koru
      });
      return out;
    } catch {
      // JSON parse başarısız → aşağıdaki numaralı-liste fallback'ine düş
    }
  }

  // ── Fallback: model JSON döndürmediyse numaralı-liste denemesi ──────────────
  // (Eski protokolün dayanıklı parse'ı; nadiren tetiklenir.)
  const out = new Array(blocks.length).fill('');
  let curIdx = -1;
  for (const raw of result.split('\n')) {
    const m = raw.match(/^\s*(\d+)[.)]\s?(.*)$/);
    if (m) {
      const n = parseInt(m[1], 10) - 1;
      const inRange = n >= 0 && n < blocks.length;
      const isNext = n === curIdx + 1;
      if (inRange && (isNext || (out[n] === '' && n > curIdx))) {
        curIdx = n;
        out[curIdx] = m[2].trim();
        continue;
      }
    }
    if (curIdx >= 0 && raw.trim()) {
      out[curIdx] = (out[curIdx] + ' ' + raw.trim()).trim();
    }
  }
  return out.map((t, i) => (t && t.trim()) || blocks[i]);
}

// ─── 7b) Sayfa görüntüsü + metin blokları → tüm çeviri (text + visual) ─────

export interface PageVisionTranslation {
  /** PDF.js'ten çıkan blokların çevirisi (aynı sırada) */
  textTranslations: string[];
  /** Grafik/şekil İÇİNDE tespit edilen yeni metinler */
  visualBlocks: Array<{
    x: number; y: number; w: number; h: number;
    fontSize: number; original: string; translated: string;
  }>;
}

/**
 * Sayfanın hem metnini hem GÖRSEL İÇİ yazılarını çevirir.
 *
 * İKİ AŞAMALI yaklaşım (güvenilirlik için):
 *  Faz 1 — Metin çevirisi: translateTextBlocks() ile (görsel gerektirmez, çok güvenilir)
 *  Faz 2 — Görsel metin tespiti: sadece görüntü + JSON çıktı (Gemini JSON'a daha iyi uyar)
 *
 * Faz 2 başarısız olursa çeviri durmuyor — sadece görsel bloklar boş kalır.
 */
export async function translatePageWithVision(
  pageImageDataURL: string,
  textBlocks: Array<{ text: string; x: number; y: number; w: number; h: number; fontSize: number }>,
  sourceLang: string,
  targetLang = 'tr',
  signal?: AbortSignal,
  domain = 'general',
  glossary?: Record<string, string>,
): Promise<PageVisionTranslation> {

  // ── Faz 1: Metin çevirisi (görsel yok, basit numara listesi) ─────────────
  let textTranslations: string[] = textBlocks.map(b => b.text);
  if (textBlocks.length > 0) {
    try {
      textTranslations = await withRetry(
        () => translateTextBlocks(textBlocks.map(b => b.text), sourceLang, targetLang, signal, domain, glossary),
        2,
        2000,
      );
    } catch (e) {
      const msg = (e as Error)?.message ?? '';
      if (msg.includes('İptal')) throw e;
      console.warn('Metin çevirisi başarısız — orijinal metin kullanılıyor:', msg);
    }
  }

  if (signal?.aborted) throw new Error('İptal edildi');

  // ── Faz 2: Grafik/görsel içi metin tespiti (best-effort, JSON çıktı) ─────
  const visualBlocks: PageVisionTranslation['visualBlocks'] = [];
  try {
    const detected = await withRetry(
      () => detectVisualTextInPage(pageImageDataURL, sourceLang, targetLang),
      1, // görsel tespit için sadece 1 retry
      2000,
    );
    visualBlocks.push(...detected);
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    if (msg.includes('İptal')) throw e;
    // Görsel tespit başarısız → önemli değil, devam et
  }

  return { textTranslations, visualBlocks };
}

/**
 * Sayfa görüntüsündeki grafik/diyagram/şekil İÇİNDEKİ metin etiketlerini tespit eder.
 * JSON çıktı formatı kullanır (Gemini JSON'a özel metin formatından çok daha iyi uyar).
 */
async function detectVisualTextInPage(
  pageImageDataURL: string,
  sourceLang: string,
  targetLang: string,
): Promise<PageVisionTranslation['visualBlocks']> {
  const [header, b64] = pageImageDataURL.split(',');
  const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const targetName = targetLang === 'tr' ? 'Türkçe' : targetLang;

  const prompt =
    `Look at this PDF page. Find text labels that appear INSIDE charts, graphs, diagrams, or figures.\n` +
    `Include: axis labels, legend text, bar/pie labels, diagram annotations, chart titles inside figures.\n` +
    `Exclude: regular paragraph text, section headings, captions below figures, page numbers.\n\n` +
    `Translate each found label from ${sourceLang} to ${targetName}.\n\n` +
    `Return ONLY valid JSON — no markdown, no explanation, nothing else:\n` +
    `{"items":[{"x":0.1,"y":0.3,"w":0.2,"h":0.03,"fs":9,"original":"X Axis","translated":"X Ekseni"}]}\n\n` +
    `Coordinate system: x,y = top-left corner as 0-1 ratio of page size, w = width ratio, h = height ratio.\n` +
    `If no visual text found, return: {"items":[]}`;

  const result = await callGemini({
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data: b64 } },
        { text: prompt },
      ],
    }],
    temperature: 0.05,
    maxOutputTokens: 2048,
    _useProModel: false,
  });

  // JSON'u yanıt içinden çıkar (markdown code block olsa bile)
  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  let parsed: { items?: unknown[] };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }

  const items: PageVisionTranslation['visualBlocks'] = [];
  for (const item of (parsed.items ?? [])) {
    if (!item || typeof item !== 'object') continue;
    const { x, y, w, h, fs, original, translated } = item as Record<string, unknown>;
    if (
      typeof x === 'number' && x >= 0 && x <= 1 &&
      typeof y === 'number' && y >= 0 && y <= 1 &&
      typeof w === 'number' && w > 0 && w <= 1 &&
      original && translated
    ) {
      items.push({
        x,
        y,
        w: Math.min(w, 1 - x),
        h: Math.max(typeof h === 'number' ? h : 0.02, 0.01),
        fontSize: typeof fs === 'number' ? fs : 10,
        original: String(original),
        translated: String(translated),
      });
    }
  }
  return items;
}

/**
 * Tek bir görseldeki metinleri tespit eder ve çevirir.
 * detectVisualTextInPage'den farklı olarak, izole bir görseli analiz eder → daha yüksek doğruluk.
 */
export async function detectImageText(
  imageBase64: string,
  imageMimeType: string,
  sourceLang: string,
  targetLang = 'tr',
  operationId?: string,
): Promise<Array<{
  x: number; y: number; w: number; h: number;
  fontSize: number;
  original: string;
  translated: string;
  textColor: [number, number, number];
}>> {
  const targetName = targetLang === 'tr' ? 'Türkçe' : targetLang;

  const prompt =
    `Analyze this image carefully. Find ALL text that appears in it — including axis labels, titles, legends, annotations, watermarks, captions, and any other readable text.\n\n` +
    `For each text element found:\n` +
    `1. Identify its exact bounding box as x, y, w, h ratios (0-1, relative to image dimensions, top-left origin)\n` +
    `2. Identify the approximate font size in pixels\n` +
    `3. Identify the text color as [r, g, b] (0-255)\n` +
    `4. Translate it from ${sourceLang} to ${targetName}\n\n` +
    `Return ONLY valid JSON — no markdown, no explanation:\n` +
    `{"items":[{"x":0.1,"y":0.3,"w":0.2,"h":0.03,"fs":14,"original":"Sample","translated":"Örnek","color":[0,0,0]}]}\n\n` +
    `If no text found, return: {"items":[]}`;

  const result = await callGemini({
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: imageMimeType, data: imageBase64 } },
        { text: prompt },
      ],
    }],
    temperature: 0.05,
    maxOutputTokens: 4096,
    _useProModel: false,
    operationId,
  });

  // JSON'u yanıt içinden çıkar (markdown code block olsa bile)
  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  let parsed: { items?: unknown[] };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }

  const items: Array<{
    x: number; y: number; w: number; h: number;
    fontSize: number; original: string; translated: string;
    textColor: [number, number, number];
  }> = [];

  for (const item of (parsed.items ?? [])) {
    if (!item || typeof item !== 'object') continue;
    const { x, y, w, h, fs, original, translated, color } = item as Record<string, unknown>;
    if (
      typeof x === 'number' && x >= 0 && x <= 1 &&
      typeof y === 'number' && y >= 0 && y <= 1 &&
      typeof w === 'number' && w > 0 && w <= 1 &&
      original && translated
    ) {
      // Renk: [r,g,b] 0-255, varsayılan siyah
      let textColor: [number, number, number] = [0, 0, 0];
      if (Array.isArray(color) && color.length >= 3 &&
          typeof color[0] === 'number' && typeof color[1] === 'number' && typeof color[2] === 'number') {
        textColor = [
          Math.max(0, Math.min(255, Math.round(color[0]))),
          Math.max(0, Math.min(255, Math.round(color[1]))),
          Math.max(0, Math.min(255, Math.round(color[2]))),
        ];
      }

      items.push({
        x,
        y,
        w: Math.min(w, 1 - x),
        h: Math.max(typeof h === 'number' ? h : 0.02, 0.01),
        fontSize: typeof fs === 'number' ? fs : 10,
        original: String(original),
        translated: String(translated),
        textColor,
      });
    }
  }
  return items;
}

/**
 * Belgeyi özetle — kısa, madde madde Türkçe özet üretir.
 */
export async function summarizeDocument(
  text: string,
  signal?: AbortSignal,
  onChunk?: (delta: string, full: string) => void,
  operationId?: string,
): Promise<string> {
  const truncated = text.slice(0, 48_000);
  const systemPrompt =
    `Sen bir akademik özet asistanısın. Verilen belgeyi:
• 6-10 maddeli, net ve bilgilendirici Türkçe özetle
• Her madde tek cümle veya kısa paragraf olsun
• Önemli kavramlar, bulgular ve sonuçlara odaklan
• Başlık ekle: ## Özet
• Markdown kullan ama gereksiz iç içe başlık yapma`;

  const contents: AIMessage[] = [{
    role: 'user',
    parts: [{ text: `Şu belgeyi özetle:\n\n${truncated}` }],
  }];

  return streamOrFallback({ contents, systemInstruction: systemPrompt, maxOutputTokens: 2048, onChunk, signal, operationId });
}

// ─── Akademik Yazım Asistanı (F7) ────────────────────────────────────────────

/** Yazım asistanı modları. */
export type WriteMode = 'academic' | 'paraphrase' | 'grammar' | 'shorten' | 'expand';

export interface RewriteOptions {
  operationId?: string;
  signal?: AbortSignal;
  onChunk?: (delta: string, full: string) => void;
}

const WRITE_PROMPTS: Record<WriteMode, string> = {
  academic:
    `Sen bir akademik yazım editörüsün. Verilen metni akademik Türkçeye dönüştür:
• Resmî, nesnel ve akademik bir ton kullan; günlük/konuşma dilini kaldır.
• Anlamı koru; yeni bilgi UYDURMA.
• Akıcı, net ve tutarlı cümleler kur.
• SADECE düzenlenmiş metni döndür — açıklama, başlık, ön söz ekleme.`,
  paraphrase:
    `Sen bir parafraz uzmanısın. Verilen metni özgün anlamını koruyarak yeniden yaz:
• Aynı anlamı farklı kelime ve cümle yapısıyla ifade et (intihalden kaçınacak şekilde).
• Bilgi ekleme/çıkarma; tonu makul ölçüde koru.
• SADECE parafraz edilmiş metni döndür — başka hiçbir şey yazma.`,
  grammar:
    `Sen bir Türkçe dil bilgisi ve yazım denetmenisin. Verilen metni düzelt:
• Yazım, noktalama, dil bilgisi ve anlatım bozukluklarını gider.
• Üslubu ve anlamı OLABILDIĞINCE koru; gereksiz yere yeniden yazma.
• SADECE düzeltilmiş metni döndür — değişiklik listesi/açıklama ekleme.`,
  shorten:
    `Sen bir editörsün. Verilen metni özünü kaybetmeden kısalt:
• Temel fikirleri ve önemli ayrıntıları koru; tekrar ve dolgu ifadeleri at.
• Yaklaşık %40-60 daha kısa, akıcı ve net bir metin üret.
• SADECE kısaltılmış metni döndür.`,
  expand:
    `Sen bir akademik yazım asistanısın. Verilen metni geliştirerek genişlet:
• Mevcut fikirleri açıklamalar, geçiş cümleleri ve uygun ayrıntılarla derinleştir.
• Anlamı koru; UYDURMA bilgi/iddia ekleme, yalnızca var olanı netleştir/zenginleştir.
• SADECE genişletilmiş metni döndür.`,
};

/**
 * Akademik yazım asistanı: verilen metni seçilen moda göre yeniden yazar (streaming).
 * Kredi akışı çağıran tarafta useAiOperation ile sarılır; operationId taşınır.
 */
export async function rewriteText(
  text: string,
  mode: WriteMode,
  opts: RewriteOptions = {},
): Promise<string> {
  const { operationId, signal, onChunk } = opts;
  const truncated = text.slice(0, 24_000);
  const contents: AIMessage[] = [{
    role: 'user',
    parts: [{ text: `Aşağıdaki metni işle:\n\n${truncated}` }],
  }];
  return streamOrFallback({
    contents,
    systemInstruction: WRITE_PROMPTS[mode],
    maxOutputTokens: 4096,
    onChunk,
    signal,
    operationId,
  });
}

// ─── Flashcard üretimi (F1 — Aralıklı Tekrar) ────────────────────────────────

/** Kart tipleri: klasik çevir-kart, çoktan seçmeli, doğru/yanlış. */
export type FlashcardType = 'classic' | 'mcq' | 'truefalse';
/** Üretim isteği: tek bir tip ya da karışık ('mixed'). */
export type FlashcardGenType = FlashcardType | 'mixed';

export interface GeneratedCard {
  /** Kart tipi — reviewer buna göre render eder. */
  type: FlashcardType;
  /** Soru / kavram (mcq+tf için: soru veya önerme). */
  front: string;
  /** Cevap (classic) ya da açıklama (mcq/tf). */
  back: string;
  hint?: string;
  tag?: string;
  /** mcq: 2-5 şık (doğru şık dahil, karışık sırada). */
  options?: string[];
  /** mcq: doğru şıkkın metni · truefalse: 'true' | 'false'. */
  answer?: string;
}

export interface GenerateFlashcardsOptions {
  /** Üretilecek hedef kart sayısı (model yaklaşık uyar). Varsayılan 12. */
  count?: number;
  /** Üretilecek kart tipi. Varsayılan 'classic'. */
  cardType?: FlashcardGenType;
  operationId?: string;
  signal?: AbortSignal;
}

/** Diziyi yerinde olmayan kopyayla karıştırır (Fisher-Yates) — doğru şık hep başta olmasın. */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function typeInstruction(cardType: FlashcardGenType): string {
  const classic =
    `• "classic" kart: {"type":"classic","front":"kısa soru/kavram","back":"net kısa cevap","hint":"(opsiyonel)","tag":"(opsiyonel tek kelime)"}`;
  const mcq =
    `• "mcq" (çoktan seçmeli): {"type":"mcq","front":"soru","options":["A","B","C","D"],"answer":"doğru şıkkın TAM metni (options içinden biri)","back":"doğru cevabın kısa açıklaması","tag":"(opsiyonel)"}
  - Tam 4 şık üret. Şıklar kısa ve birbirinden net ayrılsın; yalnızca biri doğru olsun. "answer" değeri options dizisindeki bir elemanla birebir aynı olmalı.`;
  const tf =
    `• "truefalse" (doğru/yanlış): {"type":"truefalse","front":"doğru ya da yanlış olabilecek bir önerme","answer":"true" veya "false","back":"neden doğru/yanlış olduğunun kısa açıklaması","tag":"(opsiyonel)"}
  - Önermelerin yarısı doğru yarısı yanlış olsun. "answer" sadece "true" ya da "false".`;

  if (cardType === 'classic') return `TÜM kartlar "classic" tipinde olsun.\n${classic}`;
  if (cardType === 'mcq') return `TÜM kartlar "mcq" tipinde olsun.\n${mcq}`;
  if (cardType === 'truefalse') return `TÜM kartlar "truefalse" tipinde olsun.\n${tf}`;
  // mixed
  return `Kartları üç tipten KARIŞIK üret (yaklaşık dengeli dağıt): classic, mcq, truefalse.\n${classic}\n${mcq}\n${tf}`;
}

/**
 * Verilen metinden Türkçe flashcard kartları üretir (klasik / çoktan seçmeli / doğru-yanlış / karma).
 * JSON protokolü (detectImageText/translateTextBlocks deseni): model SADECE geçerli JSON döndürür.
 */
export async function generateFlashcards(
  text: string,
  opts: GenerateFlashcardsOptions = {},
): Promise<GeneratedCard[]> {
  const { count = 12, cardType = 'classic', operationId, signal } = opts;
  const truncated = text.slice(0, 48_000);
  if (truncated.trim().length < 40) return [];

  const systemPrompt =
    `Sen bir öğrenme asistanısın ve verilen materyalden aralıklı tekrar (flashcard) kartları üretiyorsun.
KURALLAR:
• Türkçe üret. Materyalin dili farklı olsa bile kartlar Türkçe olsun.
• Her kart önemli bir kavramı/olguyu test etsin; bağlama bağımlı ("yukarıdaki", "bu metinde") ifade kullanma.
• En önemli ${count} civarı kavrama odaklan. Önemsiz ayrıntıdan kart üretme.
• SADECE geçerli JSON döndür. Markdown, açıklama, kod bloğu YOK.

KART TİPLERİ:
${typeInstruction(cardType)}

ÇIKTI FORMATI:
{"cards":[ ...yukarıdaki şemalara uygun kart nesneleri... ]}
Kart üretilemiyorsa: {"cards":[]}`;

  const contents: AIMessage[] = [{
    role: 'user',
    parts: [{ text: `Şu materyalden flashcard kartları üret:\n\n${truncated}` }],
  }];

  const result = await callGemini({
    contents,
    systemInstruction: systemPrompt,
    temperature: 0.3,
    maxOutputTokens: 8192,
    operationId,
    signal,
  });

  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  let parsed: { cards?: unknown[] };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }

  const cards: GeneratedCard[] = [];
  for (const item of parsed.cards ?? []) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const front = typeof rec.front === 'string' ? rec.front.trim() : '';
    if (!front) continue;
    const rawType = typeof rec.type === 'string' ? rec.type.toLowerCase() : 'classic';
    const hint = typeof rec.hint === 'string' && rec.hint.trim() ? rec.hint.trim() : undefined;
    const tag = typeof rec.tag === 'string' && rec.tag.trim() ? rec.tag.trim().slice(0, 40) : undefined;
    const common = { front, ...(hint ? { hint } : {}), ...(tag ? { tag } : {}) };

    if (rawType === 'mcq') {
      const opts = Array.isArray(rec.options)
        ? rec.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0).map(o => o.trim())
        : [];
      const answer = typeof rec.answer === 'string' ? rec.answer.trim() : '';
      // Geçersiz mcq (yetersiz şık / cevap şıklarda yok) → atla.
      if (opts.length < 2 || !answer) continue;
      const uniq = Array.from(new Set(opts));
      const correct = uniq.find(o => o === answer) ?? uniq.find(o => o.toLowerCase() === answer.toLowerCase());
      if (!correct) continue;
      const back = typeof rec.back === 'string' && rec.back.trim() ? rec.back.trim() : `Doğru cevap: ${correct}`;
      cards.push({ ...common, type: 'mcq', options: shuffle(uniq), answer: correct, back });
    } else if (rawType === 'truefalse') {
      const a = typeof rec.answer === 'string' ? rec.answer.trim().toLowerCase() : '';
      const isTrue = ['true', 'doğru', 'dogru', 'd', 'evet'].includes(a);
      const isFalse = ['false', 'yanlış', 'yanlis', 'y', 'hayır', 'hayir'].includes(a);
      if (!isTrue && !isFalse) continue;
      const ans = isTrue ? 'true' : 'false';
      const back = typeof rec.back === 'string' && rec.back.trim()
        ? rec.back.trim()
        : (ans === 'true' ? 'Bu önerme doğru.' : 'Bu önerme yanlış.');
      cards.push({ ...common, type: 'truefalse', answer: ans, back });
    } else {
      const back = typeof rec.back === 'string' ? rec.back.trim() : '';
      if (!back) continue;
      cards.push({ ...common, type: 'classic', back });
    }
  }
  return cards;
}

// ─── 6) Ders Notu Üretimi (multimodal + metin kaynak birleştirme) ────────────

export type StudyNoteLang = 'tr' | 'en';

export interface StudyNoteTextSource {
  /** Kaynağın görünen adı (belge adı vb.) — modele başlık olarak verilir. */
  label: string;
  /** Kaynağın düz metni (çeviri metni veya çıkarılmış orijinal metin). */
  text: string;
}

export interface GenerateStudyNotesOptions {
  /** Yüklenen görsel/PDF dosyaları (multimodal okuma). */
  files?: File[];
  /** Mevcut belge/çevirilerden gelen metin kaynakları (birleştirilir). */
  textSources?: StudyNoteTextSource[];
  subject?: string;
  /** Çıktı dili — Türkçe (varsayılan) veya İngilizce. */
  language?: StudyNoteLang;
  onChunk?: (delta: string, full: string) => void;
  operationId?: string;
}

/** Ders notu üretimi. Hem yüklenen dosyalardan hem mevcut metin kaynaklarından
 *  (ör. çevrilmiş belgeler) birleşik not çıkarır. Çıktı dili seçilebilir. */
export async function generateStudyNotes(opts: GenerateStudyNotesOptions): Promise<string> {
  const { files = [], textSources = [], subject, language = 'tr', onChunk, operationId } = opts;
  const langName = language === 'en' ? 'İngilizce (English)' : 'Türkçe';
  const subjectLine = subject ? `Ders/Konu: **${subject}**` : '';

  // Metin kaynaklarını tek bağlam halinde birleştir (kaynak başlıklarıyla).
  const mergedText = textSources
    .filter(s => s.text && s.text.trim())
    .map((s, i) => `### Kaynak ${i + 1}: ${s.label}\n${s.text.slice(0, 60_000)}`)
    .join('\n\n---\n\n');

  const systemPrompt =
    `Sen deneyimli bir eğitim asistanısın ve üniversite/lise öğrencileri için ders notu hazırlıyorsun.
ÇIKTI DİLİ: ${langName} — TÜM notu bu dilde yaz.
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
${langName} yaz. Birden fazla kaynak varsa bilgileri TEK bütünleşik nota harmanla (kaynakları tek tek tekrarlama). Öğrencinin anlayacağı sadelikte ama akademik doğrulukta ol.`;

  const sourceCount = files.length + textSources.filter(s => s.text?.trim()).length;
  const promptLines = [
    `${sourceCount} kaynaktan birleşik bir ders notu hazırla.`,
    files.length ? `Yüklenen görsel/PDF'lerdeki TÜM yazıları, formülleri ve şemaları oku.` : '',
    mergedText ? `Aşağıdaki metin kaynaklarını da nota dahil et:\n\n${mergedText}` : '',
    `Konuyu anlamayı kolaylaştıracak şekilde yapılandır. Çıktı tek bir Markdown not olsun.`,
  ].filter(Boolean);
  const prompt = promptLines.join('\n\n');

  // Metin yoğun olabileceği için çıktı bütçesini yükselt.
  const maxOut = 32768;

  // Dosya yoksa (sadece metin kaynak) düz metin çağrısı; varsa multimodal.
  if (files.length === 0) {
    const contents: AIMessage[] = [{ role: 'user', parts: [{ text: prompt }] }];
    return streamOrFallback({ contents, systemInstruction: systemPrompt, onChunk, maxOutputTokens: maxOut, operationId });
  }
  return processFilesMultimodal(files, prompt, systemPrompt, onChunk, operationId, maxOut);
}

/**
 * Üretilmiş bir ders notunu (Markdown) hedef dile çevirir — TR↔EN.
 * Bilingual indirme için kullanılır. Markdown yapısı, LaTeX formülleri ve
 * tablolar korunur. Akış (stream) destekler.
 */
export async function translateStudyNotes(
  markdown: string,
  targetLang: StudyNoteLang,
  onChunk?: (delta: string, full: string) => void,
  operationId?: string,
): Promise<string> {
  const targetName = targetLang === 'en' ? 'İngilizce (English)' : 'Türkçe';
  const systemPrompt =
    `Sen akademik bir çevirmensin. Verilen ders notunu ${targetName} diline çevir.
KURALLAR:
- Markdown yapısını AYNEN koru (başlıklar #, listeler, tablolar, > alıntılar).
- LaTeX formüllerini ($...$, $$...$$) ve sembolleri DEĞİŞTİRME.
- Kod, değişken adları, özel adlar ve sayılar olduğu gibi kalsın.
- Sadece çevrilmiş Markdown'ı döndür; açıklama ekleme.`;
  const contents: AIMessage[] = [{ role: 'user', parts: [{ text: markdown }] }];
  return streamOrFallback({ contents, systemInstruction: systemPrompt, onChunk, maxOutputTokens: 32768, temperature: 0.1, operationId });
}

// ─── 7) Profil tabanlı otomatik sözlük üretimi ───────────────────────────────

export interface GlossarySuggestion {
  source_term: string;
  target_term: string;
  domain: string;
}

const PROFESSION_LABELS: Record<string, string> = {
  student: 'üniversite öğrencisi', researcher: 'akademik araştırmacı',
  medical: 'sağlık profesyoneli', legal: 'hukuk profesyoneli',
  engineer: 'mühendis/teknisyen', business: 'iş/finans profesyoneli',
  teacher: 'öğretmen/akademisyen', other: 'genel kullanıcı',
};

const USE_CASE_LABELS: Record<string, string> = {
  academic: 'akademik makaleler ve tezler', medical: 'tıbbi belgeler ve raporlar',
  legal: 'hukuki sözleşmeler ve kararlar', engineering: 'teknik belgeler ve standartlar',
  business: 'iş ve finans belgeleri', general: 'genel belgeler',
};

export async function generateGlossarySuggestions(
  profession: string,
  useCase: string,
  nativeLanguage: string,
  operationId?: string,
): Promise<GlossarySuggestion[]> {
  const profLabel = PROFESSION_LABELS[profession] ?? profession;
  const ucLabel   = USE_CASE_LABELS[useCase] ?? useCase;
  const langLabel = nativeLanguage === 'tr' ? 'Türkçe' : nativeLanguage === 'en' ? 'İngilizce' : nativeLanguage;

  const systemPrompt = `Sen uzman bir çeviri terminoloji asistanısın. Kullanıcının mesleki geçmişine ve çeviri ihtiyaçlarına göre kısmen teknik, kısmen akademik bir sözlük listesi üretiyorsun.`;

  const userPrompt = `Kullanıcı profili:
- Meslek: ${profLabel}
- Çeviri amacı: ${ucLabel}
- Hedef dil: ${langLabel} (kaynak dil genellikle İngilizce)

Bu profile uygun, çeviride tutarlılık sağlayacak 15 İngilizce→${langLabel} terim çifti öner.
Yanıtını SADECE aşağıdaki JSON formatında ver, başka hiçbir şey ekleme:

[
  {"source": "term in English", "target": "${langLabel} karşılık", "domain": "alan_kodu"},
  ...
]

Domain kodları: medical, legal, engineering, academic, business, general, cs, math

Terimleri ${profLabel} için gerçekten yararlı, sık kullanılan akademik/teknik kelimeler seç.`;

  const contents: AIMessage[] = [{ role: 'user', parts: [{ text: userPrompt }] }];

  try {
    const raw = await callGemini({ contents, systemInstruction: systemPrompt, maxOutputTokens: 1024, operationId });
    // Extract JSON array from response
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]) as Array<{ source: string; target: string; domain: string }>;
    return parsed.map(item => ({
      source_term: item.source?.trim() ?? '',
      target_term: item.target?.trim() ?? '',
      domain: item.domain?.trim() ?? 'general',
    })).filter(e => e.source_term && e.target_term);
  } catch {
    return [];
  }
}
