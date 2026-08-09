import { createFileRoute } from "@tanstack/react-router";

type NoteBullet = { text?: string; sources?: number[] };
type NoteTerm = { term?: string; definition?: string; sources?: number[] };
type Notes = {
  summary?: string;
  keyPoints?: NoteBullet[];
  keyTerms?: NoteTerm[];
};

type Body = {
  topic?: string;
  markerColors?: string[];
  numConcepts?: number;
  difficulty?: "Beginner" | "Intermediate" | "Advanced";
  notes?: Notes;
  geminiKey?: string;
};

/** Nano Banana 2 family first; legacy 2.5 last. */
const GEMINI_IMAGE_MODELS = [
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-lite-image",
  "gemini-2.5-flash-image",
] as const;

const FREE_TIER_IMAGE_MSG =
  "Gemini image generation is not available on the free tier for this API key (quota limit 0). " +
  "Enable billing on the Google AI Studio / Cloud project for this key, or remove the key and use Built-in AI.";

const RATE_LIMIT_MSG =
  "Gemini is rate-limiting this key right now. Wait about a minute and try again, or switch to Built-in AI.";

/** Wrap a single finished image as a one-frame SSE stream the client parser understands. */
const sseFromBase64 = (b64: string) =>
  new Response(
    `data: ${JSON.stringify({ type: "image_generation.completed", b64_json: b64 })}\n\ndata: [DONE]\n\n`,
    {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    },
  );

const parseGeminiErrorDetail = (raw: string) => {
  try {
    return (JSON.parse(raw)?.error?.message as string) || raw;
  } catch {
    return raw;
  }
};

/** Free-tier image quota is often hard-zero (not a soft rate limit). */
const isFreeTierBlocked = (status: number, detail: string) =>
  status === 429 &&
  (/limit:\s*0/i.test(detail) ||
    /free_tier/i.test(detail) ||
    (/quota/i.test(detail) && /free/i.test(detail)));

const isTransientRateLimit = (status: number, detail: string) =>
  status === 429 && !isFreeTierBlocked(status, detail);

const buildPrompt = ({
  topic,
  markerColors,
  numConcepts,
  difficulty,
  notes,
}: {
  topic: string;
  markerColors: string[];
  numConcepts: number;
  difficulty: string;
  notes?: Notes;
}) => {
  const colorList = markerColors.length ? markerColors.join(", ") : "black, blue, green, orange, red";

  let contentBlock = "";
  if (notes) {
    const parts: string[] = [];
    if (notes.summary) parts.push(`OVERVIEW:\n${notes.summary}`);
    if (notes.keyTerms?.length) {
      parts.push(
        "KEY TERMS — write each term in a colored box with its full definition beneath it (verbatim, do NOT shorten):\n" +
          notes.keyTerms
            .filter((t) => t.term && t.definition)
            .map((t, i) => `${i + 1}. ${t.term}: ${t.definition}`)
            .join("\n"),
      );
    }
    if (notes.keyPoints?.length) {
      parts.push(
        "KEY POINTS — write each as a numbered bullet with a 1–2 sentence explanation beneath:\n" +
          notes.keyPoints
            .filter((p) => p.text)
            .map((p, i) => `${i + 1}. ${p.text}`)
            .join("\n"),
      );
    }
    contentBlock = `\n\nUSE THIS EXACT CONTENT — render every term, definition and point legibly on the board, do not invent or replace it:\n\n${parts.join("\n\n")}`;
  }

  return `Create a highly detailed WHITEBOARD STUDY NOTES infographic about:

"${topic}"

DIFFICULTY LEVEL: ${difficulty} — pitch the explanations, vocabulary and depth at a ${difficulty.toLowerCase()} learner.${contentBlock}

FORMAT & COMPOSITION
- True A4 portrait layout (210 × 297 mm, 1:1.414)
- Entire whiteboard fully visible from edge to edge, all four corners and complete aluminum frame shown
- Small margin around the board so viewers clearly recognize it as a physical whiteboard
- Whiteboard occupies ~85–95% of the image, never cropped
- Straight-on front-facing camera angle, no perspective distortion
- Professional classroom/study-room environment, softly blurred background

CONTENT STRUCTURE
- Large handwritten title centered at the top
- EXACTLY ${numConcepts} major concepts / principles / formulas / key facts, clearly numbered or sectioned
- Every concept MUST include a short DEFINITION and 1–2 lines of explanation/detail beneath it
- For each technical term, draw a small highlighted DEFINITION box ("Def:") with the meaning written clearly
- Organized into multiple sections with dividers and clear visual hierarchy
- Include real-world examples, formulas, step-by-step processes and key takeaways

TEXT LEGIBILITY (CRITICAL — DO NOT SKIP)
- All handwriting MUST be large, neat, perfectly spelled and 100% readable
- Use a minimum text height equivalent to ~18pt; never tiny or scribbled
- High contrast between marker ink and white board — NO faded, blurry, wet, smudged, or half-erased text
- No fake/lorem/gibberish words, no decorative unreadable scribbles, no overlapping text
- Sharp focus across the ENTIRE board, edge to edge — every word in every section must be readable
- Leave generous whitespace between lines and sections so nothing is cramped

VISUAL LEARNING ELEMENTS
- Hand-drawn arrows connecting related ideas
- Educational doodles, sketchnotes, flowcharts, mini graphs, timelines, comparison tables
- Icons, symbols, visual metaphors, boxes, circles, highlights, callout sections

WHITEBOARD STYLE
- Realistic dry-erase marker handwriting, professional teacher-created presentation
- Use ONLY these marker colors: ${colorList}
- Natural marker strokes with crisp, fully-formed letters
- Premium educational sketchnote appearance

The finished image must look like a premium viral educational whiteboard by an expert teacher — every single word fully legible, with clear definitions and explanations for each concept.`;
};

export const Route = createFileRoute("/api/generate-whiteboard")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as Body;
        const topic = body.topic?.trim();
        if (!topic) {
          return new Response(JSON.stringify({ error: "Topic is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const markerColors =
          Array.isArray(body.markerColors) && body.markerColors.length
            ? body.markerColors.slice(0, 6)
            : ["black", "blue", "green", "orange", "red"];
        const numConcepts = Math.min(20, Math.max(5, Number(body.numConcepts) || 12));
        const difficulty: "Beginner" | "Intermediate" | "Advanced" =
          body.difficulty === "Beginner" || body.difficulty === "Advanced"
            ? body.difficulty
            : "Intermediate";

        const prompt = buildPrompt({
          topic,
          markerColors,
          numConcepts,
          difficulty,
          notes: body.notes,
        });

        const userKey = body.geminiKey?.trim();
        if (userKey) {
          let lastError = "";
          let sawFreeTierBlock = false;
          let sawTransient429 = false;

          for (const model of GEMINI_IMAGE_MODELS) {
            let res: Response;
            try {
              res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": userKey,
                  },
                  body: JSON.stringify({
                    contents: [
                      {
                        role: "user",
                        parts: [
                          {
                            text: `${prompt}\n\nOutput a single A4 portrait (2:3 aspect ratio) image. Return the image only.`,
                          },
                        ],
                      },
                    ],
                    generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
                  }),
                  signal: request.signal,
                },
              );
            } catch {
              return new Response("Could not reach Google's API. Check your connection.", {
                status: 502,
              });
            }

            if (!res.ok) {
              const raw = await res.text().catch(() => "");
              const detail = parseGeminiErrorDetail(raw).slice(0, 500);
              lastError = detail;

              if (res.status === 404 || /not found|not supported/i.test(detail)) {
                continue;
              }

              if (isFreeTierBlocked(res.status, detail)) {
                sawFreeTierBlock = true;
                continue;
              }

              if (isTransientRateLimit(res.status, detail)) {
                sawTransient429 = true;
                continue;
              }

              return new Response(`Gemini error (${res.status}): ${detail}`, {
                status: res.status,
              });
            }

            const data = (await res.json()) as any;
            const inline = data?.candidates?.[0]?.content?.parts?.find(
              (p: any) => p.inlineData?.data,
            )?.inlineData;
            if (inline?.data) return sseFromBase64(inline.data as string);

            const blocked =
              data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason;
            lastError = blocked
              ? `Gemini returned no image (${blocked}). Try rephrasing the topic.`
              : "Gemini returned no image data.";
          }

          if (sawFreeTierBlock) {
            return new Response(`Gemini error (429): ${FREE_TIER_IMAGE_MSG}`, {
              status: 429,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
          }
          if (sawTransient429) {
            return new Response(`Gemini error (429): ${RATE_LIMIT_MSG}`, {
              status: 429,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
          }

          return new Response(
            lastError ||
              "Your Gemini key could not generate an image. Image generation may not be enabled for it.",
            { status: 502 },
          );
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-image-2",
            prompt,
            size: "1024x1536",
            quality: "high",
            n: 1,
            stream: true,
            partial_images: 2,
          }),
          signal: request.signal,
        });

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          const status = upstream.status;
          if (status === 429) {
            return new Response(
              text ||
                "Built-in AI is rate-limited right now. Wait a moment and try again, or use your own Gemini key with billing enabled.",
              { status: 429 },
            );
          }
          return new Response(text || "Upstream error", { status });
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
