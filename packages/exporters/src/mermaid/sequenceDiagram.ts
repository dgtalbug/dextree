import type { GraphNode, WorkspaceSubgraph } from "@dextree/core";

import type { ScopedMermaidOptions } from "./scopedSerializer.js";
import { MERMAID_INIT_DIRECTIVE } from "./theme.js";

/**
 * Snapshot of an active trace route the webview sends to the host for export.
 * Only valid when the graph trace state is actively resolved.
 */
export interface TraceSequenceSnapshot {
  phase: "path-active";
  startNodeId: string;
  endNodeId: string;
  nodeIds: readonly string[];
  edgeIds: readonly string[];
}

/**
 * One Mermaid sequence participant derived from a traced route. Methods group
 * under their enclosing class when available; top-level functions fall back to
 * symbol or file identity.
 */
export interface SequenceDiagramParticipant {
  id: string;
  label: string;
  sourceNodeIds: readonly string[];
  kind: "class" | "symbol" | "file";
}

/**
 * One ordered interaction line in the exported Mermaid sequence.
 */
export interface SequenceDiagramStep {
  edgeId: string;
  fromParticipantId: string;
  toParticipantId: string;
  label: string;
  hopIndex: number;
}

/**
 * Validation result for sequence-diagram export before serialization. Only `ok`
 * results may proceed to export.
 */
export type SequenceDiagramValidation =
  | { status: "ok"; participantCount: number; stepCount: number }
  | { status: "empty"; reason: string }
  | { status: "unsupported"; reason: string }
  | {
      status: "oversized";
      participantCount: number;
      stepCount: number;
      cap: { participants: number; steps: number };
      reason: string;
    };

const SEQUENCE_DIAGRAM_CAPS = { participants: 40, steps: 100 } as const;

function lookupNode(subgraph: WorkspaceSubgraph, id: string): GraphNode | undefined {
  return subgraph.nodes.find((n) => n.id === id);
}

function lookupEdge(subgraph: WorkspaceSubgraph, id: string) {
  return subgraph.edges.find((e) => e.id === id);
}

function classParticipantLabel(node: GraphNode): string {
  return node.label.replace(/^class\s+/, "");
}

/**
 * Escape a label for safe interpolation into Mermaid sequenceDiagram text.
 * Order matters: backslash MUST be replaced before quote, otherwise the
 * quote-escape pass produces `\\"` and the subsequent backslash pass
 * double-escapes the backslash we just wrote, breaking round-trip parsing.
 * Also strips newlines and carriage returns since Mermaid line-terminates
 * on them. Flagged by CodeQL "Incomplete string escaping" on the prior
 * single-replace pattern.
 */
function escapeMermaidLabel(label: string): string {
  return label
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, " ");
}

/**
 * Build participants from trace node IDs by grouping methods under enclosing
 * classes. Falls back to symbol or file identity when no class grouping exists.
 */
function buildParticipants(
  subgraph: WorkspaceSubgraph,
  trace: TraceSequenceSnapshot,
): SequenceDiagramParticipant[] {
  const classMap = new Map<string, { label: string; sourceNodeIds: string[] }>();
  const participants: SequenceDiagramParticipant[] = [];

  for (const nodeId of trace.nodeIds) {
    const node = lookupNode(subgraph, nodeId);
    if (!node) continue;

    if (node.symbolKind === "method" && node.enclosingSymbolId) {
      const enclosureId = node.enclosingSymbolId;
      if (!classMap.has(enclosureId)) {
        const enc = lookupNode(subgraph, enclosureId);
        classMap.set(enclosureId, {
          label: enc ? classParticipantLabel(enc) : enclosureId,
          sourceNodeIds: [],
        });
      }
      classMap.get(enclosureId)!.sourceNodeIds.push(nodeId);
      continue;
    }

    if (node.symbolKind === "class" || node.symbolKind === "interface") {
      if (!classMap.has(nodeId)) {
        classMap.set(nodeId, {
          label: classParticipantLabel(node),
          sourceNodeIds: [nodeId],
        });
      }
      continue;
    }

    participants.push({
      id: nodeId,
      label: node.label,
      sourceNodeIds: [nodeId],
      kind: node.type === "file" ? "file" : "symbol",
    });
  }

  for (const [id, info] of classMap) {
    participants.unshift({
      id,
      label: info.label,
      sourceNodeIds: info.sourceNodeIds,
      kind: "class",
    });
  }

  return participants;
}

function resolveParticipantId(
  nodeId: string,
  participants: SequenceDiagramParticipant[],
): string | null {
  for (const p of participants) {
    if (p.sourceNodeIds.includes(nodeId)) return p.id;
  }
  return null;
}

/**
 * Build ordered interaction steps from the trace edge IDs.
 */
function buildSteps(
  subgraph: WorkspaceSubgraph,
  trace: TraceSequenceSnapshot,
  participants: SequenceDiagramParticipant[],
): SequenceDiagramStep[] {
  const steps: SequenceDiagramStep[] = [];
  let hopIndex = 0;
  for (const edgeId of trace.edgeIds) {
    const edge = lookupEdge(subgraph, edgeId);
    hopIndex += 1;
    if (!edge) continue;
    const from = resolveParticipantId(edge.source, participants);
    const to = resolveParticipantId(edge.target, participants);
    if (!from || !to) continue;
    const sourceNode = lookupNode(subgraph, edge.source);
    const label = sourceNode?.label ?? edge.kind;
    steps.push({
      edgeId: edge.id,
      fromParticipantId: from,
      toParticipantId: to,
      label,
      hopIndex: hopIndex - 1,
    });
  }
  return steps;
}

export function validateSequenceDiagramExport(
  subgraph: WorkspaceSubgraph,
  trace: TraceSequenceSnapshot,
): SequenceDiagramValidation {
  if (trace.phase !== "path-active") {
    return { status: "unsupported", reason: "No active trace route is available for export." };
  }
  if (trace.nodeIds.length === 0) {
    return { status: "empty", reason: "The active trace route contains no nodes to export." };
  }

  // Count emitted participants, not raw trace nodes — buildParticipants groups
  // all method nodes that share an enclosing class under one participant, so a
  // route through 10 methods on the same class is 1 participant, not 10.
  // Counting raw nodeIds would falsely reject these as oversized.
  const cap = SEQUENCE_DIAGRAM_CAPS;
  const participantCount = buildParticipants(subgraph, trace).length;
  const stepCount = trace.edgeIds.length;
  if (participantCount > cap.participants || stepCount > cap.steps) {
    return {
      status: "oversized",
      participantCount,
      stepCount,
      cap,
      reason: `Trace route exceeds sequence export limits (${cap.participants} participants, ${cap.steps} steps).`,
    };
  }

  return { status: "ok", participantCount, stepCount };
}

export function serializeToSequenceDiagram(
  subgraph: WorkspaceSubgraph,
  trace: TraceSequenceSnapshot,
  options: ScopedMermaidOptions,
): string {
  const participants = buildParticipants(subgraph, trace);
  const steps = buildSteps(subgraph, trace, participants);

  const lines: string[] = [MERMAID_INIT_DIRECTIVE[options.theme], "sequenceDiagram"];

  for (const p of participants) {
    const safeId = p.id.replace(/-/g, "_");
    lines.push(`    participant ${safeId} as ${escapeMermaidLabel(p.label)}`);
  }
  lines.push("");

  for (const step of steps) {
    const fromId = step.fromParticipantId.replace(/-/g, "_");
    const toId = step.toParticipantId.replace(/-/g, "_");
    lines.push(`    ${fromId}->>+${toId}: ${escapeMermaidLabel(step.label)}`);
  }

  return lines.join("\n");
}
