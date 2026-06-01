/**
 * Kredi maliyeti yapılandırması — canlı (admin tarafından yönetilen) değerleri okur.
 *
 * Kaynak: public.app_config tablosu (category = 'credit_cost').
 * Admin panelinden değiştirilen maliyetler buradan uygulamaya yansır.
 * DB okunamazsa constants.ts'teki sabit değerlere düşülür (fail-safe).
 *
 * NOT: Bunlar yalnızca istemci tarafı GÖSTERIM ve gönderilen tutar içindir.
 * Gerçek düşüm her zaman server-side `consume_credits` RPC'siyle atomik yapılır.
 */
import { supabase } from './supabase';
import { CREDIT_COSTS } from './constants';

export interface CreditCosts {
  translationPerPage: number;
  chat: number;
  studyNotes: number;
  glossary: number;
}

const FALLBACK: CreditCosts = {
  translationPerPage: CREDIT_COSTS.TRANSLATION_PER_PAGE,
  chat: CREDIT_COSTS.CHAT_PER_QUESTION,
  studyNotes: CREDIT_COSTS.STUDY_NOTES_PER_SOURCE,
  glossary: CREDIT_COSTS.GLOSSARY_SUGGEST,
};

let cache: CreditCosts | null = null;
let inflight: Promise<CreditCosts> | null = null;

/** Canlı kredi maliyetlerini getirir (tek sefer cache'lenir). */
export async function getCreditCosts(force = false): Promise<CreditCosts> {
  if (cache && !force) return cache;
  if (inflight && !force) return inflight;

  inflight = (async () => {
    try {
      const { data } = await supabase
        .from('app_config')
        .select('key, value')
        .eq('category', 'credit_cost');

      if (data && data.length) {
        const map = Object.fromEntries(data.map(r => [r.key as string, Number(r.value)]));
        cache = {
          translationPerPage: map['credit_cost.translation_per_page'] ?? FALLBACK.translationPerPage,
          chat: map['credit_cost.chat'] ?? FALLBACK.chat,
          studyNotes: map['credit_cost.study_notes'] ?? FALLBACK.studyNotes,
          glossary: map['credit_cost.glossary'] ?? FALLBACK.glossary,
        };
      } else {
        cache = FALLBACK;
      }
    } catch {
      cache = FALLBACK;
    } finally {
      inflight = null;
    }
    return cache!;
  })();

  return inflight;
}

/** Senkron erişim — daha önce yüklenmemişse fallback döner. */
export function getCachedCreditCosts(): CreditCosts {
  return cache ?? FALLBACK;
}

/** Admin panelinde değer değişince cache'i tazele. */
export function invalidateCreditCosts(): void {
  cache = null;
}
