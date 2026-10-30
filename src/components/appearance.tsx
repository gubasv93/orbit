'use client';

import {createContext, useContext, useEffect, useState, type ReactNode} from 'react';

type Theme = 'light' | 'dark';
const storageKey = 'orbit-appearance';
const AppearanceContext = createContext<{theme: Theme; changeTheme(theme: Theme): void}>({theme: 'light', changeTheme() {}});

export function AppearanceProvider({children}: {children: ReactNode}) {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    const sync = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return;
      const next = event.newValue === 'dark' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  function changeTheme(next: Theme) {
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try { localStorage.setItem(storageKey, next); } catch { /* The current page still supports private browsing without storage. */ }
  }
  return <AppearanceContext.Provider value={{theme, changeTheme}}>{children}</AppearanceContext.Provider>;
}

export function ThemeToggle({className = '', showLabel = false}: {className?: string; showLabel?: boolean}) {
  const {theme, changeTheme} = useContext(AppearanceContext);
  const dark = theme === 'dark';
  return <button type="button" className={`appearance-toggle ${className}`} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} aria-pressed={dark} title={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => changeTheme(dark ? 'light' : 'dark')}>
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{dark ? <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42m0-14.14-1.42 1.42m-11.3 11.3-1.42 1.42"/></> : <path d="M20.9 13.2A9 9 0 0 1 10.8 3.1 9 9 0 1 0 20.9 13.2Z"/>}</svg>
    {showLabel && <span>{dark ? 'Dark theme' : 'Light theme'}</span>}
  </button>;
}
