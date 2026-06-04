import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * ai-proxy — TransWordly güvenli AI proxy'si (v4)
 *
 * Frontend (src/lib/ai.ts) ile birebir uyumlu kontrat:
 *   İstek gövdesi:
 *     {
 *       mode: 'generate' | 'stream',
 *       model: string,                       // whitelist'te olmalı
 *       contents: Array<{ role, parts }>,    // Gemini formatı (multimodal dahil)
 *       systemInstruction?: { parts: [{ text }] },
 *       generationConfig?: { temperature, maxOutputTokens }
 *     }
 *   Yanıt:
 *     • generate → Gemini'nin ham JSON'u ({ candidates, usageMetadata })
 *     • stream   → Gemini'nin SSE akışı (data: {...}\n\n) doğrudan proxy edilir
 *
 * API anahtarı yalnızca burada (Edge Function secrets) bulunur, istemciye gitmez.
 */

// ── Konfig ─────────────────────────────────────────────────────────────────
// Üretimde ALLOWED_ORIGIN secret'ını tam alan adınıza ayarlayın:
//   supabase secrets set ALLOWED_ORIGIN=https://transwordly.com
// Yerel geliştirmede '*' bırakılabilir.
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*';

// Gemini API tabanı. Varsayılan Google Generative Language API.
//   supabase secrets set AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/models
// Geriye uyumluluk: eski kurulumda AI_API_URL (tam ".../models/<model>:generateContent")
// secret'ı varsa ondan tabanı (".../models") türetiriz.
function resolveBaseUrl(): string {
  const explicit = Deno.env.get('AI_BASE_URL');
  if (explicit) return explicit.replace(/\/+$/, '');

  const legacy = Deno.env.get('AI_API_URL');
  if (legacy) {
    const idx = legacy.indexOf('/models');
    if (idx !== -1) return legacy.slice(0, idx + '/models'.length);
  }
  return 'https://generativelanguage.googleapis.com/v1beta/models';
}
const AI_BASE_URL = resolveBaseUrl();

// İstemcinin gönderebileceği modeller — frontend'deki MODEL_FLASH/MODEL_PRO ile aynı olmalı.
// Hem stabil hem preview adları kabul edilir (preview'ler 2026 ortasında kapanıyor).
const MODEL_WHITELIST = new Set([
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.1-pro-preview',
]);

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

// ── Tipler ───────────────────────────────────────────────────────────────────
interface AIPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}
interface AIContent {
  role: 'user' | 'model';
  parts: AIPart[];
}
interface ThinkingConfig {
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
  thinkingBudget?: number;
}
interface AIRequest {
  mode?: 'generate' | 'stream';
  model?: string;
  contents?: AIContent[];
  systemInstruction?: { parts: Array<{ text: string }> };
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;
    thinkingConfig?: ThinkingConfig;
  };
  /** Zorunlu — begin_ai_operation ile alınan operasyon jetonu. Kredi/limit zorlaması için. */
  operationId?: string;
}

// ── Yardımcılar ────────────────────────────────────────────────────────────
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  // CORS pre-flight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // ── JWT doğrulaması ─────────────────────────────────────────────────────
  // Her istek geçerli bir Supabase oturum token'ı taşımalı.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing or malformed Authorization header' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: 'Server misconfigured: SUPABASE_URL/ANON_KEY missing' }, 500);
  }

  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return jsonResponse({ error: 'Unauthorized — invalid or expired session' }, 401);
  }
  // ── JWT doğrulaması sonu ────────────────────────────────────────────────

  const apiKey = Deno.env.get('AI_API_KEY');
  if (!apiKey) {
    return jsonResponse({ error: 'AI_API_KEY must be configured' }, 500);
  }

  // ── Gövde parse + doğrulama ─────────────────────────────────────────────
  let payload: AIRequest;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const mode = payload.mode === 'stream' ? 'stream' : 'generate';
  const model = payload.model ?? '';
  if (!MODEL_WHITELIST.has(model)) {
    return jsonResponse({ error: `Model not allowed: ${model || '(none)'}` }, 400);
  }
  if (!Array.isArray(payload.contents) || payload.contents.length === 0) {
    return jsonResponse({ error: 'contents is required' }, 400);
  }

  // ── Kredi/limit zorlaması (server-side, bypass edilemez) ─────────────────
  // Her çağrı, begin_ai_operation ile önceden kredi harcanarak alınmış bir
  // operasyon jetonu taşımak zorundadır. Proxy bu jetondan bir "çağrı hakkı"
  // atomik olarak tüketir (claim_ai_call). Jeton yok / süresi dolmuş / hakkı
  // bitmişse Gemini'ye HİÇ gidilmez → kredi harcamadan AI kullanımı imkânsız.
  const operationId = typeof payload.operationId === 'string' ? payload.operationId.trim() : '';
  if (!operationId) {
    return jsonResponse({ error: 'operationId required' }, 400);
  }
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) {
    return jsonResponse({ error: 'Server misconfigured: service role key missing' }, 500);
  }
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: claimed, error: claimErr } = await admin.rpc('claim_ai_call', {
    p_op_id: operationId,
    p_user_id: user.id,
  });
  if (claimErr) {
    return jsonResponse({ error: 'Kredi doğrulaması başarısız' }, 500);
  }
  if (claimed !== true) {
    return jsonResponse(
      { error: 'Geçersiz veya tükenmiş AI işlem jetonu — kredi/limit dolmuş olabilir' },
      402,
    );
  }

  // ── Gemini istek gövdesi ────────────────────────────────────────────────
  // generationConfig'i güvenli alanlarla ileriye taşı (whitelist). Böylece
  // istemci thinkingConfig (Gemini 3.x düşünme seviyesi) gönderebilir; bu
  // hem gecikmeyi (hız) hem de çıktı bütçesi tükenmesini (MAX_TOKENS) önler.
  const inCfg = payload.generationConfig ?? {};
  const reqMaxOut = typeof inCfg.maxOutputTokens === 'number' ? inCfg.maxOutputTokens : 16384;
  const genCfg: Record<string, unknown> = {
    temperature: typeof inCfg.temperature === 'number' ? Math.max(0, Math.min(inCfg.temperature, 2)) : 0.25,
    // Üst sınır: kötü niyetli istemcinin sınırsız çıktı istemesini engelle.
    maxOutputTokens: Math.max(1, Math.min(reqMaxOut, 65536)),
  };
  if (typeof inCfg.topP === 'number') genCfg.topP = inCfg.topP;
  if (typeof inCfg.topK === 'number') genCfg.topK = inCfg.topK;
  if (inCfg.thinkingConfig && typeof inCfg.thinkingConfig === 'object') {
    const tc: Record<string, unknown> = {};
    const lvl = inCfg.thinkingConfig.thinkingLevel;
    if (lvl && ['minimal', 'low', 'medium', 'high'].includes(lvl)) tc.thinkingLevel = lvl;
    if (typeof inCfg.thinkingConfig.thinkingBudget === 'number') tc.thinkingBudget = inCfg.thinkingConfig.thinkingBudget;
    if (Object.keys(tc).length) genCfg.thinkingConfig = tc;
  }
  const geminiBody: Record<string, unknown> = {
    contents: payload.contents,
    generationConfig: genCfg,
  };
  if (payload.systemInstruction) {
    geminiBody.systemInstruction = payload.systemInstruction;
  }

  const method = mode === 'stream' ? 'streamGenerateContent' : 'generateContent';
  const sseSuffix = mode === 'stream' ? '&alt=sse' : '';
  const upstreamUrl =
    `${AI_BASE_URL}/${model}:${method}?key=${apiKey}${sseSuffix}`;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });
  } catch (e) {
    return jsonResponse({ error: `AI provider unreachable: ${(e as Error).message}` }, 503);
  }

  // ── Hata durumları ──────────────────────────────────────────────────────
  if (!upstream.ok) {
    const errData = await upstream.json().catch(() => null);
    const msg = errData?.error?.message || `AI provider returned HTTP ${upstream.status}`;
    // Rate limit ve geçici hataları olduğu gibi geçir ki istemci doğru mesaj göstersin.
    const status = [429, 503].includes(upstream.status) ? upstream.status : 502;
    return jsonResponse({ error: msg }, status);
  }

  // ── Streaming: Gemini SSE akışını doğrudan proxy et ─────────────────────
  if (mode === 'stream') {
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  // ── Non-streaming: ham Gemini JSON'unu döndür ───────────────────────────
  const data = await upstream.json().catch(() => null);
  if (!data) {
    return jsonResponse({ error: 'AI provider returned invalid JSON' }, 502);
  }
  return jsonResponse(data);
});
