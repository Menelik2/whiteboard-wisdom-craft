import { createFileRoute } from "@tanstack/react-router";

type Segment = { index: number; label: string; title: string; text: string };
type Body = { segments?: Segment[]; filename?: string; geminiKey?: string };

/** Real generateContent model ids (there is no "gemini-3.1-flash"). */
const GEMINI_TEXT_MODELS = [
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
] as const;

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
          let lastDetail = "";
          let lastStatus = 502;

          for (const model of GEMINI_TEXT_MODELS) {
            const res = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
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
                    functionCallingConfig: {
                      mode: "ANY",
                      allowedFunctionNames: ["build_notes"],
                    },
                  },
                }),
                signal: request.signal,
              },
            );

            if (!res.ok) {
              const t = await res.text().catch(() => "");
              let detail = t.slice(0, 400);
              try {
                detail = JSON.parse(t)?.error?.message || detail;
              } catch {
                /* keep */
              }
              lastDetail = detail;
              lastStatus = res.status;

              if (res.status === 404 || /not found|not supported/i.test(detail)) continue;

              if (res.status === 429) {
                const msg = /limit:\s*0|free_tier/i.test(detail)
                  ? "Gemini quota exhausted for this key (free tier). Enable billing or try again later."
                  : "Gemini is rate-limiting this key. Wait a minute and try again.";
                return new Response(JSON.stringify({ error: msg }), {
                  status: 429,
                  headers: { "Content-Type": "application/json" },
                });
              }

              return new Response(
                JSON.stringify({ error: `Gemini error (${res.status}): ${detail}` }),
                { status: res.status, headers: { "Content-Type": "application/json" } },
              );
            }

            const data = (await res.json()) as any;
            const call = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.functionCall)
              ?.functionCall;
            if (!call?.args) {
              lastDetail = "No structured output from Gemini";
              lastStatus = 502;
              continue;
            }
            parsed = call.args;
            break;
          }

          if (!parsed) {
            return new Response(
              JSON.stringify({
                error:
                  lastDetail ||
                  "No supported Gemini text model available for this key.",
              }),
              { status: lastStatus, headers: { "Content-Type": "application/json" } },
            );
          }
        } else {
          const strictSchema = {
            type: "object",
            additionalProperties: false,
            properties: {
              topic: { type: "string", description: "2-6 word topic for the whiteboard title." },
              summary: { type: "string", description: "2-3 sentence overview." },
              keyPoints: {
                type: "array",
                description: "8-14 concise bullet points with citations.",
                items: {
                  type: "object",
                  additionalProperties: false,
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
                  additionalProperties: false,
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

          const upstream = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Lovable-API-Key": key!,
              "X-Lovable-AIG-SDK": "fetch",
            },
            body: JSON.stringify({
              model: "openai/gpt-5.4-mini",
              stream: true,
              instructions: systemPrompt,
              input: [{ role: "user", content: [{ type: "input_text", text: userPrompt }] }],
              text: {
                format: {
                  type: "json_schema",
                  name: "build_notes",
                  strict: true,
                  schema: strictSchema,
                },
              },
            }),
            signal: request.signal,
          });

          if (!upstream.ok || !upstream.body) {
            const t = await upstream.text().catch(() => "");
            return new Response(
              JSON.stringify({ error: `AI gateway error: ${upstream.status} ${t.slice(0, 400)}` }),
              { status: upstream.status, headers: { "Content-Type": "application/json" } },
            );
          }

          const reader = upstream.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let text = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const evt = JSON.parse(payload) as any;
                if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
                  text += evt.delta;
                } else if (evt.type === "response.completed" && evt.response?.output_text) {
                  text = Array.isArray(evt.response.output_text)
                    ? evt.response.output_text.join("")
                    : String(evt.response.output_text);
                }
              } catch {
                /* ignore partial frames */
              }
            }
          }

          try {
            parsed = JSON.parse(text);
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
