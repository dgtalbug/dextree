import type { GraphEdge, GraphNode } from "@dextree/core";
import { useEffect, useReducer, useState } from "react";
import { EmptyState } from "./components/EmptyState.js";
import { GraphView } from "./components/GraphView.js";
import { LoadingState } from "./components/LoadingState.js";
import type { CommandMessage, GraphCommandId, IndexingMessage } from "./protocol/messages.js";
import { isHostToWebviewMessage } from "./protocol/messages.js";

// ---------------------------------------------------------------------------
// State model — discriminated union (FR-002, FR-008)
// ---------------------------------------------------------------------------

interface AppState {
  hasReceivedGraph: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
  indexing: IndexingMessage | null;
}

type AppAction =
  | { type: "graph"; nodes: GraphNode[]; edges: GraphEdge[] }
  | { type: "indexing"; message: IndexingMessage };

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "graph":
      return {
        hasReceivedGraph: true,
        nodes: action.nodes,
        edges: action.edges,
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
    indexing: null,
  });

  const [indexedCount, setIndexedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [lastIndexedFiles, setLastIndexedFiles] = useState<string[]>([]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg: unknown = event.data;
      if (!isHostToWebviewMessage(msg)) return;
      if (msg.type === "graph") {
        dispatch({ type: "graph", nodes: msg.nodes, edges: msg.edges });
        return;
      }

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

  const hasGraph = state.nodes.length > 0;
  const isIndexingActive = state.indexing !== null && state.indexing.phase !== "finished";
  const showEmptyState = state.hasReceivedGraph && !hasGraph && state.indexing === null;
  const showLoadingOverlay =
    !showEmptyState && (state.indexing !== null || !state.hasReceivedGraph);
  const loadingLabel = state.indexing === null ? "Building graph…" : "Indexing workspace…";

  const nodeCount = state.nodes.length;
  const edgeCount = state.edges.length;
  const fileCount = state.nodes.filter((n) => n.type === "file").length;
  const symbolCount = state.nodes.filter((n) => n.type === "symbol").length;

  function formatFileLabel(name: string): string {
    const parts = name.split(/[/\\]/);
    return parts[parts.length - 1] ?? name;
  }

  if (showEmptyState) {
    return <EmptyState />;
  }

  return (
    <div className={`dxt-app-shell${showLoadingOverlay ? " dxt-app-shell-indexing" : ""}`}>
      <div className="dxt-graph-layer">
        {hasGraph ? (
          <GraphView nodes={state.nodes} edges={state.edges} onNavigate={handleNavigate} />
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
              <span className="dxt-stat-value">{nodeCount}</span>
              <span className="dxt-stat-label">Nodes</span>
            </div>
            <div className="dxt-stat-cell">
              <span className="dxt-stat-value">{edgeCount}</span>
              <span className="dxt-stat-label">Edges</span>
            </div>
            <div className="dxt-stat-cell">
              <span className="dxt-stat-value">{fileCount}</span>
              <span className="dxt-stat-label">Files</span>
            </div>
            <div className="dxt-stat-cell">
              <span className="dxt-stat-value">{symbolCount}</span>
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
          <div className="dxt-legend-row">
            <span className="dxt-legend-pill dxt-legend-pill-defines" />
            <span className="dxt-legend-label">DEFINES</span>
          </div>
          <div className="dxt-legend-row">
            <span className="dxt-legend-pill dxt-legend-pill-imports" />
            <span className="dxt-legend-label">IMPORTS</span>
          </div>
          <div className="dxt-legend-row">
            <span className="dxt-legend-pill dxt-legend-pill-calls" />
            <span className="dxt-legend-label">CALLS</span>
          </div>
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
