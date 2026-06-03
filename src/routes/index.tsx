import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { streamImage } from "@/lib/streamImage";
import { extractText, type Segment } from "@/lib/extractText";
import {
  downloadNotesPdf,
  downloadPdf,
  downloadPng,
  loadHistory,
  removeFromHistory,
  saveToHistory,
  type HistoryItem,
} from "@/lib/whiteboard-utils";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

type KeyPoint = { text: string; sources: number[] };
type KeyTerm = { term: string; definition: string; sources: number[] };
type Notes = {
  topic: string;
  summary: string;
  keyPoints: KeyPoint[];
  keyTerms: KeyTerm[];
  sourceLabel: string;
};

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
  const [notes, setNotes] = useState<Notes | null>(null);
  const [docName, setDocName] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set());
  const [extracting, setExtracting] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastSettingsRef = useRef<Omit<HistoryItem, "id" | "dataUrl" | "createdAt"> | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const selectedSegments = useMemo(
    () => segments.filter((s) => selectedIdx.has(s.index)),
    [segments, selectedIdx],
  );

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setExtracting(true);
    setNotes(null);
    setSegments([]);
    setSelectedIdx(new Set());
    setDocName(file.name);
    try {
      const { segments: segs } = await extractText(file);
      setSegments(segs);
      setSelectedIdx(new Set(segs.map((s) => s.index)));
      toast.success(`Extracted ${segs.length} ${segs[0]?.label.toLowerCase()}${segs.length === 1 ? "" : "s"} — review and summarize`);
    } catch (e) {
      console.error(e);
      toast.error((e as Error).message || "Could not read document");
    } finally {
      setExtracting(false);
    }
  };

  const summarizeSelected = async () => {
    if (selectedSegments.length === 0) {
      toast.error("Select at least one segment");
      return;
    }
    setSummarizing(true);
    setNotes(null);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments: selectedSegments, filename: docName }),
      });
      if (!res.ok) throw new Error(`Summarize failed (${res.status})`);
      const data = (await res.json()) as Notes;
      setNotes(data);
      if (data.topic && !topic.trim()) setTopic(data.topic);
      toast.success("Notes ready");
    } catch (e) {
      console.error(e);
      toast.error((e as Error).message || "Could not summarize document");
    } finally {
      setSummarizing(false);
    }
  };

  const toggleSegment = (idx: number) => {
    setSelectedIdx((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };


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

        <section className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-card/50 p-4 sm:p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold">Summarize a document</h2>
            <p className="text-xs text-muted-foreground">
              Upload PDF, DOCX, PPTX, or TXT — get structured study notes and use them as the whiteboard topic.
            </p>
          </div>
          <label
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-input bg-background px-4 py-6 text-center text-sm transition hover:bg-accent ${
              extracting || summarizing ? "opacity-60" : ""
            }`}
          >
            <input
              type="file"
              accept=".pdf,.docx,.pptx,.ppt,.txt,.md,application/pdf"
              className="hidden"
              disabled={extracting || summarizing}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                handleFile(f);
              }}
            />
            <span className="font-medium">
              {extracting
                ? "Extracting text…"
                : docName
                  ? `Replace: ${docName}`
                  : "Choose a document"}
            </span>
            <span className="text-xs text-muted-foreground">PDF · DOCX · PPTX · TXT</span>
          </label>

          {segments.length > 0 && (
            <div className="flex flex-col gap-3 rounded-md border border-border bg-background p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Extracted preview
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedIdx.size} of {segments.length} {segments[0].label.toLowerCase()}
                    {segments.length === 1 ? "" : "s"} selected
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setSelectedIdx(new Set(segments.map((s) => s.index)))}
                    className="rounded border border-input bg-background px-2 py-1 text-[11px] hover:bg-accent"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIdx(new Set())}
                    className="rounded border border-input bg-background px-2 py-1 text-[11px] hover:bg-accent"
                  >
                    None
                  </button>
                </div>
              </div>
              <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
                {segments.map((s) => {
                  const active = selectedIdx.has(s.index);
                  return (
                    <li key={s.index}>
                      <label
                        className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition ${
                          active ? "border-foreground bg-accent/30" : "border-border bg-background hover:bg-accent/30"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => toggleSegment(s.index)}
                          className="mt-1 accent-foreground"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">
                            {s.label} {s.index} · {s.title}
                          </p>
                          <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-[11px] text-muted-foreground">
                            {s.text || <em>(no text)</em>}
                          </p>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={summarizeSelected}
                disabled={summarizing || selectedIdx.size === 0}
                className="self-start rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {summarizing ? "Summarizing…" : `Summarize ${selectedIdx.size} selected`}
              </button>
            </div>
          )}

          {notes && (
            <article className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-background to-accent/20 p-5 text-sm shadow-sm sm:p-6">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-accent/30 blur-3xl"
              />

              <div className="relative flex flex-col gap-5">
                <header className="flex flex-col gap-2">
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    AI Summary
                  </span>
                  <h3 className="text-xl font-bold leading-tight tracking-tight sm:text-2xl">
                    {notes.topic}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{notes.summary}</p>
                  <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <span className="font-semibold text-foreground">{notes.keyPoints?.length ?? 0}</span>
                      key points
                    </span>
                    <span className="opacity-40">·</span>
                    <span className="inline-flex items-center gap-1">
                      <span className="font-semibold text-foreground">{notes.keyTerms?.length ?? 0}</span>
                      key terms
                    </span>
                  </div>
                </header>

                {notes.keyPoints?.length > 0 && (
                  <section className="flex flex-col gap-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Key points
                    </h4>
                    <ul className="flex flex-col gap-2">
                      {notes.keyPoints.map((p, i) => (
                        <li
                          key={i}
                          className="group flex gap-3 rounded-lg border border-border/60 bg-background/70 p-3 backdrop-blur transition hover:border-foreground/30 hover:bg-background"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm leading-snug">{p.text}</p>
                            {p.sources?.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {p.sources.map((n) => (
                                  <span
                                    key={n}
                                    className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                                  >
                                    {notes.sourceLabel} {n}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {notes.keyTerms?.length > 0 && (
                  <section className="flex flex-col gap-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Key terms
                    </h4>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {notes.keyTerms.map((t, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-border/60 bg-background/70 p-3 backdrop-blur transition hover:border-foreground/30"
                        >
                          <p className="text-sm font-semibold">{t.term}</p>
                          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                            {t.definition}
                          </p>
                          {t.sources?.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {t.sources.map((n) => (
                                <span
                                  key={n}
                                  className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                                >
                                  {notes.sourceLabel} {n}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTopic(notes.topic);
                      if (!loading) generate();
                    }}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    ✨ Generate whiteboard from these notes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const lines = [
                        `# ${notes.topic}`,
                        "",
                        notes.summary,
                        "",
                        "## Key Points",
                        ...notes.keyPoints.map(
                          (p) =>
                            `- ${p.text}${p.sources?.length ? ` [${notes.sourceLabel} ${p.sources.join(", ")}]` : ""}`,
                        ),
                        "",
                        "## Key Terms",
                        ...notes.keyTerms.map(
                          (t) =>
                            `- **${t.term}**: ${t.definition}${t.sources?.length ? ` [${notes.sourceLabel} ${t.sources.join(", ")}]` : ""}`,
                        ),
                      ].join("\n");
                      navigator.clipboard.writeText(lines).then(
                        () => toast.success("Notes copied"),
                        () => toast.error("Copy failed"),
                      );
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-input bg-background/70 px-4 py-2 text-xs font-semibold backdrop-blur transition hover:bg-accent"
                  >
                    Copy notes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        downloadNotesPdf(notes);
                        toast.success("PDF downloaded");
                      } catch (e) {
                        console.error(e);
                        toast.error("PDF download failed");
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-input bg-background/70 px-4 py-2 text-xs font-semibold backdrop-blur transition hover:bg-accent"
                  >
                    Download PDF
                  </button>
                </div>
              </div>
            </article>
          )}
        </section>


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
