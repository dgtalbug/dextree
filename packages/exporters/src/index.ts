export {
  DEFAULT_MERMAID_THEME,
  isMermaidTheme,
  MERMAID_INIT_DIRECTIVE,
  type MermaidTheme,
} from "./mermaid/theme.js";
export { serializeToMermaid, type MermaidSerializeOptions } from "./mermaid/serializer.js";
export {
  applyMermaidGranularity,
  extractMermaidScope,
  inferMermaidDirection,
  MERMAID_GRANULARITY_CAPS,
  serializeToScopedMermaid,
  validateScopedMermaidExport,
  type MermaidDiagram,
  type MermaidDirection,
  type MermaidGranularity,
  type MermaidScope,
  type ScopeExtractionResult,
  type ScopedExportValidation,
  type ScopedMermaidOptions,
} from "./mermaid/scopedSerializer.js";
export {
  groupClassDiagramEntries,
  MERMAID_CLASS_DIAGRAM_CAPS,
  serializeToClassDiagram,
  validateClassDiagramExport,
  type ClassDiagramEntry,
  type ClassDiagramValidation,
} from "./mermaid/classDiagram.js";
