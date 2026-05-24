import { describe, expect, it } from "vitest";

import { readTomlKeypath } from "./toml.js";

describe("readTomlKeypath", () => {
  it("reads a simple top-level key", () => {
    expect(readTomlKeypath('name = "django"', "name")).toBe("django");
  });

  it("reads a nested section keypath", () => {
    const content = ["[tool.poetry.dependencies]", 'django = "^4.0"', 'requests = "^2.0"'].join(
      "\n",
    );

    expect(readTomlKeypath(content, "tool.poetry.dependencies.django")).toBe("^4.0");
    expect(readTomlKeypath(content, "tool.poetry.dependencies.requests")).toBe("^2.0");
  });

  it("returns undefined for a missing keypath", () => {
    expect(readTomlKeypath('foo = "bar"', "baz")).toBeUndefined();
  });

  it("returns undefined on malformed input without throwing", () => {
    expect(() => readTomlKeypath("[unterminated section", "any")).not.toThrow();
    expect(readTomlKeypath("[unterminated section", "any")).toBeUndefined();
  });

  it("handles unquoted values", () => {
    expect(readTomlKeypath("count = 42", "count")).toBe("42");
  });

  it("handles single-quoted values", () => {
    expect(readTomlKeypath("name = 'django'", "name")).toBe("django");
  });

  it("ignores comment-only lines", () => {
    const content = ["# top comment", "[pkg]", 'name = "x" # inline'].join("\n");
    expect(readTomlKeypath(content, "pkg.name")).toBe("x");
  });

  it("returns undefined for array-of-tables sections (out of scope)", () => {
    const content = ["[[tool.poetry.deps]]", 'name = "x"'].join("\n");
    expect(readTomlKeypath(content, "tool.poetry.deps.name")).toBeUndefined();
  });
});
