import type React from "react";
import { useEffect, useId, useRef, useState } from "react";

import type { SearchResultItem } from "./graphViewTypes.js";
import styles from "./SearchBar.module.css";

const SEARCH_DEBOUNCE_MS = 150;
const MAX_VISIBLE_RESULTS = 8;

export interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  results: SearchResultItem[];
  focusedIndex: number;
  onSelectResult: (nodeId: string, index: number) => void;
  onClear: () => void;
}

export function SearchBar({
  query,
  onQueryChange,
  results,
  focusedIndex,
  onSelectResult,
  onClear,
}: SearchBarProps): React.ReactElement {
  const listboxId = useId();
  const [pendingValue, setPendingValue] = useState(query);
  const timerRef = useRef<number | null>(null);

  // Keep local pending state in sync when the parent resets the query externally
  // (e.g. on Escape from elsewhere or workspace switch).
  useEffect(() => {
    setPendingValue(query);
  }, [query]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const next = event.target.value;
    setPendingValue(next);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      onQueryChange(next);
      timerRef.current = null;
    }, SEARCH_DEBOUNCE_MS);
  };

  const visibleResults = results.slice(0, MAX_VISIBLE_RESULTS);
  const showDropdown = query.length > 0;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClear();
      return;
    }
    if (visibleResults.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = (focusedIndex + 1) % visibleResults.length;
      const next = visibleResults[nextIndex];
      if (next !== undefined) {
        onSelectResult(next.nodeId, nextIndex);
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const prevIndex = (focusedIndex - 1 + visibleResults.length) % visibleResults.length;
      const prev = visibleResults[prevIndex];
      if (prev !== undefined) {
        onSelectResult(prev.nodeId, prevIndex);
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const current = visibleResults[focusedIndex];
      if (current !== undefined) {
        onSelectResult(current.nodeId, focusedIndex);
      }
    }
  };

  return (
    <div className={styles.searchBar} role="search">
      <span className={`codicon codicon-search ${styles.searchIcon}`} aria-hidden="true" />
      <input
        type="search"
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={showDropdown && visibleResults.length > 0}
        aria-label="Search graph"
        className={styles.input}
        placeholder="Search symbols, files, FQNs…"
        value={pendingValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
      />
      {showDropdown && visibleResults.length === 0 && (
        <div className={styles.noResults} role="status">
          No results
        </div>
      )}
      {showDropdown && visibleResults.length > 0 && (
        <ul id={listboxId} role="listbox" className={styles.dropdown} aria-label="Search results">
          {visibleResults.map((result, index) => {
            const isFocused = index === focusedIndex;
            return (
              <li
                key={result.nodeId}
                role="option"
                aria-selected={isFocused}
                className={`${styles.option} ${isFocused ? styles.optionFocused : ""}`}
                onClick={() => onSelectResult(result.nodeId, index)}
              >
                <span className={styles.optionLabel}>{result.label}</span>
                <span className={styles.optionFilePath}>{result.filePath}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default SearchBar;
