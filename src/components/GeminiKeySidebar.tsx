import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useGeminiKey } from "@/lib/gemini-key";

/**
 * Side panel where each visitor stores their own Gemini API key.
 * The key never leaves this browser except to make their own AI requests.
 */
export function GeminiKeySidebar() {
  const { key, hasKey, save } = useGeminiKey();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(key);
      setReveal(false);
    }
  }, [open, key]);

  const onSave = () => {
    const value = draft.trim();
    if (!value) {
      toast.error("Paste a Gemini API key first");
      return;
    }
    if (!value.startsWith("AIza")) {
      toast.error("That doesn't look like a Gemini API key (starts with AIza)");
      return;
    }
    save(value);
    toast.success("Gemini key saved on this device");
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          aria-label="Open API key settings"
        >
          <span
            aria-hidden
            className={`h-2 w-2 rounded-full ${hasKey ? "bg-accent" : "bg-destructive"}`}
          />
          {hasKey ? "API key" : "Add API key"}
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="w-full max-w-sm overflow-y-auto sm:max-w-sm">
        <SheetHeader className="text-left">
          <SheetTitle className="font-serif text-2xl">Your Gemini key</SheetTitle>
          <SheetDescription>
            Summaries and whiteboards run on your own Google Gemini API key. It is stored only in
            this browser and sent straight to Google with your requests.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="gemini-key">API key</Label>
            <Input
              id="gemini-key"
              type={reveal ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder="AIza…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              className="self-start text-xs font-medium text-muted-foreground underline underline-offset-4"
            >
              {reveal ? "Hide key" : "Show key"}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={onSave}>
              Save key
            </Button>
            {hasKey && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  save("");
                  setDraft("");
                  toast.success("Key removed from this device");
                }}
              >
                Remove
              </Button>
            )}
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            Create a free key in Google AI Studio at{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline underline-offset-4"
            >
              aistudio.google.com/apikey
            </a>
            . Anyone using this browser profile can access the saved key, so avoid shared machines.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
