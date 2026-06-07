import { describe, expect, it, vi } from "vitest";

import { LiveLayout, type LayoutSupervisor } from "./liveLayout.js";

function fakeSupervisor() {
  let running = false;
  return {
    start: vi.fn(() => {
      running = true;
    }),
    stop: vi.fn(() => {
      running = false;
    }),
    kill: vi.fn(),
    isRunning: () => running,
  } satisfies LayoutSupervisor;
}

/** A controllable fake timer: capture the callback, fire it on demand. */
function fakeTimers() {
  const pending: { id: number; cb: () => void }[] = [];
  let nextId = 1;
  return {
    setTimer: vi.fn((cb: () => void) => {
      const id = nextId++;
      pending.push({ id, cb });
      return id;
    }),
    clearTimer: vi.fn((handle: unknown) => {
      const i = pending.findIndex((p) => p.id === handle);
      if (i >= 0) pending.splice(i, 1);
    }),
    fireAll: () => {
      const due = pending.splice(0, pending.length);
      for (const p of due) p.cb();
    },
    pendingCount: () => pending.length,
  };
}

function make(sup: LayoutSupervisor, timers: ReturnType<typeof fakeTimers>, nodeCount = 10) {
  return new LiveLayout(() => sup, {
    maxRunMs: 2000,
    nodeCount,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
}

describe("LiveLayout", () => {
  it("run() starts the supervisor and arms an auto-stop timer", () => {
    const sup = fakeSupervisor();
    const timers = fakeTimers();
    const live = make(sup, timers);

    live.run();
    expect(sup.start).toHaveBeenCalledTimes(1);
    expect(live.running).toBe(true);
    expect(timers.pendingCount()).toBe(1);
  });

  it("auto-stops when the timer fires", () => {
    const sup = fakeSupervisor();
    const timers = fakeTimers();
    const live = make(sup, timers);

    live.run();
    timers.fireAll();
    expect(sup.stop).toHaveBeenCalledTimes(1);
    expect(live.running).toBe(false);
  });

  it("re-run re-arms the timer without double-starting", () => {
    const sup = fakeSupervisor();
    const timers = fakeTimers();
    const live = make(sup, timers);

    live.run();
    live.run(); // already running → only re-arm
    expect(sup.start).toHaveBeenCalledTimes(1);
    expect(timers.clearTimer).toHaveBeenCalledTimes(1); // prior timer cleared
    expect(timers.pendingCount()).toBe(1);
  });

  it("stop() halts and clears the pending timer (idempotent)", () => {
    const sup = fakeSupervisor();
    const timers = fakeTimers();
    const live = make(sup, timers);

    live.run();
    live.stop();
    expect(sup.stop).toHaveBeenCalledTimes(1);
    expect(timers.pendingCount()).toBe(0);
    live.stop(); // idempotent — no throw, no extra stop
    expect(sup.stop).toHaveBeenCalledTimes(1);
  });

  it("dispose() stops and kills; run() is a no-op afterwards", () => {
    const sup = fakeSupervisor();
    const timers = fakeTimers();
    const live = make(sup, timers);

    live.run();
    live.dispose();
    expect(sup.kill).toHaveBeenCalledTimes(1);

    live.run(); // disposed → no-op
    expect(sup.start).toHaveBeenCalledTimes(1); // still just the first start
  });

  it("caps the run time and scales it down for large graphs", () => {
    const sup = fakeSupervisor();
    const timers = fakeTimers();
    // 2000ms cap, 4000 nodes (10x the large-graph threshold of 400) → ~200ms,
    // floored at 300ms.
    const live = new LiveLayout(() => sup, {
      maxRunMs: 2000,
      nodeCount: 4000,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });
    live.run(99999); // ask for huge; must be clamped to the scaled cap
    const ms = timers.setTimer.mock.calls[0]![1] as number;
    expect(ms).toBeLessThanOrEqual(300);
    expect(ms).toBeGreaterThan(0);
  });
});
