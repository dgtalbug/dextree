import type { MultiDirectedGraph } from "graphology";
import type Sigma from "sigma";

import type { GraphNodeAttributes } from "./graphViewTypes.js";

/**
 * Canvas-overlay drawing for the GraphView: per-file cluster hulls and the
 * minimap. These render on dedicated `<canvas>` layers above the Sigma WebGL
 * canvas and are redrawn on Sigma's `afterRender`. Pure drawing helpers — they
 * take the graph, the Sigma instance, and the target canvas; they hold no React
 * or component state.
 */

/** The Sigma camera accessor the minimap reads — the only `SigmaWithExtras`
 * surface this module needs, declared locally to avoid coupling to the
 * component's broader Sigma augmentation. */
type SigmaWithCamera = Sigma & {
  getCamera?: () => { getState?: () => { x: number; y: number; ratio: number } };
};

/**
 * Andrew/gift-wrapping convex hull of a set of 2-D points. Returns the input
 * unchanged when there are fewer than 3 points (no hull is possible).
 */
export function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return points;
  let start = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i]!.x < points[start]!.x) start = i;
  }
  const hull: { x: number; y: number }[] = [];
  let current = start;
  do {
    hull.push(points[current]!);
    let next = (current + 1) % points.length;
    for (let i = 0; i < points.length; i++) {
      const cross =
        (points[next]!.x - points[current]!.x) * (points[i]!.y - points[current]!.y) -
        (points[next]!.y - points[current]!.y) * (points[i]!.x - points[current]!.x);
      if (cross < 0) next = i;
    }
    current = next;
  } while (current !== start && hull.length <= points.length);
  return hull;
}

/** Convert a `#rrggbb` hex string to an `rgba(...)` string at the given alpha. */
export function colorWithAlpha(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (m === null) return `rgba(128,128,128,${alpha})`;
  const h = m[1] as string;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Draw one translucent convex-hull surface per file behind its symbol nodes.
 * The hovered/selected file's hull is emphasised; other hulls dim when any file
 * is active. `sigma.graphToViewport` maps graph-space coords to canvas pixels.
 */
export function drawClusterHulls(
  graph: MultiDirectedGraph,
  sigma: Sigma,
  canvas: HTMLCanvasElement,
  hoveredFilePath: string | null,
  selectedFilePath: string | null,
  communityByNode?: ReadonlyMap<string, number>,
  visibleNodeIds?: ReadonlySet<string>,
): void {
  const ctx = canvas.getContext("2d");
  if (ctx === null) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // When a visible set is supplied (filters / depth / focus active), hulls are
  // computed over only those members, so the regions reflect the filtered view.
  const isVisible = (nodeId: string): boolean =>
    visibleNodeIds === undefined || visibleNodeIds.has(nodeId);

  // Grouping key per symbol node: by community id when a partition is supplied
  // (cluster-aesthetics), else by filePath (the original per-file hulls). The
  // active/dimmed highlight resolves the hovered/selected node's group key too,
  // so highlighting works the same way under either grouping.
  const byCommunity = communityByNode !== undefined && communityByNode.size > 0;
  const groupKeyForNode = (nodeId: string, filePath: string): string | null => {
    if (byCommunity) {
      const community = communityByNode.get(nodeId);
      return community === undefined ? null : `community:${community}`;
    }
    return filePath;
  };

  // Group symbol nodes by their group key, collect viewport coordinates.
  // sigma.graphToViewport takes graph-space {x,y} coords — NOT a node ID.
  const groups = new Map<string, Array<{ x: number; y: number }>>();
  const groupColors = new Map<string, string>();
  // When grouping by community, resolve the active keys from the hovered /
  // selected node's community (the highlight is by node, surfaced as file path).
  let activeKey: string | null = null;
  let selectedKey: string | null = null;

  graph.forEachNode((nodeId, attrs) => {
    const a = attrs as GraphNodeAttributes;
    if (a.nodeKind === "file") {
      if (!byCommunity) {
        groupColors.set(String(a.filePath), String(a.baseColor ?? a.color));
      }
      return;
    }
    if (!isVisible(nodeId)) return;
    const key = groupKeyForNode(nodeId, String(a.filePath));
    if (key === null) return;
    // First color seen for a group wins (deterministic via node iteration order).
    if (!groupColors.has(key)) {
      groupColors.set(key, String(a.baseColor ?? a.color));
    }
    // Track which group the hovered/selected node belongs to.
    if (String(a.filePath) === hoveredFilePath) activeKey = key;
    if (String(a.filePath) === selectedFilePath) selectedKey = key;
    const gx = Number(a.x);
    const gy = Number(a.y);
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) return;
    const vp = sigma.graphToViewport({ x: gx, y: gy });
    let group = groups.get(key);
    if (group === undefined) {
      group = [];
      groups.set(key, group);
    }
    group.push({ x: vp.x, y: vp.y });
  });

  // Under file grouping the active keys are the file paths directly.
  if (!byCommunity) {
    activeKey = hoveredFilePath;
    selectedKey = selectedFilePath;
  }

  for (const [fp, points] of groups.entries()) {
    if (points.length < 3) continue;
    const hull = convexHull(points);
    if (hull.length < 3) continue;

    // Compute centroid
    let cx = 0;
    let cy = 0;
    for (const p of hull) {
      cx += p.x;
      cy += p.y;
    }
    cx /= hull.length;
    cy /= hull.length;

    // Expand hull outward by 14px from centroid
    const expanded = hull.map((p) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dist = Math.max(Math.hypot(dx, dy), 0.01);
      return { x: cx + (dx / dist) * (dist + 14), y: cy + (dy / dist) * (dist + 14) };
    });

    const isActive = fp === activeKey || fp === selectedKey;
    const isDimmed = (activeKey !== null || selectedKey !== null) && !isActive;
    const fillAlpha = isActive ? 0.14 : isDimmed ? 0.03 : 0.08;
    const strokeAlpha = isActive ? 0.5 : isDimmed ? 0.1 : 0.28;
    const baseColor = groupColors.get(fp) ?? "#808080";

    ctx.beginPath();
    ctx.moveTo(expanded[0]!.x, expanded[0]!.y);
    for (let i = 1; i < expanded.length; i++) {
      ctx.lineTo(expanded[i]!.x, expanded[i]!.y);
    }
    ctx.closePath();
    ctx.fillStyle = colorWithAlpha(baseColor, fillAlpha);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(expanded[0]!.x, expanded[0]!.y);
    for (let i = 1; i < expanded.length; i++) {
      ctx.lineTo(expanded[i]!.x, expanded[i]!.y);
    }
    ctx.closePath();
    ctx.strokeStyle = colorWithAlpha(baseColor, strokeAlpha);
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/**
 * Draw the minimap: every node as a small dot scaled to fit the canvas, plus a
 * crosshair at the current camera centre. No-op when fewer than two nodes have
 * finite coordinates (nothing meaningful to frame).
 */
export function drawMinimap(
  graph: MultiDirectedGraph,
  sigma: Sigma,
  canvas: HTMLCanvasElement,
  _container: HTMLDivElement,
): void {
  const ctx = canvas.getContext("2d");
  if (ctx === null) return;

  const W = canvas.width;
  const H = canvas.height;

  const nodePoints: Array<{ x: number; y: number; color: string; isFile: boolean }> = [];
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  graph.forEachNode((_nodeId, attrs) => {
    const a = attrs as GraphNodeAttributes;
    const x = Number(a.x);
    const y = Number(a.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    nodePoints.push({
      x,
      y,
      color: String(a.baseColor ?? a.color),
      isFile: a.nodeKind === "file",
    });
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });

  if (nodePoints.length <= 1 || minX >= maxX || minY >= maxY) return;

  const pad = 6;
  const scaleX = (W - 2 * pad) / (maxX - minX);
  const scaleY = (H - 2 * pad) / (maxY - minY);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.fill();

  for (const pt of nodePoints) {
    const pcx = pad + (pt.x - minX) * scaleX;
    const pcy = pad + (pt.y - minY) * scaleY;
    ctx.beginPath();
    ctx.arc(pcx, pcy, pt.isFile ? 2 : 1, 0, Math.PI * 2);
    ctx.fillStyle = pt.color;
    ctx.fill();
  }

  // Draw camera crosshair
  const sigmaPlus = sigma as SigmaWithCamera;
  const cameraState = sigmaPlus.getCamera?.()?.getState?.();
  if (cameraState !== undefined) {
    const camX = Number(cameraState.x);
    const camY = Number(cameraState.y);
    if (Number.isFinite(camX) && Number.isFinite(camY)) {
      const ccx = pad + (camX - minX) * scaleX;
      const ccy = pad + (camY - minY) * scaleY;
      ctx.beginPath();
      ctx.arc(ccx, ccy, 4, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}
