const STORAGE_KEY = "wb.geminiApiKey";

export function loadGeminiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveGeminiKey(key: string) {
  if (typeof window === "undefined") return;
  try {
    const trimmed = key.trim();
    if (trimmed) window.localStorage.setItem(STORAGE_KEY, trimmed);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Loose shape check for a Google AI Studio key. */
export function looksLikeGeminiKey(key: string) {
  return /^AIza[0-9A-Za-z_-]{20,}$/.test(key.trim());
}
