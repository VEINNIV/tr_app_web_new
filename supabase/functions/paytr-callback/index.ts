/**
 * paytr-callback — PayTR ödeme bildirimi (webhook) doğrulama (TransWordly)
 * =======================================================================
 * PayTR, ödeme sonucunu bu URL'e POST eder (application/x-www-form-urlencoded).
 * PayTR mağaza panelinde "Bildirim URL"i olarak ayarlanır:
 *   https://<proje>.supabase.co/functions/v1/paytr-callback
 *
 * DOĞRULAMA (kritik): gelen `hash`, merchant_key/salt ile yeniden üretilip
 * karşılaştırılır. Eşleşmezse istek REDDEDİLİR (sahte bildirim koruması).
 *
 * Başarılıysa `complete_payment_order` RPC çağrılır → plan + kredi yüklenir
 * (idempotent: PayTR aynı bildirimi tekrar gönderse bile kredi bir kez verilir).
 *
 * ÖNEMLİ: PayTR yalnızca gövdesi düz metin "OK" olan 200 yanıtını başarılı sayar;
 * aksi halde bildirimi tekrar tekrar gönderir.
 *
 * deploy: supabase functions deploy paytr-callback --no-verify-jwt
 *   (verify_jwt: false olmalı — PayTR JWT göndermez)
 *
 * Gerekli secret'lar: PAYTR_MERCHANT_KEY, PAYTR_MERCHANT_SALT,
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function hmacBase64(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const MKEY = Deno.env.get('PAYTR_MERCHANT_KEY');
  const MSALT = Deno.env.get('PAYTR_MERCHANT_SALT');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!MKEY || !MSALT || !supabaseUrl || !serviceKey) {
    // Yapılandırma eksik — yanlışlıkla "OK" dönüp ödemeyi onaylamış gibi görünmemeli.
    return new Response('PAYTR not configured', { status: 500 });
  }

  // PayTR form-urlencoded gönderir
  let form: URLSearchParams;
  try {
    const raw = await req.text();
    form = new URLSearchParams(raw);
  } catch {
    return new Response('bad request', { status: 400 });
  }

  const merchantOid = form.get('merchant_oid') ?? '';
  const status = form.get('status') ?? '';
  const totalAmount = form.get('total_amount') ?? '';
  const hash = form.get('hash') ?? '';
  const paymentType = form.get('payment_type') ?? '';
  const failReason = form.get('failed_reason_msg') ?? form.get('failed_reason_code') ?? '';

  if (!merchantOid || !hash) return new Response('missing fields', { status: 400 });

  // ── Hash doğrulama: HMAC(merchant_oid + salt + status + total_amount, key) ──
  const expected = await hmacBase64(MKEY, merchantOid + MSALT + status + totalAmount);
  if (expected !== hash) {
    console.warn('PayTR hash uyuşmadı — sahte bildirim olabilir:', merchantOid);
    return new Response('bad hash', { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  try {
    if (status === 'success') {
      await admin.rpc('complete_payment_order', { p_merchant_oid: merchantOid });
    } else {
      await admin.rpc('fail_payment_order', { p_merchant_oid: merchantOid, p_reason: failReason });
    }
  } catch (e) {
    // DB hatası → PayTR'nin tekrar denemesi için OK DÖNME (500)
    console.error('PayTR callback DB hatası:', (e as Error).message, { merchantOid, paymentType });
    return new Response('db error', { status: 500 });
  }

  // PayTR yalnızca düz metin "OK" görürse bildirimi tamamlanmış sayar
  return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
});
