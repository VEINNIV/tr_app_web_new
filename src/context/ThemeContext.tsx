import { createContext, useContext, type ReactNode } from 'react';
import { useTheme } from '../hooks/useTheme';

interface ThemeCtx {
  theme: 'light' | 'dark';
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useTheme();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useThemeContext() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useThemeContext must be inside ThemeProvider');
  return c;
}
