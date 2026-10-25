// Client-side text extraction for PDF, DOCX, PPTX, and plain text files.
// Returns structured segments (slides/pages) so the UI can preview, let the
// user pick which to include, and the summarizer can cite sources.

const MAX_CHARS = 80_000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export type SupportedKind = "pdf" | "docx" | "pptx" | "text";

export type Segment = {
  /** 1-based index */
  index: number;
  /** "Slide" | "Page" | "Section" */
  label: string;
  /** Short topic/title guess (first line or first few words) */
  title: string;
  /** Full text */
  text: string;
};

export type ExtractResult = {
  kind: SupportedKind;
  segments: Segment[];
};

export function detectKind(file: File): SupportedKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".pptx")) return "pptx";
  if (name.endsWith(".txt") || name.endsWith(".md")) return "text";
  if (file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("text/")) return "text";
  return null;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function makeTitle(text: string, fallback: string): string {
  const first = text.split(/\r?\n/).map((s) => s.trim()).find(Boolean) ?? "";
  const clean = first.replace(/\s+/g, " ").slice(0, 80);
  return clean || fallback;
}

async function extractPdf(file: File): Promise<Segment[]> {
  const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const segments: Segment[] = [];
  const pageCount = Math.min(pdf.numPages, 80);
  let total = 0;
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const remaining = MAX_CHARS - total;
    if (remaining <= 0) break;
    const text = content.items.map((it: any) => it.str).join(" ").replace(/\s+/g, " ").trim().slice(0, remaining);
    segments.push({
      index: i,
      label: "Page",
      title: makeTitle(text, `Page ${i}`),
      text,
    });
    total += text.length;
    if (total >= MAX_CHARS) break;
  }
  return segments;
}

async function extractDocx(file: File): Promise<Segment[]> {
  const mammoth = (await import("mammoth")).default;
  const buf = await file.arrayBuffer();
  const { value: extracted } = await mammoth.extractRawText({ arrayBuffer: buf });
  const value = extracted.slice(0, MAX_CHARS);
  // Split on blank lines into rough sections, capped.
  const blocks = value
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  // Group into ~10 sections so previews stay manageable.
  const groupSize = Math.max(1, Math.ceil(blocks.length / 10));
  const segments: Segment[] = [];
  for (let i = 0; i < blocks.length; i += groupSize) {
    const chunk = blocks.slice(i, i + groupSize).join("\n\n");
    const idx = segments.length + 1;
    segments.push({
      index: idx,
      label: "Section",
      title: makeTitle(chunk, `Section ${idx}`),
      text: chunk,
    });
  }
  if (segments.length === 0) {
    segments.push({ index: 1, label: "Section", title: file.name, text: value });
  }
  return segments;
}

async function extractPptx(file: File): Promise<Segment[]> {
  const JSZip = (await import("jszip")).default;
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const slideFiles = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => {
      const n = (s: string) => Number(s.match(/slide(\d+)/)?.[1] ?? 0);
      return n(a) - n(b);
    });
  const segments: Segment[] = [];
  let total = 0;
  for (let i = 0; i < Math.min(slideFiles.length, 100); i++) {
    const xml = await zip.files[slideFiles[i]].async("string");
    const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) ?? [];
    const runs = matches.map((m) => m.replace(/<a:t[^>]*>|<\/a:t>/g, "").trim()).filter(Boolean);
    const remaining = MAX_CHARS - total;
    if (remaining <= 0) break;
    const text = decodeXmlEntities(runs.join("\n")).slice(0, remaining);
    const idx = i + 1;
    segments.push({
      index: idx,
      label: "Slide",
      title: makeTitle(text, `Slide ${idx}`),
      text,
    });
    total += text.length;
    if (total >= MAX_CHARS) break;
  }
  return segments;
}

async function extractTxt(file: File): Promise<Segment[]> {
  const value = await file.text();
  return [{ index: 1, label: "Section", title: file.name, text: value.slice(0, MAX_CHARS) }];
}

export async function extractText(file: File): Promise<ExtractResult> {
  const kind = detectKind(file);
  if (!kind) throw new Error("Unsupported file type. Use PDF, DOCX, PPTX, TXT, or Markdown.");

  let segments: Segment[];
  switch (kind) {
    case "pdf": segments = await extractPdf(file); break;
    case "docx": segments = await extractDocx(file); break;
    case "pptx": segments = await extractPptx(file); break;
    case "text": segments = await extractTxt(file); break;
  }
  segments = segments.filter((s) => s.text.trim().length > 0);
  if (segments.length === 0) throw new Error("Could not extract any text from this file.");
  return { kind, segments };
}
