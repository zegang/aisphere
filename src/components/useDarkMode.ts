import { useState, useCallback } from 'react';

export function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.classList.contains('dark');
  });

  const toggleDark = useCallback(() => {
    document.documentElement.classList.toggle('dark');
    setIsDark((prev) => !prev);
  }, []);

  return { isDark, toggleDark };
}
