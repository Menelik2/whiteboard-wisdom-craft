// Client-side text extraction for PDF, DOCX, PPTX, and plain text files.
// All heavy parsers are dynamically imported inside functions to keep them
// out of the SSR module graph (mammoth/jszip/pdfjs touch browser-only APIs).


const MAX_CHARS = 80_000;

export type SupportedKind = "pdf" | "docx" | "pptx" | "text";

export function detectKind(file: File): SupportedKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".pptx") || name.endsWith(".ppt")) return "pptx";
  if (name.endsWith(".txt") || name.endsWith(".md")) return "text";
  if (file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("text/")) return "text";
  return null;
}

async function extractPdf(file: File): Promise<string> {
  // Dynamic import keeps pdfjs out of the initial bundle.
  const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  const pageCount = Math.min(pdf.numPages, 80);
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it: any) => it.str).join(" ");
    parts.push(text);
    if (parts.join("\n").length > MAX_CHARS) break;
  }
  return parts.join("\n\n");
}

async function extractDocx(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
  return value;
}

async function extractPptx(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const slideFiles = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => {
      const n = (s: string) => Number(s.match(/slide(\d+)/)?.[1] ?? 0);
      return n(a) - n(b);
    });
  const parts: string[] = [];
  for (const path of slideFiles) {
    const xml = await zip.files[path].async("string");
    // Extract <a:t>...</a:t> text runs.
    const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) ?? [];
    const text = matches
      .map((m) => m.replace(/<a:t[^>]*>|<\/a:t>/g, ""))
      .join(" ");
    parts.push(`Slide ${parts.length + 1}: ${text}`);
    if (parts.join("\n").length > MAX_CHARS) break;
  }
  return parts.join("\n\n");
}

export async function extractText(file: File): Promise<{ kind: SupportedKind; text: string }> {
  const kind = detectKind(file);
  if (!kind) throw new Error("Unsupported file type. Use PDF, DOCX, PPTX, or TXT.");

  let text: string;
  switch (kind) {
    case "pdf":
      text = await extractPdf(file);
      break;
    case "docx":
      text = await extractDocx(file);
      break;
    case "pptx":
      text = await extractPptx(file);
      break;
    case "text":
      text = await file.text();
      break;
  }
  text = text.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new Error("Could not extract any text from this file.");
  return { kind, text: text.slice(0, MAX_CHARS) };
}
