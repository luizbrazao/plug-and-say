function normalizeLocale(input: string): string {
  const lang = String(input ?? "").toLowerCase();
  if (lang.startsWith("en")) return "en-US";
  if (lang.startsWith("es")) return "es-ES";
  return "pt-BR";
}

export function formatRelativeTimeFromNow(timestamp: number, language: string): string {
  const locale = normalizeLocale(language);
  const diffMs = timestamp - Date.now();
  const diffSeconds = Math.round(diffMs / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (absSeconds < 60) return rtf.format(diffSeconds, "second");
  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, "day");
}

export function formatLocalizedDateTime(timestamp: number, language: string): string {
  return new Date(timestamp).toLocaleString(normalizeLocale(language));
}

export function formatLocalizedTime(timestamp: number, language: string): string {
  return new Date(timestamp).toLocaleTimeString(normalizeLocale(language), {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
