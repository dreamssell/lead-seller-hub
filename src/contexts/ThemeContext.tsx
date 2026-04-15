import { createContext, useContext, type ReactNode } from 'react';
import { useTheme } from '@/hooks/useTheme';

type ThemeCtx = ReturnType<typeof useTheme>;

const ThemeContext = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const themeValue = useTheme();
  return (
    <ThemeContext.Provider value={themeValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeContext must be within ThemeProvider');
  return ctx;
}
