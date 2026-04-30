export type Locale = 'de' | 'en';

const LOCALE_STORAGE_KEY = 'mhh-locale';

export const getLocale = (): Locale => {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  return stored === 'en' ? 'en' : 'de';
};

export const setLocalePreference = (locale: Locale): void => {
  if (locale === 'en') {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    return;
  }
  localStorage.removeItem(LOCALE_STORAGE_KEY);
};
