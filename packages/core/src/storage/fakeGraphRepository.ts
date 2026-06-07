import type { EdgeRow } from "../extractors/types.js";
import type { NodeLocation, PreciseResolution, UnresolvedCallSite } from "../resolution/types.js";
import type {
  CoverageReport,
  ExtractedIndexData,
  NeighborhoodOptions,
  NeighborhoodResult,
  SessionSummary,
  StoredFile,
  StoredSymbol,
  SymbolClassificationRecord,
  WorkspaceCacheIdentity,
  WorkspaceCacheValidation,
  WorkspaceSubgraph,
} from "../types.js";
import type { ClearAllResult, ClearFileResult, ClearWorkspaceResult } from "./clear.js";
import type { GraphRepository } from "./graphRepository.js";
import type { MigrationResult } from "./migrations/runner.js";
import type { DetectedFrameworkRow } from "./repository.js";
import type { WriteWorkspaceCacheSnapshotInput } from "./workspaceCache.js";

/**
 * In-memory {@link GraphRepository} for contract tests that need the interface
 * without a DuckDB instance. It is a structural proof that the repository is
 * substitutable (RULE-ARCH-003): the type checker enforces that this satisfies
 * the whole interface, and it implements enough real behavior (per-file symbol
 * storage, clears) for round-trip tests. Analytics-heavy reads return valid
 * empty shapes — extend them in a test if a scenario needs richer behavior.
 */
/** In-memory CALLS edge for the precise-resolution round-trip (test modelling). */
interface FakeEdge {
  edgeId: string;
  source: NodeLocation;
  targetId: string | null;
  resolution: "heuristic" | "unresolved" | "precise";
}

export class FakeGraphRepository implements GraphRepository {
  /** relativePath → file */
  private readonly files = new Map<string, StoredFile>();
  /** relativePath → symbols */
  private readonly symbolsByFile = new Map<string, StoredSymbol[]>();
  private readonly cacheSnapshots = new Map<string, WriteWorkspaceCacheSnapshotInput>();
  /** CALLS edges, for the precise-resolution contract tests. */
  private readonly callEdges: FakeEdge[] = [];
  /** `${filePath}:${startLine}` → symbol id, for findSymbolIdAt. */
  private readonly symbolByLocation = new Map<string, string>();

  /** Test helper: seed a CALLS edge + the target symbol's location, for precise tests. */
  seedCallSite(edge: FakeEdge, target?: { filePath: string; line: number; id: string }): void {
    this.callEdges.push(edge);
    if (target !== undefined) {
      this.symbolByLocation.set(`${target.filePath}:${target.line}`, target.id);
    }
  }

  async initializeSchema(): Promise<void> {}

  async applyMigrations(): Promise<MigrationResult> {
    return { status: "ok", from: 0, to: 0, applied: [] };
  }

  async replaceFileGraph(
    input: ExtractedIndexData,
    _extraEdges?: readonly EdgeRow[],
    _classifications?: ReadonlyMap<string, SymbolClassificationRecord>,
    _annotations?: readonly unknown[],
  ): Promise<void> {
    const rel = input.file.relativePath;
    this.files.set(rel, {
      id: input.file.id,
      relativePath: rel,
      language: input.file.language,
      path: input.file.path,
      hash: input.file.hash,
    });
    this.symbolsByFile.set(rel, [...input.symbols]);
  }

  async setFileFramework(): Promise<void> {}

  async replaceWorkspaceFrameworks(_rows: readonly DetectedFrameworkRow[]): Promise<void> {}

  async resolveWorkspaceCrossFileEdges(): Promise<void> {}

  async stampResolutionTier(): Promise<void> {}

  async synthesizeFolderTree(): Promise<void> {}

  async getUnresolvedCallSites(_workspaceRoot: string): Promise<UnresolvedCallSite[]> {
    return this.callEdges
      .filter((e) => e.resolution !== "precise")
      .map((e) => ({ edgeId: e.edgeId, sourceLocation: e.source }));
  }

  async findSymbolIdAt(filePath: string, line: number): Promise<string | null> {
    return this.symbolByLocation.get(`${filePath}:${line}`) ?? null;
  }

  async persistPreciseEdges(resolutions: readonly PreciseResolution[]): Promise<number> {
    let upgraded = 0;
    for (const { edgeId, targetId } of resolutions) {
      const edge = this.callEdges.find((e) => e.edgeId === edgeId);
      if (edge === undefined) continue;
      edge.targetId = targetId;
      edge.resolution = "precise";
      upgraded += 1;
    }
    return upgraded;
  }

  async getWorkspaceSubgraph(): Promise<WorkspaceSubgraph> {
    return { nodes: [], edges: [], frameworks: [] };
  }

  async getSymbolsForFile(relativePath: string): Promise<StoredSymbol[]> {
    return [...(this.symbolsByFile.get(relativePath) ?? [])];
  }

  async getAllFiles(): Promise<StoredFile[]> {
    return [...this.files.values()];
  }

  async getPresentEdgeKinds(): Promise<readonly string[]> {
    return [];
  }

  async getCoverageReport(): Promise<CoverageReport> {
    return { rows: [], totalEdges: 0, resolvedEdges: 0, resolvedRatio: 0 };
  }

  async getSessionSummary(workspaceRoot: string): Promise<SessionSummary> {
    const fileCount = this.files.size;
    const symbolCount = [...this.symbolsByFile.values()].reduce((n, s) => n + s.length, 0);
    return {
      workspaceName: workspaceRoot.split("/").pop() ?? workspaceRoot,
      generatedAt: new Date(0),
      fileCount,
      symbolCount,
    } as SessionSummary;
  }

  async neighborhood(_nodeId: string, _options: NeighborhoodOptions): Promise<NeighborhoodResult> {
    return { nodes: [], edges: [], truncated: false };
  }

  async writeWorkspaceCacheSnapshot(input: WriteWorkspaceCacheSnapshotInput): Promise<void> {
    this.cacheSnapshots.set(input.identity.cacheKey, input);
  }

  async validateWorkspaceCache(
    identity: WorkspaceCacheIdentity,
  ): Promise<WorkspaceCacheValidation> {
    const has = this.cacheSnapshots.has(identity.cacheKey);
    return { status: has ? "ready" : "missing", identity, metadata: null };
  }

  async clearWorkspace(_workspaceRoot: string): Promise<ClearWorkspaceResult> {
    const deletedFiles = this.files.size;
    const deletedSymbols = [...this.symbolsByFile.values()].reduce((n, s) => n + s.length, 0);
    this.files.clear();
    this.symbolsByFile.clear();
    return { deletedFiles, deletedSymbols, deletedEdges: 0 };
  }

  async clearFile(filePath: string): Promise<ClearFileResult> {
    // Mirrors the real adapter: matches on the absolute stored path.
    const entry = [...this.files.values()].find((f) => f.path === filePath);
    if (entry === undefined) return { deletedFiles: 0, deletedSymbols: 0, deletedEdges: 0 };
    const deletedSymbols = this.symbolsByFile.get(entry.relativePath)?.length ?? 0;
    this.files.delete(entry.relativePath);
    this.symbolsByFile.delete(entry.relativePath);
    return { deletedFiles: 1, deletedSymbols, deletedEdges: 0 };
  }

  async clearAll(): Promise<ClearAllResult> {
    this.files.clear();
    this.symbolsByFile.clear();
    this.cacheSnapshots.clear();
    return { clearedTables: 0 };
  }

  dispose(): void {}
}
