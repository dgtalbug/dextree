import type { FileWithSymbols } from "../protocol/messages.js";

interface SymbolListProps {
  files: FileWithSymbols[];
  onNavigate: (filePath: string, line: number) => void;
}

/**
 * Renders the indexed files and their symbols (FR-005).
 * Clicking a symbol entry sends a navigate message to the extension host (FR-007).
 */
export function SymbolList({ files, onNavigate }: SymbolListProps) {
  return (
    <ul className="dxt-file-list">
      {files.map((file) => (
        <li key={file.path} className="dxt-file-entry">
          <span className="dxt-file-label">{file.relativePath}</span>
          <ul className="dxt-symbol-list">
            {file.symbols.map((symbol, idx) => (
              <li key={`${file.path}:${symbol.startLine}:${idx}`}>
                <button
                  type="button"
                  className="dxt-symbol-btn"
                  data-symbol="true"
                  onClick={() => onNavigate(file.path, symbol.startLine)}
                >
                  <span className="codicon codicon-symbol-class" aria-hidden="true" />
                  <span className="dxt-symbol-name">{symbol.name}</span>
                  <span className="dxt-symbol-kind">{symbol.kind}</span>
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
