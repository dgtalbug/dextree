import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchBar } from "./SearchBar.js";
import type { SearchResultItem } from "./graphViewTypes.js";

const sampleResults: SearchResultItem[] = [
  { nodeId: "n1", label: "parseManifest", filePath: "src/parser/manifest.ts", matchIndex: 0 },
  { nodeId: "n2", label: "parseManifestV2", filePath: "src/parser/v2.ts", matchIndex: 0 },
  { nodeId: "n3", label: "parser", filePath: "src/parser/index.ts", matchIndex: 0 },
];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("SearchBar", () => {
  it("renders the search input", () => {
    render(
      <SearchBar
        query=""
        results={[]}
        focusedIndex={0}
        onQueryChange={vi.fn()}
        onSelectResult={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByRole("combobox")).toBeTruthy();
  });

  it("debounces onQueryChange by 150ms", () => {
    const onQueryChange = vi.fn();
    render(
      <SearchBar
        query=""
        results={[]}
        focusedIndex={0}
        onQueryChange={onQueryChange}
        onSelectResult={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "par" } });
    expect(onQueryChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(149);
    expect(onQueryChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onQueryChange).toHaveBeenCalledTimes(1);
    expect(onQueryChange).toHaveBeenCalledWith("par");
  });

  it("renders the dropdown listbox when results exist and query is non-empty", () => {
    render(
      <SearchBar
        query="par"
        results={sampleResults}
        focusedIndex={0}
        onQueryChange={vi.fn()}
        onSelectResult={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getAllByRole("option").length).toBe(3);
  });

  it("hides the dropdown when query is empty", () => {
    render(
      <SearchBar
        query=""
        results={sampleResults}
        focusedIndex={0}
        onQueryChange={vi.fn()}
        onSelectResult={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("marks the focused result with aria-selected=true", () => {
    render(
      <SearchBar
        query="par"
        results={sampleResults}
        focusedIndex={1}
        onQueryChange={vi.fn()}
        onSelectResult={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    const options = screen.getAllByRole("option");
    expect(options[0]?.getAttribute("aria-selected")).toBe("false");
    expect(options[1]?.getAttribute("aria-selected")).toBe("true");
  });

  it("shows the no-results message when query is set but results are empty", () => {
    render(
      <SearchBar
        query="zzz"
        results={[]}
        focusedIndex={0}
        onQueryChange={vi.fn()}
        onSelectResult={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText(/no results/i)).toBeTruthy();
  });

  it("calls onSelectResult when a result is clicked", () => {
    const onSelectResult = vi.fn();
    render(
      <SearchBar
        query="par"
        results={sampleResults}
        focusedIndex={0}
        onQueryChange={vi.fn()}
        onSelectResult={onSelectResult}
        onClear={vi.fn()}
      />,
    );
    fireEvent.click(screen.getAllByRole("option")[1]!);
    expect(onSelectResult).toHaveBeenCalledWith("n2", 1);
  });

  it("calls onSelectResult cycling forward on ArrowDown", () => {
    const onSelectResult = vi.fn();
    render(
      <SearchBar
        query="par"
        results={sampleResults}
        focusedIndex={0}
        onQueryChange={vi.fn()}
        onSelectResult={onSelectResult}
        onClear={vi.fn()}
      />,
    );
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    expect(onSelectResult).toHaveBeenCalledWith("n2", 1);
  });

  it("calls onSelectResult cycling backward on ArrowUp (wraps to last)", () => {
    const onSelectResult = vi.fn();
    render(
      <SearchBar
        query="par"
        results={sampleResults}
        focusedIndex={0}
        onQueryChange={vi.fn()}
        onSelectResult={onSelectResult}
        onClear={vi.fn()}
      />,
    );
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowUp" });
    expect(onSelectResult).toHaveBeenCalledWith("n3", 2);
  });

  it("calls onClear on Escape", () => {
    const onClear = vi.fn();
    render(
      <SearchBar
        query="par"
        results={sampleResults}
        focusedIndex={0}
        onQueryChange={vi.fn()}
        onSelectResult={vi.fn()}
        onClear={onClear}
      />,
    );
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
