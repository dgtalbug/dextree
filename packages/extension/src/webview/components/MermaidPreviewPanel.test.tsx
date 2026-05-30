import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MermaidPreviewOptions, MermaidPreviewResult } from "@dextree/exporters";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MermaidRenderState } from "../preview/renderMermaid.js";
import { MermaidPreviewPanel } from "./MermaidPreviewPanel.js";

const DEFAULT_OPTIONS: MermaidPreviewOptions = {
  diagram: "flowchart",
  scope: { kind: "workspace" },
  granularity: "symbol",
  direction: "auto",
  theme: "light",
};

function okPreview(source = "graph TB\n  a-->b"): MermaidPreviewResult {
  return {
    status: "ok",
    options: DEFAULT_OPTIONS,
    source,
    title: "flowchart · Workspace",
  };
}

function classOkPreview(): MermaidPreviewResult {
  return {
    status: "ok",
    options: { ...DEFAULT_OPTIONS, diagram: "classDiagram" },
    source: "classDiagram\n  class Foo",
    title: "classDiagram · Workspace",
  };
}

function failedPreview(
  status: "empty" | "oversized" | "unsupported",
  reason: string,
  options: MermaidPreviewOptions = DEFAULT_OPTIONS,
): MermaidPreviewResult {
  return { status, options, reason };
}

describe("MermaidPreviewPanel (slice 029 US1)", () => {
  afterEach(() => cleanup());

  it("renders the empty placeholder when preview is null", () => {
    render(<MermaidPreviewPanel preview={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(/Open a Mermaid preview/i);
  });

  it("renders the source pane for an ok preview", () => {
    const renderSource = vi.fn<typeof import("../preview/renderMermaid.js").renderMermaidSource>(
      async () => ({ status: "rendering" }) as MermaidRenderState,
    );
    render(<MermaidPreviewPanel preview={okPreview()} renderSource={renderSource} />);

    // The mockup Mermaid scene (slice 033) has no title heading — the editor
    // tab labels the scene. The source pane still renders the .mmd text.
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

describe("MermaidPreviewPanel inline controls (slice 029 US2 / PR-B)", () => {
  afterEach(() => cleanup());

  it("renders diagram, scope, granularity, and direction selectors when preview is ok", () => {
    render(<MermaidPreviewPanel preview={okPreview()} onOptionsChange={vi.fn()} />);

    expect(screen.getByLabelText(/diagram/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/scope/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/granularity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/direction/i)).toBeInTheDocument();
  });

  it("selectors reflect the current preview.options values", () => {
    const customPreview: MermaidPreviewResult = {
      status: "ok",
      options: {
        diagram: "flowchart",
        scope: { kind: "workspace" },
        granularity: "file",
        direction: "LR",
        theme: "light",
      },
      source: "graph LR\n",
      title: "flowchart · Workspace",
    };
    render(<MermaidPreviewPanel preview={customPreview} onOptionsChange={vi.fn()} />);

    expect(screen.getByLabelText(/diagram/i)).toHaveValue("flowchart");
    expect(screen.getByLabelText(/granularity/i)).toHaveValue("file");
    expect(screen.getByLabelText(/direction/i)).toHaveValue("LR");
  });

  it("changing the diagram selector emits onOptionsChange with diagram updated and other fields preserved", () => {
    const onOptionsChange = vi.fn();
    render(<MermaidPreviewPanel preview={okPreview()} onOptionsChange={onOptionsChange} />);

    fireEvent.change(screen.getByLabelText(/diagram/i), { target: { value: "classDiagram" } });

    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange).toHaveBeenCalledWith({
      ...DEFAULT_OPTIONS,
      diagram: "classDiagram",
    });
  });

  it("changing the granularity selector emits onOptionsChange with granularity updated", () => {
    const onOptionsChange = vi.fn();
    render(<MermaidPreviewPanel preview={okPreview()} onOptionsChange={onOptionsChange} />);

    fireEvent.change(screen.getByLabelText(/granularity/i), { target: { value: "package" } });

    expect(onOptionsChange).toHaveBeenCalledWith({
      ...DEFAULT_OPTIONS,
      granularity: "package",
    });
  });

  it("changing the direction selector emits onOptionsChange with direction updated", () => {
    const onOptionsChange = vi.fn();
    render(<MermaidPreviewPanel preview={okPreview()} onOptionsChange={onOptionsChange} />);

    fireEvent.change(screen.getByLabelText(/direction/i), { target: { value: "TB" } });

    expect(onOptionsChange).toHaveBeenCalledWith({
      ...DEFAULT_OPTIONS,
      direction: "TB",
    });
  });

  it("disables granularity and direction controls when diagram is classDiagram (Mermaid classDiagram ignores both)", () => {
    render(<MermaidPreviewPanel preview={classOkPreview()} onOptionsChange={vi.fn()} />);

    expect(screen.getByLabelText(/granularity/i)).toBeDisabled();
    expect(screen.getByLabelText(/direction/i)).toBeDisabled();
  });

  it("does not call onOptionsChange when a disabled control is targeted programmatically", () => {
    const onOptionsChange = vi.fn();
    render(<MermaidPreviewPanel preview={classOkPreview()} onOptionsChange={onOptionsChange} />);

    // Even if some test or accessibility tool fires a change on a disabled
    // select, the panel must not forward it as an options change.
    fireEvent.change(screen.getByLabelText(/granularity/i), { target: { value: "package" } });

    expect(onOptionsChange).not.toHaveBeenCalled();
  });

  it("keeps the inline control bar visible when preview is fail-closed so users can switch away from the failing diagram", () => {
    const failed = failedPreview(
      "unsupported",
      "Sequence preview is unavailable until slice 031.",
      {
        ...DEFAULT_OPTIONS,
        diagram: "sequenceDiagram",
      },
    );
    const onOptionsChange = vi.fn();
    render(<MermaidPreviewPanel preview={failed} onOptionsChange={onOptionsChange} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/Sequence preview/i);
    // Controls still present — and the diagram selector reflects the failing pick.
    expect(screen.getByLabelText(/diagram/i)).toHaveValue("sequenceDiagram");

    // User picks flowchart to recover.
    fireEvent.change(screen.getByLabelText(/diagram/i), { target: { value: "flowchart" } });
    expect(onOptionsChange).toHaveBeenCalledWith({
      ...DEFAULT_OPTIONS,
      diagram: "flowchart",
    });
  });

  it("diagram dropdown lists sequenceDiagram as visible-but-unavailable so future-diagram discoverability stays honest", () => {
    render(<MermaidPreviewPanel preview={okPreview()} onOptionsChange={vi.fn()} />);

    const select = screen.getByLabelText(/diagram/i);
    const options = Array.from(select.querySelectorAll("option")).map((opt) => ({
      value: opt.getAttribute("value"),
      label: opt.textContent ?? "",
    }));

    const sequence = options.find((opt) => opt.value === "sequenceDiagram");
    expect(sequence).toBeDefined();
    expect(sequence?.label).toMatch(/sequence/i);
    // Label or surrounding text should mark it as not yet available.
    expect(sequence?.label).toMatch(/slice 031|unavailable|coming|not yet/i);
  });

  it("does not call onOptionsChange when the preview's existing diagram is re-selected (no-op change)", () => {
    const onOptionsChange = vi.fn();
    render(<MermaidPreviewPanel preview={okPreview()} onOptionsChange={onOptionsChange} />);

    // Selecting the same value as the current one would be a no-op rerender
    // request. The contract is to only emit on actual change.
    fireEvent.change(screen.getByLabelText(/diagram/i), { target: { value: "flowchart" } });

    expect(onOptionsChange).not.toHaveBeenCalled();
  });
});

describe("MermaidPreviewPanel export actions (slice 029 US3 / PR-C)", () => {
  afterEach(() => cleanup());

  function okRenderSource(): Promise<MermaidRenderState> {
    return Promise.resolve({
      status: "ok",
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>',
    } as MermaidRenderState);
  }

  it("renders the export action bar when preview is ok and SVG is rendered", async () => {
    render(<MermaidPreviewPanel preview={okPreview()} renderSource={okRenderSource} />);

    await waitFor(() => {
      expect(screen.getByRole("group", { name: /export actions/i })).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /save.*\.mmd/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save.*\.svg/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save.*\.png/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy image/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy snippet/i })).toBeInTheDocument();
  });

  it("does not render the export action bar when preview is null", () => {
    render(<MermaidPreviewPanel preview={null} />);
    expect(screen.queryByRole("group", { name: /export actions/i })).toBeNull();
  });

  it("renders the export bar but disables its actions when preview is fail-closed", () => {
    // The mockup keeps the export bar visible at all times (slice 033); on a
    // fail-closed preview there is nothing to export, so every action disables.
    render(<MermaidPreviewPanel preview={failedPreview("empty", "No nodes")} />);
    expect(screen.getByRole("group", { name: /export actions/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save.*\.mmd/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /copy \.mmd/i })).toBeDisabled();
  });

  it("calls onSaveRequest with mmd format when Save .mmd is clicked", async () => {
    const onSaveRequest = vi.fn();
    render(
      <MermaidPreviewPanel
        preview={okPreview()}
        renderSource={okRenderSource}
        onSaveRequest={onSaveRequest}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save.*\.mmd/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /save.*\.mmd/i }));

    await waitFor(() => {
      expect(onSaveRequest).toHaveBeenCalledWith(
        "mmd",
        "dextree-flowchart-workspace.mmd",
        expect.stringContaining("graph TB"),
      );
    });
  });

  it("calls onSaveRequest with svg format when Save .svg is clicked", async () => {
    const onSaveRequest = vi.fn();
    render(
      <MermaidPreviewPanel
        preview={okPreview()}
        renderSource={okRenderSource}
        onSaveRequest={onSaveRequest}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save.*\.svg/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /save.*\.svg/i }));

    await waitFor(() => {
      expect(onSaveRequest).toHaveBeenCalledWith(
        "svg",
        "dextree-flowchart-workspace.svg",
        '<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>',
      );
    });
  });

  it("calls onSaveRequest with png format and data URL when Save .png is clicked", async () => {
    const onSaveRequest = vi.fn();
    const rasterize = vi.fn().mockResolvedValue("data:image/png;base64,FAKEPNG");

    render(
      <MermaidPreviewPanel
        preview={okPreview()}
        renderSource={okRenderSource}
        onSaveRequest={onSaveRequest}
        rasterizeSvg={rasterize}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save.*\.png/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /save.*\.png/i }));

    await waitFor(() => {
      expect(onSaveRequest).toHaveBeenCalledWith(
        "png",
        "dextree-flowchart-workspace.png",
        "data:image/png;base64,FAKEPNG",
      );
    });
  });

  it("shows working status while PNG is being rasterized", async () => {
    const rasterize = vi.fn().mockImplementation(() => new Promise(() => {})); // never resolves

    render(
      <MermaidPreviewPanel
        preview={okPreview()}
        renderSource={okRenderSource}
        rasterizeSvg={rasterize}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save.*\.png/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /save.*\.png/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/preparing png/i);
    });
  });

  it("shows error status when PNG rasterization fails", async () => {
    const rasterize = vi.fn().mockRejectedValue(new Error("Canvas not supported"));

    render(
      <MermaidPreviewPanel
        preview={okPreview()}
        renderSource={okRenderSource}
        rasterizeSvg={rasterize}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save.*\.png/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /save.*\.png/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/export failed.*canvas/i);
    });
  });

  it("disables all export buttons while an export is in progress", async () => {
    const rasterize = vi.fn().mockImplementation(() => new Promise(() => {}));

    render(
      <MermaidPreviewPanel
        preview={okPreview()}
        renderSource={okRenderSource}
        rasterizeSvg={rasterize}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save.*\.png/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /save.*\.png/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save.*\.mmd/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /save.*\.svg/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /save.*\.png/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /copy image/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /copy snippet/i })).toBeDisabled();
    });
  });
});

describe("MermaidPreviewPanel mockup layout (slice 033 Phase 4)", () => {
  afterEach(() => cleanup());

  const renderOk = vi.fn<typeof import("../preview/renderMermaid.js").renderMermaidSource>(
    async () => ({ status: "ok", svg: "<svg data-testid='svg'></svg>" }) as MermaidRenderState,
  );

  it("orders the toolbar controls Scope → Granularity → Diagram → Direction (T021)", () => {
    const { container } = render(
      <MermaidPreviewPanel
        preview={okPreview()}
        onOptionsChange={vi.fn()}
        renderSource={renderOk}
      />,
    );

    const toolbar = container.querySelector('[data-testid="mermaid-toolbar"]');
    expect(toolbar).toBeTruthy();
    const labels = Array.from(toolbar!.querySelectorAll("label")).map((l) =>
      (l.textContent ?? "").trim().toLowerCase(),
    );
    // The four control labels appear in mockup order before the action buttons.
    const controlLabels = labels.filter((t) => /scope|granularity|diagram|direction/.test(t));
    expect(controlLabels.slice(0, 4)).toEqual([
      expect.stringContaining("scope"),
      expect.stringContaining("granularity"),
      expect.stringContaining("diagram"),
      expect.stringContaining("direction"),
    ]);
  });

  it("renders Re-render and Back to graph actions in the toolbar (T021)", () => {
    const onOptionsChange = vi.fn();
    const onBackToGraph = vi.fn();
    render(
      <MermaidPreviewPanel
        preview={okPreview()}
        onOptionsChange={onOptionsChange}
        onBackToGraph={onBackToGraph}
        renderSource={renderOk}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /re-render/i }));
    expect(onOptionsChange).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /back to graph/i }));
    expect(onBackToGraph).toHaveBeenCalledTimes(1);
  });

  it("renders a status row showing the active theme (T024)", () => {
    const { container } = render(
      <MermaidPreviewPanel preview={okPreview()} renderSource={renderOk} />,
    );
    const statusRow = container.querySelector('[data-testid="mermaid-status-row"]');
    expect(statusRow).toBeTruthy();
    expect(statusRow!.textContent).toMatch(/theme/i);
    expect(statusRow!.textContent).toMatch(/light/i);
  });

  it("splits the body with the rendered preview before the source (T022)", async () => {
    const { container } = render(
      <MermaidPreviewPanel preview={okPreview()} renderSource={renderOk} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("mermaid-render-pane")).toBeInTheDocument();
    });
    const body = container.querySelector('[data-testid="mermaid-body"]');
    expect(body).toBeTruthy();
    const panes = Array.from(
      body!.querySelectorAll(
        '[data-testid="mermaid-render-pane"], [data-testid="mermaid-source-pane"]',
      ),
    ).map((el) => el.getAttribute("data-testid"));
    // Preview (render) pane comes first, source pane second.
    expect(panes).toEqual(["mermaid-render-pane", "mermaid-source-pane"]);
  });

  it("orders export bar Copy .mmd → Save .mmd → Save PNG → Save SVG → Copy image → Markdown snippet (T023)", async () => {
    const { container } = render(
      <MermaidPreviewPanel preview={okPreview()} onSaveRequest={vi.fn()} renderSource={renderOk} />,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save.*\.svg/i })).toBeInTheDocument();
    });
    const bar = container.querySelector('[data-testid="mermaid-export-bar"]');
    expect(bar).toBeTruthy();
    const buttonText = Array.from(bar!.querySelectorAll("button")).map((b) =>
      (b.textContent ?? "").trim().toLowerCase(),
    );
    expect(buttonText).toEqual([
      expect.stringContaining("copy .mmd"),
      expect.stringContaining("save .mmd"),
      expect.stringContaining("save"), // Save PNG
      expect.stringContaining("save"), // Save SVG
      expect.stringContaining("copy"), // Copy image
      expect.stringContaining("copy"), // Markdown snippet
    ]);
    // The deferred-sequence hint lives at the end of the export bar.
    expect(bar!.textContent).toMatch(/sequence diagram available after/i);
  });

  it("Copy .mmd copies the source to the clipboard (T023)", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <MermaidPreviewPanel preview={okPreview("graph TB\n  x-->y")} renderSource={renderOk} />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /copy \.mmd/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /copy \.mmd/i }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
  });
});
