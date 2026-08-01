import { createFileRoute } from "@tanstack/react-router";

type Segment = { index: number; label: string; title: string; text: string };
type Body = { segments?: Segment[]; filename?: string; apiKey?: string };

export const Route = createFileRoute("/api/summarize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { segments, filename, apiKey } = (await request.json()) as Body;
        if (!segments || segments.length === 0) {
          return new Response(JSON.stringify({ error: "No segments provided" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const key = typeof apiKey === "string" ? apiKey.trim() : "";
        if (!key) {
          return new Response(
            JSON.stringify({ error: "Add your Gemini API key in the sidebar first" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }


        const label = segments[0].label;
        // Build a labelled document with explicit citation markers.
        let doc = "";
        let total = 0;
        const CAP = 60_000;
        for (const s of segments) {
          const block = `[${label} ${s.index}] ${s.title}\n${s.text}\n\n`;
          if (total + block.length > CAP) {
            doc += block.slice(0, CAP - total);
            break;
          }
          doc += block;
          total += block.length;
        }

        const schema = {
          type: "object",
          properties: {
            topic: { type: "string", description: "2-6 word topic for the whiteboard title." },
            summary: { type: "string", description: "2-3 sentence overview." },
            keyPoints: {
              type: "array",
              description: "8-14 concise bullet points with citations.",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  sources: {
                    type: "array",
                    items: { type: "integer" },
                    description: `${label} numbers this point came from.`,
                  },
                },
                required: ["text", "sources"],
              },
            },
            keyTerms: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  term: { type: "string" },
                  definition: { type: "string" },
                  sources: { type: "array", items: { type: "integer" } },
                },
                required: ["term", "definition", "sources"],
              },
            },
          },
          required: ["topic", "summary", "keyPoints", "keyTerms"],
        };

        const upstream = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
          {
            method: "POST",
            headers: {
              "x-goog-api-key": key,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              systemInstruction: {
                parts: [
                  {
                    text: `You turn study documents into concise structured notes. Each point and key term MUST cite which ${label.toLowerCase()}(s) it came from using the sources array (numbers only).`,
                  },
                ],
              },
              contents: [
                {
                  role: "user",
                  parts: [
                    {
                      text: `Document${filename ? ` (${filename})` : ""} — segments are marked like "[${label} N]":\n\n${doc}`,
                    },
                  ],
                },
              ],
              generationConfig: {
                responseMimeType: "application/json",
                responseSchema: schema,
              },
            }),
          },
        );

        if (!upstream.ok) {
          const t = await upstream.text().catch(() => "");
          const message =
            upstream.status === 400 || upstream.status === 403
              ? "Your Gemini API key was rejected — check it in the sidebar."
              : upstream.status === 429
                ? "Gemini rate limit reached for your key. Try again shortly."
                : `Gemini error: ${upstream.status} ${t}`;
          return new Response(JSON.stringify({ error: message }), {
            status: upstream.status,
            headers: { "Content-Type": "application/json" },
          });
        }

        const data = (await upstream.json()) as any;
        const text = data?.candidates?.[0]?.content?.parts
          ?.map((p: any) => p?.text ?? "")
          .join("");
        if (!text) {
          return new Response(JSON.stringify({ error: "No structured output" }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }
        let parsed: any;
        try {
          parsed = JSON.parse(text);
        } catch {
          return new Response(JSON.stringify({ error: "Malformed AI response" }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ...parsed, sourceLabel: label }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

