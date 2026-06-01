import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { streamImage } from "@/lib/streamImage";
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

function Index() {
  const [topic, setTopic] = useState("");
  const [src, setSrc] = useState<string | null>(null);
  const [isFinal, setIsFinal] = useState(false);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const generate = async () => {
    const t = topic.trim();
    if (!t) {
      toast.error("Enter a topic first");
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setSrc(null);
    setIsFinal(false);
    setLoading(true);
    try {
      await streamImage(
        "/api/generate-whiteboard",
        { topic: t },
        (dataUrl, final) => {
          setSrc(dataUrl);
          if (final) setIsFinal(true);
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
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
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Photosynthesis, Newton's Laws, SQL Joins…"
            className="flex-1 rounded-md border border-input bg-background px-4 py-3 text-sm shadow-sm outline-none ring-ring/20 transition focus:ring-2"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
          >
            {loading ? "Generating…" : "Generate"}
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
          <a
            href={src}
            download={`whiteboard-${topic.replace(/\s+/g, "-").toLowerCase()}.png`}
            className="mx-auto rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition hover:bg-accent"
          >
            Download image
          </a>
        )}
      </main>
    </div>
  );
}
