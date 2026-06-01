import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * shared-access — Paylaşılan çeviriye anonim (giriş gerektirmeyen) erişim.
 *
 * Güvenlik modeli:
 *   • Çeviri içeriği RLS ile anon'a KAPALI; yalnızca bu fonksiyon (service_role) döndürür.
 *   • Şifreli paylaşımlarda 4 haneli kod doğrulanır (SHA-256, case-insensitive).
 *   • IP + token başına 5 yanlış denemeden sonra o link o IP'ye KALICI engellenir.
 *   • Anon kullanıcı yalnızca görüntüler + indirir; düzenleme yetkisi yoktur.
 *
 * İstek:  POST { token: string, code?: string }
 * Yanıt:
 *   { ok: true, data: {...} }      → içerik
 *   { needsCode: true }            → şifre gerekli (kod ekranı göster)
 *   { wrongCode: true, remaining } → yanlış kod, kalan deneme
 *   { blocked: true }              → çok fazla yanlış, erişim engellendi
 */

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_ATTEMPTS = 5;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server misconfigured' }, 500);
  }

  let body: { token?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const token = (body.token ?? '').trim();
  const code = (body.code ?? '').trim();
  if (!token) return json({ error: 'token required' }, 400);

  // İstemci IP'si (gizlilik için hash'lenir)
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const ipHash = await sha256(ip);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Çeviri satırını çek (RLS bypass: service_role) ──────────────────────
  const { data: row } = await admin
    .from('translations')
    .select('id, translated_text, shared_pdf_url, target_language, share_password_hash, document_id')
    .eq('share_token', token)
    .maybeSingle();

  if (!row || !row.shared_pdf_url) {
    return json({ notFound: true }, 404);
  }

  // ── Lockout durumu ──────────────────────────────────────────────────────
  const { data: attempt } = await admin
    .from('share_access_attempts')
    .select('fail_count, blocked')
    .eq('share_token', token)
    .eq('ip_hash', ipHash)
    .maybeSingle();

  if (attempt?.blocked) {
    return json({ blocked: true }, 403);
  }

  const requiresCode = !!row.share_password_hash;

  // ── Şifre doğrulaması ───────────────────────────────────────────────────
  if (requiresCode) {
    if (!code) {
      return json({ needsCode: true }, 401);
    }
    const codeHash = await sha256(`${token}:${code.toUpperCase()}`);
    if (codeHash !== row.share_password_hash) {
      const newCount = (attempt?.fail_count ?? 0) + 1;
      const blocked = newCount >= MAX_ATTEMPTS;
      await admin.from('share_access_attempts').upsert({
        share_token: token,
        ip_hash: ipHash,
        fail_count: newCount,
        blocked,
        last_attempt: new Date().toISOString(),
      });
      return blocked
        ? json({ blocked: true }, 403)
        : json({ wrongCode: true, remaining: MAX_ATTEMPTS - newCount }, 401);
    }
    // Doğru kod → bu IP için sayacı temizle
    if (attempt) {
      await admin.from('share_access_attempts').delete()
        .eq('share_token', token).eq('ip_hash', ipHash);
    }
  }

  // ── Belge meta verisi ───────────────────────────────────────────────────
  let originalName: string | null = null;
  let originalLanguage: string | null = null;
  if (row.document_id) {
    const { data: doc } = await admin
      .from('documents')
      .select('original_name, original_language')
      .eq('id', row.document_id)
      .maybeSingle();
    originalName = doc?.original_name ?? null;
    originalLanguage = doc?.original_language ?? null;
  }

  return json({
    ok: true,
    data: {
      id: row.id,
      translated_text: row.translated_text,
      shared_pdf_url: row.shared_pdf_url,
      target_language: row.target_language,
      original_name: originalName,
      original_language: originalLanguage,
    },
  });
});
