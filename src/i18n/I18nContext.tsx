import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { LanguageCode } from '../game/types.ts';
import {
  detectBrowserLanguage,
  isLanguageCode,
  LANGUAGE_LOCALES,
  LANGUAGE_OPTIONS,
  normalizeLanguageCode,
  TRANSLATIONS,
  type LanguageOption,
  type TranslationDict,
} from './translations.ts';

export type TemplateVars = Record<string, string | number>;

export function interpolateMessage(template: string, vars?: TemplateVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

interface I18nContextValue {
  language: LanguageCode;
  locale: string;
  languages: LanguageOption[];
  t: TranslationDict;
  setLanguage: (lang: LanguageCode) => void;
  formatMessage: (template: string, vars?: TemplateVars) => string;
  formatDate: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  locale: LANGUAGE_LOCALES.en,
  languages: LANGUAGE_OPTIONS,
  t: TRANSLATIONS.en,
  setLanguage: () => {},
  formatMessage: interpolateMessage,
  formatDate: (value, options) => new Date(value).toLocaleDateString(LANGUAGE_LOCALES.en, options),
  formatNumber: (value, options) => new Intl.NumberFormat(LANGUAGE_LOCALES.en, options).format(value),
});

export interface I18nProviderProps {
  language?: LanguageCode;
  initialLanguage?: LanguageCode;
  storageKey?: string;
  onChangeLanguage?: (lang: LanguageCode) => void;
  children: React.ReactNode;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({
  language,
  initialLanguage,
  storageKey,
  onChangeLanguage,
  children,
}) => {
  const [internalLang, setInternalLang] = useState<LanguageCode>(() => {
    if (isLanguageCode(language)) return language;
    if (storageKey && typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem(storageKey);
        if (stored && isLanguageCode(stored)) return stored;
      } catch {
        // Ignore storage errors
      }
    }
    if (initialLanguage) return normalizeLanguageCode(initialLanguage);
    return detectBrowserLanguage();
  });

  const activeLanguage: LanguageCode = isLanguageCode(language)
    ? language
    : internalLang;
  const locale = LANGUAGE_LOCALES[activeLanguage] ?? LANGUAGE_LOCALES.en;

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = activeLanguage;
    }
  }, [activeLanguage]);

  const setLanguage = useCallback(
    (nextLang: LanguageCode | string) => {
      const normalized = normalizeLanguageCode(nextLang);
      if (!isLanguageCode(language)) {
        setInternalLang(normalized);
        if (storageKey && typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(storageKey, normalized);
          } catch {
            // Ignore storage errors
          }
        }
      }
      onChangeLanguage?.(normalized);
    },
    [language, storageKey, onChangeLanguage],
  );

  const formatMessage = useCallback(
    (template: string, vars?: TemplateVars) => interpolateMessage(template, vars),
    [],
  );

  const formatDate = useCallback(
    (value: string | Date, options?: Intl.DateTimeFormatOptions) => {
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) return '';
      return new Intl.DateTimeFormat(locale, options).format(d);
    },
    [locale],
  );

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(locale, options).format(value),
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      language: activeLanguage,
      locale,
      languages: LANGUAGE_OPTIONS,
      t: TRANSLATIONS[activeLanguage] ?? TRANSLATIONS.en,
      setLanguage,
      formatMessage,
      formatDate,
      formatNumber,
    }),
    [activeLanguage, locale, setLanguage, formatMessage, formatDate, formatNumber],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
