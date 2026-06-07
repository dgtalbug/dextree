import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";

import type {
  MermaidDiagramKind,
  MermaidDirection,
  MermaidGranularity,
  MermaidPreviewOptions,
  MermaidPreviewResult,
} from "@dextree/exporters";
import DOMPurify from "dompurify";

import {
  renderMermaidSource,
  resolveMermaidThemeFromBody,
  type MermaidRenderState,
} from "../preview/renderMermaid.js";
import {
  buildMmdContent,
  buildSvgContent,
  buildMarkdownSnippet,
  suggestedPreviewFilename,
  buildPngDataUrl,
  copyClipboardImage,
  type MermaidPreviewFileFormat,
} from "../preview/exportPreview.js";
import styles from "./MermaidPreviewPanel.module.css";

export interface MermaidPreviewPanelProps {
  preview: MermaidPreviewResult | null;
  /**
   * Called when an inline control changes. Wired by App.tsx to send a
   * `requestMermaidPreview` message to the host so the preview rerenders in
   * place. Optional so tests that don't supply it still pass.
   */
  onOptionsChange?: (options: MermaidPreviewOptions) => void;
  /**
   * Returns to the GraphView scene. Wired by App.tsx; the "Back to graph"
   * action now lives in the panel toolbar instead of a separate App-level
   * topbar. Optional so existing tests render without it.
   */
  onBackToGraph?: () => void;
  /**
   * Called when the user requests a file-backed save. The host handles the
   * actual file write after presenting a save dialog.
   */
  onSaveRequest?: (
    format: MermaidPreviewFileFormat,
    suggestedName: string,
    content: string,
  ) => void;
  /**
   * Render hook injected by tests so the component can be exercised without
   * the real `mermaid` runtime. Defaults to {@link renderMermaidSource}.
   */
  renderSource?: typeof renderMermaidSource;
  /**
   * Rasterizer hook injected by tests for PNG export. Defaults to the
   * Canvas-based implementation in exportPreview.ts.
   */
  rasterizeSvg?: Parameters<typeof buildPngDataUrl>[1];
  /**
   * Clipboard writer hook injected by tests for clipboard image copy.
   * Defaults to the navigator.clipboard-based implementation in exportPreview.ts.
   */
  writeClipboardImage?: Parameters<typeof copyClipboardImage>[1];
}

const DIAGRAM_OPTIONS: ReadonlyArray<{ value: MermaidDiagramKind; label: string }> = [
  { value: "flowchart", label: "Flowchart" },
  { value: "classDiagram", label: "Class diagram" },
  { value: "sequenceDiagram", label: "Sequence diagram (not yet available)" },
];

const GRANULARITY_OPTIONS: ReadonlyArray<{ value: MermaidGranularity; label: string }> = [
  { value: "package", label: "Package" },
  { value: "file", label: "File" },
  { value: "symbol", label: "Symbol" },
];

const DIRECTION_OPTIONS: ReadonlyArray<{ value: MermaidDirection; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "TB", label: "Top → Bottom" },
  { value: "LR", label: "Left → Right" },
  { value: "BT", label: "Bottom → Top" },
  { value: "RL", label: "Right → Left" },
];

/**
 * Sanitizes SVG markup through DOMPurify before injection. Mermaid's
 * `securityLevel:"strict"` already strips harmful content, but this
 * provides defense-in-depth so the rendered SVG stays safe even if
 * the Mermaid runtime output were to change.
 */
function sanitizeSvgForRender(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
  });
}

/**
 * Mermaid preview tab body.
 *
 * Two-pane layout — source on the left, rendered SVG on the right — with an
 * inline scope/granularity/diagram/direction control bar above the panes.
 * Controls are always visible when a preview exists (even when the current
 * preview is fail-closed) so the user can switch away from a failing
 * combination without leaving the tab.
 *
 * Mermaid `classDiagram` is supported but ignores `granularity` and
 * `direction` (the serializer drops both), so those selectors disable when
 * the active diagram is `classDiagram`. `sequenceDiagram` is listed for
 * discoverability but flagged as not yet available; selecting it produces a
 * host-side fail-closed result with an explanation, which the panel renders
 * in the body without hiding the control bar.
 */
export function MermaidPreviewPanel({
  preview,
  onOptionsChange,
  onBackToGraph,
  onSaveRequest,
  renderSource = renderMermaidSource,
  rasterizeSvg,
  writeClipboardImage,
}: MermaidPreviewPanelProps) {
  const [renderState, setRenderState] = useState<MermaidRenderState>({ status: "idle" });
  const [exportStatus, setExportStatus] = useState<
    | { type: "idle" }
    | { type: "working"; message: string }
    | { type: "error"; message: string; timestamp: number }
    | { type: "success"; message: string; timestamp: number }
  >({ type: "idle" });

  const okPreview = useMemo(() => (preview?.status === "ok" ? preview : null), [preview]);
  const renderedSvg = renderState.status === "ok" ? renderState.svg : null;
  const exportResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (exportResetTimerRef.current !== null) {
        clearTimeout(exportResetTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (okPreview === null) {
      setRenderState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setRenderState({ status: "rendering" });
    // .then chain must be paired with .catch — `renderSource` is supposed to
    // resolve to a `render-error` state on failure rather than reject, but a
    // synchronous throw before its own try/catch (e.g. dynamic import failure)
    // would bubble as an unhandled rejection and leave the panel stuck in
    // "rendering". The catch routes any such case through the same
    // render-error surface so the UI never hangs.
    renderSource(okPreview.source, okPreview.options.theme)
      .then((next) => {
        if (cancelled) return;
        setRenderState(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const reason = err instanceof Error ? err.message : String(err);
        setRenderState({ status: "render-error", source: okPreview.source, reason });
      });
    return () => {
      cancelled = true;
    };
  }, [okPreview, renderSource]);

  // Export action handlers
  async function handleSave(format: MermaidPreviewFileFormat): Promise<void> {
    if (okPreview === null) return;
    setExportStatus({ type: "working", message: `Preparing ${format.toUpperCase()}…` });
    try {
      let content: string;
      if (format === "mmd") {
        content = buildMmdContent(okPreview.source);
      } else if (format === "svg") {
        if (renderedSvg === null) {
          throw new Error("SVG not yet rendered");
        }
        content = buildSvgContent(renderedSvg);
      } else {
        // png
        if (renderedSvg === null) {
          throw new Error("SVG not yet rendered");
        }
        content = await buildPngDataUrl(renderedSvg, rasterizeSvg);
      }
      const suggestedName = suggestedPreviewFilename(okPreview.options, format);
      onSaveRequest?.(format, suggestedName, content);
      setExportStatus({
        type: "success",
        message: `${format.toUpperCase()} ready — choose where to save.`,
        timestamp: Date.now(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setExportStatus({
        type: "error",
        message: `Export failed: ${message}`,
        timestamp: Date.now(),
      });
    }
  }

  async function handleCopyImage(): Promise<void> {
    if (renderedSvg === null) return;
    setExportStatus({ type: "working", message: "Copying image…" });
    try {
      await copyClipboardImage(renderedSvg, writeClipboardImage);
      setExportStatus({
        type: "success",
        message: "Image copied to clipboard.",
        timestamp: Date.now(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setExportStatus({ type: "error", message: `Copy failed: ${message}`, timestamp: Date.now() });
    }
  }

  async function handleCopyMmd(): Promise<void> {
    if (okPreview === null) return;
    setExportStatus({ type: "working", message: "Copying .mmd…" });
    try {
      const content = buildMmdContent(okPreview.source);
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
        setExportStatus({
          type: "success",
          message: "Mermaid source copied.",
          timestamp: Date.now(),
        });
      } else {
        throw new Error("Clipboard text API unavailable");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setExportStatus({ type: "error", message: `Copy failed: ${message}`, timestamp: Date.now() });
    }
  }

  async function handleCopyMarkdown(): Promise<void> {
    if (okPreview === null) return;
    setExportStatus({ type: "working", message: "Copying snippet…" });
    try {
      const snippet = buildMarkdownSnippet(okPreview.source);
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(snippet);
        setExportStatus({
          type: "success",
          message: "Markdown snippet copied.",
          timestamp: Date.now(),
        });
      } else {
        throw new Error("Clipboard text API unavailable");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setExportStatus({ type: "error", message: `Copy failed: ${message}`, timestamp: Date.now() });
    }
  }

  if (preview === null) {
    return (
      <div className={styles.empty} role="status">
        Open a Mermaid preview to see source and rendered output here.
      </div>
    );
  }

  const canExport = okPreview !== null && renderedSvg !== null;
  const exportDisabled = !canExport || exportStatus.type === "working";
  const themeLabel = preview.options.theme === "dark" ? "Dark" : "Light";

  return (
    <div className={styles.shell}>
      {/* Row 1 — control toolbar (Scope → Granularity → Diagram → Direction → Re-render → Back) */}
      <div className={styles.toolbar} data-testid="mermaid-toolbar">
        <ControlBar options={preview.options} onOptionsChange={onOptionsChange} />
        <div className={styles.toolbarSpacer} />
        <button
          type="button"
          className={styles.toolbarButton}
          onClick={() => onOptionsChange?.(preview.options)}
          disabled={onOptionsChange === undefined}
          title="Re-render the diagram"
        >
          <span className="codicon codicon-refresh" aria-hidden="true" />
          Re-render
        </button>
        <button
          type="button"
          className={styles.toolbarButton}
          onClick={() => onBackToGraph?.()}
          disabled={onBackToGraph === undefined}
          title="Back to the graph view"
        >
          <span className="codicon codicon-close" aria-hidden="true" />
          Back to graph
        </button>
      </div>

      {/* Row 2 — status row (theme + an optional soft-cap "large diagram" notice) */}
      <div className={styles.statusRow} data-testid="mermaid-status-row">
        <span className={styles.statusItem}>
          <span className="codicon codicon-info" aria-hidden="true" />
          Theme: {themeLabel}
        </span>
        {okPreview?.warning !== undefined && (
          <span
            className={styles.statusItem}
            data-testid="mermaid-soft-cap-warning"
            role="status"
            title={okPreview.warning}
          >
            <span className="codicon codicon-warning" aria-hidden="true" />
            Large diagram
          </span>
        )}
        <span className={styles.statusSpacer} />
        {exportStatus.type !== "idle" && (
          <span
            className={
              exportStatus.type === "error"
                ? styles.statusMessageError
                : exportStatus.type === "success"
                  ? styles.statusMessageSuccess
                  : styles.statusMessageWorking
            }
            role={exportStatus.type === "error" ? "alert" : "status"}
            aria-live={exportStatus.type === "error" ? undefined : "polite"}
          >
            {exportStatus.message}
            {exportStatus.type !== "working" && (
              <button
                type="button"
                onClick={() => setExportStatus({ type: "idle" })}
                aria-label="Close export status message"
                className={styles.statusCloseButton}
              >
                <span className="codicon codicon-close" aria-hidden="true" />
              </button>
            )}
          </span>
        )}
      </div>

      {/* Row 3 — body: rendered preview (left, 2fr) + source (right, 1fr) */}
      {preview.status !== "ok" ? (
        <div className={styles.failClosed} role="alert">
          <h3 className={styles.failTitle}>Preview unavailable</h3>
          <p className={styles.failReason}>{preview.reason}</p>
        </div>
      ) : (
        <div className={styles.body} data-testid="mermaid-body">
          <section
            className={styles.renderPane}
            aria-label="Rendered Mermaid preview"
            data-testid="mermaid-render-pane"
          >
            {renderState.status === "rendering" ? (
              <div className={styles.renderStatus} role="status">
                Rendering…
              </div>
            ) : renderState.status === "ok" ? (
              <div
                className={styles.renderSvg}
                data-testid="mermaid-render-svg"
                dangerouslySetInnerHTML={{
                  __html: sanitizeSvgForRender(renderState.svg),
                }}
              />
            ) : renderState.status === "render-error" ? (
              <div className={styles.renderError} role="alert">
                <strong>Render failed:</strong> {renderState.reason}
              </div>
            ) : (
              <div className={styles.renderStatus} role="status">
                Idle.
              </div>
            )}
          </section>
          <section
            className={styles.sourcePane}
            aria-label="Mermaid source"
            data-testid="mermaid-source-pane"
          >
            <pre className={styles.sourceText}>{preview.source}</pre>
          </section>
        </div>
      )}

      {/* Row 4 — export bar (Copy .mmd → Save .mmd → Save PNG → Save SVG → Copy image → Markdown snippet → hint) */}
      <div
        className={styles.exportBar}
        role="group"
        aria-label="Export actions"
        data-testid="mermaid-export-bar"
      >
        <button
          type="button"
          className={styles.exportButton}
          onClick={() => void handleCopyMmd()}
          disabled={exportDisabled}
          title="Copy Mermaid source (.mmd) to clipboard"
        >
          <span className="codicon codicon-copy" aria-hidden="true" />
          Copy .mmd
        </button>
        <button
          type="button"
          className={styles.exportButton}
          onClick={() => void handleSave("mmd")}
          disabled={exportDisabled}
          title="Save as Mermaid source (.mmd)"
        >
          <span className="codicon codicon-save" aria-hidden="true" />
          Save .mmd
        </button>
        <button
          type="button"
          className={styles.exportButton}
          onClick={() => void handleSave("png")}
          disabled={exportDisabled}
          title="Save as PNG"
        >
          <span className="codicon codicon-file-media" aria-hidden="true" />
          Save .png
        </button>
        <button
          type="button"
          className={styles.exportButton}
          onClick={() => void handleSave("svg")}
          disabled={exportDisabled}
          title="Save as SVG"
        >
          <span className="codicon codicon-file-media" aria-hidden="true" />
          Save .svg
        </button>
        <button
          type="button"
          className={styles.exportButton}
          onClick={() => void handleCopyImage()}
          disabled={exportDisabled}
          title="Copy rendered image to clipboard"
        >
          <span className="codicon codicon-clippy" aria-hidden="true" />
          Copy image
        </button>
        <button
          type="button"
          className={styles.exportButton}
          onClick={() => void handleCopyMarkdown()}
          disabled={exportDisabled}
          title="Copy Markdown snippet to clipboard"
        >
          <span className="codicon codicon-markdown" aria-hidden="true" />
          Copy snippet
        </button>
        <span className={styles.exportSpacer} />
        <span className={styles.exportHint}>
          Sequence diagram available after you set a trace route in GraphView
        </span>
      </div>
    </div>
  );
}

interface ControlBarProps {
  options: MermaidPreviewOptions;
  onOptionsChange: ((options: MermaidPreviewOptions) => void) | undefined;
}

function ControlBar({ options, onOptionsChange }: ControlBarProps) {
  const diagramId = useId();
  const scopeId = useId();
  const granularityId = useId();
  const directionId = useId();

  const isClassDiagram = options.diagram === "classDiagram";
  const granularityDisabled = isClassDiagram;
  const directionDisabled = isClassDiagram;

  function emitIfChanged(next: MermaidPreviewOptions): void {
    if (onOptionsChange === undefined) return;
    if (
      next.diagram === options.diagram &&
      next.granularity === options.granularity &&
      next.direction === options.direction &&
      next.scope.kind === options.scope.kind
    ) {
      return;
    }
    onOptionsChange(next);
  }

  function handleDiagramChange(event: ChangeEvent<HTMLSelectElement>): void {
    const next = event.target.value as MermaidDiagramKind;
    emitIfChanged({ ...options, diagram: next });
  }

  function handleGranularityChange(event: ChangeEvent<HTMLSelectElement>): void {
    if (granularityDisabled) return;
    const next = event.target.value as MermaidGranularity;
    emitIfChanged({ ...options, granularity: next });
  }

  function handleDirectionChange(event: ChangeEvent<HTMLSelectElement>): void {
    if (directionDisabled) return;
    const next = event.target.value as MermaidDirection;
    emitIfChanged({ ...options, direction: next });
  }

  function handleScopeChange(event: ChangeEvent<HTMLSelectElement>): void {
    const next = event.target.value;
    if (next === "workspace") {
      emitIfChanged({ ...options, scope: { kind: "workspace" } });
    }
    // "file" is listed but disabled — scope stays workspace for now
  }

  return (
    <div className={styles.controls} role="group" aria-label="Mermaid preview controls">
      <label className={styles.controlLabel} htmlFor={scopeId}>
        Scope
        <select
          id={scopeId}
          className={styles.controlSelect}
          value={options.scope.kind}
          onChange={onOptionsChange !== undefined ? handleScopeChange : undefined}
          disabled={onOptionsChange === undefined}
          title="Choose the diagram scope"
        >
          <option value="workspace">Workspace</option>
          <option value="file" disabled title="Per-file scoping available in a future release">
            File (future release)
          </option>
        </select>
      </label>
      <label className={styles.controlLabel} htmlFor={granularityId}>
        Granularity
        <select
          id={granularityId}
          className={styles.controlSelect}
          value={options.granularity}
          onChange={handleGranularityChange}
          disabled={granularityDisabled}
          title={
            granularityDisabled
              ? "Class diagram has a fixed granularity"
              : "Choose the level of detail"
          }
        >
          {GRANULARITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.controlLabel} htmlFor={diagramId}>
        Diagram
        <select
          id={diagramId}
          className={styles.controlSelect}
          value={options.diagram}
          onChange={handleDiagramChange}
        >
          {DIAGRAM_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.controlLabel} htmlFor={directionId}>
        Direction
        <select
          id={directionId}
          className={styles.controlSelect}
          value={options.direction}
          onChange={handleDirectionChange}
          disabled={directionDisabled}
          title={
            directionDisabled
              ? "Class diagram has no direction token"
              : "Choose the layout direction"
          }
        >
          {DIRECTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export { resolveMermaidThemeFromBody };
