/**
 * Click-link shaping for Mermaid exports.
 *
 * Pure helper: no filesystem, network, DOM, or VS Code API work.
 */

export interface MermaidClickTarget {
  nodeId: string;
  filePath: string;
  line: number;
}

export interface MermaidClickLinkPolicy {
  includeLinks: boolean;
}

/**
 * Append Mermaid `click` directives to an existing Mermaid source when the
 * policy and format allow interactive links. Returns `source` unchanged when
 * links are disabled or the format cannot preserve them.
 */
export function appendMermaidClickLinks(
  source: string,
  targets: readonly MermaidClickTarget[],
  policy: MermaidClickLinkPolicy,
): string {
  if (!policy.includeLinks || targets.length === 0) {
    return source;
  }

  const lines = targets.map((t) => `    click ${t.nodeId} "vscode://file/${t.filePath}:${t.line}"`);

  return `${source}\n\n%% Click-through links\n${lines.join("\n")}`;
}
