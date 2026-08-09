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

/**
 * Loose client-side shape check for Google AI Studio / Gemini keys.
 * Accepts legacy AIza… keys and new AQ. authorization keys.
 * Server /api/validate-gemini-key performs the real check.
 */
export function looksLikeGeminiKey(key: string) {
  const k = key.trim();
  if (!k || k.length < 20 || k.length > 512) return false;
  if (/^AIza[0-9A-Za-z_-]{20,}$/.test(k)) return true;
  if (/^AQ\.[0-9A-Za-z_-]+$/.test(k)) return true;
  if (/^[A-Za-z0-9._-]{20,}$/.test(k)) return true;
  return false;
}
