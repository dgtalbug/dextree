import { describe, expect, it } from "vitest";

import { classifySymbol } from "./classifySymbol.js";
import type { ClassifySymbolInput } from "./classifySymbol.js";
import { entryLayerSamples } from "./__fixtures__/entryLayerSamples.js";

function makeInput(overrides: Partial<ClassifySymbolInput> = {}): ClassifySymbolInput {
  return {
    relativePath: "src/example.ts",
    language: "typescript",
    symbolKind: "function",
    symbolName: "example",
    source: "export function example() {}",
    ...overrides,
  };
}

describe("classifySymbol", () => {
  describe("safe fallback", () => {
    it("returns unclassified / unknown when no heuristic matches", () => {
      const result = classifySymbol(makeInput());
      expect(result.entryKind).toBe("unclassified");
      expect(result.archLayer).toBe("unknown");
    });
  });

  describe("curated samples", () => {
    if (entryLayerSamples.length === 0) {
      it.skip("entryLayerSamples is empty — curated cases land with US1 / US2", () => {});
      return;
    }
    for (const sample of entryLayerSamples) {
      it(sample.name, () => {
        const result = classifySymbol(sample.input);
        expect(result.entryKind).toBe(sample.expectedEntryKind);
        expect(result.archLayer).toBe(sample.expectedArchLayer);
      });
    }
  });
});
