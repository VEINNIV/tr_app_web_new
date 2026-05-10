const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface AIRequest {
  prompt?: string;
  systemInstruction?: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: {
    message?: string;
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const apiKey = Deno.env.get('AI_API_KEY');
  const apiUrl = Deno.env.get('AI_API_URL');

  if (!apiKey || !apiUrl) {
    return jsonResponse({ error: 'AI_API_KEY and AI_API_URL must be configured' }, 500);
  }

  let payload: AIRequest;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (!payload.prompt || typeof payload.prompt !== 'string') {
    return jsonResponse({ error: 'prompt is required' }, 400);
  }

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: payload.prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
  };

  if (payload.systemInstruction) {
    body.systemInstruction = { parts: [{ text: payload.systemInstruction }] };
  }

  const aiResponse = await fetch(`${apiUrl}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data: GeminiResponse = await aiResponse.json().catch(() => ({}));

  if (!aiResponse.ok || data.error) {
    return jsonResponse(
      { error: data.error?.message || `AI provider returned HTTP ${aiResponse.status}` },
      aiResponse.ok ? 502 : aiResponse.status,
    );
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return jsonResponse({ error: 'AI provider returned an empty response' }, 502);
  }

  return jsonResponse({ text });
});
