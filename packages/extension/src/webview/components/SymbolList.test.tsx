import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FileWithSymbols } from "../protocol/messages.js";
import { SymbolList } from "./SymbolList.js";

const mockFiles: FileWithSymbols[] = [
  {
    path: "/workspace/src/app.ts",
    relativePath: "src/app.ts",
    symbols: [
      { name: "greet", kind: "function", startLine: 5 },
      { name: "AppConfig", kind: "interface", startLine: 12 },
    ],
  },
  {
    path: "/workspace/src/util.ts",
    relativePath: "src/util.ts",
    symbols: [{ name: "formatDate", kind: "function", startLine: 3 }],
  },
];

describe("SymbolList", () => {
  it("renders file and directory names in tree", () => {
    const { container } = render(<SymbolList files={mockFiles} onNavigate={vi.fn()} />);
    // Directory node shows segment name
    expect(screen.getByText("src")).toBeTruthy();
    // File nodes show filename only
    const names = Array.from(container.querySelectorAll(".dxt-dir-name")).map((n) => n.textContent);
    expect(names).toContain("app.ts");
    expect(names).toContain("util.ts");
  });

  it("renders symbol names", () => {
    const { container } = render(<SymbolList files={mockFiles} onNavigate={vi.fn()} />);
    const names = container.querySelectorAll(".dxt-symbol-name");
    const nameTexts = Array.from(names).map((n) => n.textContent);
    expect(nameTexts).toContain("greet");
    expect(nameTexts).toContain("AppConfig");
    expect(nameTexts).toContain("formatDate");
  });

  it("renders codicon-symbol-class icons", () => {
    const { container } = render(<SymbolList files={mockFiles} onNavigate={vi.fn()} />);
    const icons = container.querySelectorAll(".codicon-symbol-class");
    expect(icons.length).toBeGreaterThan(0);
  });

  it("calls onNavigate with filePath and line when symbol is clicked (US2, FR-007)", () => {
    const onNavigate = vi.fn();
    const { container } = render(<SymbolList files={mockFiles} onNavigate={onNavigate} />);

    const buttons = container.querySelectorAll("[data-symbol]");
    const greetBtn = Array.from(buttons).find((btn) => btn.textContent?.includes("greet"));
    expect(greetBtn).toBeTruthy();
    fireEvent.click(greetBtn!);

    expect(onNavigate).toHaveBeenCalledWith("/workspace/src/app.ts", 5);
  });

  it("calls onNavigate with correct values for second symbol", () => {
    const onNavigate = vi.fn();
    const { container } = render(<SymbolList files={mockFiles} onNavigate={onNavigate} />);

    const buttons = container.querySelectorAll("[data-symbol]");
    const configBtn = Array.from(buttons).find((btn) => btn.textContent?.includes("AppConfig"));
    expect(configBtn).toBeTruthy();
    fireEvent.click(configBtn!);

    expect(onNavigate).toHaveBeenCalledWith("/workspace/src/app.ts", 12);
  });

  it("calls onNavigate for a symbol in the second file", () => {
    const onNavigate = vi.fn();
    const { container } = render(<SymbolList files={mockFiles} onNavigate={onNavigate} />);

    const buttons = container.querySelectorAll("[data-symbol]");
    const formatBtn = Array.from(buttons).find((btn) => btn.textContent?.includes("formatDate"));
    expect(formatBtn).toBeTruthy();
    fireEvent.click(formatBtn!);

    expect(onNavigate).toHaveBeenCalledWith("/workspace/src/util.ts", 3);
  });

  it("renders with no files without crashing", () => {
    render(<SymbolList files={[]} onNavigate={vi.fn()} />);
  });
});
