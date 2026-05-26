import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { MermaidPreviewResult } from "@dextree/exporters";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MermaidRenderState } from "../preview/renderMermaid.js";
import { MermaidPreviewPanel } from "./MermaidPreviewPanel.js";

function okPreview(source = "graph TB\n  a-->b"): MermaidPreviewResult {
  return {
    status: "ok",
    options: {
      diagram: "flowchart",
      scope: { kind: "workspace" },
      granularity: "symbol",
      direction: "auto",
      theme: "light",
    },
    source,
    title: "flowchart · Workspace",
  };
}

describe("MermaidPreviewPanel (slice 029 US1)", () => {
  afterEach(() => cleanup());

  it("renders the empty placeholder when preview is null", () => {
    render(<MermaidPreviewPanel preview={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(/Open a Mermaid preview/i);
  });

  it("renders the title + source pane for an ok preview", () => {
    const renderSource = vi.fn<typeof import("../preview/renderMermaid.js").renderMermaidSource>(
      async () => ({ status: "rendering" }) as MermaidRenderState,
    );
    render(<MermaidPreviewPanel preview={okPreview()} renderSource={renderSource} />);

    expect(screen.getByRole("heading", { name: /flowchart/i })).toBeInTheDocument();
    expect(screen.getByTestId("mermaid-source-pane")).toHaveTextContent("graph TB");
  });

  it("triggers the renderSource adapter with source + resolved theme on ok preview", async () => {
    const renderSource = vi.fn<typeof import("../preview/renderMermaid.js").renderMermaidSource>(
      async () =>
        ({ status: "ok", svg: "<svg data-testid='svg-stub'></svg>" }) as MermaidRenderState,
    );
    render(<MermaidPreviewPanel preview={okPreview()} renderSource={renderSource} />);

    await waitFor(() => {
      expect(renderSource).toHaveBeenCalledWith("graph TB\n  a-->b", "light");
    });
  });

  it("injects the rendered SVG into the DOM when renderSource resolves to ok", async () => {
    const renderSource = vi.fn<typeof import("../preview/renderMermaid.js").renderMermaidSource>(
      async () =>
        ({ status: "ok", svg: '<svg data-testid="render-svg-stub"></svg>' }) as MermaidRenderState,
    );
    render(<MermaidPreviewPanel preview={okPreview()} renderSource={renderSource} />);

    await waitFor(() => {
      expect(screen.getByTestId("render-svg-stub")).toBeInTheDocument();
    });
  });

  it("shows the render-error reason while keeping the source pane intact", async () => {
    const renderSource = vi.fn<typeof import("../preview/renderMermaid.js").renderMermaidSource>(
      async () =>
        ({
          status: "render-error",
          source: "graph TB\n  a-->b",
          reason: "Mermaid parse error: bad token",
        }) as MermaidRenderState,
    );
    render(<MermaidPreviewPanel preview={okPreview()} renderSource={renderSource} />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/Render failed.*bad token/i);
    });
    expect(screen.getByTestId("mermaid-source-pane")).toHaveTextContent("graph TB");
  });

  it("renders the fail-closed alert for empty/oversized/unsupported preview statuses", () => {
    const previews: MermaidPreviewResult[] = [
      {
        status: "empty",
        options: okPreview().options,
        reason: "Scope resolved to zero nodes; pick a wider scope.",
      },
      {
        status: "oversized",
        options: okPreview().options,
        reason: "250 file nodes exceeds the symbol cap of 200 nodes; narrow the scope.",
      },
      {
        status: "unsupported",
        options: okPreview().options,
        reason: "Sequence preview is unavailable until slice 031.",
      },
    ];

    for (const preview of previews) {
      const { unmount } = render(<MermaidPreviewPanel preview={preview} />);
      expect(screen.getByRole("alert")).toHaveTextContent(preview.reason);
      // No source pane, no rendered SVG — fail closed.
      expect(screen.queryByTestId("mermaid-source-pane")).toBeNull();
      expect(screen.queryByTestId("mermaid-render-pane")).toBeNull();
      unmount();
    }
  });
});
