import type { GraphEdge, GraphNode } from "@dextree/core";
import type { MermaidPreviewOptions, MermaidPreviewResult } from "@dextree/exporters";
import { useEffect, useMemo, useReducer, useState } from "react";
import { EmptyState } from "./components/EmptyState.js";
import { GraphView } from "./components/GraphView.js";
import { LoadingState } from "./components/LoadingState.js";
import { MermaidPreviewPanel } from "./components/MermaidPreviewPanel.js";
import { resolveMermaidThemeFromBody } from "./preview/renderMermaid.js";
import { WorkspacesPage } from "./components/WorkspacesPage.js";
import type {
  CommandMessage,
  GraphCommandId,
  IndexedWorkspaceRecord,
  IndexingMessage,
  RequestMermaidPreviewMessage,
  RequestWorkspaceListMessage,
  SaveMermaidPreviewMessage,
  SwitchWorkspaceMessage,
} from "./protocol/messages.js";
import { isHostToWebviewMessage } from "./protocol/messages.js";
import type { MermaidPreviewFileFormat } from "./preview/exportPreview.js";

type AppScene = "graph" | "workspaces" | "mermaid-preview";

// ---------------------------------------------------------------------------
// State model — discriminated union (FR-002, FR-008)
// ---------------------------------------------------------------------------

interface AppState {
  hasReceivedGraph: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
  indexing: IndexingMessage | null;
  presentEdgeKinds: readonly string[];
  workspaceName: string | null;
  workspaceFrameworks: readonly string[];
}

type AppAction =
  | { type: "graph"; nodes: GraphNode[]; edges: GraphEdge[]; presentEdgeKinds: readonly string[] }
  | { type: "indexing"; message: IndexingMessage }
  | { type: "setWorkspaceContext"; name: string; frameworks: readonly string[] };

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "graph":
      return {
        ...state,
        hasReceivedGraph: true,
        nodes: action.nodes,
        edges: action.edges,
        presentEdgeKinds: action.presentEdgeKinds,
        indexing: state.indexing?.phase === "finished" ? null : state.indexing,
      };
    case "indexing":
      if (action.message.phase === "finished") {
        return {
          ...state,
          indexing: null,
        };
      }

      return {
        ...state,
        indexing: action.message,
      };
    case "setWorkspaceContext":
      return {
        ...state,
        workspaceName: action.name,
        workspaceFrameworks: action.frameworks,
      };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// App component
// ---------------------------------------------------------------------------

interface AppProps {
  vscodeApi: {
    postMessage: (message: unknown) => void;
  };
}

export function App({ vscodeApi }: AppProps) {
  const [state, dispatch] = useReducer(reducer, {
    hasReceivedGraph: false,
    nodes: [],
    edges: [],
    presentEdgeKinds: [],
    indexing: null,
    workspaceName: null,
    workspaceFrameworks: [],
  });

  const [indexedCount, setIndexedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [lastIndexedFiles, setLastIndexedFiles] = useState<string[]>([]);
  const [showSourceOnly, setShowSourceOnly] = useState(false);
  const [activeScene, setActiveScene] = useState<AppScene>("graph");
  const [workspaceList, setWorkspaceList] = useState<IndexedWorkspaceRecord[] | null>(null);
  const [mermaidPreview, setMermaidPreview] = useState<MermaidPreviewResult | null>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // Diagnostic: log every message received so the bridged log surfaces
      // in the Dextree output channel. Records the type + key shape info
      // (e.g. node count for graph messages, phase for indexing) without
      // dumping payloads.
      const rawMsg: unknown = event.data;
      const typeForLog =
        typeof rawMsg === "object" && rawMsg !== null && "type" in rawMsg
          ? String((rawMsg as { type: unknown }).type)
          : "<non-object>";
      const eventSourceLabel =
        event.source === null ? "null" : event.source === window.parent ? "window.parent" : "other";
      console.log(`[App] message in (source=${eventSourceLabel}, type=${typeForLog})`);

      // The previous guard `event.source !== null && event.source !== window.parent`
      // was overly strict — in newer VS Code builds the webview is wrapped in
      // additional service-worker/iframe layers, so legitimate host messages
      // arrive with `event.source` set to an inner frame that is neither
      // `null` nor literally `window.parent`. That rejected every host
      // message and left the React app permanently in its initial state.
      // The structural type check via `isHostToWebviewMessage` below remains
      // the practical security gate (validates the `type` discriminator),
      // so removing the source check does not weaken validation.
      const msg: unknown = rawMsg;
      if (!isHostToWebviewMessage(msg)) {
        console.log(`[App] dropped: !isHostToWebviewMessage (type=${typeForLog})`);
        return;
      }
      if (msg.type === "graph") {
        console.log(
          `[App] graph: ${msg.nodes.length} nodes, ${msg.edges.length} edges, workspaceName=${msg.workspaceName ?? "(none)"}`,
        );
        dispatch({
          type: "graph",
          nodes: msg.nodes,
          edges: msg.edges,
          presentEdgeKinds: msg.presentEdgeKinds ?? [],
        });
        if (msg.workspaceName !== undefined) {
          dispatch({
            type: "setWorkspaceContext",
            name: msg.workspaceName,
            frameworks: msg.workspaceFrameworks ?? [],
          });
        }
        setActiveScene("graph");
        return;
      }

      if (msg.type === "workspaceList") {
        console.log(`[App] workspaceList: ${msg.workspaces.length} workspaces`);
        setWorkspaceList(msg.workspaces);
        return;
      }

      if (msg.type === "mermaidPreview") {
        console.log(`[App] mermaidPreview: status=${msg.preview.status}`);
        setMermaidPreview(msg.preview);
        setActiveScene("mermaid-preview");
        return;
      }

      console.log(`[App] dispatching indexing: phase=${"phase" in msg ? String(msg.phase) : "?"}`);
      dispatch({ type: "indexing", message: msg });

      if (msg.type === "indexing") {
        if (msg.phase === "progress" && msg.fileName) {
          const name = msg.fileName;
          setLastIndexedFiles((prev) => [name, ...prev.filter((f) => f !== name)].slice(0, 8));
          setFailedCount(msg.failed);
        }
        if (msg.phase === "finished") {
          setIndexedCount(msg.current - msg.failed);
          setFailedCount(msg.failed);
        }
        if (msg.phase === "starting") {
          setLastIndexedFiles([]);
          setFailedCount(0);
          setIndexedCount(0);
        }
      }
    }

    window.addEventListener("message", handleMessage);
    vscodeApi.postMessage({ type: "ready" });
    return () => window.removeEventListener("message", handleMessage);
  }, [vscodeApi]);

  function handleNavigate(filePath: string, line: number) {
    vscodeApi.postMessage({ type: "navigate", filePath, line });
  }

  function handleCommand(command: GraphCommandId) {
    const msg: CommandMessage = { type: "command", command };
    vscodeApi.postMessage(msg);
  }

  function handleWorkspaceSwitcherClick() {
    setWorkspaceList(null);
    setActiveScene("workspaces");
    const request: RequestWorkspaceListMessage = { type: "requestWorkspaceList" };
    vscodeApi.postMessage(request);
  }

  function handleWorkspacesBack() {
    setActiveScene("graph");
  }

  function handlePreviewBack() {
    setActiveScene("graph");
  }

  function handleMermaidOptionsChange(options: MermaidPreviewOptions) {
    // Resolve the live VS Code theme at send-time so the host preview source
    // stays deterministic for the same (graph, options, theme) tuple even if
    // the editor theme has changed since the last preview.
    const resolvedTheme = resolveMermaidThemeFromBody(document.body);
    const message: RequestMermaidPreviewMessage = {
      type: "requestMermaidPreview",
      options: { ...options, theme: resolvedTheme },
    };
    vscodeApi.postMessage(message);
  }

  function handleMermaidSaveRequest(
    format: MermaidPreviewFileFormat,
    suggestedName: string,
    content: string,
  ): void {
    const message: SaveMermaidPreviewMessage = {
      type: "saveMermaidPreview",
      format,
      suggestedName,
      content,
    };
    vscodeApi.postMessage(message);
  }

  function handleSwitchWorkspace(workspaceRoot: string) {
    if (state.workspaceName !== null) {
      const activeRoot = workspaceList?.find((w) => w.isActive)?.workspaceRoot;
      if (workspaceRoot === activeRoot) {
        setActiveScene("graph");
        return;
      }
    }
    const msg: SwitchWorkspaceMessage = { type: "switchWorkspace", workspaceRoot };
    vscodeApi.postMessage(msg);
    setActiveScene("graph");
  }

  const hasGraph = state.nodes.length > 0;
  const isIndexingActive = state.indexing !== null && state.indexing.phase !== "finished";
  const showEmptyState = state.hasReceivedGraph && !hasGraph && state.indexing === null;
  const showLoadingOverlay =
    !showEmptyState && (state.indexing !== null || !state.hasReceivedGraph);
  const loadingLabel = state.indexing === null ? "Building graph…" : "Indexing workspace…";

  // Source-only filter: hide markdown and test/spec files from the graph.
  function isSourceFile(filePath: string): boolean {
    if (/\.md$/i.test(filePath)) return false;
    if (/\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(filePath)) return false;
    return true;
  }

  const displayNodes = useMemo(
    () => (showSourceOnly ? state.nodes.filter((n) => isSourceFile(n.filePath)) : state.nodes),
    [showSourceOnly, state.nodes],
  );

  const displayNodeIds = useMemo(() => new Set(displayNodes.map((n) => n.id)), [displayNodes]);

  const displayEdges = useMemo(
    () =>
      showSourceOnly
        ? state.edges.filter((e) => displayNodeIds.has(e.source) && displayNodeIds.has(e.target))
        : state.edges,
    [showSourceOnly, state.edges, displayNodeIds],
  );

  const nodeCount = displayNodes.length;
  const edgeCount = displayEdges.length;
  const fileCount = displayNodes.filter((n) => n.type === "file").length;
  const symbolCount = displayNodes.filter((n) => n.type === "symbol").length;
  // During active indexing, show live progress in Files; use "—" for counts not yet known.
  const displayFileCount = isIndexingActive && state.indexing ? state.indexing.current : fileCount;
  const displayNodeCount: number | "—" = isIndexingActive ? "—" : nodeCount;
  const displayEdgeCount: number | "—" = isIndexingActive ? "—" : edgeCount;
  const displaySymbolCount: number | "—" = isIndexingActive ? "—" : symbolCount;

  function formatFileLabel(name: string): string {
    const parts = name.split(/[/\\]/);
    return parts[parts.length - 1] ?? name;
  }

  if (activeScene === "workspaces") {
    return (
      <WorkspacesPage
        workspaces={workspaceList}
        onBack={handleWorkspacesBack}
        onSwitch={handleSwitchWorkspace}
      />
    );
  }

  if (activeScene === "mermaid-preview") {
    return (
      <div className="dxt-app-shell">
        <header className="dxt-preview-topbar">
          <button
            type="button"
            className="dxt-panel-button"
            onClick={handlePreviewBack}
            aria-label="Back to graph"
          >
            <span className="codicon codicon-arrow-left" aria-hidden="true" />
            Back to graph
          </button>
        </header>
        <MermaidPreviewPanel
          preview={mermaidPreview}
          onOptionsChange={handleMermaidOptionsChange}
          onSaveRequest={handleMermaidSaveRequest}
        />
      </div>
    );
  }

  if (showEmptyState) {
    return <EmptyState />;
  }

  return (
    <div className={`dxt-app-shell${showLoadingOverlay ? " dxt-app-shell-indexing" : ""}`}>
      <div className="dxt-graph-layer">
        {hasGraph ? (
          <GraphView
            nodes={displayNodes}
            edges={displayEdges}
            onNavigate={handleNavigate}
            onExportMermaid={() => {
              handleCommand("export-mermaid");
            }}
            onExportCurrentView={() => {
              vscodeApi.postMessage({ type: "exportCurrentView", viewId: "graph-view" });
            }}
            {...(state.workspaceName !== null && { workspaceName: state.workspaceName })}
            workspaceFrameworks={state.workspaceFrameworks}
            onWorkspaceSwitcherClick={handleWorkspaceSwitcherClick}
          />
        ) : (
          <div
            className="dxt-graph-scaffold dxt-graph-stage"
            data-testid="graph-scaffold"
            aria-hidden="true"
          />
        )}
      </div>

      {showLoadingOverlay ? (
        state.indexing !== null ? (
          <LoadingState indexing={state.indexing} label={loadingLabel} />
        ) : (
          <LoadingState label={loadingLabel} />
        )
      ) : null}

      <aside className="dxt-graph-panel" aria-label="Graph info">
        <section className="dxt-graph-stats" aria-label="Graph statistics">
          <div className="dxt-stats-grid">
            <div className="dxt-stat-cell">
              <span className="dxt-stat-value">{displayNodeCount}</span>
              <span className="dxt-stat-label">Nodes</span>
            </div>
            <div className="dxt-stat-cell">
              <span className="dxt-stat-value">{displayEdgeCount}</span>
              <span className="dxt-stat-label">Edges</span>
            </div>
            <div className="dxt-stat-cell">
              <span className="dxt-stat-value">{displayFileCount}</span>
              <span className="dxt-stat-label">Files</span>
            </div>
            <div className="dxt-stat-cell">
              <span className="dxt-stat-value">{displaySymbolCount}</span>
              <span className="dxt-stat-label">Symbols</span>
            </div>
            {indexedCount > 0 || failedCount > 0 ? (
              <>
                <div className="dxt-stat-cell">
                  <span className="dxt-stat-value">{indexedCount}</span>
                  <span className="dxt-stat-label">Indexed</span>
                </div>
                {failedCount > 0 ? (
                  <div className="dxt-stat-cell dxt-stat-cell-warn">
                    <span className="dxt-stat-value">{failedCount}</span>
                    <span className="dxt-stat-label">Failed</span>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </section>

        <section className="dxt-graph-legend" aria-label="Edge legend">
          <div className="dxt-legend-title">Relations</div>
          {(state.presentEdgeKinds.length > 0
            ? state.presentEdgeKinds
            : ["DEFINES", "IMPORTS"]
          ).map((kind) => (
            <div className="dxt-legend-row" key={kind}>
              <span
                className={`dxt-legend-pill dxt-legend-pill-${kind.startsWith("CUSTOM_") ? "custom" : kind.toLowerCase()}`}
              />
              <span className="dxt-legend-label">{kind}</span>
            </div>
          ))}
        </section>

        {lastIndexedFiles.length > 0 ? (
          <section className="dxt-graph-file-list" aria-label="Recently indexed files">
            <div className="dxt-legend-title">Recent files</div>
            <ul className="dxt-file-list">
              {lastIndexedFiles.map((f) => (
                <li key={f} className="dxt-file-list-item" title={f}>
                  <span className="codicon codicon-file" aria-hidden="true" />
                  {formatFileLabel(f)}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="dxt-graph-actions">
          <button
            type="button"
            className="dxt-panel-button dxt-panel-button-primary"
            onClick={() => {
              handleCommand("index-workspace");
            }}
            disabled={isIndexingActive}
          >
            <span className="codicon codicon-sync" aria-hidden="true" />
            {isIndexingActive ? "Indexing…" : "Re-index"}
          </button>
          {isIndexingActive ? (
            <button
              type="button"
              className="dxt-panel-button dxt-panel-button-danger"
              onClick={() => {
                handleCommand("cancel-indexing");
              }}
            >
              <span className="codicon codicon-stop-circle" aria-hidden="true" />
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            className={`dxt-panel-button${showSourceOnly ? " dxt-panel-button-active" : ""}`}
            onClick={() => {
              setShowSourceOnly((prev) => !prev);
            }}
            title="Toggle source-only view (hides markdown and test files)"
          >
            <span className="codicon codicon-filter" aria-hidden="true" />
            {showSourceOnly ? "All Files" : "Source Only"}
          </button>
          <button
            type="button"
            className="dxt-panel-button"
            onClick={() => {
              handleCommand("clear-workspace");
            }}
            disabled={isIndexingActive}
            title="Clear the current workspace index"
          >
            <span className="codicon codicon-trash" aria-hidden="true" />
            Clear Workspace
          </button>
          <button
            type="button"
            className="dxt-panel-button"
            onClick={() => {
              handleCommand("clear-all");
            }}
            disabled={isIndexingActive}
            title="Clear all indexed workspaces"
          >
            <span className="codicon codicon-clear-all" aria-hidden="true" />
            Clear All
          </button>
        </section>
      </aside>
    </div>
  );
}
