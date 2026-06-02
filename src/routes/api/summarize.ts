import { createFileRoute } from "@tanstack/react-router";

type Body = { text?: string; filename?: string };

export const Route = createFileRoute("/api/summarize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { text, filename } = (await request.json()) as Body;
        const clean = (text ?? "").trim();
        if (!clean) {
          return new Response(JSON.stringify({ error: "No text provided" }), {
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

        const truncated = clean.slice(0, 60_000);

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content:
                  "You turn study documents into concise structured notes. Always reply by calling the provided function.",
              },
              {
                role: "user",
                content: `Document${filename ? ` (${filename})` : ""}:\n\n${truncated}`,
              },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "build_notes",
                  description: "Return structured study notes for the document.",
                  parameters: {
                    type: "object",
                    properties: {
                      topic: {
                        type: "string",
                        description: "A short 2-6 word topic suitable for a whiteboard title.",
                      },
                      summary: {
                        type: "string",
                        description: "A 2-3 sentence overview of the document.",
                      },
                      keyPoints: {
                        type: "array",
                        items: { type: "string" },
                        description: "8-14 concise bullet points covering the most important ideas.",
                      },
                      keyTerms: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            term: { type: "string" },
                            definition: { type: "string" },
                          },
                          required: ["term", "definition"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["topic", "summary", "keyPoints", "keyTerms"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "build_notes" } },
          }),
        });

        if (!upstream.ok) {
          const t = await upstream.text().catch(() => "");
          return new Response(
            JSON.stringify({ error: `AI gateway error: ${upstream.status} ${t}` }),
            { status: upstream.status, headers: { "Content-Type": "application/json" } },
          );
        }

        const data = (await upstream.json()) as any;
        const call = data?.choices?.[0]?.message?.tool_calls?.[0];
        const args = call?.function?.arguments;
        if (!args) {
          return new Response(JSON.stringify({ error: "No structured output" }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(args);
        } catch {
          return new Response(JSON.stringify({ error: "Malformed AI response" }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify(parsed), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
