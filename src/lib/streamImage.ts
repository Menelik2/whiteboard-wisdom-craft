import { flushSync } from "react-dom";

type Payload = {
  type?: string;
  b64_json?: string;
};

/** Map common upstream failures to short, actionable errors. */
function friendlyHttpError(status: number, body: string): string {
  const text = (body || "").trim();
  if (status === 429) {
    if (/limit:\s*0|free_tier|not available on the free tier/i.test(text)) {
      return (
        text.replace(/^Gemini error \(429\):\s*/i, "") ||
        "Gemini image generation needs a paid API project (free-tier image quota is 0). Enable billing or use Built-in AI."
      );
    }
    return (
      text.replace(/^Gemini error \(429\):\s*/i, "") ||
      "Rate limited (429). Wait a minute and try again."
    );
  }
  if (status === 401 || status === 403) {
    return text || "API key was rejected. Check your Gemini key or Built-in AI configuration.";
  }
  if (status >= 500) {
    return text || `Server error (${status}). Try again shortly.`;
  }
  return text || `Request failed: ${status}`;
}

/**
 * Robust SSE parser for the Lovable AI image-gen stream.
 * Parses by JSON `type` field instead of relying on `event:` line, which
 * some proxies strip. Handles CRLF, comments, multi-line data, [DONE].
 */
export async function streamImage(
  endpoint: string,
  body: unknown,
  onFrame: (dataUrl: string, isFinal: boolean) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(friendlyHttpError(res.status, text));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawFinal = false;
  let lastFrame: { url: string; final: boolean } | null = null;

  const handleEventBlock = (block: string) => {
    const dataLines: string[] = [];
    for (let line of block.split("\n")) {
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^ /, ""));
      }
    }
    if (dataLines.length === 0) return;
    const data = dataLines.join("\n");
    if (data === "[DONE]") return;

    let payload: Payload;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    if (!payload.b64_json) return;

    const isFinal = payload.type === "image_generation.completed";
    const url = `data:image/png;base64,${payload.b64_json}`;
    lastFrame = { url, final: isFinal };
    flushSync(() => onFrame(url, isFinal));
    if (isFinal) sawFinal = true;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIdx: number;
    while ((sepIdx = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const block = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx).replace(/^\r?\n\r?\n/, "");
      handleEventBlock(block);
    }
  }
  if (buffer.trim()) handleEventBlock(buffer);

  if (!sawFinal && lastFrame) {
    flushSync(() => onFrame(lastFrame!.url, true));
    return;
  }
  if (!sawFinal && !lastFrame) {
    throw new Error("No image data received");
  }
}
