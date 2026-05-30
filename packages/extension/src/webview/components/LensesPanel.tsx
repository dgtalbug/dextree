import {
  LENS_IDS,
  selectGodClass,
  selectLeastUsed,
  selectMostUsed,
  type LensId,
  type LensSelector,
} from "@dextree/core/lenses";
import type React from "react";

import styles from "./LensesPanel.module.css";

interface LensDescriptor {
  id: LensId;
  title: string;
  description: string;
  iconKey: string;
  selector: LensSelector | null;
  /** Tooltip rendered on disabled rows; must contain substring "slice 026". */
  disabledTooltip?: string;
}

export const LENS_REGISTRY: Readonly<Record<LensId, LensDescriptor>> = {
  "god-class": {
    id: "god-class",
    title: "God class / function",
    description: "Top-10 by PageRank",
    iconKey: "star",
    selector: selectGodClass,
  },
  "most-used": {
    id: "most-used",
    title: "Most used",
    description: "Highest fan-in",
    iconKey: "flame",
    selector: selectMostUsed,
  },
  "least-used": {
    id: "least-used",
    title: "Least used",
    description: "Fan-in ≤ 1 in main component",
    iconKey: "trash",
    selector: selectLeastUsed,
  },
  "entry-points": {
    id: "entry-points",
    title: "Entry points",
    description: "Runtime · handler · test · public-API",
    iconKey: "key",
    selector: null,
    disabledTooltip:
      "Available after slice 026 — entry-point and architectural layer classification.",
  },
  architecture: {
    id: "architecture",
    title: "Architecture",
    description: "Colour by layer (entry / domain / I/O / util)",
    iconKey: "layers",
    selector: null,
    disabledTooltip:
      "Available after slice 026 — entry-point and architectural layer classification.",
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
          const disabled = descriptor.selector === null;
          const pressed = activeLensId === id;
          const count = lensCounts[id];

          const rowClass = disabled ? `${styles.lensRow} ${styles.disabled}` : styles.lensRow;

          const handleClick = (): void => {
            if (!disabled) {
              onLensToggle(id);
            }
          };

          return (
            <button
              key={id}
              type="button"
              className={rowClass}
              data-testid={`lens-row-${id}`}
              aria-pressed={pressed}
              aria-disabled={disabled || undefined}
              title={disabled ? descriptor.disabledTooltip : undefined}
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
