import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en.json';
import uk from '@/locales/uk.json';

export const SUPPORTED_LANGUAGES = ['en', 'uk'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

const STORAGE_KEY = 'fairprice_lang';

function isSupportedLang(v: unknown): v is SupportedLanguage {
  return v === 'en' || v === 'uk';
}

function browserLocale(): SupportedLanguage {
  try {
    const loc = navigator.language.slice(0, 2).toLowerCase();
    if (loc === 'uk') return 'uk';
  } catch { /* ignore */ }
  return 'en';
}

// Initialize with navigator language as synchronous default.
// After calling initLanguage() the actual persisted value takes over.
i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      uk: { translation: uk },
    },
    lng: browserLocale(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

/**
 * Read persisted language from browser.storage.sync and apply it.
 * Call this once from each UI context (popup, injector) at startup.
 */
export async function initLanguage(): Promise<void> {
  try {
    const result = await browser.storage.sync.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY];
    if (isSupportedLang(stored)) {
      await i18n.changeLanguage(stored);
    }
  } catch { /* storage unavailable in unit-test env */ }
}

/**
 * Persist language and change the active i18n locale.
 * Works across popup, content scripts via browser.storage.onChanged.
 */
export async function setLanguage(lang: SupportedLanguage): Promise<void> {
  try {
    await browser.storage.sync.set({ [STORAGE_KEY]: lang });
  } catch { /* ignore */ }
  await i18n.changeLanguage(lang);
}

export function getLanguage(): SupportedLanguage {
  const cur = i18n.language;
  return isSupportedLang(cur) ? cur : 'en';
}

/**
 * Subscribe to cross-context language changes (e.g. popup → content script).
 * Returns an unsubscribe function.
 */
export function watchLanguage(onChange: (lang: SupportedLanguage) => void): () => void {
  const handler = (
    changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
    area: string,
  ) => {
    if (area !== 'sync') return;
    const newVal = changes[STORAGE_KEY]?.newValue;
    if (isSupportedLang(newVal)) {
      void i18n.changeLanguage(newVal);
      onChange(newVal);
    }
  };
  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}

export default i18n;

