import { useState, useEffect } from 'react';

const TOUR_KEY = 'tw-tour-v1';

/**
 * @param enabled Tur yalnızca bu true olduğunda başlar. Kurulum sihirbazı (onboarding)
 *   açıkken turu geciktirmek için kullanılır — ikisi aynı anda çıkmasın, sırayla aksın.
 */
export function useOnboardingTour(enabled: boolean = true) {
  const [runTour, setRunTour] = useState(false);

  useEffect(() => {
    if (!enabled) return; // onboarding bitene kadar bekle
    if (!localStorage.getItem(TOUR_KEY)) {
      // Small delay so dashboard content has rendered before tour starts
      const t = setTimeout(() => setRunTour(true), 800);
      return () => clearTimeout(t);
    }
  }, [enabled]);

  const finishTour = () => {
    localStorage.setItem(TOUR_KEY, '1');
    setRunTour(false);
  };

  const resetTour = () => {
    localStorage.removeItem(TOUR_KEY);
    setRunTour(true);
  };

  return { runTour, setRunTour, finishTour, resetTour };
}
