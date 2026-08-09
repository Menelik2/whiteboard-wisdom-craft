/**
 * Official Gemini API model resource names for v1beta generateContent.
 * @see https://ai.google.dev/gemini-api/docs/models
 *
 * Invalid / common typos (do not use):
 * - gemini-3.1-flash          (does not exist; use gemini-3.1-flash-lite for text)
 * - gemini-2.5-flash-preview-image
 * - gemini-2.5-flash-image-preview
 */

/** Text models (summarize + key validation). */
export const GEMINI_TEXT_MODELS = [
  "gemini-2.5-flash", // stable Flash text
] as const;

/**
 * Native image generation models (Nano Banana family).
 * Tried in order; 404 / "not found" skips to the next.
 */
export const GEMINI_IMAGE_MODELS = [
  "gemini-2.5-flash-image", // Nano Banana (legacy, widely available)
  "gemini-3.1-flash-image", // Nano Banana 2
  "gemini-3.1-flash-lite-image", // Nano Banana 2 Lite
  "gemini-3-pro-image", // Nano Banana Pro
] as const;

export type GeminiTextModel = (typeof GEMINI_TEXT_MODELS)[number];
export type GeminiImageModel = (typeof GEMINI_IMAGE_MODELS)[number];
