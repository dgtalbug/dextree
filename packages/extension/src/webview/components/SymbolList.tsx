import { useState } from "react";
import type { FileWithSymbols, SymbolEntry } from "../protocol/messages.js";

// ---------------------------------------------------------------------------
// Tree data model
// ---------------------------------------------------------------------------

interface FileNode {
  kind: "file";
  name: string;
  file: FileWithSymbols;
}

interface DirNode {
  kind: "dir";
  name: string;
  children: TreeNode[];
}

type TreeNode = FileNode | DirNode;

function buildTree(files: FileWithSymbols[]): TreeNode[] {
  const root: DirNode = { kind: "dir", name: "", children: [] };

  for (const file of files) {
    const parts = file.relativePath.split("/");
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const segment = parts[i];
      let dir = current.children.find((n): n is DirNode => n.kind === "dir" && n.name === segment);
      if (dir === undefined) {
        dir = { kind: "dir", name: segment, children: [] };
        current.children.push(dir);
      }
      current = dir;
    }

    current.children.push({ kind: "file", name: parts[parts.length - 1], file });
  }

  return root.children;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SymbolRowProps {
  symbol: SymbolEntry;
  filePath: string;
  onNavigate: (filePath: string, line: number) => void;
}

function SymbolRow({ symbol, filePath, onNavigate }: SymbolRowProps) {
  return (
    <li>
      <button
        type="button"
        className="dxt-symbol-btn"
        data-symbol="true"
        onClick={() => onNavigate(filePath, symbol.startLine)}
      >
        <span className="codicon codicon-symbol-class" aria-hidden="true" />
        <span className="dxt-symbol-name">{symbol.name}</span>
        <span className="dxt-symbol-kind">{symbol.kind}</span>
      </button>
    </li>
  );
}

interface FileRowProps {
  node: FileNode;
  onNavigate: (filePath: string, line: number) => void;
}

function FileRow({ node, onNavigate }: FileRowProps) {
  const [open, setOpen] = useState(true);
  return (
    <li className="dxt-tree-file">
      <button
        type="button"
        className="dxt-dir-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span
          className={`codicon ${open ? "codicon-chevron-down" : "codicon-chevron-right"}`}
          aria-hidden="true"
        />
        <span className="codicon codicon-file" aria-hidden="true" />
        <span className="dxt-dir-name">{node.name}</span>
      </button>
      {open && (
        <ul className="dxt-tree-children">
          {node.file.symbols.map((sym, idx) => (
            <SymbolRow
              key={`${node.file.path}:${sym.startLine}:${idx}`}
              symbol={sym}
              filePath={node.file.path}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

interface DirRowProps {
  node: DirNode;
  onNavigate: (filePath: string, line: number) => void;
}

function DirRow({ node, onNavigate }: DirRowProps) {
  const [open, setOpen] = useState(true);
  return (
    <li className="dxt-tree-dir">
      <button
        type="button"
        className="dxt-dir-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span
          className={`codicon ${open ? "codicon-chevron-down" : "codicon-chevron-right"}`}
          aria-hidden="true"
        />
        <span
          className={`codicon ${open ? "codicon-folder-opened" : "codicon-folder"}`}
          aria-hidden="true"
        />
        <span className="dxt-dir-name">{node.name}</span>
      </button>
      {open && (
        <ul className="dxt-tree-children">
          {node.children.map((child) =>
            child.kind === "dir" ? (
              <DirRow key={child.name} node={child} onNavigate={onNavigate} />
            ) : (
              <FileRow key={child.file.path} node={child} onNavigate={onNavigate} />
            ),
          )}
        </ul>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

interface SymbolListProps {
  files: FileWithSymbols[];
  onNavigate: (filePath: string, line: number) => void;
}

/**
 * Renders indexed files as a collapsible directory tree (FR-005).
 * Clicking a symbol sends a navigate message to the extension host (FR-007).
 */
export function SymbolList({ files, onNavigate }: SymbolListProps) {
  const tree = buildTree(files);
  return (
    <ul className="dxt-tree">
      {tree.map((node) =>
        node.kind === "dir" ? (
          <DirRow key={node.name} node={node} onNavigate={onNavigate} />
        ) : (
          <FileRow key={node.file.path} node={node} onNavigate={onNavigate} />
        ),
      )}
    </ul>
  );
}
