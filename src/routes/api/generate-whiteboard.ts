import { createFileRoute } from "@tanstack/react-router";

const buildPrompt = (topic: string) => `Create a highly detailed WHITEBOARD STUDY NOTES infographic about:

"${topic}"

FORMAT & COMPOSITION
- True A4 portrait layout (210 × 297 mm ratio, 1:1.414)
- Entire whiteboard fully visible from edge to edge, all four corners and complete aluminum frame shown
- Small margin around the board so viewers clearly recognize it as a physical whiteboard
- Whiteboard occupies ~85–95% of the image while remaining completely visible
- Straight-on front-facing camera angle
- Professional classroom/study-room environment, softly blurred background
- No cropping of the board, frame, corners, or edges

CONTENT STRUCTURE
- Large handwritten title centered at the top
- 10–15 major concepts, principles, formulas, lessons or key facts
- Organized into multiple sections with dividers and clear visual hierarchy
- Short clear explanations beneath each point
- Definitions, frameworks, formulas, exam-focused info
- Step-by-step processes where appropriate
- Real-world examples, quick revision summaries, mnemonic devices
- Key takeaways and margin notes

VISUAL LEARNING ELEMENTS
- Hand-drawn arrows connecting related ideas
- Educational doodles, sketchnotes, flowcharts, mini graphs, timelines, comparison tables
- Icons, symbols, visual metaphors, boxes, circles, highlights and callout sections

WHITEBOARD STYLE
- Realistic dry-erase marker handwriting, professional teacher-created presentation
- Clean highly legible text, black marker for primary notes
- Blue, green, orange and red marker accents
- Natural marker strokes, authentic whiteboard texture, realistic thickness variations
- Slight dry-erase imperfections for authenticity
- Premium educational sketchnote appearance

The finished image should look like a premium viral educational whiteboard by an expert teacher, with the entire physical whiteboard clearly visible.`;

export const Route = createFileRoute("/api/generate-whiteboard")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { topic } = (await request.json()) as { topic?: string };
        if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
          return new Response(JSON.stringify({ error: "Topic is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
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
            prompt: buildPrompt(topic.trim()),
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
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
