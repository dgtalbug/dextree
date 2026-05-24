export type MermaidTheme = "Light" | "Dark" | "Print";

export const MERMAID_INIT_DIRECTIVE: Record<MermaidTheme, string> = {
  Light: "%%{init: {'theme': 'default'}}%%",
  Dark: "%%{init: {'theme': 'dark'}}%%",
  Print: "%%{init: {'theme': 'neutral'}}%%",
};

export const DEFAULT_MERMAID_THEME: MermaidTheme = "Light";

export function isMermaidTheme(value: unknown): value is MermaidTheme {
  return value === "Light" || value === "Dark" || value === "Print";
}
