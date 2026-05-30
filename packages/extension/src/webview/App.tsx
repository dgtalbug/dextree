import type { GraphEdge, GraphNode } from "@dextree/core";
import type { MermaidPreviewOptions, MermaidPreviewResult } from "@dextree/exporters";
import { useEffect, useMemo, useReducer, useState } from "react";
import appStyles from "./App.module.css";
import { EmptyState } from "./components/EmptyState.js";
import { GraphView } from "./components/GraphView.js";
import { LoadingState } from "./components/LoadingState.js";
import { MermaidPreviewPanel } from "./components/MermaidPreviewPanel.js";
import { resolveMermaidThemeFromBody } from "./preview/renderMermaid.js";
import { WorkspacesPage } from "./components/WorkspacesPage.js";
import type {
  CommandMessage,
  ExportTraceSequenceMessage,
  GraphCommandId,
  IndexedWorkspaceRecord,
  IndexingMessage,
  RequestMermaidPreviewMessage,
  RequestWorkspaceListMessage,
  SaveMermaidPreviewMessage,
  SwitchWorkspaceMessage,
} from "./protocol/messages.js";
import type { TraceSequenceSnapshot } from "@dextree/exporters";
import { isHostToWebviewMessage } from "./protocol/messages.js";
import type { MermaidPreviewFileFormat } from "./preview/exportPreview.js";

type AppScene = "graph" | "workspaces" | "mermaid-preview";

/**
 * Tab identity for the editor-style strip (slice 033 US1). Distinct from
 * {@link AppScene}: "trace" is a *variant* of the graph scene (driven by
 * GraphView's internal trace state), not a separate scene — so it maps back to
 * the "graph" scene when activated.
 */
type TabKey = "graph" | "mermaid" | "trace" | "workspaces";

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
// Tab strip (slice 033 US1)
// ---------------------------------------------------------------------------

interface TabDescriptor {
  key: TabKey;
  label: string;
  codicon: string;
  /** Disabled tabs render muted and are not clickable. */
  disabled?: boolean;
  /** Shows the green workspace-loaded dot before the icon. */
  showDot?: boolean;
  onSelect: () => void;
}

function TabStrip({ tabs, activeKey }: { tabs: TabDescriptor[]; activeKey: TabKey }) {
  return (
    <div className={appStyles.tabs} role="tablist" aria-label="Dextree scenes">
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={tab.disabled ? true : undefined}
            disabled={tab.disabled ?? false}
            className={`${appStyles.tab}${isActive ? ` ${appStyles.tabActive}` : ""}`}
            data-testid={`tab-${tab.key}`}
            onClick={tab.disabled ? undefined : tab.onSelect}
          >
            {tab.showDot ? <span className={appStyles.tabDot} aria-hidden="true" /> : null}
            <span className={`codicon codicon-${tab.codicon}`} aria-hidden="true" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
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

  // ---- Tab strip model (slice 033 US1) --------------------------------------
  // The active tab derives from activeScene. "trace" is a graph-scene variant
  // owned by GraphView; at the App level it stays disabled until trace wiring
  // lands (phase 5 / T032), so it never shows as the active tab here.
  const activeTabKey: TabKey =
    activeScene === "workspaces"
      ? "workspaces"
      : activeScene === "mermaid-preview"
        ? "mermaid"
        : "graph";

  const graphTabLabel =
    state.workspaceName !== null ? `GraphView · ${state.workspaceName}` : "GraphView";

  const tabs: TabDescriptor[] = [
    {
      key: "graph",
      label: graphTabLabel,
      codicon: "graph",
      showDot: hasGraph,
      onSelect: () => setActiveScene("graph"),
    },
    {
      key: "mermaid",
      label: "Mermaid Preview",
      codicon: "export",
      onSelect: () => setActiveScene("mermaid-preview"),
    },
    {
      key: "trace",
      label: "GraphView (Trace mode)",
      codicon: "rocket",
      // Trace is entered from within GraphView; the tab is a status indicator
      // until the trace-active bridge lands in phase 5.
      disabled: true,
      onSelect: () => setActiveScene("graph"),
    },
    {
      key: "workspaces",
      label: "Workspaces",
      codicon: "database",
      onSelect: handleWorkspaceSwitcherClick,
    },
  ];

  const tabStrip = <TabStrip tabs={tabs} activeKey={activeTabKey} />;

  function renderScene() {
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

    return renderGraphScene();
  }

  // GraphView owns the full 3-column shell (toolbar / rails / status) as of
  // slice 033 Phase 3. App no longer renders a competing grid or right-rail
  // "Graph info" panel — the workspace actions (Re-index / Clear / Source-only)
  // are threaded into the toolbar, counts live in GraphView's status bar, and
  // Empty/Loading render as overlays on top of the shell (T020).
  function renderGraphScene() {
    return (
      <div
        className={`dxt-app-shell${showLoadingOverlay ? " dxt-app-shell-indexing" : ""} ${appStyles.graphScene}`}
        data-testid="graph-shell"
      >
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
            onExportTraceSequence={(trace: TraceSequenceSnapshot) => {
              const message: ExportTraceSequenceMessage = { type: "exportTraceSequence", trace };
              vscodeApi.postMessage(message);
            }}
            {...(state.workspaceName !== null && { workspaceName: state.workspaceName })}
            workspaceFrameworks={state.workspaceFrameworks}
            onWorkspaceSwitcherClick={handleWorkspaceSwitcherClick}
            onReindex={() => {
              handleCommand("index-workspace");
            }}
            onClearWorkspace={() => {
              handleCommand("clear-workspace");
            }}
            onClearAll={() => {
              handleCommand("clear-all");
            }}
            onToggleSourceOnly={() => {
              setShowSourceOnly((prev) => !prev);
            }}
            sourceOnly={showSourceOnly}
            isIndexing={isIndexingActive}
          />
        ) : (
          <div
            className="dxt-graph-scaffold dxt-graph-stage"
            data-testid="graph-scaffold"
            aria-hidden="true"
          />
        )}

        {showEmptyState ? (
          <div className="dxt-graph-overlay" data-testid="graph-empty-overlay">
            <EmptyState />
          </div>
        ) : null}

        {showLoadingOverlay ? (
          <div className="dxt-graph-overlay">
            {state.indexing !== null ? (
              <LoadingState indexing={state.indexing} label={loadingLabel} />
            ) : (
              <LoadingState label={loadingLabel} />
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={appStyles.window}>
      {tabStrip}
      <div className={appStyles.scene}>{renderScene()}</div>
    </div>
  );
}
