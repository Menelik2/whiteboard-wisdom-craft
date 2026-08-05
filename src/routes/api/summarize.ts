import { createFileRoute } from "@tanstack/react-router";

type Segment = { index: number; label: string; title: string; text: string };
type Body = { segments?: Segment[]; filename?: string; geminiKey?: string };

const GEMINI_MODEL = "gemini-2.5-flash";

export const Route = createFileRoute("/api/summarize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { segments, filename, geminiKey } = (await request.json()) as Body;
        if (!segments || segments.length === 0) {
          return new Response(JSON.stringify({ error: "No segments provided" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const userKey = geminiKey?.trim();
        const key = process.env.LOVABLE_API_KEY;
        if (!userKey && !key) {
          return new Response(JSON.stringify({ error: "No AI key available" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
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

        const systemPrompt = `You turn study documents into concise structured notes. Each point and key term MUST cite which ${label.toLowerCase()}(s) it came from using the sources array (numbers only). Always reply by calling the provided function.`;
        const userPrompt = `Document${filename ? ` (${filename})` : ""} — segments are marked like "[${label} N]":\n\n${doc}`;

        const parameters = {
          type: "object",
          properties: {
            topic: { type: "string", description: "2-6 word topic for the whiteboard title." },
            summary: { type: "string", description: "2-3 sentence overview." },
            keyPoints: {
              type: "array",
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
              description: "8-14 concise bullet points with citations.",
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
        } as const;

        let parsed: any;

        if (userKey) {
          // ---- User's own Gemini API key (Google AI Studio) ----
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-goog-api-key": userKey },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: "user", parts: [{ text: userPrompt }] }],
                tools: [
                  {
                    functionDeclarations: [
                      {
                        name: "build_notes",
                        description: "Return structured study notes with source citations.",
                        parameters,
                      },
                    ],
                  },
                ],
                toolConfig: {
                  functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["build_notes"] },
                },
              }),
            },
          );
          if (!res.ok) {
            const t = await res.text().catch(() => "");
            return new Response(
              JSON.stringify({ error: `Gemini error (${res.status}): ${t.slice(0, 400)}` }),
              { status: res.status, headers: { "Content-Type": "application/json" } },
            );
          }
          const data = (await res.json()) as any;
          const call = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.functionCall)
            ?.functionCall;
          if (!call?.args) {
            return new Response(JSON.stringify({ error: "No structured output from Gemini" }), {
              status: 502,
              headers: { "Content-Type": "application/json" },
            });
          }
          parsed = call.args;
        } else {
          const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              tools: [
                {
                  type: "function",
                  function: {
                    name: "build_notes",
                    description: "Return structured study notes with source citations.",
                    parameters,
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
          const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
          if (!args) {
            return new Response(JSON.stringify({ error: "No structured output" }), {
              status: 502,
              headers: { "Content-Type": "application/json" },
            });
          }
          try {
            parsed = JSON.parse(args);
          } catch {
            return new Response(JSON.stringify({ error: "Malformed AI response" }), {
              status: 502,
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        return new Response(JSON.stringify({ ...parsed, sourceLabel: label }), {
          headers: { "Content-Type": "application/json" },
        });

      },
    },
  },
});
