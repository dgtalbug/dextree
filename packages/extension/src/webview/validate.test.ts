import { describe, expect, it } from "vitest";
import { validateNavigateMessage } from "./validate.js";

const WORKSPACE_ROOT = "/Users/user/projects/myapp";

describe("validateNavigateMessage", () => {
  describe("valid messages", () => {
    it("returns the message for a valid navigate message", () => {
      const msg = {
        type: "navigate",
        filePath: `${WORKSPACE_ROOT}/src/index.ts`,
        line: 10,
      };
      const result = validateNavigateMessage(msg, WORKSPACE_ROOT);
      expect(result).toEqual(msg);
    });

    it("accepts line 0", () => {
      const msg = { type: "navigate", filePath: `${WORKSPACE_ROOT}/src/app.ts`, line: 0 };
      expect(validateNavigateMessage(msg, WORKSPACE_ROOT)).toEqual(msg);
    });

    it("accepts deep nested paths", () => {
      const msg = {
        type: "navigate",
        filePath: `${WORKSPACE_ROOT}/a/b/c/d.ts`,
        line: 42,
      };
      expect(validateNavigateMessage(msg, WORKSPACE_ROOT)).toEqual(msg);
    });
  });

  describe("workspaceRoot guard", () => {
    it("returns null when workspaceRoot is undefined", () => {
      const msg = { type: "navigate", filePath: `${WORKSPACE_ROOT}/src/index.ts`, line: 0 };
      expect(validateNavigateMessage(msg, undefined)).toBeNull();
    });

    it("returns null when workspaceRoot is empty string", () => {
      const msg = { type: "navigate", filePath: "/some/file.ts", line: 0 };
      expect(validateNavigateMessage(msg, "")).toBeNull();
    });
  });

  describe("type field checks", () => {
    it("returns null when type is not navigate", () => {
      const msg = { type: "symbols", filePath: `${WORKSPACE_ROOT}/src/index.ts`, line: 0 };
      expect(validateNavigateMessage(msg, WORKSPACE_ROOT)).toBeNull();
    });

    it("returns null when type is missing", () => {
      const msg = { filePath: `${WORKSPACE_ROOT}/src/index.ts`, line: 0 };
      expect(validateNavigateMessage(msg, WORKSPACE_ROOT)).toBeNull();
    });
  });

  describe("filePath checks", () => {
    it("returns null when filePath is missing", () => {
      const msg = { type: "navigate", line: 0 };
      expect(validateNavigateMessage(msg, WORKSPACE_ROOT)).toBeNull();
    });

    it("returns null when filePath is empty string", () => {
      const msg = { type: "navigate", filePath: "", line: 0 };
      expect(validateNavigateMessage(msg, WORKSPACE_ROOT)).toBeNull();
    });

    it("returns null when filePath is not a string", () => {
      const msg = { type: "navigate", filePath: 42, line: 0 };
      expect(validateNavigateMessage(msg, WORKSPACE_ROOT)).toBeNull();
    });

    it("returns null for relative path (not absolute)", () => {
      const msg = { type: "navigate", filePath: "src/index.ts", line: 0 };
      expect(validateNavigateMessage(msg, WORKSPACE_ROOT)).toBeNull();
    });

    it("returns null when filePath contains .. traversal", () => {
      const msg = {
        type: "navigate",
        filePath: `${WORKSPACE_ROOT}/../../../etc/passwd`,
        line: 0,
      };
      expect(validateNavigateMessage(msg, WORKSPACE_ROOT)).toBeNull();
    });

    it("returns null when filePath is outside workspace root", () => {
      const msg = {
        type: "navigate",
        filePath: "/Users/user/projects/otherapp/src/index.ts",
        line: 0,
      };
      expect(validateNavigateMessage(msg, WORKSPACE_ROOT)).toBeNull();
    });
  });

  describe("line checks", () => {
    it("returns null when line is missing", () => {
      const msg = { type: "navigate", filePath: `${WORKSPACE_ROOT}/src/index.ts` };
      expect(validateNavigateMessage(msg, WORKSPACE_ROOT)).toBeNull();
    });

    it("returns null when line is negative", () => {
      const msg = { type: "navigate", filePath: `${WORKSPACE_ROOT}/src/index.ts`, line: -1 };
      expect(validateNavigateMessage(msg, WORKSPACE_ROOT)).toBeNull();
    });

    it("returns null when line is a float", () => {
      const msg = { type: "navigate", filePath: `${WORKSPACE_ROOT}/src/index.ts`, line: 1.5 };
      expect(validateNavigateMessage(msg, WORKSPACE_ROOT)).toBeNull();
    });

    it("returns null when line is not a safe integer", () => {
      const msg = {
        type: "navigate",
        filePath: `${WORKSPACE_ROOT}/src/index.ts`,
        line: Number.MAX_SAFE_INTEGER + 1,
      };
      expect(validateNavigateMessage(msg, WORKSPACE_ROOT)).toBeNull();
    });

    it("returns null when line is Infinity", () => {
      const msg = { type: "navigate", filePath: `${WORKSPACE_ROOT}/src/index.ts`, line: Infinity };
      expect(validateNavigateMessage(msg, WORKSPACE_ROOT)).toBeNull();
    });

    it("returns null when line is NaN", () => {
      const msg = { type: "navigate", filePath: `${WORKSPACE_ROOT}/src/index.ts`, line: NaN };
      expect(validateNavigateMessage(msg, WORKSPACE_ROOT)).toBeNull();
    });

    it("returns null when line is a string", () => {
      const msg = { type: "navigate", filePath: `${WORKSPACE_ROOT}/src/index.ts`, line: "0" };
      expect(validateNavigateMessage(msg, WORKSPACE_ROOT)).toBeNull();
    });
  });

  describe("non-object inputs", () => {
    it("returns null for null", () => {
      expect(validateNavigateMessage(null, WORKSPACE_ROOT)).toBeNull();
    });

    it("returns null for a string", () => {
      expect(validateNavigateMessage("navigate", WORKSPACE_ROOT)).toBeNull();
    });

    it("returns null for undefined", () => {
      expect(validateNavigateMessage(undefined, WORKSPACE_ROOT)).toBeNull();
    });

    it("returns null for a number", () => {
      expect(validateNavigateMessage(42, WORKSPACE_ROOT)).toBeNull();
    });
  });
});
