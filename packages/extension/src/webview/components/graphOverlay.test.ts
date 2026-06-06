import { describe, expect, it } from "vitest";

import { colorWithAlpha, convexHull } from "./graphOverlay.js";

describe("convexHull", () => {
  it("returns the points unchanged when there are fewer than 3", () => {
    expect(convexHull([])).toEqual([]);
    expect(convexHull([{ x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }]);
    expect(
      convexHull([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
  });

  it("returns the enclosing corners of a square, dropping an interior point", () => {
    const corners = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const interior = { x: 5, y: 5 };

    const hull = convexHull([...corners, interior]);

    // The interior point must not be on the hull.
    expect(hull).not.toContainEqual(interior);
    // Every corner must be on the hull.
    for (const corner of corners) {
      expect(hull).toContainEqual(corner);
    }
    expect(hull.length).toBe(4);
  });

  it("keeps all points when they are already a convex triangle", () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 2, y: 3 },
    ];

    const hull = convexHull(triangle);

    expect(hull.length).toBe(3);
    for (const p of triangle) {
      expect(hull).toContainEqual(p);
    }
  });
});

describe("colorWithAlpha", () => {
  it("converts a #rrggbb hex to an rgba string at the given alpha", () => {
    expect(colorWithAlpha("#ff8040", 0.5)).toBe("rgba(255,128,64,0.5)");
  });

  it("is case-insensitive on the hex digits", () => {
    expect(colorWithAlpha("#FF8040", 0.25)).toBe("rgba(255,128,64,0.25)");
  });

  it("falls back to grey for a non-hex input", () => {
    expect(colorWithAlpha("rebeccapurple", 0.3)).toBe("rgba(128,128,128,0.3)");
    expect(colorWithAlpha("#abc", 0.3)).toBe("rgba(128,128,128,0.3)");
  });
});
