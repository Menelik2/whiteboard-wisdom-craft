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
  "gemini-3.8-flash", // Current stable flagship Flash model
  "gemini-3.5-flash-lite", // Cost-efficient stable fallback
  "gemini-3.1-flash-lite", // Broadly available stable fallback
  "gemini-2.5-flash", // Legacy fallback; access is limited for some new projects
] as const;

/**
 * Native image generation models (Nano Banana family), in preferred order.
 * Prefer the current stable image model, then fall back to older or alternate
 * models when an account does not have access to a particular model.
 */
export const GEMINI_IMAGE_MODELS = [
  "gemini-nano-banana-2.1", // Current stable Nano Banana 2.1
  "gemini-3.1-flash-image", // Nano Banana 2
  "gemini-3-pro-image", // Nano Banana Pro
  "gemini-3.1-flash-lite-image", // Nano Banana 2 Lite
  "gemini-2.5-flash-image", // Legacy Nano Banana
] as const;

export type GeminiTextModel = (typeof GEMINI_TEXT_MODELS)[number];
export type GeminiImageModel = (typeof GEMINI_IMAGE_MODELS)[number];
