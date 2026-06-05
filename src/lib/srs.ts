/**
 * srs.ts — Saf SM-2 aralıklı tekrar motoru (DB'siz, yan etkisiz).
 *
 * Flashcard tekrarında kullanılır: kullanıcı bir kartı derecelendirir (Again/Hard/Good/Easy),
 * bu fonksiyon bir sonraki `dueAt` ve güncel SM-2 durumunu (ease/interval/repetitions) hesaplar.
 * DB'ye bağımlı değildir → izole düşünülebilir ve elle doğrulanabilir.
 *
 * SM-2 referansı (uyarlanmış):
 *  - ease (kolaylık faktörü) alt sınır 1.3.
 *  - interval gün cinsinden; "again" için dakikalık kısa tekrar (interval=0).
 */

export type Grade = 'again' | 'hard' | 'good' | 'easy';

export interface SrsState {
  ease: number;        // kolaylık faktörü (>= 1.3)
  interval: number;    // gün
  repetitions: number; // ardışık başarılı tekrar sayısı
}

export interface SrsResult extends SrsState {
  dueAt: Date;
}

export const MIN_EASE = 1.3;
/** "again" derecesinde kart kısa süre sonra tekrar gösterilir. */
export const AGAIN_DELAY_MIN = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

const clampEase = (e: number): number => Math.max(MIN_EASE, Math.round(e * 100) / 100);

/**
 * Bir kartı derecelendirir ve sonraki SM-2 durumunu döndürür.
 * @param state mevcut kart durumu
 * @param grade kullanıcı derecesi
 * @param now referans zaman (test için enjekte edilebilir)
 */
export function review(state: SrsState, grade: Grade, now: Date = new Date()): SrsResult {
  let { ease, interval, repetitions } = state;

  switch (grade) {
    case 'again': {
      ease = clampEase(ease - 0.2);
      repetitions = 0;
      interval = 0;
      return { ease, interval, repetitions, dueAt: new Date(now.getTime() + AGAIN_DELAY_MIN * 60 * 1000) };
    }
    case 'hard': {
      ease = clampEase(ease - 0.15);
      interval = Math.max(1, Math.round((interval || 1) * 1.2));
      repetitions += 1;
      return { ease, interval, repetitions, dueAt: new Date(now.getTime() + interval * DAY_MS) };
    }
    case 'good': {
      if (repetitions === 0) interval = 1;
      else if (repetitions === 1) interval = 6;
      else interval = Math.max(1, Math.round(interval * ease));
      repetitions += 1;
      // ease sabit
      return { ease: clampEase(ease), interval, repetitions, dueAt: new Date(now.getTime() + interval * DAY_MS) };
    }
    case 'easy': {
      ease = clampEase(ease + 0.15);
      if (repetitions === 0) interval = Math.round(1 * 1.3);
      else if (repetitions === 1) interval = Math.round(6 * 1.3);
      else interval = Math.max(1, Math.round(interval * ease * 1.3));
      repetitions += 1;
      return { ease, interval, repetitions, dueAt: new Date(now.getTime() + interval * DAY_MS) };
    }
  }
}

/** Yeni kart için başlangıç SM-2 durumu. */
export const initialSrsState = (): SrsState => ({ ease: 2.5, interval: 0, repetitions: 0 });
