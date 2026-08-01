import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "gemini_api_key";

/** Reads the user's own Gemini API key from this browser's local storage. */
export function readGeminiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

const listeners = new Set<(key: string) => void>();

export function writeGeminiKey(key: string) {
  try {
    if (key) window.localStorage.setItem(STORAGE_KEY, key);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(key));
}

/** Hydration-safe hook for the locally stored Gemini API key. */
export function useGeminiKey() {
  const [key, setKey] = useState("");

  useEffect(() => {
    setKey(readGeminiKey());
    const onChange = (next: string) => setKey(next);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  const save = useCallback((next: string) => {
    const trimmed = next.trim();
    writeGeminiKey(trimmed);
    setKey(trimmed);
  }, []);

  return { key, hasKey: key.length > 0, save };
}
