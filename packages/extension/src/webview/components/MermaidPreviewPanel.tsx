import { useEffect, useMemo, useState } from "react";

import type { MermaidPreviewResult } from "@dextree/exporters";

import {
  renderMermaidSource,
  resolveMermaidThemeFromBody,
  type MermaidRenderState,
} from "../preview/renderMermaid.js";
import styles from "./MermaidPreviewPanel.module.css";

export interface MermaidPreviewPanelProps {
  preview: MermaidPreviewResult | null;
  /**
   * Render hook injected by tests so the component can be exercised without
   * the real `mermaid` runtime. Defaults to {@link renderMermaidSource}.
   */
  renderSource?: typeof renderMermaidSource;
}

/**
 * Slice 029 US1 (PR-A) preview tab body.
 *
 * Two-pane layout: source on the left, rendered SVG on the right. The
 * inline scope/granularity/diagram/direction control bar lands in PR-B
 * (US2) and the export action bar lands in PR-C (US3).
 */
export function MermaidPreviewPanel({
  preview,
  renderSource = renderMermaidSource,
}: MermaidPreviewPanelProps) {
  const [renderState, setRenderState] = useState<MermaidRenderState>({ status: "idle" });

  const okPreview = useMemo(() => (preview?.status === "ok" ? preview : null), [preview]);

  useEffect(() => {
    if (okPreview === null) {
      setRenderState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setRenderState({ status: "rendering" });
    void renderSource(okPreview.source, okPreview.options.theme).then((next) => {
      if (cancelled) return;
      setRenderState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [okPreview, renderSource]);

  if (preview === null) {
    return (
      <div className={styles.empty} role="status">
        Open a Mermaid preview to see source and rendered output here.
      </div>
    );
  }

  if (preview.status !== "ok") {
    return (
      <div className={styles.failClosed} role="alert">
        <h2 className={styles.failTitle}>Preview unavailable</h2>
        <p className={styles.failReason}>{preview.reason}</p>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>{preview.title}</h2>
      </header>
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
              // dangerouslySetInnerHTML is safe here because the SVG comes
              // from the Mermaid runtime with securityLevel:"strict", and
              // mermaid sanitizes the input source before producing markup.
              dangerouslySetInnerHTML={{ __html: renderState.svg }}
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
    </div>
  );
}

export { resolveMermaidThemeFromBody };
