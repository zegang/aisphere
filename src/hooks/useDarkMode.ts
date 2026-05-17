import { useEffect, useState } from 'react';

type ColorScheme = 'light' | 'dark';

export function useDarkMode(): { mode: ColorScheme; toggle: () => void } {
  const [mode, setMode] = useState<ColorScheme>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = localStorage.getItem('darkMode');
      if (stored === 'true') return 'dark';
      if (stored === 'false') return 'light';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', mode === 'dark');
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('darkMode', String(mode === 'dark'));
    }
  }, [mode]);

  const toggle = () => setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return { mode, toggle };
}
