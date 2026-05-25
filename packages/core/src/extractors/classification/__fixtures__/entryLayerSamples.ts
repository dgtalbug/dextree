import type { ArchitecturalLayer, EntryKind } from "../../../types.js";
import type { ClassifySymbolInput } from "../classifySymbol.js";

/**
 * One curated classification case. Authors set `input` to a synthetic symbol
 * descriptor and pin the expected `entryKind` / `archLayer` outcome. The test
 * suite drives a single classifier call per sample and asserts both fields.
 */
export interface EntryLayerSample {
  readonly name: string;
  readonly input: ClassifySymbolInput;
  readonly expectedEntryKind: EntryKind;
  readonly expectedArchLayer: ArchitecturalLayer;
}

/**
 * Curated structural samples covering runtime / handler / test / public-api
 * entry kinds and presentation / application / domain / infrastructure / test
 * architectural layers. Populated incrementally as US1 and US2 land.
 */
export const entryLayerSamples: ReadonlyArray<EntryLayerSample> = [];
