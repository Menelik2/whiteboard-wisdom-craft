/**
 * Official Gemini API model ids (Google AI Studio / generativelanguage v1beta).
 * Source: https://ai.google.dev/gemini-api/docs/models
 *
 * There is NO "gemini-3.1-flash" text model — only gemini-3.1-flash-lite
 * and image variants (gemini-3.1-flash-image, gemini-3.1-flash-lite-image).
 */

/** Text / multimodal models that support generateContent (summarize, validate). */
export const GEMINI_TEXT_MODELS = [
  "gemini-2.5-flash", // stable, widely available free+paid
  "gemini-3.1-flash-lite", // cheap high-volume 3.x
  "gemini-3.5-flash", // strong agentic/coding Flash
  "gemini-3.6-flash", // latest stable Flash
] as const;

/** Native image generation (Nano Banana family). */
export const GEMINI_IMAGE_MODELS = [
  "gemini-3.1-flash-image", // Nano Banana 2 — recommended default
  "gemini-3.1-flash-lite-image", // Nano Banana 2 Lite — faster/cheaper
  "gemini-3-pro-image", // Nano Banana Pro — highest quality / 4K
  "gemini-2.5-flash-image", // legacy Nano Banana
] as const;

export type GeminiTextModel = (typeof GEMINI_TEXT_MODELS)[number];
export type GeminiImageModel = (typeof GEMINI_IMAGE_MODELS)[number];
