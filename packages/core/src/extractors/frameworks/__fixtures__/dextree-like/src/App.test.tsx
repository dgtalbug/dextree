import { describe, it, expect } from "vitest";
import App from "./App.js";

describe("App", () => {
  it("returns a React element", () => {
    expect(App()).toBeTruthy();
  });
});
