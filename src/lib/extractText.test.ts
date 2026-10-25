import { describe, expect, it } from "vitest";
import { detectKind, extractText } from "./extractText";

describe("document input validation", () => {
  it("supports PDF, DOCX, PPTX, TXT and Markdown extensions", () => {
    expect(detectKind({ name: "notes.pdf", type: "" } as File)).toBe("pdf");
    expect(detectKind({ name: "notes.docx", type: "" } as File)).toBe("docx");
    expect(detectKind({ name: "slides.pptx", type: "" } as File)).toBe("pptx");
    expect(detectKind({ name: "notes.txt", type: "" } as File)).toBe("text");
    expect(detectKind({ name: "notes.md", type: "" } as File)).toBe("text");
  });

  it("does not claim support for legacy binary .ppt files", () => {
    expect(detectKind({ name: "slides.ppt", type: "application/vnd.ms-powerpoint" } as File)).toBeNull();
  });

  it("rejects oversized files before reading their contents", async () => {
    const file = { name: "huge.txt", type: "text/plain", size: 20 * 1024 * 1024 + 1 } as File;
    await expect(extractText(file)).rejects.toThrow("smaller than 20 MB");
  });
});
