import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ThemeContext } from './theme-context';
import type { Theme } from './theme-context';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('linkflow-theme', theme);
    } catch {
      /* Theme still works when storage is unavailable. */
    }
  }, [theme]);
  return <ThemeContext value={{ theme, setTheme: updateTheme }}>{children}</ThemeContext>;
}
