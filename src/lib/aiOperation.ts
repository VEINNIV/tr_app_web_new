/**
 * AI operasyonu (kredi) primitifleri — tek kaynak.
 *
 * begin_ai_operation / refund_ai_operation RPC çağrıları, operationId ayrıştırma ve
 * hata sınıflandırma yalnızca burada yapılır. Sayfalar/hook'lar bunları import eder;
 * inline supabase.rpc('begin_ai_operation') çağrısı başka yerde KALMAMALI.
 *
 * NOT: Sunucu otoritesi (atomik düşüm/iade) RPC'lerde kalır; bu dosya yalnızca onları sarar.
 */
import { supabase } from './supabase';

export type AiAction = 'chat' | 'translation' | 'study_notes' | 'glossary' | (string & {});

export type CreditErrorReason = 'insufficient' | 'rate_limit' | 'error';

export interface BeginAiOpInput {
  action: AiAction;
  /** Ayrılacak kredi — çağıran getCreditCosts'tan çözer. */
  amount: number;
  /** ai-proxy çağrı bütçesi. */
  calls: number;
  /** İlgili kayıt (docId vb.). */
  reference?: string | null;
}

export type BeginAiOpResult =
  | { ok: true; operationId: string }
  | { ok: false; reason: CreditErrorReason; message: string };

/** begin_ai_operation RPC + operationId ayrıştırma + hata sınıflandırma. */
export async function beginAiOperation({
  action,
  amount,
  calls,
  reference = null,
}: BeginAiOpInput): Promise<BeginAiOpResult> {
  const { data, error } = await supabase.rpc('begin_ai_operation', {
    p_action: action,
    p_amount: amount,
    p_calls: calls,
    p_reference: reference,
  });
  const operationId = (data as Array<{ operation_id: string }> | null)?.[0]?.operation_id;
  if (!error && operationId) return { ok: true, operationId };

  const message = error?.message ?? '';
  const reason: CreditErrorReason = /Yetersiz/.test(message)
    ? 'insufficient'
    : /fazla istek/.test(message)
      ? 'rate_limit'
      : 'error';
  return { ok: false, reason, message };
}

/**
 * refund_ai_operation RPC — hatayı yutar.
 * Sunucu yalnızca hiç AI çağrısı yapılmadıysa gerçekten iade eder (mevcut davranış).
 */
export async function refundAiOperation(operationId: string): Promise<void> {
  try {
    await supabase.rpc('refund_ai_operation', { p_op_id: operationId });
  } catch {
    /* yut */
  }
}
