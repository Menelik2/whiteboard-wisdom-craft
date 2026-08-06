import { createFileRoute } from "@tanstack/react-router";

type Body = { geminiKey?: string };

const VALIDATION_MODEL = "gemini-2.5-flash";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Map a Google API failure to a clear, user-facing message. */
const messageFor = (status: number, raw: string) => {
  const detail = (() => {
    try {
      return (JSON.parse(raw)?.error?.message as string) || "";
    } catch {
      return "";
    }
  })();

  if (status === 400 && /API key not valid/i.test(detail))
    return "That API key is not valid. Check you copied the whole key from Google AI Studio.";
  if (status === 400) return detail || "The key was rejected as malformed.";
  if (status === 401) return "Unauthorized — this key is not accepted by Google AI Studio.";
  if (status === 403)
    return "This key is not authorized for the Gemini API. Enable the Generative Language API for its project, or create a new key in Google AI Studio.";
  if (status === 429)
    return "This key is valid but currently rate-limited or out of quota. Try again later.";
  if (status >= 500) return "Google's API is temporarily unavailable. Try validating again shortly.";
  return detail || `Validation failed (HTTP ${status}).`;
};

export const Route = createFileRoute("/api/validate-gemini-key")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { geminiKey } = (await request.json()) as Body;
        const key = geminiKey?.trim();
        if (!key) return json({ valid: false, error: "No API key provided." }, 400);

        let res: Response;
        try {
          res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${VALIDATION_MODEL}:generateContent`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-goog-api-key": key },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: "ping" }] }],
                generationConfig: { maxOutputTokens: 1 },
              }),
              signal: request.signal,
            },
          );
        } catch {
          return json(
            { valid: false, error: "Could not reach Google's API to validate the key." },
            502,
          );
        }

        if (res.ok) return json({ valid: true });

        const raw = await res.text().catch(() => "");
        // 429 means the key authenticated but hit quota — treat it as usable.
        if (res.status === 429) return json({ valid: true, warning: messageFor(429, raw) });

        return json({ valid: false, error: messageFor(res.status, raw) }, 200);
      },
    },
  },
});
