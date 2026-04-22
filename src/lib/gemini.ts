// TransLingua — Gemini AI Service (placeholder for API key)

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

export async function callGemini(prompt: string, systemInstruction?: string): Promise<string> {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
    // Demo mode: return a placeholder response
    return `[Demo Mode] AI yanıtı — Lütfen .env.local dosyasına geçerli bir VITE_GEMINI_API_KEY ekleyin.\n\nPrompt: ${prompt.slice(0, 100)}...`;
  }

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const res = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data: GeminiResponse = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');
  return text;
}

export async function translateDocument(
  text: string,
  sourceLang: string,
  targetLang: string = 'tr'
): Promise<string> {
  const systemPrompt = `You are a professional document translator. Translate the following text from ${sourceLang} to ${targetLang}. Maintain the original formatting, paragraph structure, and meaning. Do not add explanations — only output the translated text.`;
  return callGemini(text, systemPrompt);
}

export async function detectLanguage(text: string): Promise<string> {
  const prompt = `Detect the language of the following text. Return ONLY the ISO 639-1 language code (e.g., "en", "ar", "de", "fr"). Text:\n\n${text.slice(0, 500)}`;
  const result = await callGemini(prompt);
  return result.trim().toLowerCase().slice(0, 2);
}

export async function askAboutDocument(
  documentText: string,
  question: string
): Promise<string> {
  const systemPrompt = `You are an intelligent document assistant. The user has uploaded a document and is asking questions about it. Answer in Turkish, be detailed and helpful. Use the document content below as your context.`;
  const prompt = `Document Content:\n${documentText.slice(0, 30000)}\n\n---\n\nUser Question: ${question}`;
  return callGemini(prompt, systemPrompt);
}
