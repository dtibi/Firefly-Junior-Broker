import React, { createContext, useState, useEffect, useCallback } from 'react';
import { Locale, getTranslation } from './translations';

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  dir: () => 'ltr' | 'rtl';
}

export const LocaleContext = createContext<LocaleContextType>({
  locale: 'en',
  setLocale: () => {},
  t: (key: string) => key,
  dir: () => 'ltr',
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    // Check localStorage first
    try {
      const saved = localStorage.getItem('firefly-broker-locale');
      if (saved === 'en' || saved === 'he') return saved;
    } catch {}

    // Fall back to browser language detection
    if (typeof navigator !== 'undefined') {
      const lang = navigator.language.toLowerCase();
      if (lang.startsWith('he') || lang.startsWith('iw')) return 'he';
    }

    return 'en';
  });

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem('firefly-broker-locale', newLocale);
    } catch {}
  }, []);

  const t = useCallback((key: string): string => {
    return getTranslation(locale, key);
  }, [locale]);

  const dir = useCallback((): 'ltr' | 'rtl' => {
    return locale === 'he' ? 'rtl' : 'ltr';
  }, [locale]);

  // Update document direction and lang attribute
  useEffect(() => {
    document.documentElement.dir = dir();
    document.documentElement.lang = locale;
  }, [locale, dir]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t, dir }}>
      {children}
    </LocaleContext.Provider>
  );
}
