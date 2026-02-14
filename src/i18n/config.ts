import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enTranslation from "./locales/en/translation.json";
import esTranslation from "./locales/es/translation.json";
import ptTranslation from "./locales/pt/translation.json";

export const SUPPORTED_LANGUAGES = ["en", "es", "pt"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function normalizeSupportedLanguage(input: unknown): SupportedLanguage {
  const normalized = String(input ?? "").trim().toLowerCase();
  if (normalized === "en-us" || normalized === "english" || normalized === "english (us)") {
    return "en";
  }
  if (normalized === "es-es" || normalized === "espanol" || normalized === "español" || normalized === "spanish") {
    return "es";
  }
  if (normalized === "pt-br" || normalized === "pt-pt" || normalized === "portugues" || normalized === "português (brasil)" || normalized === "portuguese") {
    return "pt";
  }
  if (normalized === "en" || normalized === "es" || normalized === "pt") {
    return normalized;
  }
  return "pt";
}

if (!i18n.isInitialized) {
  void i18n
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: enTranslation },
        es: { translation: esTranslation },
        pt: { translation: ptTranslation },
      },
      lng: "pt",
      fallbackLng: "pt",
      returnNull: false,
      returnEmptyString: false,
      interpolation: {
        escapeValue: false,
      },
    });
}

export default i18n;
