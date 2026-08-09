import { createFileRoute } from "@tanstack/react-router";
import { GEMINI_TEXT_MODELS } from "@/lib/gemini-models";

type Segment = { index: number; label: string; title: string; text: string };
type Body = { segments?: Segment[]; filename?: string; geminiKey?: string };

/** System instruction for Gemini text (and built-in path). */
function buildSystemPrompt(label: string) {
  const unit = label.toLowerCase();
  return [
    "You are a study-notes engine for exam-ready whiteboard material.",
    "Read only the provided document segments. Do not invent facts that are not supported by the text.",
    "",
    "Output rules:",
    "1. Always call the function build_notes exactly once. Never reply with plain prose.",
    `2. Every keyPoint and keyTerm MUST include sources: an array of ${unit} numbers (integers only) that support that item.`,
    "3. Prefer fewer, denser points over long paragraphs. Each keyPoint is one clear idea in 1–2 short sentences.",
    "4. keyTerms: short term names + precise definitions (one sentence) grounded in the document.",
    "5. topic: 2–6 words suitable as a whiteboard title (no trailing punctuation).",
    "6. summary: 2–3 sentences covering the main idea and scope of the selected segments.",
    "7. Target 8–12 keyPoints and 5–10 keyTerms unless the document is very short.",
    "8. Use plain language a student can copy onto a board. Avoid fluff, filler, and marketing tone.",
  ].join("\n");
}

function buildUserPrompt(label: string, filename: string | undefined, doc: string) {
  return [
    `Task: Extract structured study notes from the document below.`,
    filename ? `Filename: ${filename}` : null,
    `Segments are labeled [${label} N]. Cite sources using those N values only.`,
    "",
    "Document:",
    doc.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildNotesParameters(label: string) {
  return {
    type: "object",
    properties: {
      topic: {
        type: "string",
        description: "Whiteboard title: 2–6 words, specific to the content, no period at the end.",
      },
      summary: {
        type: "string",
        description: "2–3 sentence overview of what the selected segments teach.",
      },
      keyPoints: {
        type: "array",
        description: "8–12 high-value study bullets. One idea each; 1–2 sentences max.",
        items: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "A single exam-worthy fact, rule, step, or explanation.",
            },
            sources: {
              type: "array",
              items: { type: "integer" },
              description: `${label} numbers that support this point (at least one).`,
            },
          },
          required: ["text", "sources"],
        },
      },
      keyTerms: {
        type: "array",
        description: "5–10 important terms with definitions from the document.",
        items: {
          type: "object",
          properties: {
            term: {
              type: "string",
              description: "Short term or phrase as it should appear on a whiteboard.",
            },
            definition: {
              type: "string",
              description: "One precise sentence definition grounded in the source text.",
            },
            sources: {
              type: "array",
              items: { type: "integer" },
              description: `${label} numbers that support this definition.`,
            },
          },
          required: ["term", "definition", "sources"],
        },
      },
    },
    required: ["topic", "summary", "keyPoints", "keyTerms"],
  } as const;
}

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
          const title = (s.title || "").trim();
          const text = (s.text || "").trim();
          if (!text) continue;
          const block = `[${label} ${s.index}] ${title}\n${text}\n\n`;
          if (total + block.length > CAP) {
            doc += block.slice(0, CAP - total);
            break;
          }
          doc += block;
          total += block.length;
        }

        if (!doc.trim()) {
          return new Response(JSON.stringify({ error: "Selected segments have no readable text" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const systemPrompt = buildSystemPrompt(label);
        const userPrompt = buildUserPrompt(label, filename, doc);
        const parameters = buildNotesParameters(label);

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
                          description:
                            "Return structured study notes (topic, summary, keyPoints, keyTerms) with source citations for a whiteboard.",
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
                  generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 4096,
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
                error: lastDetail || "No supported Gemini text model available for this key.",
              }),
              { status: lastStatus, headers: { "Content-Type": "application/json" } },
            );
          }
        } else {
          const strictSchema = {
            type: "object",
            additionalProperties: false,
            properties: {
              topic: {
                type: "string",
                description: "Whiteboard title: 2–6 words, specific to the content, no period at the end.",
              },
              summary: {
                type: "string",
                description: "2–3 sentence overview of what the selected segments teach.",
              },
              keyPoints: {
                type: "array",
                description: "8–12 high-value study bullets. One idea each; 1–2 sentences max.",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    text: { type: "string" },
                    sources: {
                      type: "array",
                      items: { type: "integer" },
                      description: `${label} numbers that support this point.`,
                    },
                  },
                  required: ["text", "sources"],
                },
              },
              keyTerms: {
                type: "array",
                description: "5–10 important terms with definitions from the document.",
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
