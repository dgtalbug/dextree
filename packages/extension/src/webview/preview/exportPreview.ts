import type { MermaidPreviewOptions } from "@dextree/exporters";

/**
 * Webview-local helpers for slice 029 US3 export actions. Pure helpers stay
 * sync; side-effecting helpers (PNG rasterization + clipboard image writes)
 * accept an injection point so unit tests can substitute fakes without
 * polyfilling Canvas or `navigator.clipboard.write`.
 *
 * Production defaults live alongside each async helper and use the browser
 * APIs available inside the VS Code webview iframe.
 */

/**
 * Supported file formats for Mermaid preview export (slice 029 US3).
 */
export type MermaidPreviewFileFormat = "mmd" | "svg" | "png";

/**
 * Returns the `.mmd` file contents for the current preview source. Always
 * ends with a single trailing newline so editors and CLI tools that flag
 * missing terminators stay happy. Internal blank lines are preserved.
 */
export function buildMmdContent(source: string): string {
  return source.endsWith("\n") ? source : source + "\n";
}

/**
 * Returns the `.svg` file contents — identity pass-through that exists so
 * callers stay decoupled from the rendered-SVG shape and so the export bar
 * can treat every format symmetrically.
 */
export function buildSvgContent(svg: string): string {
  return svg;
}

/**
 * Wraps the current preview source in a fenced ` ```mermaid ` block suitable
 * for pasting into a Markdown document. Strips trailing whitespace from the
 * source so the closing fence sits flush against the last content line.
 */
export function buildMarkdownSnippet(source: string): string {
  const trimmed = source.replace(/\n+$/, "");
  return "```mermaid\n" + trimmed + "\n```\n";
}

/**
 * Stable export filename for the current preview options + format. Encodes
 * just the diagram kind and scope kind so the name stays portable across
 * checkouts; relative paths and symbol ids are intentionally omitted to
 * avoid leaking workspace-specific paths into shared exports.
 */
export function suggestedPreviewFilename(
  options: MermaidPreviewOptions,
  format: MermaidPreviewFileFormat,
): string {
  const diagram =
    options.diagram === "classDiagram"
      ? "class"
      : options.diagram === "sequenceDiagram"
        ? "sequence"
        : "flowchart";
  const scope =
    options.scope.kind === "workspace" ? "workspace" : scopeKindToken(options.scope.kind);
  return `dextree-${diagram}-${scope}.${format}`;
}

function scopeKindToken(kind: MermaidPreviewOptions["scope"]["kind"]): string {
  switch (kind) {
    case "workspace":
      return "workspace";
    case "file":
      return "file";
    case "symbol-callers":
      return "callers";
    case "symbol-callees":
      return "callees";
  }
}

/**
 * Rasterizes an SVG markup string to a `data:image/png;base64,...` URL. The
 * default implementation uses Canvas; tests pass a fake. Side-effecting:
 * may throw on a webview without Canvas support.
 */
export type SvgRasterizer = (svg: string) => Promise<string>;

/**
 * Writes the currently rendered preview to the system clipboard as an image.
 * The default implementation uses `navigator.clipboard.write` + `ClipboardItem`;
 * tests pass a fake. Side-effecting: may throw when the host browser/iframe
 * does not expose the clipboard image API.
 */
export type ClipboardImageWriter = (svg: string) => Promise<void>;

export async function buildPngDataUrl(
  svg: string,
  rasterize: SvgRasterizer = defaultSvgRasterizer,
): Promise<string> {
  return rasterize(svg);
}

export async function copyClipboardImage(
  svg: string,
  writeImage: ClipboardImageWriter = defaultClipboardImageWriter,
): Promise<void> {
  return writeImage(svg);
}

// ---------------------------------------------------------------------------
// Production defaults — only reachable from the live VS Code webview iframe.
// These are intentionally untyped against jsdom: tests inject fakes via the
// adapter parameters above so the suite stays portable.
// ---------------------------------------------------------------------------

const defaultSvgRasterizer: SvgRasterizer = async (svg) => {
  // The defensive `typeof` checks let this module load cleanly in the
  // tsc-via-vitest environment even though only the webview iframe ever
  // calls the default implementation.
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    throw new Error("PNG export requires the browser DOM (Canvas + Blob URLs).");
  }
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    // eslint-disable-next-line no-undef
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width || 800;
    canvas.height = img.naturalHeight || img.height || 600;
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("2D canvas context unavailable in this webview.");
    }
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
};

// eslint-disable-next-line no-undef
function loadImage(src: string): Promise<HTMLImageElement> {
  // eslint-disable-next-line no-undef
  return new Promise<HTMLImageElement>((resolve, reject) => {
    // eslint-disable-next-line no-undef
    const img = new Image();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => {
      reject(new Error("Failed to rasterize SVG to image."));
    };
    img.src = src;
  });
}

const defaultClipboardImageWriter: ClipboardImageWriter = async (svg) => {
  // ClipboardItem + navigator.clipboard.write are not part of the baseline
  // VS Code webview surface on every host; the explicit check produces a
  // clearer error than the runtime ReferenceError.
  if (
    typeof navigator === "undefined" ||
    typeof navigator.clipboard === "undefined" ||
    typeof navigator.clipboard.write !== "function" ||
    typeof ClipboardItem === "undefined"
  ) {
    throw new Error("Clipboard image copy is not supported in this webview.");
  }
  const blob = new Blob([svg], { type: "image/svg+xml" });
  // eslint-disable-next-line no-undef
  await navigator.clipboard.write([new ClipboardItem({ "image/svg+xml": blob })]);
};
