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

type BatchSlot = {
  id: string;
  dataUrl: string | null;
  status: "pending" | "streaming" | "done";
  progress: number;
  frameCount: number;
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DocBoard — Editorial AI Study Notes" },
      {
        name: "description",
        content:
          "Upload PDFs, DOCX, or slides. DocBoard distills them into editorial study notes and a beautiful whiteboard infographic.",
      },
      { property: "og:title", content: "DocBoard — Editorial AI Study Notes" },
      {
        property: "og:description",
        content: "Editorial AI that turns documents into elegant whiteboard study notes.",
      },
    ],
  }),
  component: Index,
});

const COLOR_PRESETS: { name: string; value: string; swatch: string }[] = [
  { name: "Ink", value: "black", swatch: "#1a1815" },
  { name: "Indigo", value: "blue", swatch: "#1d4ed8" },
  { name: "Emerald", value: "green", swatch: "#15803d" },
  { name: "Ochre", value: "orange", swatch: "#c2410c" },
  { name: "Crimson", value: "red", swatch: "#b91c1c" },
  { name: "Plum", value: "purple", swatch: "#6b21a8" },
];

type Difficulty = "Beginner" | "Intermediate" | "Advanced";

// Tiny inline icons (no extra deps) ------------------------------------------
const Icon = {
  Upload: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 16V4m0 0l-4 4m4-4l4 4" />
      <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
    </svg>
  ),
  Sparkle: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" />
    </svg>
  ),
  Download: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 4v12m0 0l-4-4m4 4l4-4" />
      <path d="M4 20h16" />
    </svg>
  ),
  Copy: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" />
    </svg>
  ),
  Check: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  ),
};

function SectionLabel({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className={`h-px w-6 ${accent ? "bg-accent" : "bg-foreground/30"}`} />
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {children}
      </span>
    </div>
  );
}

function Index() {
  const [topic, setTopic] = useState("");
  const [colors, setColors] = useState<string[]>(["black", "blue", "green", "orange", "red"]);
  const [numConcepts, setNumConcepts] = useState(12);
  const [difficulty, setDifficulty] = useState<Difficulty>("Intermediate");
  const [variants, setVariants] = useState(1);

  const [src, setSrc] = useState<string | null>(null);
  const [isFinal, setIsFinal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [batch, setBatch] = useState<BatchSlot[]>([]);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [activeVariant, setActiveVariant] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [notes, setNotes] = useState<Notes | null>(null);
  const [docName, setDocName] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set());
  const [extracting, setExtracting] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
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
      toast.error("Select at least one passage");
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

  const generate = async (overrideNotes?: Notes | null) => {
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

    const runs = Math.min(4, Math.max(1, variants));
    const slots = Array.from({ length: runs }, () => ({
      id: crypto.randomUUID(),
      dataUrl: null as string | null,
      status: "pending" as "pending" | "streaming" | "done",
      progress: 0,
      frameCount: 0,
    }));
    setSrc(null);
    setIsFinal(false);
    setLoading(true);
    setBatch(slots);
    setActiveVariant(0);
    setBatchProgress({ current: 1, total: runs });
    lastSettingsRef.current = {
      topic: t,
      difficulty,
      numConcepts,
      markerColors: colors,
    };

    const notesPayload = overrideNotes ?? notes;
    let completedCount = 0;
    const frameCounts = Array.from({ length: runs }, () => 0);

    const updateSlot = (
      idx: number,
      patch: Partial<BatchSlot>,
    ) => {
      setBatch((prev) => {
        const next = prev.slice();
        if (next[idx]) next[idx] = { ...next[idx], ...patch };
        return next;
      });
    };

    try {
      for (let i = 0; i < runs; i++) {
        if (ctrl.signal.aborted) break;
        setBatchProgress({ current: i + 1, total: runs });
        setActiveVariant(i);
        setSrc(null);
        setIsFinal(false);
        updateSlot(i, { status: "streaming", progress: 12, frameCount: 0 });
        await streamImage(
          "/api/generate-whiteboard",
          {
            topic: t,
            markerColors: colors,
            numConcepts,
            difficulty,
            ...(notesPayload ? { notes: notesPayload } : {}),
          },
          (dataUrl, final) => {
            frameCounts[i] += 1;
            setSrc(dataUrl);
            updateSlot(i, {
              dataUrl,
              status: final ? "done" : "streaming",
              progress: final ? 100 : Math.min(88, 38 + frameCounts[i] * 18),
              frameCount: frameCounts[i],
            });
            if (final) {
              setIsFinal(true);
              const item: HistoryItem = {
                id: slots[i].id,
                dataUrl,
                createdAt: Date.now(),
                ...lastSettingsRef.current!,
              };
              saveToHistory(item);
              completedCount++;
            }
          },
          ctrl.signal,
        );
      }
      setHistory(loadHistory());
      if (runs > 1) toast.success(`${completedCount} whiteboards ready`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        console.error(e);
        toast.error((e as Error).message || "Generation failed");
      }
    } finally {
      setBatchProgress(null);
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

  const copyNotes = () => {
    if (!notes) return;
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
  };

  return (
    <div className="min-h-screen bg-paper-grain text-foreground">
      <Toaster />

      {/* Top brand bar ----------------------------------------------------- */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/75 backdrop-blur-md">
        <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="relative h-8 w-8 shrink-0">
              <div className="absolute inset-0 rounded-lg bg-foreground" />
              <div className="absolute inset-[5px] rounded-[5px] bg-accent" />
              <div className="absolute inset-[9px] rounded-sm bg-background" />
            </div>
            <div className="min-w-0 leading-none">
              <p className="truncate font-serif text-lg font-bold tracking-tight sm:text-xl">DocBoard</p>
              <p className="mt-0.5 hidden text-[10px] uppercase tracking-[0.22em] text-muted-foreground sm:block">
                Editorial study notes
              </p>
            </div>
          </div>
          <a
            href="#workspace"
            className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-foreground/80 hover:bg-secondary sm:px-3.5 sm:text-xs"
          >
            <span className="hidden sm:inline">New summary →</span>
            <span className="sm:hidden">New →</span>
          </a>
        </div>
      </header>

      <main id="workspace" className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:gap-12 sm:px-5 sm:py-14 lg:px-8">


        {/* Hero ------------------------------------------------------------ */}
        <section className="relative grid items-end gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              <span className="truncate">Documents → Notes → Whiteboard</span>
            </span>
            <h1 className="mt-4 font-serif text-[2rem] font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
              Read less.
              <br />
              <span className="italic text-foreground/90">
                Understand
                <span className="relative ml-2 inline-block">
                  <span className="relative z-10">more</span>
                  <span className="absolute inset-x-0 bottom-1 -z-0 h-3 bg-accent/60" aria-hidden />
                </span>
                .
              </span>
            </h1>
            <p className="mt-5 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
              Upload a PDF, deck, or doc. DocBoard pulls the passages that matter and
              composes them into editorial notes — and a hand-drawn whiteboard you can print.
            </p>
          </div>

          {/* Mini whiteboard collage */}
          <div className="relative hidden h-56 lg:block">
            <div className="absolute right-0 top-0 h-32 w-44 -rotate-3 bg-amber-note shadow-lg ring-1 ring-border p-3">
              <p className="font-serif text-[11px] font-bold leading-snug">Decentralized Energy</p>
              <div className="mt-2 h-0.5 w-8 bg-foreground/40" />
              <p className="mt-2 text-[9px] leading-snug text-foreground/70">
                Grid management must shift to peer-to-peer.
              </p>
            </div>
            <div className="absolute bottom-0 left-2 h-28 w-40 rotate-2 bg-sage-note shadow-lg ring-1 ring-border p-3">
              <p className="font-serif text-[11px] font-bold">Key insight</p>
              <p className="mt-1 text-[9px] italic leading-snug text-foreground/70">
                "Compress 40 pages into 12 cards you can teach back."
              </p>
            </div>
            <div className="absolute right-8 bottom-4 h-10 w-44 rounded-full bg-card shadow-md ring-1 ring-border flex items-center justify-center gap-2">
              <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Refining notes
              </span>
            </div>
          </div>
        </section>


        {/* Upload + Selection ---------------------------------------------- */}
        <section className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_0_0_rgba(0,0,0,0.04),0_30px_60px_-30px_rgba(0,0,0,0.15)] sm:rounded-3xl">
          <div className="grid gap-0 lg:grid-cols-[1.05fr_1fr]">

            {/* Left: Upload */}
            <div className="border-b border-border p-5 sm:p-6 lg:border-b-0 lg:border-r lg:p-8">

              <SectionLabel accent>01 — Document source</SectionLabel>
              <h2 className="font-serif text-xl font-bold tracking-tight sm:text-2xl">
                Drop a document
              </h2>

              <p className="mt-1.5 text-sm text-muted-foreground">
                PDF, DOCX, PPTX, PPT, TXT — up to a few hundred pages.
              </p>

              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0] ?? null;
                  handleFile(f);
                }}
                className={`group relative mt-5 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-5 py-10 text-center transition ${
                  dragOver
                    ? "border-accent bg-accent/10"
                    : "border-border bg-secondary/40 hover:border-accent/60 hover:bg-secondary"
                } ${extracting || summarizing ? "pointer-events-none opacity-60" : ""}`}
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
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-card shadow-sm ring-1 ring-border transition group-hover:scale-105">
                  {extracting ? (
                    <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
                  ) : (
                    <Icon.Upload className="h-5 w-5 text-foreground" />
                  )}
                </div>
                <div>
                  <p className="font-serif text-base font-bold">
                    {extracting
                      ? "Reading document…"
                      : docName
                        ? "Replace document"
                        : "Drop file or click to browse"}
                  </p>
                  {docName && !extracting && (
                    <p className="mt-1 truncate text-xs text-muted-foreground" title={docName}>
                      {docName}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  {["PDF", "DOCX", "PPTX", "PPT", "TXT"].map((ext) => (
                    <span
                      key={ext}
                      className="rounded-full bg-card px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground ring-1 ring-border"
                    >
                      {ext}
                    </span>
                  ))}
                </div>
              </label>
            </div>

            {/* Right: Selection */}
            <div className="p-5 sm:p-6 lg:p-8">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                <div className="min-w-0">
                  <SectionLabel>02 — Key passages</SectionLabel>
                  <h2 className="font-serif text-xl font-bold tracking-tight sm:text-2xl">
                    Choose what to keep
                  </h2>
                </div>
                {segments.length > 0 && (
                  <span className="shrink-0 rounded-full bg-accent/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground">
                    {selectedIdx.size} / {segments.length}
                  </span>
                )}
              </div>


              {segments.length === 0 ? (
                <div className="mt-5 flex h-[260px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-secondary/30 text-center">
                  <div className="font-serif text-base italic text-muted-foreground">
                    Awaiting your document…
                  </div>
                  <p className="text-xs text-muted-foreground/80">
                    Extracted pages or slides will appear here.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedIdx(new Set(segments.map((s) => s.index)))}
                      className="rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold ring-1 ring-border hover:bg-stone-soft"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedIdx(new Set())}
                      className="rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold ring-1 ring-border hover:bg-stone-soft"
                    >
                      Clear
                    </button>
                  </div>

                  <ul className="mt-3 flex max-h-[260px] flex-col gap-2 overflow-y-auto pr-1">
                    {segments.map((s) => {
                      const active = selectedIdx.has(s.index);
                      return (
                        <li key={s.index}>
                          <label
                            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                              active
                                ? "border-accent/70 bg-accent/10 shadow-sm"
                                : "border-border bg-card hover:border-foreground/30"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={() => toggleSegment(s.index)}
                              className="sr-only"
                            />
                            <span
                              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 transition ${
                                active
                                  ? "bg-foreground text-background ring-foreground"
                                  : "bg-card ring-border"
                              }`}
                            >
                              {active && <Icon.Check className="h-3 w-3" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-serif text-[11px] font-bold uppercase tracking-wider text-foreground/70">
                                  {s.label} {s.index}
                                </span>
                                <span className="truncate text-xs font-medium">— {s.title}</span>
                              </div>
                              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
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
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground py-3.5 text-sm font-semibold text-background shadow-lg shadow-foreground/15 transition hover:bg-foreground/90 disabled:opacity-50"
                  >
                    {summarizing ? (
                      <>
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                        Composing notes…
                      </>
                    ) : (
                      <>
                        <Icon.Sparkle className="h-4 w-4" />
                        Summarize {selectedIdx.size} passage{selectedIdx.size === 1 ? "" : "s"}
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Notes article --------------------------------------------------- */}
        {notes && (
          <article className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_30px_80px_-40px_rgba(0,0,0,0.25)] sm:rounded-3xl">
            {/* Magazine masthead */}
            <div className="border-b border-border bg-foreground px-5 py-5 text-background sm:px-10 sm:py-7">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] uppercase tracking-[0.3em] text-background/60">
                <span>Vol. 01 — Field notes</span>
                <span>{new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
              </div>
              <h3 className="mt-3 font-serif text-2xl font-bold leading-tight sm:text-3xl md:text-4xl">
                {notes.topic}
              </h3>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-background/70">
                <span>{notes.keyPoints?.length ?? 0} key points</span>
                <span className="opacity-40">·</span>
                <span>{notes.keyTerms?.length ?? 0} key terms</span>
                {docName && <><span className="opacity-40">·</span><span className="truncate max-w-[180px]">from {docName}</span></>}
              </div>
            </div>

            <div className="grid gap-8 px-5 py-6 sm:px-10 sm:py-10 lg:grid-cols-[1fr_1.4fr]">

              {/* Lede */}
              <div>
                <SectionLabel accent>Lede</SectionLabel>
                <p className="font-serif text-lg leading-[1.55] text-foreground first-letter:float-left first-letter:mr-2 first-letter:font-serif first-letter:text-5xl first-letter:font-bold first-letter:leading-[0.9]">
                  {notes.summary}
                </p>
              </div>

              {/* Key points */}
              {notes.keyPoints?.length > 0 && (
                <div>
                  <SectionLabel>Key points</SectionLabel>
                  <ol className="flex flex-col divide-y divide-border">
                    {notes.keyPoints.map((p, i) => (
                      <li key={i} className="flex gap-4 py-3 first:pt-0 last:pb-0">
                        <span className="font-serif text-2xl font-bold leading-none text-accent">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="flex-1">
                          <p className="text-[15px] leading-snug">{p.text}</p>
                          {p.sources?.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {p.sources.map((n) => (
                                <span
                                  key={n}
                                  className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border"
                                >
                                  {notes.sourceLabel} {n}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            {/* Key terms — sticky notes */}
            {notes.keyTerms?.length > 0 && (
              <div className="border-t border-border bg-secondary/40 px-5 py-6 sm:px-10 sm:py-10">

                <SectionLabel>Glossary</SectionLabel>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {notes.keyTerms.map((t, i) => {
                    const bg = i % 2 === 0 ? "bg-amber-note" : "bg-sage-note";
                    const rot = i % 3 === 0 ? "-rotate-1" : i % 3 === 1 ? "rotate-1" : "rotate-0";
                    return (
                      <div
                        key={i}
                        className={`${bg} ${rot} ring-1 ring-foreground/10 p-4 shadow-md`}
                      >
                        <p className="font-serif text-base font-bold leading-tight">{t.term}</p>
                        <div className="mt-1 h-0.5 w-8 bg-foreground/30" />
                        <p className="mt-2 text-xs leading-relaxed text-foreground/80">
                          {t.definition}
                        </p>
                        {t.sources?.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1">
                            {t.sources.map((n) => (
                              <span
                                key={n}
                                className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-semibold text-foreground/70"
                              >
                                {notes.sourceLabel} {n}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Article actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-5 sm:px-10">
              <p className="w-full text-[11px] uppercase tracking-[0.22em] text-muted-foreground sm:w-auto">
                End of article
              </p>

              <div className="flex w-full flex-wrap gap-2 sm:w-auto">

                <button
                  type="button"
                  onClick={copyNotes}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold hover:bg-secondary sm:flex-none"
                >
                  <Icon.Copy className="h-3.5 w-3.5" /> Copy
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
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold hover:bg-secondary sm:flex-none"
                >
                  <Icon.Download className="h-3.5 w-3.5" /> <span className="whitespace-nowrap">Download PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTopic(notes.topic);
                    if (!loading) generate(notes);
                  }}
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background shadow-md hover:bg-foreground/90 disabled:opacity-50 sm:w-auto"
                >
                  <Icon.Sparkle className="h-3.5 w-3.5" />
                  Compose whiteboard
                </button>

              </div>
            </div>
          </article>
        )}

        {/* Whiteboard composer -------------------------------------------- */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!loading) generate();
          }}
          className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-card via-card to-secondary/40 p-5 shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_40px_80px_-40px_rgba(0,0,0,0.25)] sm:p-8"
        >
          {/* Ambient glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/30 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-amber-note/40 blur-3xl"
          />

          <div className="relative grid gap-8 lg:grid-cols-[1.2fr_1fr]">
          <div className="flex min-w-0 flex-col gap-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-foreground/80 backdrop-blur">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                  Step 03 · Composer
                </div>
                <h2 className="font-serif text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                  Draw it on the board
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Tune the topic, palette, and density. We hand-letter the rest.
                </p>
              </div>
              <div className="hidden shrink-0 rounded-2xl border border-border bg-background/70 p-2.5 shadow-sm backdrop-blur sm:block">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-foreground text-background">
                  <Icon.Sparkle className="h-4 w-4" />
                </div>
              </div>
            </div>

            {/* Topic input */}
            <div className="flex flex-col gap-2">
              <label htmlFor="topic" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Topic
              </label>
              <div className="group relative">
                <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/60 transition group-focus-within:text-accent">
                  <Icon.Sparkle className="h-4 w-4" />
                </div>
                <input
                  id="topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Photosynthesis, Newton's Laws, SQL Joins…"
                  className="w-full rounded-2xl border border-input bg-background/80 py-3.5 pl-11 pr-4 text-base shadow-inner outline-none ring-accent/30 backdrop-blur transition placeholder:text-muted-foreground/50 focus:border-accent focus:bg-background focus:ring-2"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Marker palette — dot chips */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Marker palette
                </span>
                <span className="text-[10px] text-muted-foreground/70">
                  {colors.length} selected
                </span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {COLOR_PRESETS.map((c) => {
                  const active = colors.includes(c.value);
                  return (
                    <button
                      type="button"
                      key={c.value}
                      onClick={() => toggleColor(c.value)}
                      disabled={loading}
                      title={c.name}
                      aria-pressed={active}
                      className={`group relative flex h-11 w-11 items-center justify-center rounded-full transition-all duration-200 ${
                        active
                          ? "scale-105 ring-2 ring-offset-2 ring-offset-card"
                          : "opacity-60 hover:opacity-100 hover:scale-105"
                      }`}
                      style={{
                        // @ts-expect-error CSS var
                        "--tw-ring-color": c.swatch,
                      }}
                    >
                      <span
                        className="h-8 w-8 rounded-full shadow-md ring-1 ring-black/10"
                        style={{ backgroundColor: c.swatch }}
                      />
                      {active && (
                        <Icon.Check className="absolute h-4 w-4 text-white drop-shadow" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Concepts + Difficulty */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-background/60 p-4 backdrop-blur">
                <label htmlFor="num" className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <span>Concepts</span>
                  <span className="rounded-full bg-foreground px-2 py-0.5 font-serif text-xs font-bold text-background">{numConcepts}</span>
                </label>
                <input
                  id="num"
                  type="range"
                  min={5}
                  max={20}
                  value={numConcepts}
                  onChange={(e) => setNumConcepts(Number(e.target.value))}
                  disabled={loading}
                  className="accent-accent"
                />
                <div className="flex justify-between text-[9px] uppercase tracking-wider text-muted-foreground/60">
                  <span>Sparse</span><span>Dense</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-background/60 p-4 backdrop-blur">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Difficulty
                </span>
                <div
                  className="relative grid grid-cols-3 rounded-xl bg-secondary/70 p-1"
                  role="radiogroup"
                  aria-label="Difficulty level"
                >
                  {(["Beginner", "Intermediate", "Advanced"] as Difficulty[]).map((d) => (
                    <button
                      type="button"
                      key={d}
                      onClick={() => setDifficulty(d)}
                      disabled={loading}
                      role="radio"
                      aria-checked={difficulty === d}
                      aria-label={`Difficulty ${d}`}
                      className={`relative z-10 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
                        difficulty === d
                          ? "bg-foreground text-background shadow-md"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span aria-hidden="true">{d.slice(0, 3)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Variants stepper */}
            <div className="flex flex-col gap-2.5 rounded-2xl border border-border/70 bg-background/60 p-4 backdrop-blur">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Variants
                </span>
                <span className="font-serif text-sm text-foreground">
                  {variants} board{variants > 1 ? "s" : ""}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Number of whiteboard variants">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    type="button"
                    key={n}
                    onClick={() => setVariants(n)}
                    disabled={loading}
                    role="radio"
                    aria-checked={variants === n}
                    aria-label={`${n} variant${n > 1 ? "s" : ""}`}
                    className={`flex flex-col items-center justify-center gap-0.5 rounded-xl py-2.5 text-xs font-bold transition ${
                      variants === n
                        ? "bg-foreground text-background shadow-lg shadow-foreground/20"
                        : "bg-secondary/70 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <span className="font-serif text-lg leading-none" aria-hidden="true">×{n}</span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Draw multiple takes in one go — each streams into the preview.
              </p>
            </div>

            {/* Live region for batch status announcements */}
            <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
              {loading && batchProgress
                ? `Drawing whiteboard ${batchProgress.current} of ${batchProgress.total}`
                : batch.length > 0
                  ? `${batch.filter((b) => b.status === "done").length} of ${batch.length} whiteboards ready`
                  : ""}
            </div>

            {/* Generate CTA */}
            <button
              type="submit"
              disabled={loading}
              className="group relative overflow-hidden rounded-2xl bg-foreground px-6 py-4 text-sm font-semibold text-background shadow-xl shadow-foreground/25 transition hover:shadow-2xl hover:shadow-foreground/30 disabled:opacity-60"
            >
              <span
                aria-hidden
                className="absolute inset-0 bg-gradient-to-r from-transparent via-accent/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
              />
              <span className="relative inline-flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                    {batchProgress && batchProgress.total > 1
                      ? `Drawing ${batchProgress.current} of ${batchProgress.total}…`
                      : "Drawing…"}
                  </>
                ) : (
                  <>
                    <Icon.Sparkle className="h-4 w-4 transition group-hover:rotate-12" />
                    Generate {variants > 1 ? `${variants} whiteboards` : "whiteboard"}
                  </>
                )}
              </span>
            </button>
          </div>

          {/* Preview pane */}
          <div className="mx-auto flex w-full max-w-sm flex-col gap-3 lg:mx-0 lg:max-w-none">
            <div className="flex items-center justify-between">
              <SectionLabel>Live preview</SectionLabel>
              {loading && (
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                  Live
                </span>
              )}
            </div>
            <div className="group relative rounded-3xl bg-gradient-to-br from-accent/20 via-transparent to-amber-note/30 p-[2px] shadow-2xl shadow-foreground/10">
              <div
                aria-label="Generated whiteboard"
                className="relative overflow-hidden rounded-[calc(1.5rem-2px)] bg-secondary"
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
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
                    <div className="relative grid h-14 w-14 place-items-center rounded-2xl bg-background shadow-inner ring-1 ring-border">
                      <Icon.Sparkle className={`h-6 w-6 text-foreground/60 ${loading ? "animate-pulse" : ""}`} />
                      {loading && (
                        <span className="absolute inset-0 rounded-2xl ring-2 ring-accent/50 animate-pulse" />
                      )}
                    </div>
                    <div className="font-serif text-base italic text-muted-foreground">
                      {loading ? "Sketching your whiteboard…" : "Your whiteboard will appear here."}
                    </div>
                    {!loading && (
                      <p className="text-[11px] text-muted-foreground/80">
                        A4 portrait · marker on paper
                      </p>
                    )}
                  </div>
                )}
                {/* Streaming shimmer overlay */}
                {loading && (
                  <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    <div className="absolute inset-y-0 -left-1/3 w-1/3 animate-[shimmer_2s_linear_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  </div>
                )}
                {loading && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                    <div className="flex items-center gap-2 rounded-full bg-background/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] shadow-lg ring-1 ring-border backdrop-blur">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                      Rendering
                    </div>
                  </div>
                )}
              </div>
            </div>

            {src && isFinal && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => downloadPng(src, topic)}
                  aria-label={`Download whiteboard for ${topic || "current topic"} as PNG`}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-card/80 px-4 py-2.5 text-xs font-semibold shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-foreground/40 hover:shadow-md"
                >
                  <Icon.Download className="h-3.5 w-3.5" aria-hidden="true" /> PNG
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadPdf(src, topic).catch((e) => toast.error((e as Error).message))
                  }
                  aria-label={`Download whiteboard for ${topic || "current topic"} as PDF`}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-card/80 px-4 py-2.5 text-xs font-semibold shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-foreground/40 hover:shadow-md"
                >
                  <Icon.Download className="h-3.5 w-3.5" aria-hidden="true" /> PDF
                </button>
              </div>
            )}

            {batch.length > 1 && (() => {
              const doneCount = batch.filter((b) => b.status === "done").length;
              return (
                <div className="mt-1 flex flex-col gap-2">
                  <SectionLabel>
                    This batch · {doneCount} of {batch.length}{loading ? " · drawing…" : " · complete"}
                  </SectionLabel>
                  <div className="grid grid-cols-4 gap-2" aria-label="Whiteboard variant progress">
                    {batch.map((b, i) => {
                      const isActive = i === activeVariant;
                      const isSelected = b.dataUrl != null && src === b.dataUrl;
                      const statusLabel =
                        b.status === "done"
                          ? "Ready"
                          : b.status === "streaming"
                            ? `Generating ${b.progress}%`
                            : "Queued";
                      return (
                        <button
                          type="button"
                          key={b.id}
                          onClick={() => {
                            if (b.dataUrl) {
                              setSrc(b.dataUrl);
                              setIsFinal(b.status === "done");
                            }
                          }}
                          disabled={!b.dataUrl}
                          className={`group relative overflow-hidden rounded-xl border bg-secondary transition ${
                            isSelected
                              ? "border-foreground ring-2 ring-accent shadow-lg"
                              : isActive && b.status === "streaming"
                                ? "border-accent ring-1 ring-accent/60"
                                : "border-border hover:border-foreground/60 hover:-translate-y-0.5"
                          } ${!b.dataUrl ? "cursor-default" : ""}`}
                          style={{ aspectRatio: "1024 / 1536" }}
                          aria-label={`Variant ${i + 1} — ${statusLabel}`}
                        >
                          {b.dataUrl ? (
                            <img
                              src={b.dataUrl}
                              alt={`Variant ${i + 1}`}
                              className="h-full w-full object-cover transition-[filter] duration-500"
                              style={{ filter: b.status === "done" ? "none" : "blur(6px)" }}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-secondary/60">
                              <span
                                className={`inline-block h-3 w-3 rounded-full border-2 ${
                                  b.status === "streaming"
                                    ? "animate-spin border-accent border-t-transparent"
                                    : "border-dashed border-foreground/30"
                                }`}
                              />
                            </div>
                          )}

                          {b.status !== "done" && (
                            <div
                              className="pointer-events-none absolute inset-x-0 bottom-0"
                              role="progressbar"
                              aria-label={`Variant ${i + 1} generation progress`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={b.progress}
                            >
                              <div className="h-1 w-full overflow-hidden bg-foreground/10">
                                <div
                                  className="h-full bg-accent transition-[width] duration-500"
                                  style={{ width: `${b.status === "streaming" ? b.progress : 0}%` }}
                                />
                              </div>
                            </div>
                          )}

                          <span className="absolute left-1 top-1 rounded-full bg-background/90 px-1.5 py-0.5 font-serif text-[10px] font-bold shadow-sm ring-1 ring-border">
                            ×{i + 1}
                          </span>

                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
          </div>
        </form>

        {/* History --------------------------------------------------------- */}
        {history.length > 0 && (
          <section className="flex flex-col gap-5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
              <div className="min-w-0">
                <SectionLabel>Archive</SectionLabel>
                <h2 className="font-serif text-xl font-bold tracking-tight sm:text-2xl">
                  Your past boards
                </h2>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{history.length} saved</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">

              {history.map((item) => (
                <article
                  key={item.id}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:shadow-md"
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
                      className="aspect-[1024/1536] w-full object-cover transition group-hover:scale-[1.02]"
                    />
                  </button>
                  <div className="flex flex-col gap-2 p-3">
                    <p className="font-serif text-sm font-bold leading-snug line-clamp-2" title={item.topic}>
                      {item.topic}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {item.difficulty} · {item.numConcepts} concepts
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => downloadPng(item.dataUrl, item.topic)}
                        className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-semibold hover:bg-secondary"
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
                        className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-semibold hover:bg-secondary"
                      >
                        PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="ml-auto rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-semibold text-destructive hover:bg-secondary"
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

        <footer className="mt-4 border-t border-border pt-6 text-center">
          <p className="font-serif text-sm italic text-muted-foreground">
            DocBoard — editorial notes, drawn by hand.
          </p>
        </footer>
      </main>
    </div>
  );
}
