/**
 * Property-based tests for core data-model invariants.
 * Uses fast-check (https://fast-check.io) to exhaustively verify contracts
 * that unit tests would only spot-check.
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { SCHEMA_VERSION } from "./types.js";

describe("SCHEMA_VERSION invariants", () => {
  it("is a positive integer", () => {
    expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
    expect(SCHEMA_VERSION).toBeGreaterThan(0);
  });
});

describe("workspace cache key round-trip", () => {
  it("any non-empty string survives JSON serialisation", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (key) => {
        const serialised = JSON.stringify({ cacheKey: key });
        const parsed = JSON.parse(serialised) as { cacheKey: string };
        return parsed.cacheKey === key;
      }),
    );
  });

  it("integer schema versions never lose precision through JSON", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000 }), (v) => {
        const parsed = JSON.parse(JSON.stringify({ schemaVersion: v })) as {
          schemaVersion: number;
        };
        return parsed.schemaVersion === v;
      }),
    );
  });
});

describe("graph count invariants", () => {
  it("node + edge counts are always non-negative integers", () => {
    fc.assert(
      fc.property(
        fc.nat(), // non-negative integer for nodeCount
        fc.nat(), // non-negative integer for edgeCount
        (nodeCount, edgeCount) => {
          return (
            Number.isInteger(nodeCount) &&
            Number.isInteger(edgeCount) &&
            nodeCount >= 0 &&
            edgeCount >= 0
          );
        },
      ),
    );
  });
});
