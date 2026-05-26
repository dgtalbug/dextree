import { describe, expect, it, vi } from "vitest";

import type { MermaidPreviewOptions } from "@dextree/exporters";

import {
  buildMmdContent,
  buildMarkdownSnippet,
  buildPngDataUrl,
  buildSvgContent,
  copyClipboardImage,
  suggestedPreviewFilename,
} from "./exportPreview.js";

const FLOWCHART_WORKSPACE_OPTIONS: MermaidPreviewOptions = {
  diagram: "flowchart",
  scope: { kind: "workspace" },
  granularity: "symbol",
  direction: "auto",
  theme: "light",
};

describe("buildMmdContent", () => {
  it("returns the source verbatim when it already ends with a newline", () => {
    expect(buildMmdContent("graph TB\n  a-->b\n")).toBe("graph TB\n  a-->b\n");
  });

  it("appends a trailing newline when missing so editors don't flag the file", () => {
    expect(buildMmdContent("graph TB\n  a-->b")).toBe("graph TB\n  a-->b\n");
  });

  it("preserves blank-line whitespace inside the source", () => {
    expect(buildMmdContent("graph TB\n\n  a-->b\n")).toBe("graph TB\n\n  a-->b\n");
  });
});

describe("buildSvgContent", () => {
  it("returns the rendered SVG markup verbatim", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>';
    expect(buildSvgContent(svg)).toBe(svg);
  });
});

describe("buildMarkdownSnippet", () => {
  it("wraps the source in a fenced mermaid block with a trailing newline", () => {
    const snippet = buildMarkdownSnippet("graph TB\n  a-->b");
    expect(snippet).toBe("```mermaid\ngraph TB\n  a-->b\n```\n");
  });

  it("strips any trailing newlines from the source so the fence sits flush", () => {
    const snippet = buildMarkdownSnippet("graph TB\n  a-->b\n\n");
    expect(snippet).toBe("```mermaid\ngraph TB\n  a-->b\n```\n");
  });
});

describe("suggestedPreviewFilename", () => {
  it("produces a deterministic kebab-case filename for workspace-scope flowchart", () => {
    expect(suggestedPreviewFilename(FLOWCHART_WORKSPACE_OPTIONS, "mmd")).toBe(
      "dextree-flowchart-workspace.mmd",
    );
  });

  it("uses the requested format extension for .svg and .png", () => {
    expect(suggestedPreviewFilename(FLOWCHART_WORKSPACE_OPTIONS, "svg")).toBe(
      "dextree-flowchart-workspace.svg",
    );
    expect(suggestedPreviewFilename(FLOWCHART_WORKSPACE_OPTIONS, "png")).toBe(
      "dextree-flowchart-workspace.png",
    );
  });

  it("encodes class-diagram diagrams as 'class' so filenames stay short", () => {
    expect(
      suggestedPreviewFilename({ ...FLOWCHART_WORKSPACE_OPTIONS, diagram: "classDiagram" }, "svg"),
    ).toBe("dextree-class-workspace.svg");
  });

  it("encodes file-scope kind into the filename without the relative path (keeps it portable)", () => {
    expect(
      suggestedPreviewFilename(
        { ...FLOWCHART_WORKSPACE_OPTIONS, scope: { kind: "file", relativePath: "src/a.ts" } },
        "mmd",
      ),
    ).toBe("dextree-flowchart-file.mmd");
  });
});

describe("buildPngDataUrl", () => {
  it("delegates rasterization to the injected adapter and returns its data URL", async () => {
    const rasterize = vi.fn().mockResolvedValue("data:image/png;base64,AAAA");
    const url = await buildPngDataUrl("<svg/>", rasterize);
    expect(rasterize).toHaveBeenCalledWith("<svg/>");
    expect(url).toBe("data:image/png;base64,AAAA");
  });

  it("propagates the rasterizer's rejection so callers can surface a render-side failure", async () => {
    const rasterize = vi.fn().mockRejectedValue(new Error("canvas not supported"));
    await expect(buildPngDataUrl("<svg/>", rasterize)).rejects.toThrow(/canvas not supported/);
  });

  it("is byte-stable: repeated calls for the same SVG produce the same data URL", async () => {
    const rasterize = vi
      .fn()
      .mockResolvedValueOnce("data:image/png;base64,AAAA")
      .mockResolvedValueOnce("data:image/png;base64,AAAA");
    const first = await buildPngDataUrl("<svg/>", rasterize);
    const second = await buildPngDataUrl("<svg/>", rasterize);
    expect(first).toBe(second);
  });
});

describe("copyClipboardImage", () => {
  it("delegates to the injected clipboard writer with the rendered SVG markup", async () => {
    const writeImage = vi.fn().mockResolvedValue(undefined);
    await copyClipboardImage("<svg/>", writeImage);
    expect(writeImage).toHaveBeenCalledWith("<svg/>");
  });

  it("propagates writer rejection so the panel can surface a clipboard error", async () => {
    const writeImage = vi.fn().mockRejectedValue(new Error("clipboard.write unsupported"));
    await expect(copyClipboardImage("<svg/>", writeImage)).rejects.toThrow(
      /clipboard\.write unsupported/,
    );
  });
});

describe("repeated same-state export (US3 determinism)", () => {
  it("buildMmdContent + buildMarkdownSnippet return the same string for the same source", () => {
    const source = "graph TB\n  a-->b";
    expect(buildMmdContent(source)).toBe(buildMmdContent(source));
    expect(buildMarkdownSnippet(source)).toBe(buildMarkdownSnippet(source));
  });

  it("suggestedPreviewFilename returns the same name for the same (options, format)", () => {
    expect(suggestedPreviewFilename(FLOWCHART_WORKSPACE_OPTIONS, "svg")).toBe(
      suggestedPreviewFilename(FLOWCHART_WORKSPACE_OPTIONS, "svg"),
    );
  });
});
