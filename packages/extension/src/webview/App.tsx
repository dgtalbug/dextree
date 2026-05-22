import type { GraphEdge, GraphNode } from "@dextree/core";
import { useEffect, useReducer } from "react";
import { EmptyState } from "./components/EmptyState.js";
import { GraphView } from "./components/GraphView.js";
import { LoadingState } from "./components/LoadingState.js";
import type { IndexingMessage } from "./protocol/messages.js";
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

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg: unknown = event.data;
      if (!isHostToWebviewMessage(msg)) return;
      if (msg.type === "graph") {
        dispatch({ type: "graph", nodes: msg.nodes, edges: msg.edges });
        return;
      }

      dispatch({ type: "indexing", message: msg });
    }

    window.addEventListener("message", handleMessage);
    // Signal the extension host that the listener is registered.
    // The host will re-push any cached symbols to handle the startup race condition.
    vscodeApi.postMessage({ type: "ready" });
    return () => window.removeEventListener("message", handleMessage);
  }, [vscodeApi]);

  function handleNavigate(filePath: string, line: number) {
    vscodeApi.postMessage({ type: "navigate", filePath, line });
  }

  const hasGraph = state.nodes.length > 0;
  const showEmptyState = state.hasReceivedGraph && !hasGraph && state.indexing === null;
  const showLoadingOverlay = !showEmptyState && (state.indexing !== null || !state.hasReceivedGraph);
  const loadingLabel = state.indexing === null ? "Building graph…" : "Indexing workspace…";

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
    </div>
  );
}
