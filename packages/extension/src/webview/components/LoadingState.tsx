import { motion } from "framer-motion";

/**
 * Shown while the extension host is indexing or before the first symbols message
 * arrives (FR-003, FR-008).
 */
export function LoadingState() {
  return (
    <div className="dxt-loading">
      <motion.span
        className="codicon codicon-type-hierarchy"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
        aria-hidden="true"
      />
      <span>Indexing symbols…</span>
    </div>
  );
}
