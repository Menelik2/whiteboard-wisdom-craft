import { describe, expect, it, beforeEach, vi } from "vitest";

import { loadHistory, saveToHistory, removeFromHistory, type HistoryItem } from "./whiteboard-utils";

const makeItem = (id: string): HistoryItem => ({
  id,
  topic: `Topic ${id}`,
  difficulty: "beginner",
  numConcepts: 8,
  markerColors: ["black", "blue"],
  dataUrl: "data:image/png;base64,AAAA",
  createdAt: Date.now(),
});

function installLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  vi.stubGlobal("window", { localStorage });
  return store;
}

describe("whiteboard history", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    installLocalStorage();
  });

  it("returns an empty list when nothing is stored", () => {
    expect(loadHistory()).toEqual([]);
  });

  it("saves and reads back an item", () => {
    saveToHistory(makeItem("a"));
    expect(loadHistory().map((i) => i.id)).toEqual(["a"]);
  });

  it("keeps newest first and de-duplicates by id", () => {
    saveToHistory(makeItem("a"));
    saveToHistory(makeItem("b"));
    saveToHistory(makeItem("a"));
    expect(loadHistory().map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("caps history at 12 entries", () => {
    for (let i = 0; i < 20; i++) saveToHistory(makeItem(`id-${i}`));
    expect(loadHistory()).toHaveLength(12);
  });

  it("removes an item by id", () => {
    saveToHistory(makeItem("a"));
    saveToHistory(makeItem("b"));
    removeFromHistory("a");
    expect(loadHistory().map((i) => i.id)).toEqual(["b"]);
  });
});
