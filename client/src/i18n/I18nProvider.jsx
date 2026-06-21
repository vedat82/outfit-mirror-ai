import { createContext, useContext, useMemo, useState } from 'react';
import tr from './locales/tr.json';
import en from './locales/en.json';

const languageStorageKey = 'daily-outfit-planner:language';
const defaultLanguage = 'tr';
const translations = { tr, en };
const I18nContext = createContext(null);

function getInitialLanguage() {
  const storedLanguage = localStorage.getItem(languageStorageKey);
  return translations[storedLanguage] ? storedLanguage : defaultLanguage;
}

function readPath(source, path) {
  return path.split('.').reduce((value, key) => value?.[key], source);
}

function interpolate(value, params = {}) {
  return String(value).replace(/\{\{(\w+)\}\}/g, (_match, key) => params[key] ?? '');
}

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(getInitialLanguage);

  function setLanguage(nextLanguage) {
    if (!translations[nextLanguage]) return;
    localStorage.setItem(languageStorageKey, nextLanguage);
    setLanguageState(nextLanguage);
  }

  const value = useMemo(() => {
    function t(key, params) {
      const translatedValue = readPath(translations[language], key) ?? readPath(translations[defaultLanguage], key) ?? key;
      return interpolate(translatedValue, params);
    }

    function optionLabel(group, value) {
      const key = `options.${group}.${value}`;
      const label = t(key);
      return label === key ? value : label;
    }

    return {
      language,
      setLanguage,
      t,
      optionLabel
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error('useI18n must be used inside I18nProvider');
  }

  return context;
}
