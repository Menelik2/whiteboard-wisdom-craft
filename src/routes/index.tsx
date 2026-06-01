import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { streamImage } from "@/lib/streamImage";
import {
  downloadPdf,
  downloadPng,
  loadHistory,
  removeFromHistory,
  saveToHistory,
  type HistoryItem,
} from "@/lib/whiteboard-utils";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Whiteboard Notes AI — Generate Study Infographics" },
      {
        name: "description",
        content:
          "Type any topic and instantly generate a premium A4 whiteboard study-notes infographic.",
      },
      { property: "og:title", content: "Whiteboard Notes AI" },
      {
        property: "og:description",
        content: "Type any topic, get a beautiful whiteboard study-notes image.",
      },
    ],
  }),
  component: Index,
});

const COLOR_PRESETS: { name: string; value: string; swatch: string }[] = [
  { name: "Black", value: "black", swatch: "#111111" },
  { name: "Blue", value: "blue", swatch: "#1d4ed8" },
  { name: "Green", value: "green", swatch: "#16a34a" },
  { name: "Orange", value: "orange", swatch: "#ea580c" },
  { name: "Red", value: "red", swatch: "#dc2626" },
  { name: "Purple", value: "purple", swatch: "#7e22ce" },
];

type Difficulty = "Beginner" | "Intermediate" | "Advanced";

function Index() {
  const [topic, setTopic] = useState("");
  const [colors, setColors] = useState<string[]>(["black", "blue", "green", "orange", "red"]);
  const [numConcepts, setNumConcepts] = useState(12);
  const [difficulty, setDifficulty] = useState<Difficulty>("Intermediate");

  const [src, setSrc] = useState<string | null>(null);
  const [isFinal, setIsFinal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const lastSettingsRef = useRef<Omit<HistoryItem, "id" | "dataUrl" | "createdAt"> | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const toggleColor = (value: string) => {
    setColors((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value],
    );
  };

  const generate = async () => {
    const t = topic.trim();
    if (!t) {
      toast.error("Enter a topic first");
      return;
    }
    if (colors.length === 0) {
      toast.error("Pick at least one marker color");
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setSrc(null);
    setIsFinal(false);
    setLoading(true);
    lastSettingsRef.current = {
      topic: t,
      difficulty,
      numConcepts,
      markerColors: colors,
    };

    try {
      await streamImage(
        "/api/generate-whiteboard",
        { topic: t, markerColors: colors, numConcepts, difficulty },
        (dataUrl, final) => {
          setSrc(dataUrl);
          if (final) {
            setIsFinal(true);
            const item: HistoryItem = {
              id: crypto.randomUUID(),
              dataUrl,
              createdAt: Date.now(),
              ...lastSettingsRef.current!,
            };
            saveToHistory(item);
            setHistory(loadHistory());
          }
        },
        ctrl.signal,
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        console.error(e);
        toast.error((e as Error).message || "Generation failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const restoreFromHistory = (item: HistoryItem) => {
    setTopic(item.topic);
    setColors(item.markerColors);
    setNumConcepts(item.numConcepts);
    setDifficulty(item.difficulty as Difficulty);
    setSrc(item.dataUrl);
    setIsFinal(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = (id: string) => {
    removeFromHistory(id);
    setHistory(loadHistory());
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster />
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
        <header className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Whiteboard Notes AI
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Type any topic — get a detailed A4 whiteboard study-notes infographic.
          </p>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!loading) generate();
          }}
          className="flex flex-col gap-5 rounded-lg border border-border bg-card p-4 sm:p-6"
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="topic" className="text-sm font-medium">
              Topic
            </label>
            <input
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Photosynthesis, Newton's Laws, SQL Joins…"
              className="rounded-md border border-input bg-background px-4 py-3 text-sm shadow-sm outline-none ring-ring/20 transition focus:ring-2"
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Marker colors</span>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((c) => {
                const active = colors.includes(c.value);
                return (
                  <button
                    type="button"
                    key={c.value}
                    onClick={() => toggleColor(c.value)}
                    disabled={loading}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-input bg-background text-foreground hover:bg-accent"
                    }`}
                  >
                    <span
                      className="h-3 w-3 rounded-full ring-1 ring-border"
                      style={{ backgroundColor: c.swatch }}
                    />
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="num" className="flex items-center justify-between text-sm font-medium">
                <span>Number of concepts</span>
                <span className="text-muted-foreground">{numConcepts}</span>
              </label>
              <input
                id="num"
                type="range"
                min={5}
                max={20}
                value={numConcepts}
                onChange={(e) => setNumConcepts(Number(e.target.value))}
                disabled={loading}
                className="accent-foreground"
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Difficulty</span>
              <div className="grid grid-cols-3 overflow-hidden rounded-md border border-input">
                {(["Beginner", "Intermediate", "Advanced"] as Difficulty[]).map((d) => (
                  <button
                    type="button"
                    key={d}
                    onClick={() => setDifficulty(d)}
                    disabled={loading}
                    className={`px-2 py-2 text-xs font-medium transition ${
                      difficulty === d
                        ? "bg-foreground text-background"
                        : "bg-background text-foreground hover:bg-accent"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
          >
            {loading ? "Generating…" : "Generate whiteboard"}
          </button>
        </form>

        <section
          aria-label="Generated whiteboard"
          className="relative mx-auto w-full overflow-hidden rounded-lg border border-border bg-muted"
          style={{ aspectRatio: "1024 / 1536" }}
        >
          {src ? (
            <img
              src={src}
              alt={`Whiteboard study notes for ${topic}`}
              className="h-full w-full object-contain transition-[filter] duration-500"
              style={{ filter: isFinal ? "none" : "blur(16px)" }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {loading
                ? "Drawing your whiteboard…"
                : "Your whiteboard will appear here."}
            </div>
          )}
        </section>

        {src && isFinal && (
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => downloadPng(src, topic)}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition hover:bg-accent"
            >
              Download PNG
            </button>
            <button
              type="button"
              onClick={() =>
                downloadPdf(src, topic).catch((e) => toast.error((e as Error).message))
              }
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition hover:bg-accent"
            >
              Download PDF
            </button>
          </div>
        )}

        {history.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">History</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {history.map((item) => (
                <article
                  key={item.id}
                  className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card"
                >
                  <button
                    type="button"
                    onClick={() => restoreFromHistory(item)}
                    className="block"
                    aria-label={`Open ${item.topic}`}
                  >
                    <img
                      src={item.dataUrl}
                      alt={item.topic}
                      className="aspect-[1024/1536] w-full object-cover transition group-hover:opacity-90"
                    />
                  </button>
                  <div className="flex flex-col gap-2 p-2">
                    <p className="line-clamp-2 text-xs font-medium" title={item.topic}>
                      {item.topic}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {item.difficulty} · {item.numConcepts} concepts
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => downloadPng(item.dataUrl, item.topic)}
                        className="rounded border border-input bg-background px-2 py-1 text-[10px] font-medium hover:bg-accent"
                      >
                        PNG
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadPdf(item.dataUrl, item.topic).catch((e) =>
                            toast.error((e as Error).message),
                          )
                        }
                        className="rounded border border-input bg-background px-2 py-1 text-[10px] font-medium hover:bg-accent"
                      >
                        PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="ml-auto rounded border border-input bg-background px-2 py-1 text-[10px] font-medium text-destructive hover:bg-accent"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
