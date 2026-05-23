import { useState, useEffect } from 'react';

const TOUR_KEY = 'tw-tour-v1';

export function useOnboardingTour() {
  const [runTour, setRunTour] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(TOUR_KEY)) {
      // Small delay so dashboard content has rendered before tour starts
      const t = setTimeout(() => setRunTour(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

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
