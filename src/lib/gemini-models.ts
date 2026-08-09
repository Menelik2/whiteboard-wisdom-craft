/**
 * Official Gemini API model ids (Google AI Studio / generativelanguage v1beta).
 * Source: https://ai.google.dev/gemini-api/docs/models
 *
 * Text path uses gemini-2.5-flash only (stable, widely available on free + paid).
 * Image path tries Nano Banana 2 family, then legacy 2.5 image.
 */

/** Text model for summarize + key validation. */
export const GEMINI_TEXT_MODELS = ["gemini-2.5-flash"] as const;

/** Native image generation (Nano Banana family). */
export const GEMINI_IMAGE_MODELS = [
  "gemini-3.1-flash-image", // Nano Banana 2
  "gemini-3.1-flash-lite-image", // Nano Banana 2 Lite
  "gemini-3-pro-image", // Nano Banana Pro
  "gemini-2.5-flash-image", // legacy Nano Banana
] as const;

export type GeminiTextModel = (typeof GEMINI_TEXT_MODELS)[number];
export type GeminiImageModel = (typeof GEMINI_IMAGE_MODELS)[number];
