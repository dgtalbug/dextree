import type React from "react";

import styles from "./DepthSlider.module.css";

export const DEPTH_MIN = 1;
export const DEPTH_MAX = 6;
const DEPTH_DISABLED_TOOLTIP = "Select a node first";

export interface DepthSliderProps {
  depth: number;
  onDepthChange: (depth: number) => void;
  enabled: boolean;
}

export function DepthSlider({
  depth,
  onDepthChange,
  enabled,
}: DepthSliderProps): React.ReactElement {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const next = Number(event.target.value);
    if (Number.isFinite(next)) {
      onDepthChange(next);
    }
  };

  return (
    <label
      className={`${styles.depthSlider} ${enabled ? "" : styles.disabled}`}
      title={enabled ? `Depth: ${depth}` : DEPTH_DISABLED_TOOLTIP}
    >
      <span className={styles.label}>{`Depth: ${depth}`}</span>
      <input
        type="range"
        min={DEPTH_MIN}
        max={DEPTH_MAX}
        step={1}
        value={depth}
        disabled={!enabled}
        onChange={handleChange}
        aria-label="Hop depth"
        aria-valuemin={DEPTH_MIN}
        aria-valuemax={DEPTH_MAX}
        aria-valuenow={depth}
        className={styles.range}
      />
    </label>
  );
}

export default DepthSlider;
