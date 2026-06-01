import { flushSync } from "react-dom";

type Payload = {
  type?: string;
  b64_json?: string;
};

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
    throw new Error(text || `Request failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawFinal = false;
  let lastFrame: { url: string; final: boolean } | null = null;

  const handleEventBlock = (block: string) => {
    // collect data: lines
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
    try { payload = JSON.parse(data); } catch { return; }
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
    // SSE events are separated by a blank line (\n\n, possibly \r\n\r\n)
    while ((sepIdx = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const block = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx).replace(/^\r?\n\r?\n/, "");
      handleEventBlock(block);
    }
  }
  if (buffer.trim()) handleEventBlock(buffer);

  // If the upstream never sent an explicit completed marker but we did
  // receive at least one image, treat the last frame as final so the UI
  // unblurs and the user gets the result.
  if (!sawFinal && lastFrame) {
    flushSync(() => onFrame(lastFrame!.url, true));
    return;
  }
  if (!sawFinal && !lastFrame) {
    throw new Error("No image data received");
  }
}
