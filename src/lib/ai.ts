/**
 * TransLingua — AI Servis Katmanı
 *
 * Bu modül, belge çevirisi, dil tespiti ve doküman soru-cevap
 * işlemleri için kullanılan özel AI motorumuza erişimi sağlar.
 *
 * NOT: AI motoru henüz bağlı değil. Bağlandığında buradaki
 * fonksiyonlar otomatik olarak devreye girecek.
 */

// Ortam değişkeninden API anahtarını oku
const AI_API_KEY = import.meta.env.VITE_AI_API_KEY;

// API uç noktası (AI bağlandığında güncellenecek)
const AI_API_URL = import.meta.env.VITE_AI_API_URL || '';

/** Temel AI yanıt yapısı */
interface AIResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

/**
 * Ham metin prompt'u AI motoruna gönderir ve yanıt döndürür.
 *
 * @param prompt - AI'a gönderilecek metin
 * @param systemInstruction - AI'ın nasıl davranacağını belirleyen sistem talimatı (opsiyonel)
 * @returns AI yanıt metni
 * @throws API bağlantı hatası veya geçersiz yanıt durumunda hata fırlatır
 */
export async function callAI(prompt: string, systemInstruction?: string): Promise<string> {
  // AI anahtarı tanımlı değilse demo modu mesajı döndür
  if (!AI_API_KEY || AI_API_KEY === 'YOUR_AI_API_KEY_HERE') {
    return generateDemoResponse(prompt);
  }

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
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
    const errText = await res.text();
    throw new Error(`AI API hatası (${res.status}): ${errText}`);
  }

  const data: AIResponse = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('AI boş yanıt döndürdü');
  return text;
}

/**
 * Demo modu: AI bağlı olmadığında anlamlı bir yanıt döndürür.
 * Gerçek API bağlandığında bu fonksiyon kullanılmaz.
 */
function generateDemoResponse(prompt: string): string {
  const preview = prompt.slice(0, 80).replace(/\n/g, ' ');
  return (
    `[Demo Modu] AI motorumuz yakında aktif olacak.\n\n` +
    `Şu an sistem entegrasyonu tamamlanıyor. Bu süreçte çeviri ve ` +
    `soru-cevap özellikleri geçici olarak devre dışıdır.\n\n` +
    `Gönderilen içerik özeti: "${preview}..."`
  );
}

/**
 * Bir belge metnini kaynak dilden Türkçe'ye çevirir.
 * Orijinal biçimlendirmeyi ve paragraf yapısını korur.
 *
 * @param text - Çevrilecek metin
 * @param sourceLang - Kaynak dil kodu (ör: "en", "ar")
 * @param targetLang - Hedef dil kodu (varsayılan: "tr")
 */
export async function translateDocument(
  text: string,
  sourceLang: string,
  targetLang: string = 'tr'
): Promise<string> {
  const systemPrompt = `Sen profesyonel bir belge çevirmensin. Aşağıdaki metni ${sourceLang} dilinden ${targetLang} diline çevir. Orijinal biçimlendirmeyi, paragraf yapısını ve anlamı koru. Sadece çevrilmiş metni yaz, açıklama ekleme.`;
  return callAI(text, systemPrompt);
}

/**
 * Verilen metnin dilini tespit eder.
 * ISO 639-1 dil kodu döndürür (ör: "en", "ar", "de").
 *
 * @param text - Dili tespit edilecek metin (ilk 500 karakter yeterli)
 * @returns İki harfli dil kodu (küçük harf)
 */
export async function detectLanguage(text: string): Promise<string> {
  const prompt = `Aşağıdaki metnin dilini tespit et. SADECE ISO 639-1 dil kodunu döndür (ör: "en", "ar", "de", "fr"). Metin:\n\n${text.slice(0, 500)}`;
  const result = await callAI(prompt);
  return result.trim().toLowerCase().slice(0, 2);
}

/**
 * Kullanıcının yüklediği belge hakkında sorduğu soruları yanıtlar.
 * Belge içeriğini bağlam olarak kullanır ve Türkçe yanıt verir.
 *
 * @param documentText - Referans alınacak belge metni
 * @param question - Kullanıcının sorusu
 */
export async function askAboutDocument(
  documentText: string,
  question: string
): Promise<string> {
  const systemPrompt = `Sen akıllı bir doküman asistanısın. Kullanıcı bir belge yükledi ve bu belge hakkında sorular soruyor. Türkçe yanıt ver, detaylı ve yardımsever ol. Aşağıdaki belge içeriğini bağlam olarak kullan.`;
  const prompt = `Belge İçeriği:\n${documentText.slice(0, 30000)}\n\n---\n\nKullanıcı Sorusu: ${question}`;
  return callAI(prompt, systemPrompt);
}
