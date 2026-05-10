import { supabase } from './supabase';

const AI_MODE = import.meta.env.VITE_AI_MODE || '';
const AI_API_KEY = import.meta.env.VITE_AI_API_KEY;
const AI_API_URL = import.meta.env.VITE_AI_API_URL || '';

type AIMode = 'demo' | 'direct' | 'supabase';

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: {
    message?: string;
    code?: number;
  };
}

interface AIProxyResponse {
  text?: string;
  error?: string;
}

function isDirectAIAvailable(): boolean {
  return !!(AI_API_KEY && AI_API_KEY !== 'YOUR_AI_API_KEY_HERE' && AI_API_URL);
}

function resolveAIMode(): AIMode {
  if (AI_MODE === 'supabase' || AI_MODE === 'direct' || AI_MODE === 'demo') {
    return AI_MODE;
  }
  return isDirectAIAvailable() ? 'direct' : 'demo';
}

function buildGeminiBody(prompt: string, systemInstruction?: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  return body;
}

async function callSupabaseAI(prompt: string, systemInstruction?: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<AIProxyResponse>('ai-proxy', {
    body: { prompt, systemInstruction },
  });

  if (error) {
    throw new Error(`AI proxy hatası: ${error.message}`);
  }

  if (data?.error) {
    throw new Error(`AI proxy hatası: ${data.error}`);
  }

  if (!data?.text) {
    throw new Error('AI proxy boş yanıt döndürdü');
  }

  return data.text;
}

async function callDirectGemini(prompt: string, systemInstruction?: string): Promise<string> {
  const res = await fetch(`${AI_API_URL}?key=${AI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildGeminiBody(prompt, systemInstruction)),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    const errMsg = errData?.error?.message || `HTTP ${res.status}`;
    throw new Error(`AI API hatası (${res.status}): ${errMsg}`);
  }

  const data: GeminiResponse = await res.json();

  if (data.error) {
    throw new Error(`AI API hatası: ${data.error.message || 'Bilinmeyen hata'}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('AI boş yanıt döndürdü');
  return text;
}

export async function callAI(prompt: string, systemInstruction?: string): Promise<string> {
  const mode = resolveAIMode();

  if (mode === 'demo') {
    return generateDemoResponse(prompt);
  }

  try {
    if (mode === 'supabase') {
      return await callSupabaseAI(prompt, systemInstruction);
    }

    if (!isDirectAIAvailable()) {
      return generateDemoResponse(prompt);
    }

    return await callDirectGemini(prompt, systemInstruction);
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error('AI servisine bağlanılamadı. İnternet bağlantınızı kontrol edin.');
    }
    throw err;
  }
}

function generateDemoResponse(prompt: string): string {
  const preview = prompt.slice(0, 80).replace(/\n/g, ' ');
  return (
    `[Demo Modu] AI motorumuz yakında aktif olacak.\n\n` +
    `Şu an sistem entegrasyonu tamamlanıyor. Bu süreçte çeviri ve ` +
    `soru-cevap özellikleri geçici olarak devre dışıdır.\n\n` +
    `Gönderilen içerik özeti: "${preview}..."`
  );
}

export async function translateDocument(
  text: string,
  sourceLang: string,
  targetLang: string = 'tr'
): Promise<string> {
  const systemPrompt = `Sen profesyonel bir belge çevirmensin. Aşağıdaki metni ${sourceLang} dilinden ${targetLang} diline çevir.
Çeviriyi MUTLAKA yapılandırılmış bir biçimde, Markdown formatında oluştur.
Orijinal belgedeki başlıkları h1 (#), h2 (##), h3 (###) olarak belirt.
Eğer metinde maddeler varsa veya okunabilirliği artıracaksa listeler (bullet points) kullan.
Önemli kelimeleri kalın (**kalın**) yaz.
Sadece çevrilmiş ve formatlanmış Markdown metni yaz, başka açıklama ekleme.`;
  return callAI(text, systemPrompt);
}

export async function detectLanguage(text: string): Promise<string> {
  const prompt = `Aşağıdaki metnin dilini tespit et. SADECE ISO 639-1 dil kodunu döndür (ör: "en", "ar", "de", "fr"). Metin:\n\n${text.slice(0, 500)}`;
  const result = await callAI(prompt);
  return result.trim().toLowerCase().slice(0, 2);
}

export async function askAboutDocument(
  documentText: string,
  question: string
): Promise<string> {
  const systemPrompt = `Sen akıllı bir doküman asistanısın. Kullanıcı bir belge yükledi ve bu belge hakkında sorular soruyor.
Türkçe yanıt ver, detaylı ve yardımsever ol. Aşağıdaki belge içeriğini bağlam olarak kullan.
Yanıtlarını MUTLAKA Markdown formatında yapılandırarak ver. Başlıklar, alt başlıklar, maddeler ve kalın metinler kullanarak okunabilirliği maksimuma çıkar.`;
  const prompt = `Belge İçeriği:\n${documentText.slice(0, 30000)}\n\n---\n\nKullanıcı Sorusu: ${question}`;
  return callAI(prompt, systemPrompt);
}

export async function generateStudyNotes(
  contents: string[],
  subject?: string,
  title?: string
): Promise<string> {
  const subjectStr = subject ? ` Konu: ${subject}.` : '';
  const titleStr = title ? ` Başlık: ${title}.` : '';

  const systemPrompt = `Sen uzman bir eğitim asistanısın. Öğrencinin gönderdiği ders materyallerini (ders notları, kitap sayfaları, sunum slaytları vb.) analiz ederek kapsamlı, yapılandırılmış ve anlaşılır ders notları oluştur.${subjectStr}${titleStr}

Notları şu formatta MUTLAKA Markdown kullanarak oluştur:
- Markdown başlıkları (# Başlık, ## Alt Başlık) kullan
- Önemli kavramları **kalın** yaz
- Madde işaretleriyle listeler oluştur
- Tanımları vurgula (örn: alıntı blokları ">" kullan)
- Formülleri veya kodları kod bloğu içinde (\` veya \`\`\`) göster
- Sonuna kısa bir özet ekle
- Kesinlikle Türkçe yaz`;

  const combined = contents.map((c, i) => `--- Kaynak ${i + 1} ---\n${c}`).join('\n\n');
  return callAI(combined, systemPrompt);
}
