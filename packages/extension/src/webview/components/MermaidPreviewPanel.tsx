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
   * place (slice 029 US2 / PR-B). Optional so US1 tests that don't supply
   * it still pass.
   */
  onOptionsChange?: (options: MermaidPreviewOptions) => void;
  /**
   * Called when the user requests a file-backed save (slice 029 US3 / PR-C).
   * The host handles the actual file write after presenting a save dialog.
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
  { value: "sequenceDiagram", label: "Sequence diagram (unavailable until slice 031)" },
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
 * Slice 029 preview tab body.
 *
 * - US1 (PR-A): two-pane layout — source on the left, rendered SVG on the right.
 * - US2 (PR-B): inline scope/granularity/diagram/direction control bar above
 *   the panes. Controls are always visible when a preview exists (even when
 *   the current preview is fail-closed) so the user can switch away from a
 *   failing combination without leaving the tab.
 *
 * Mermaid `classDiagram` is supported but ignores `granularity` and
 * `direction` (the slice-028 serializer drops both), so those selectors
 * disable when the active diagram is `classDiagram`. `sequenceDiagram` is
 * listed for discoverability but flagged as unavailable until slice 031;
 * selecting it produces a host-side fail-closed result with the slice-031
 * explanation, which the panel renders in the body without hiding the
 * control bar.
 */
export function MermaidPreviewPanel({
  preview,
  onOptionsChange,
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

  // Export action handlers (US3)
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

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>
          {preview.status === "ok" ? preview.title : "Mermaid preview"}
        </h2>
      </header>
      <ControlBar options={preview.options} onOptionsChange={onOptionsChange} />
      {canExport && (
        <div className={styles.exportBar} role="group" aria-label="Export actions">
          <button
            type="button"
            className={styles.exportButton}
            onClick={() => void handleSave("mmd")}
            disabled={exportStatus.type === "working"}
            title="Save as Mermaid source (.mmd)"
          >
            <span className="codicon codicon-file-code" aria-hidden="true" />
            Save .mmd
          </button>
          <button
            type="button"
            className={styles.exportButton}
            onClick={() => void handleSave("svg")}
            disabled={exportStatus.type === "working"}
            title="Save as SVG"
          >
            <span className="codicon codicon-file-media" aria-hidden="true" />
            Save .svg
          </button>
          <button
            type="button"
            className={styles.exportButton}
            onClick={() => void handleSave("png")}
            disabled={exportStatus.type === "working"}
            title="Save as PNG"
          >
            <span className="codicon codicon-file-media" aria-hidden="true" />
            Save .png
          </button>
          <button
            type="button"
            className={styles.exportButton}
            onClick={() => void handleCopyImage()}
            disabled={exportStatus.type === "working"}
            title="Copy rendered image to clipboard"
          >
            <span className="codicon codicon-clippy" aria-hidden="true" />
            Copy image
          </button>
          <button
            type="button"
            className={styles.exportButton}
            onClick={() => void handleCopyMarkdown()}
            disabled={exportStatus.type === "working"}
            title="Copy Markdown snippet to clipboard"
          >
            <span className="codicon codicon-markdown" aria-hidden="true" />
            Copy snippet
          </button>
        </div>
      )}
      {exportStatus.type !== "idle" && (
        <div
          className={
            exportStatus.type === "error"
              ? styles.exportError
              : exportStatus.type === "success"
                ? styles.exportSuccess
                : styles.exportWorking
          }
          role={exportStatus.type === "error" ? "alert" : "status"}
        >
          {exportStatus.message}
        </div>
      )}
      {preview.status !== "ok" ? (
        <div className={styles.failClosed} role="alert">
          <h3 className={styles.failTitle}>Preview unavailable</h3>
          <p className={styles.failReason}>{preview.reason}</p>
        </div>
      ) : (
        <div className={styles.panes}>
          <section
            className={styles.sourcePane}
            aria-label="Mermaid source"
            data-testid="mermaid-source-pane"
          >
            <pre className={styles.sourceText}>{preview.source}</pre>
          </section>
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
        </div>
      )}
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
