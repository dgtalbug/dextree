import {
  LENS_IDS,
  selectEntryPoints,
  selectGodClass,
  selectLeastUsed,
  selectMostUsed,
  type LensId,
  type LensSelector,
} from "@dextree/core/lenses";
import type React from "react";

import { layerColor } from "./lensColor.js";
import styles from "./LensesPanel.module.css";

/**
 * A lens either matches a set of nodes (dimming non-matches) or recolours every
 * node by an attribute. The two modes are typed distinctly so each lens declares
 * what it does rather than overloading one selector shape.
 *
 * - `match`  — the four importance lenses + entry-points. Non-matching nodes are
 *   dimmed; matching nodes keep their base colour.
 * - `recolor` — the architecture lens. No dimming; each node is recoloured by its
 *   layer. `colorOf` returns `null` for nodes that should keep their base colour
 *   (unknown / unclassified layer).
 */
export type LensMode =
  | { kind: "match"; selector: LensSelector }
  | { kind: "recolor"; colorOf: (archLayer: string | undefined) => string | null };

interface LensDescriptor {
  id: LensId;
  title: string;
  description: string;
  iconKey: string;
  mode: LensMode;
}

export const LENS_REGISTRY: Readonly<Record<LensId, LensDescriptor>> = {
  "god-class": {
    id: "god-class",
    title: "God class / function",
    description: "Top-10 by PageRank",
    iconKey: "star",
    mode: { kind: "match", selector: selectGodClass },
  },
  "most-used": {
    id: "most-used",
    title: "Most used",
    description: "Highest fan-in",
    iconKey: "flame",
    mode: { kind: "match", selector: selectMostUsed },
  },
  "least-used": {
    id: "least-used",
    title: "Least used",
    description: "Fan-in ≤ 1 in main component",
    iconKey: "trash",
    mode: { kind: "match", selector: selectLeastUsed },
  },
  "entry-points": {
    id: "entry-points",
    title: "Entry points",
    description: "Runtime · handler · test · public-API",
    iconKey: "key",
    mode: { kind: "match", selector: selectEntryPoints },
  },
  architecture: {
    id: "architecture",
    title: "Architecture",
    description: "Colour by layer (presentation / app / domain / infra)",
    iconKey: "layers",
    mode: { kind: "recolor", colorOf: layerColor },
  },
};

export interface LensesPanelProps {
  activeLensId: LensId | null;
  lensCounts: Readonly<Record<LensId, number>>;
  onLensToggle: (id: LensId) => void;
}

export function LensesPanel({
  activeLensId,
  lensCounts,
  onLensToggle,
}: LensesPanelProps): React.ReactElement {
  return (
    <section className={styles.panel} aria-label="Graph lenses">
      <header className={styles.header}>
        <span className={styles.headerTitle}>LENSES</span>
      </header>
      <p className={styles.hint}>Highlight nodes by importance signal</p>
      <div className={styles.body}>
        {LENS_IDS.map((id) => {
          const descriptor = LENS_REGISTRY[id];
          const pressed = activeLensId === id;
          const count = lensCounts[id];

          const handleClick = (): void => {
            onLensToggle(id);
          };

          return (
            <button
              key={id}
              type="button"
              className={styles.lensRow}
              data-testid={`lens-row-${id}`}
              aria-pressed={pressed}
              onClick={handleClick}
            >
              <span className={styles.lensIcon} data-testid="lens-icon" aria-hidden="true">
                <span className={`codicon codicon-${descriptor.iconKey}`} />
              </span>
              <span className={styles.lensText}>
                <span className={styles.lensTitle} data-testid="lens-title">
                  {descriptor.title}
                </span>
                <span className={styles.lensDesc} data-testid="lens-desc">
                  {descriptor.description}
                </span>
              </span>
              <span
                className={styles.lensCount}
                data-testid="lens-count-badge"
                aria-hidden={count === 0 ? "true" : undefined}
              >
                {count > 0 ? count : ""}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default LensesPanel;
