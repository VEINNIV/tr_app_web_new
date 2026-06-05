/**
 * useAiOperation — standart kredi akışını saran hook.
 *
 * begin → refreshProfile → run(operationId) → hatada refund + refreshProfile.
 * Akışı bu desene birebir uyan sayfalar ve TÜM yeni AI özellikleri bunu kullanır.
 * Özgün UI mantığı olan yerler (chat inline hata, arka plan çevirisi) primitifleri
 * doğrudan kullanır.
 */
import toast from 'react-hot-toast';
import { useAuth } from '../context/auth';
import {
  beginAiOperation,
  refundAiOperation,
  type AiAction,
  type CreditErrorReason,
} from '../lib/aiOperation';

export interface RunAiOpInput<T> {
  action: AiAction;
  amount: number;
  calls: number;
  reference?: string | null;
  /** Asıl AI işi — operationId ile çağrılır. */
  run: (operationId: string) => Promise<T>;
  /** reason başına toast metni override. */
  messages?: Partial<Record<CreditErrorReason, string>>;
  /** Yükleniyor-toast'ını değiştirmek için (ör. GlossaryPage 'ai-gloss'). */
  toastId?: string;
  /** Varsayılan: true. false ise hata toast'ı gösterilmez (çağıran reason ile yönetir). */
  showErrorToast?: boolean;
  /** Varsayılan: true. Çalışma hatasında krediyi iade et. */
  refundOnError?: boolean;
  /** Varsayılan: true. AbortError'da toast gösterme. */
  silentAbort?: boolean;
}

export type RunAiOpResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: CreditErrorReason | 'aborted' };

const DEFAULT_MESSAGES: Record<CreditErrorReason, string> = {
  insufficient: 'Krediniz yetersiz.',
  rate_limit: 'Çok fazla istek — birkaç saniye bekleyin.',
  error: 'İşlem başlatılamadı, tekrar deneyin.',
};

export function useAiOperation() {
  const { refreshProfile } = useAuth();

  async function run<T>(input: RunAiOpInput<T>): Promise<RunAiOpResult<T>> {
    const {
      action,
      amount,
      calls,
      reference = null,
      run: task,
      messages,
      toastId,
      showErrorToast = true,
      refundOnError = true,
      silentAbort = true,
    } = input;

    const toastOpts = toastId ? { id: toastId } : undefined;

    const begin = await beginAiOperation({ action, amount, calls, reference });
    if (!begin.ok) {
      if (showErrorToast) {
        toast.error(messages?.[begin.reason] ?? DEFAULT_MESSAGES[begin.reason], toastOpts);
      }
      return { ok: false, reason: begin.reason };
    }

    // Kredi şimdi atomik düşüldü — UI bakiyesini tazele.
    void refreshProfile?.();

    try {
      const data = await task(begin.operationId);
      return { ok: true, data };
    } catch (e) {
      const isAbort = e instanceof Error && (e.name === 'AbortError' || /İptal/.test(e.message));
      if (refundOnError) {
        await refundAiOperation(begin.operationId);
        void refreshProfile?.();
      }
      if (isAbort && silentAbort) return { ok: false, reason: 'aborted' };
      if (showErrorToast) {
        toast.error(e instanceof Error && e.message ? e.message : 'İşlem tamamlanamadı.', toastOpts);
      }
      return { ok: false, reason: 'error' };
    }
  }

  return { run };
}
