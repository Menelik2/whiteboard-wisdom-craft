import { createFileRoute } from "@tanstack/react-router";
import { GEMINI_IMAGE_MODELS } from "@/lib/gemini-models";

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
  /** Optional user-provided Gemini API key; never stored server-side. */
  geminiKey?: string;
};

const ALLOWED_MARKER_COLORS = new Set(["black", "blue", "green", "orange", "red", "purple"]);

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

function sanitizeNotes(input: unknown): Notes | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const notes = input as Notes;
  const summary = typeof notes.summary === "string" ? notes.summary.trim().slice(0, 5_000) : "";
  const keyTerms = Array.isArray(notes.keyTerms)
    ? notes.keyTerms.slice(0, 30).flatMap((item) => {
        if (!item || typeof item.term !== "string" || typeof item.definition !== "string") return [];
        const term = item.term.trim().slice(0, 200);
        const definition = item.definition.trim().slice(0, 2_000);
        return term && definition ? [{ term, definition }] : [];
      })
    : [];
  const keyPoints = Array.isArray(notes.keyPoints)
    ? notes.keyPoints.slice(0, 40).flatMap((item) => {
        if (!item || typeof item.text !== "string") return [];
        const text = item.text.trim().slice(0, 1_000);
        return text ? [{ text }] : [];
      })
    : [];
  if (!summary && keyTerms.length === 0 && keyPoints.length === 0) return undefined;
  return { summary, keyTerms, keyPoints };
}

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
        const contentLength = Number(request.headers.get("content-length") ?? 0);
        if (Number.isFinite(contentLength) && contentLength > 200_000) {
          return jsonResponse({ error: "Request is too large. Shorten the notes and try again." }, 413);
        }

        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return jsonResponse({ error: "Invalid JSON request body." }, 400);
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          return jsonResponse({ error: "Invalid request body." }, 400);
        }

        const topic = typeof body.topic === "string" ? body.topic.trim() : "";
        if (!topic) return jsonResponse({ error: "Topic is required" }, 400);
        if (topic.length > 500) {
          return jsonResponse({ error: "Topic must be 500 characters or fewer." }, 400);
        }

        const requestedColors = Array.isArray(body.markerColors)
          ? [...new Set(
              body.markerColors
                .filter((color): color is string =>
                  typeof color === "string" && ALLOWED_MARKER_COLORS.has(color.toLowerCase()),
                )
                .map((color) => color.toLowerCase()),
            )].slice(0, 6)
          : [];
        const markerColors = requestedColors.length
          ? requestedColors
          : ["black", "blue", "green", "orange", "red"];
        const requestedConcepts = Number(body.numConcepts);
        const numConcepts = Number.isFinite(requestedConcepts)
          ? Math.min(20, Math.max(5, Math.round(requestedConcepts)))
          : 12;
        const difficulty: "Beginner" | "Intermediate" | "Advanced" =
          body.difficulty === "Beginner" || body.difficulty === "Advanced"
            ? body.difficulty
            : "Intermediate";

        const prompt = buildPrompt({
          topic,
          markerColors,
          numConcepts,
          difficulty,
          notes: sanitizeNotes(body.notes),
        });

        const userGeminiKey = typeof body.geminiKey === "string" ? body.geminiKey.trim() : "";
        if (userGeminiKey.length > 512) {
          return jsonResponse({ error: "Gemini API key is too long." }, 400);
        }

        // If the user configured Gemini in the app, use Gemini for image generation.
        // Keep the existing gateway as a backward-compatible fallback when no Gemini key is configured.
        if (userGeminiKey) {
          let lastDetail = "No supported Gemini image model returned an image.";
          let lastStatus = 502;

          for (const model of GEMINI_IMAGE_MODELS) {
            let upstream: Response;
            try {
              upstream = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": userGeminiKey,
                  },
                  body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
                  }),
                  signal: request.signal,
                },
              );
            } catch (error) {
              if ((error as Error).name === "AbortError") throw error;
              return jsonResponse(
                { error: "Could not reach the Gemini API. Check your connection and retry." },
                502,
              );
            }

            if (!upstream.ok) {
              const raw = await upstream.text().catch(() => "");
              let detail = raw;
              try {
                detail = JSON.parse(raw)?.error?.message || raw;
              } catch {
                // Keep the raw response when the upstream does not return JSON.
              }
              lastDetail = detail.slice(0, 500) || `HTTP ${upstream.status}`;
              lastStatus = upstream.status;

              // Model availability varies by Google account and API rollout. Only
              // retry another model for a missing/unsupported model, not for
              // invalid credentials, quota exhaustion, or other real failures.
              if (
                upstream.status === 404 ||
                /model.*(not found|not supported|unknown)|not found.*model/i.test(detail)
              ) {
                continue;
              }

              const status =
                upstream.status === 429
                  ? 429
                  : upstream.status === 401 || upstream.status === 403
                    ? upstream.status
                    : 502;
              return jsonResponse({ error: `Gemini image generation failed: ${lastDetail}` }, status);
            }

            let result: {
              candidates?: Array<{
                content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
              }>;
            };
            try {
              result = await upstream.json();
            } catch {
              lastDetail = "Gemini returned an unreadable response.";
              lastStatus = 502;
              continue;
            }

            const imagePart = result.candidates
              ?.flatMap((candidate) => candidate.content?.parts ?? [])
              .find((part) => part.inlineData?.data);
            if (!imagePart?.inlineData?.data) {
              lastDetail = "Gemini returned no image. Try a shorter topic or try again.";
              lastStatus = 502;
              continue;
            }

            const event = `data: ${JSON.stringify({
              type: "image_generation.completed",
              b64_json: imagePart.inlineData.data,
            })}\n\n`;
            return new Response(event, {
              headers: {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                "X-Accel-Buffering": "no",
              },
            });
          }

          return jsonResponse(
            { error: `Gemini image generation failed: ${lastDetail}` },
            lastStatus === 429 || lastStatus === 401 || lastStatus === 403 ? lastStatus : 502,
          );
        }

        // Backward-compatible built-in image generation when no Gemini key is configured.
        const key =
          process.env.LOVABLE_API_KEY?.trim() ||
          process.env.LOVABLE_AI_API_KEY?.trim() ||
          process.env.AI_GATEWAY_API_KEY?.trim();

        if (!key) {
          return new Response(JSON.stringify({
            error: "Add and verify your Gemini API key in the app settings to generate images with Gemini. Alternatively, configure LOVABLE_API_KEY on the server.",
          }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }

        let upstream: Response;
        try {
          upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
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
        } catch (error) {
          if ((error as Error).name === "AbortError") throw error;
          return jsonResponse({ error: "Could not reach the built-in image service. Check your connection and retry." }, 502);
        }

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          const status = upstream.status;
          if (status === 429) {
            return new Response(text || "Built-in AI is rate-limited right now. Wait a moment and try again.", { status: 429 });
          }
          return new Response(text || "Upstream error", { status: status || 502 });
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
