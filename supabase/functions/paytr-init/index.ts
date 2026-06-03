/**
 * paytr-init — PayTR iFrame ödeme başlatma (TransWordly)
 * ======================================================
 * Akış:
 *   1. Kullanıcı JWT ile doğrulanır.
 *   2. Plan SERVER-SIDE doğrulanır; tutar `app_config.plan_price.*`'ten okunur
 *      (istemciden gelen tutara GÜVENİLMEZ).
 *   3. `payment_orders` tablosuna 'pending' sipariş açılır (service_role).
 *   4. PayTR `get-token` çağrısı için HMAC-SHA256 paytr_token üretilir.
 *   5. Frontend dönen token ile iframe açar:
 *        https://www.paytr.com/odeme/guvenli/<token>
 *
 * Gerekli Edge Function secret'ları:
 *   PAYTR_MERCHANT_ID, PAYTR_MERCHANT_KEY, PAYTR_MERCHANT_SALT
 *   APP_BASE_URL  (ör. https://transwordly.com — ok/fail yönlendirme)
 *   PAYTR_TEST_MODE ('1' = test, '0' = canlı; varsayılan '1')
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (otomatik mevcut)
 *
 * deploy: supabase functions deploy paytr-init   (verify_jwt: true)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*';
const ALLOWED_PLANS = new Set(['starter', 'pro']);

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** base64(HMAC-SHA256(message, key)) — PayTR token şeması */
async function hmacBase64(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/** UUID → yalnızca alfanümerik merchant_oid (PayTR kısıtı) */
function toMerchantOid(uuid: string): string {
  return uuid.replace(/[^a-zA-Z0-9]/g, '');
}

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') ?? '';
  return xff.split(',')[0].trim() || '127.0.0.1';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // ── Kimlik doğrulama ────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Yetkisiz' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: 'Sunucu yapılandırması eksik' }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } =
    await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authErr || !user) return json({ error: 'Oturum geçersiz' }, 401);

  // ── PayTR secret kontrolü ───────────────────────────────────────────────
  const MID = Deno.env.get('PAYTR_MERCHANT_ID');
  const MKEY = Deno.env.get('PAYTR_MERCHANT_KEY');
  const MSALT = Deno.env.get('PAYTR_MERCHANT_SALT');
  if (!MID || !MKEY || !MSALT) {
    return json({ error: 'Ödeme altyapısı henüz yapılandırılmadı (PayTR secret eksik).' }, 503);
  }
  const TEST_MODE = Deno.env.get('PAYTR_TEST_MODE') ?? '1';
  const APP_BASE_URL = (Deno.env.get('APP_BASE_URL') ?? '').replace(/\/+$/, '');

  // ── Girdi ────────────────────────────────────────────────────────────────
  let body: { plan?: string; student?: boolean; name?: string; phone?: string };
  try { body = await req.json(); } catch { return json({ error: 'Geçersiz istek' }, 400); }

  const plan = String(body.plan ?? '');
  if (!ALLOWED_PLANS.has(plan)) return json({ error: 'Geçersiz plan' }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  // ── Tutarı SERVER-SIDE hesapla (app_config) ───────────────────────────────
  const { data: cfgRows } = await admin
    .from('app_config')
    .select('key, value')
    .or(`key.eq.plan_price.${plan},key.eq.discount.${plan},key.eq.discount.student_amount`);
  const cfg: Record<string, number> = {};
  for (const r of cfgRows ?? []) cfg[(r as { key: string }).key] = Number((r as { value: string }).value);

  const base = cfg[`plan_price.${plan}`];
  if (!base || base <= 0) return json({ error: 'Plan fiyatı bulunamadı' }, 400);
  const discountPct = cfg[`discount.${plan}`] ?? 0;
  const studentOff = body.student ? (cfg['discount.student_amount'] ?? 0) : 0;
  const afterPct = discountPct > 0 ? Math.round(base * (1 - discountPct / 100)) : base;
  const finalTl = Math.max(1, afterPct - studentOff);
  const amountKurus = Math.round(finalTl * 100);

  // ── Sipariş oluştur ────────────────────────────────────────────────────
  const orderId = crypto.randomUUID();
  const merchantOid = toMerchantOid(orderId);
  const email = user.email ?? 'noemail@transwordly.com';
  const ip = clientIp(req);

  const { error: insErr } = await admin.from('payment_orders').insert({
    id: orderId,
    user_id: user.id,
    merchant_oid: merchantOid,
    plan,
    amount_kurus: amountKurus,
    currency: 'TL',
    status: 'pending',
    email,
    user_ip: ip,
  });
  if (insErr) return json({ error: 'Sipariş oluşturulamadı: ' + insErr.message }, 500);

  // ── PayTR token ───────────────────────────────────────────────────────────
  const userBasket = btoa(JSON.stringify([[`${plan} plan`, String(finalTl), 1]]));
  const noInstallment = '0';
  const maxInstallment = '0';
  const currency = 'TL';
  const okUrl = `${APP_BASE_URL}/checkout?status=success`;
  const failUrl = `${APP_BASE_URL}/checkout?status=fail`;

  // hash_str = merchant_id + user_ip + merchant_oid + email + payment_amount
  //          + user_basket + no_installment + max_installment + currency + test_mode
  const hashStr =
    MID + ip + merchantOid + email + String(amountKurus) +
    userBasket + noInstallment + maxInstallment + currency + TEST_MODE;
  const paytrToken = await hmacBase64(MKEY, hashStr + MSALT);

  const form = new URLSearchParams({
    merchant_id: MID,
    user_ip: ip,
    merchant_oid: merchantOid,
    email,
    payment_amount: String(amountKurus),
    paytr_token: paytrToken,
    user_basket: userBasket,
    debug_on: TEST_MODE === '1' ? '1' : '0',
    no_installment: noInstallment,
    max_installment: maxInstallment,
    user_name: (body.name ?? user.email ?? 'Kullanıcı').slice(0, 60),
    user_address: 'TransWordly',
    user_phone: (body.phone ?? '').slice(0, 20),
    merchant_ok_url: okUrl,
    merchant_fail_url: failUrl,
    timeout_limit: '30',
    currency,
    test_mode: TEST_MODE,
    lang: 'tr',
  });

  let paytrRes: Response;
  try {
    paytrRes = await fetch('https://www.paytr.com/odeme/api/get-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
  } catch (e) {
    return json({ error: 'PayTR erişilemedi: ' + (e as Error).message }, 503);
  }

  const result = await paytrRes.json().catch(() => null) as
    { status?: string; token?: string; reason?: string } | null;
  if (!result || result.status !== 'success' || !result.token) {
    await admin.rpc('fail_payment_order', {
      p_merchant_oid: merchantOid,
      p_reason: result?.reason ?? 'token alınamadı',
    });
    return json({ error: 'PayTR token alınamadı: ' + (result?.reason ?? 'bilinmeyen') }, 502);
  }

  return json({
    token: result.token,
    iframeUrl: `https://www.paytr.com/odeme/guvenli/${result.token}`,
    merchantOid,
    amount: finalTl,
  });
});
