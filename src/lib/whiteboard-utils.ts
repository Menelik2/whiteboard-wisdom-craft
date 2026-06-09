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
  const pageH = 297;
  const margin = 15;
  const contentW = pageW - margin * 2;

  // Whiteboard marker palette
  const INK: [number, number, number] = [34, 34, 40];
  const MUTED: [number, number, number] = [110, 110, 120];
  const PAPER: [number, number, number] = [253, 251, 244]; // warm cream
  const BLUE: [number, number, number] = [29, 78, 216];
  const GREEN: [number, number, number] = [22, 163, 74];
  const ORANGE: [number, number, number] = [234, 88, 12];
  const RED: [number, number, number] = [220, 38, 38];
  const PURPLE: [number, number, number] = [126, 34, 206];
  const YELLOW_HL: [number, number, number] = [254, 240, 138];
  const STICKY: [number, number, number][] = [
    [255, 244, 191], // yellow
    [255, 214, 214], // pink
    [212, 237, 218], // mint
    [209, 231, 255], // sky
    [233, 218, 255], // lavender
    [255, 230, 199], // peach
  ];
  const POINT_COLORS: [number, number, number][] = [BLUE, GREEN, ORANGE, RED, PURPLE];

  const setRGB = (fn: "setTextColor" | "setDrawColor" | "setFillColor", c: [number, number, number]) =>
    (pdf as any)[fn](c[0], c[1], c[2]);

  const paintPage = () => {
    setRGB("setFillColor", PAPER);
    pdf.rect(0, 0, pageW, pageH, "F");
    // subtle dotted grid
    setRGB("setFillColor", [225, 220, 205]);
    for (let gy = 8; gy < pageH - 4; gy += 6) {
      for (let gx = 8; gx < pageW - 4; gx += 6) {
        pdf.circle(gx, gy, 0.15, "F");
      }
    }
  };

  let y = margin + 5;
  const ensure = (need: number) => {
    if (y + need > pageH - margin - 8) {
      pdf.addPage();
      paintPage();
      y = margin + 5;
    }
  };

  const wrap = (text: string, size: number, maxW: number) => {
    pdf.setFontSize(size);
    return pdf.splitTextToSize(text, maxW);
  };

  paintPage();

  // ===== Header banner =====
  setRGB("setFillColor", INK);
  pdf.roundedRect(margin, y, contentW, 22, 3, 3, "F");
  setRGB("setFillColor", [255, 221, 87]);
  pdf.roundedRect(margin, y, 6, 22, 3, 3, "F");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  setRGB("setTextColor", [255, 221, 87]);
  pdf.text("WHITEBOARD NOTES", margin + 12, y + 7);

  pdf.setFontSize(16);
  setRGB("setTextColor", [255, 255, 255]);
  const titleLines = wrap(notes.topic, 16, contentW - 18);
  pdf.text(titleLines.slice(0, 2), margin + 12, y + 14);
  y += 22 + 8;

  // ===== Summary "marker box" =====
  const summaryLines = wrap(notes.summary, 11, contentW - 14);
  const sumBoxH = summaryLines.length * 5.2 + 14;
  ensure(sumBoxH);
  setRGB("setFillColor", [255, 255, 255]);
  setRGB("setDrawColor", BLUE);
  pdf.setLineWidth(0.8);
  pdf.roundedRect(margin, y, contentW, sumBoxH, 2.5, 2.5, "FD");

  // Tab label
  setRGB("setFillColor", BLUE);
  pdf.roundedRect(margin + 4, y - 3, 28, 6, 1.5, 1.5, "F");
  setRGB("setTextColor", [255, 255, 255]);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("SUMMARY", margin + 18, y + 1.2, { align: "center" });

  setRGB("setTextColor", INK);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(summaryLines, margin + 7, y + 9);
  y += sumBoxH + 8;

  // ===== Key Points =====
  if (notes.keyPoints?.length) {
    ensure(14);
    // Section header underline like marker
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    setRGB("setTextColor", INK);
    pdf.text("Key Points", margin, y);
    setRGB("setFillColor", [255, 221, 87]);
    pdf.rect(margin, y + 1.5, 38, 2.5, "F");
    y += 9;

    notes.keyPoints.forEach((p, i) => {
      const color = POINT_COLORS[i % POINT_COLORS.length];
      const bodyW = contentW - 14;
      const lines = wrap(p.text, 11, bodyW);
      const srcText = p.sources?.length ? `${notes.sourceLabel} ${p.sources.join(", ")}` : "";
      const boxH = lines.length * 5.2 + (srcText ? 6 : 0) + 8;
      ensure(boxH + 3);

      // Colored left bar
      setRGB("setFillColor", color);
      pdf.roundedRect(margin, y, 3, boxH, 1.5, 1.5, "F");

      // Card
      setRGB("setFillColor", [255, 255, 255]);
      setRGB("setDrawColor", [230, 226, 215]);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(margin + 4, y, contentW - 4, boxH, 2, 2, "FD");

      // Number badge
      setRGB("setFillColor", color);
      pdf.circle(margin + 10, y + 6, 3.2, "F");
      setRGB("setTextColor", [255, 255, 255]);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.text(String(i + 1), margin + 10, y + 7.3, { align: "center" });

      // Text
      setRGB("setTextColor", INK);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.text(lines, margin + 16, y + 6);

      if (srcText) {
        const ty = y + 6 + lines.length * 5.2 + 2;
        pdf.setFontSize(8);
        const tw = pdf.getTextWidth(srcText) + 4;
        setRGB("setFillColor", YELLOW_HL);
        pdf.roundedRect(margin + 16, ty - 3, tw, 4.5, 1, 1, "F");
        setRGB("setTextColor", [80, 60, 0]);
        pdf.setFont("helvetica", "bold");
        pdf.text(srcText, margin + 18, ty);
      }

      y += boxH + 4;
    });
    y += 4;
  }

  // ===== Key Terms (sticky notes grid) =====
  if (notes.keyTerms?.length) {
    ensure(14);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    setRGB("setTextColor", INK);
    pdf.text("Key Terms", margin, y);
    setRGB("setFillColor", [167, 243, 208]);
    pdf.rect(margin, y + 1.5, 34, 2.5, "F");
    y += 9;

    const gap = 4;
    const colW = (contentW - gap) / 2;
    let col = 0;
    let rowMaxH = 0;
    let rowStartY = y;

    notes.keyTerms.forEach((t, i) => {
      const sticky = STICKY[i % STICKY.length];
      const termLines = wrap(t.term, 11, colW - 8);
      const defLines = wrap(t.definition, 9.5, colW - 8);
      const srcText = t.sources?.length ? `${notes.sourceLabel} ${t.sources.join(", ")}` : "";
      const h = termLines.length * 5 + defLines.length * 4.6 + (srcText ? 6 : 0) + 10;

      if (col === 0) {
        ensure(h);
        rowStartY = y;
        rowMaxH = 0;
      }

      const x = margin + col * (colW + gap);
      // Sticky shadow
      setRGB("setFillColor", [220, 215, 200]);
      pdf.roundedRect(x + 0.8, rowStartY + 0.8, colW, h, 1.5, 1.5, "F");
      // Sticky
      setRGB("setFillColor", sticky);
      pdf.roundedRect(x, rowStartY, colW, h, 1.5, 1.5, "F");

      // Term
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      setRGB("setTextColor", INK);
      pdf.text(termLines, x + 4, rowStartY + 6);

      // Definition
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9.5);
      setRGB("setTextColor", [60, 55, 50]);
      pdf.text(defLines, x + 4, rowStartY + 6 + termLines.length * 5 + 1);

      if (srcText) {
        const ty = rowStartY + 6 + termLines.length * 5 + defLines.length * 4.6 + 3;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7.5);
        setRGB("setTextColor", MUTED);
        pdf.text(srcText, x + 4, ty);
      }

      rowMaxH = Math.max(rowMaxH, h);
      col = col === 0 ? 1 : 0;
      if (col === 0) {
        y = rowStartY + rowMaxH + gap;
      }
    });
    if (col === 1) y = rowStartY + rowMaxH + gap;
  }

  // ===== Footer on every page =====
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    setRGB("setDrawColor", [220, 215, 200]);
    pdf.setLineWidth(0.3);
    pdf.line(margin, pageH - 10, pageW - margin, pageH - 10);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    setRGB("setTextColor", MUTED);
    pdf.text("Whiteboard Notes AI", margin, pageH - 6);
    pdf.text(`Page ${i} of ${pageCount}`, pageW - margin, pageH - 6, { align: "right" });
  }

  pdf.save(`notes-${safeName(notes.topic)}.pdf`);
};
