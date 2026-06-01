import { createFileRoute } from "@tanstack/react-router";

type Body = {
  topic?: string;
  markerColors?: string[];
  numConcepts?: number;
  difficulty?: "Beginner" | "Intermediate" | "Advanced";
};

const buildPrompt = ({
  topic,
  markerColors,
  numConcepts,
  difficulty,
}: {
  topic: string;
  markerColors: string[];
  numConcepts: number;
  difficulty: string;
}) => {
  const colorList = markerColors.length ? markerColors.join(", ") : "black, blue, green, orange, red";
  return `Create a highly detailed WHITEBOARD STUDY NOTES infographic about:

"${topic}"

DIFFICULTY LEVEL: ${difficulty} — pitch the explanations, vocabulary and depth at a ${difficulty.toLowerCase()} learner.

FORMAT & COMPOSITION
- True A4 portrait layout (210 × 297 mm, 1:1.414)
- Entire whiteboard fully visible from edge to edge, all four corners and complete aluminum frame shown
- Small margin around the board so viewers clearly recognize it as a physical whiteboard
- Whiteboard occupies ~85–95% of the image, never cropped
- Straight-on front-facing camera angle
- Professional classroom/study-room environment, softly blurred background

CONTENT STRUCTURE
- Large handwritten title centered at the top
- EXACTLY ${numConcepts} major concepts / principles / formulas / key facts, clearly numbered or sectioned
- Organized into multiple sections with dividers and clear visual hierarchy
- Short clear explanations beneath each point
- Definitions, frameworks, formulas, step-by-step processes
- Real-world examples, quick revision summaries, mnemonic devices
- Key takeaways and margin notes

VISUAL LEARNING ELEMENTS
- Hand-drawn arrows connecting related ideas
- Educational doodles, sketchnotes, flowcharts, mini graphs, timelines, comparison tables
- Icons, symbols, visual metaphors, boxes, circles, highlights, callout sections

WHITEBOARD STYLE
- Realistic dry-erase marker handwriting, professional teacher-created presentation
- Clean highly legible text
- Use ONLY these marker colors: ${colorList}
- Natural marker strokes, authentic whiteboard texture, realistic thickness variations
- Slight dry-erase imperfections for authenticity
- Premium educational sketchnote appearance

The finished image should look like a premium viral educational whiteboard by an expert teacher, with the entire physical whiteboard clearly visible.`;
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
        const markerColors = Array.isArray(body.markerColors) && body.markerColors.length
          ? body.markerColors.slice(0, 6)
          : ["black", "blue", "green", "orange", "red"];
        const numConcepts = Math.min(20, Math.max(5, Number(body.numConcepts) || 12));
        const difficulty: "Beginner" | "Intermediate" | "Advanced" =
          body.difficulty === "Beginner" || body.difficulty === "Advanced"
            ? body.difficulty
            : "Intermediate";

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
            prompt: buildPrompt({ topic, markerColors, numConcepts, difficulty }),
            size: "1024x1536",
            quality: "low",
            n: 1,
            stream: true,
            partial_images: 2,
          }),
          signal: request.signal,
        });

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          return new Response(text || "Upstream error", { status: upstream.status });
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
