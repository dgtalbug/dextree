/**
 * Settle-then-idle wrapper around a continuous force-layout supervisor.
 *
 * dextree's default layout used a one-shot `forceAtlas2.assign` (frozen on first
 * paint). A running supervisor (graphology's `FA2LayoutSupervisor`) makes nodes
 * visibly settle — the "lively" feel — but a sim that never stops pins the CPU.
 * `LiveLayout` runs the supervisor and **auto-stops** after a bounded time, and
 * is always stopped on dispose. The supervisor itself is injected so the
 * lifecycle is unit-testable without a web worker / DOM.
 */

/** The subset of `FA2LayoutSupervisor` this wrapper drives. */
export interface LayoutSupervisor {
  start(): void;
  stop(): void;
  kill(): void;
  isRunning(): boolean;
}

export interface LiveLayoutOptions {
  /** Hard cap on a single run before auto-stop (ms). */
  maxRunMs: number;
  /** Node count — used to scale the run time down for large graphs. */
  nodeCount: number;
  /** Injectable timer fns (default to window) so tests use fake timers. */
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/** Below this node count a graph gets the full run; above it, the run scales down. */
const LARGE_GRAPH_NODES = 400;

export class LiveLayout {
  private readonly supervisor: LayoutSupervisor;
  private readonly maxRunMs: number;
  private readonly setTimer: (cb: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private timer: unknown = null;
  private disposed = false;

  constructor(makeSupervisor: () => LayoutSupervisor, opts: LiveLayoutOptions) {
    this.supervisor = makeSupervisor();
    // Large graphs settle proportionally faster-stopping so a big repo doesn't
    // churn the CPU for the full window.
    const scale = opts.nodeCount > LARGE_GRAPH_NODES ? LARGE_GRAPH_NODES / opts.nodeCount : 1;
    this.maxRunMs = Math.max(300, Math.round(opts.maxRunMs * scale));
    this.setTimer = opts.setTimer ?? ((cb, ms) => window.setTimeout(cb, ms) as unknown);
    this.clearTimer = opts.clearTimer ?? ((handle) => window.clearTimeout(handle as number));
  }

  get running(): boolean {
    return this.supervisor.isRunning();
  }

  /**
   * Start the simulation (if idle) and (re)arm the auto-stop. Calling `run`
   * while already running just re-arms the timer — it never double-starts.
   */
  run(durationMs: number = this.maxRunMs): void {
    if (this.disposed) return;
    this.clearTimerIfAny();
    if (!this.supervisor.isRunning()) {
      this.supervisor.start();
    }
    const ms = Math.min(durationMs, this.maxRunMs);
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.stop();
    }, ms);
  }

  /** Stop the simulation and clear any pending auto-stop. Idempotent. */
  stop(): void {
    this.clearTimerIfAny();
    if (this.supervisor.isRunning()) {
      this.supervisor.stop();
    }
  }

  /** Stop + kill the supervisor. After dispose, `run` is a no-op. */
  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.supervisor.kill();
    this.disposed = true;
  }

  private clearTimerIfAny(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }
}
