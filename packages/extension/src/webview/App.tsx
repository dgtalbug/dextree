import type { GraphEdge, GraphNode } from "@dextree/core";
import { useEffect, useReducer } from "react";
import { EmptyState } from "./components/EmptyState.js";
import { GraphView } from "./components/GraphView.js";
import { LoadingState } from "./components/LoadingState.js";
import { isHostToWebviewMessage } from "./protocol/messages.js";

// ---------------------------------------------------------------------------
// State model — discriminated union (FR-002, FR-008)
// ---------------------------------------------------------------------------

type AppState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "loaded"; nodes: GraphNode[]; edges: GraphEdge[] };

type AppAction = { type: "graph"; nodes: GraphNode[]; edges: GraphEdge[] };

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "graph":
      // Never return to 'loading' once we've received a message
      return action.nodes.length === 0
        ? { status: "empty" }
        : { status: "loaded", nodes: action.nodes, edges: action.edges };
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
  const [state, dispatch] = useReducer(reducer, { status: "loading" });

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg: unknown = event.data;
      if (!isHostToWebviewMessage(msg)) return;
      dispatch({ type: "graph", nodes: msg.nodes, edges: msg.edges });
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

  switch (state.status) {
    case "loading":
      return <LoadingState label="Building graph…" />;
    case "empty":
      return <EmptyState />;
    case "loaded":
      return <GraphView nodes={state.nodes} edges={state.edges} onNavigate={handleNavigate} />;
  }
}
