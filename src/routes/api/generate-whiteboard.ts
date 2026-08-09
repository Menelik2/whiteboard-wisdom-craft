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
  /** Ignored: Gemini keys are text-only (summarize). Images always use built-in AI. */
  geminiKey?: string;
};

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

        // Whiteboard images always use the site built-in generator.
        // User Gemini keys are text-only (document summarize via /api/summarize).
        // Free-tier Gemini image quota is often 0 and is not used here.

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
              text || "Built-in AI is rate-limited right now. Wait a moment and try again.",
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
