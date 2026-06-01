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
