import { useEffect, useReducer } from "react";
import { isHostToWebviewMessage, type FileWithSymbols } from "./protocol/messages.js";
import { LoadingState } from "./components/LoadingState.js";
import { EmptyState } from "./components/EmptyState.js";
import { SymbolList } from "./components/SymbolList.js";

// ---------------------------------------------------------------------------
// State model — discriminated union (FR-002, FR-008)
// ---------------------------------------------------------------------------

type AppState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "loaded"; files: FileWithSymbols[] };

type AppAction = { type: "symbols"; files: FileWithSymbols[] };

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "symbols":
      // Never return to 'loading' once we've received a message
      return action.files.length === 0
        ? { status: "empty" }
        : { status: "loaded", files: action.files };
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
      dispatch({ type: "symbols", files: msg.files });
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  function handleNavigate(filePath: string, line: number) {
    vscodeApi.postMessage({ type: "navigate", filePath, line });
  }

  switch (state.status) {
    case "loading":
      return <LoadingState />;
    case "empty":
      return <EmptyState />;
    case "loaded":
      return <SymbolList files={state.files} onNavigate={handleNavigate} />;
  }
}
