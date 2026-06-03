import { jsPDF } from "jspdf";

export type HistoryItem = {
  id: string;
  topic: string;
  difficulty: string;
  numConcepts: number;
  markerColors: string[];
  dataUrl: string;
  createdAt: number;
};

const KEY = "whiteboard-history-v1";
const MAX_ITEMS = 12;

export const loadHistory = (): HistoryItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
  } catch {
    return [];
  }
};

export const saveToHistory = (item: HistoryItem) => {
  if (typeof window === "undefined") return;
  const list = [item, ...loadHistory().filter((i) => i.id !== item.id)].slice(0, MAX_ITEMS);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // quota — drop oldest until it fits
    let trimmed = list.slice();
    while (trimmed.length > 1) {
      trimmed = trimmed.slice(0, -1);
      try {
        window.localStorage.setItem(KEY, JSON.stringify(trimmed));
        return;
      } catch { /* keep trimming */ }
    }
  }
};

export const removeFromHistory = (id: string) => {
  if (typeof window === "undefined") return;
  const list = loadHistory().filter((i) => i.id !== id);
  window.localStorage.setItem(KEY, JSON.stringify(list));
};

const safeName = (t: string) =>
  t.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "whiteboard";

export const downloadPng = (dataUrl: string, topic: string) => {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `whiteboard-${safeName(topic)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

export const downloadPdf = async (dataUrl: string, topic: string) => {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not load image for PDF"));
    img.src = dataUrl;
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const pageH = 297;
  const ratio = img.width / img.height;
  let w = pageW;
  let h = pageW / ratio;
  if (h > pageH) {
    h = pageH;
    w = pageH * ratio;
  }
  const x = (pageW - w) / 2;
  const y = (pageH - h) / 2;
  pdf.addImage(dataUrl, "PNG", x, y, w, h, undefined, "FAST");
  pdf.save(`whiteboard-${safeName(topic)}.pdf`);
};

export const downloadNotesPdf = (notes: {
  topic: string;
  summary: string;
  keyPoints: { text: string; sources: number[] }[];
  keyTerms: { term: string; definition: string; sources: number[] }[];
  sourceLabel: string;
}) => {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const margin = 20;
  let y = 20;
  const lineHeight = 5.5;

  const addText = (text: string, size: number, style: "normal" | "bold" = "normal", color?: [number, number, number]) => {
    pdf.setFontSize(size);
    pdf.setFont("helvetica", style);
    if (color) pdf.setTextColor(color[0], color[1], color[2]);
    else pdf.setTextColor(0, 0, 0);
  };

  const wrapped = (text: string, size: number, maxW = pageW - margin * 2) => {
    pdf.setFontSize(size);
    return pdf.splitTextToSize(text, maxW);
  };

  // Title
  addText(notes.topic, 18, "bold", [30, 30, 30]);
  const titleLines = wrapped(notes.topic, 18);
  pdf.text(titleLines, margin, y);
  y += titleLines.length * 7 + 3;

  // Divider
  pdf.setDrawColor(200, 200, 200);
  pdf.line(margin, y, pageW - margin, y);
  y += 6;

  // Summary
  addText("Summary", 12, "bold", [60, 60, 60]);
  pdf.text("Summary", margin, y);
  y += lineHeight + 1;
  addText(notes.summary, 10, "normal", [50, 50, 50]);
  const summaryLines = wrapped(notes.summary, 10);
  pdf.text(summaryLines, margin, y);
  y += summaryLines.length * lineHeight + 6;

  // Key Points
  if (notes.keyPoints?.length) {
    if (y > 260) { pdf.addPage(); y = 20; }
    addText("Key Points", 12, "bold", [60, 60, 60]);
    pdf.text("Key Points", margin, y);
    y += lineHeight + 2;

    notes.keyPoints.forEach((p, i) => {
      if (y > 270) { pdf.addPage(); y = 20; }
      const num = `${i + 1}.`;
      addText(num, 10, "bold", [30, 30, 30]);
      pdf.text(num, margin, y);

      const bodyW = pageW - margin * 2 - 8;
      addText(p.text, 10, "normal", [40, 40, 40]);
      const lines = wrapped(p.text, 10, bodyW);
      pdf.text(lines, margin + 8, y);
      y += lines.length * lineHeight;

      if (p.sources?.length) {
        addText(`[${notes.sourceLabel} ${p.sources.join(", ")}]`, 8, "normal", [120, 120, 120]);
        pdf.text(`[${notes.sourceLabel} ${p.sources.join(", ")}]`, margin + 8, y);
        y += 4;
      }
      y += 2;
    });
    y += 4;
  }

  // Key Terms
  if (notes.keyTerms?.length) {
    if (y > 260) { pdf.addPage(); y = 20; }
    addText("Key Terms", 12, "bold", [60, 60, 60]);
    pdf.text("Key Terms", margin, y);
    y += lineHeight + 2;

    notes.keyTerms.forEach((t) => {
      if (y > 270) { pdf.addPage(); y = 20; }
      addText(t.term, 10, "bold", [30, 30, 30]);
      const termLines = wrapped(t.term, 10);
      pdf.text(termLines, margin, y);
      y += termLines.length * lineHeight;

      addText(t.definition, 10, "normal", [50, 50, 50]);
      const defLines = wrapped(t.definition, 10);
      pdf.text(defLines, margin + 3, y);
      y += defLines.length * lineHeight;

      if (t.sources?.length) {
        addText(`[${notes.sourceLabel} ${t.sources.join(", ")}]`, 8, "normal", [120, 120, 120]);
        pdf.text(`[${notes.sourceLabel} ${t.sources.join(", ")}]`, margin + 3, y);
        y += 4;
      }
      y += 3;
    });
  }

  // Footer
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    addText("", 8, "normal", [150, 150, 150]);
    pdf.text(`Page ${i} of ${pageCount}`, pageW - margin, 287, { align: "right" });
    addText("Generated by Whiteboard Notes AI", 8, "normal", [150, 150, 150]);
    pdf.text("Generated by Whiteboard Notes AI", margin, 287);
  }

  pdf.save(`notes-${safeName(notes.topic)}.pdf`);
};
