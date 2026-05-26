import { describe, expect, it } from "vitest";
import {
  appendMermaidClickLinks,
  type MermaidClickLinkPolicy,
  type MermaidClickTarget,
} from "./clickLinks.js";

describe("appendMermaidClickLinks", () => {
  const source = "graph TB\n  a-->b";

  const targets: MermaidClickTarget[] = [
    { nodeId: "a", filePath: "/src/index.ts", line: 10 },
    { nodeId: "b", filePath: "/src/utils.ts", line: 42 },
  ];

  it("returns source unchanged when includeLinks is false", () => {
    const policy: MermaidClickLinkPolicy = { includeLinks: false };
    expect(appendMermaidClickLinks(source, targets, policy)).toBe(source);
  });

  it("returns source unchanged when targets array is empty", () => {
    const policy: MermaidClickLinkPolicy = { includeLinks: true };
    expect(appendMermaidClickLinks(source, [], policy)).toBe(source);
  });

  it("appends click directives when enabled with non-empty targets", () => {
    const policy: MermaidClickLinkPolicy = { includeLinks: true };
    const result = appendMermaidClickLinks(source, targets, policy);
    expect(result).toContain(source);
    expect(result).toContain('click a "vscode://file//src/index.ts:10"');
    expect(result).toContain('click b "vscode://file//src/utils.ts:42"');
  });

  it("appends click directives for a single target", () => {
    const policy: MermaidClickLinkPolicy = { includeLinks: true };
    const result = appendMermaidClickLinks(source, [targets[0]!], policy);
    expect(result).toContain(source);
    expect(result).not.toContain("/src/utils.ts");
  });
});
