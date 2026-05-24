import { describe, expect, it } from "vitest";

import type { ManifestKeyPath } from "../types.js";
import { tryMatchAnyManifest, tryMatchManifest } from "./manifest.js";

function fsFromMap(files: Record<string, string | null>) {
  return {
    readFile: async (relativePath: string) => files[relativePath] ?? null,
  };
}

describe("tryMatchManifest", () => {
  it("matches a present key in package.json", async () => {
    const kp: ManifestKeyPath = {
      file: "package.json",
      keypath: "dependencies.react",
      match: { kind: "present" },
    };
    const io = fsFromMap({
      "package.json": JSON.stringify({ dependencies: { react: "^18.0.0" } }),
    });
    await expect(tryMatchManifest(kp, io)).resolves.toBe(true);
  });

  it("matches a regex against a package.json value", async () => {
    const kp: ManifestKeyPath = {
      file: "package.json",
      keypath: "engines.vscode",
      match: { kind: "regex", pattern: "^\\^1" },
    };
    const io = fsFromMap({
      "package.json": JSON.stringify({ engines: { vscode: "^1.85.0" } }),
    });
    await expect(tryMatchManifest(kp, io)).resolves.toBe(true);
  });

  it("returns false when keypath is missing", async () => {
    const kp: ManifestKeyPath = {
      file: "package.json",
      keypath: "dependencies.react",
      match: { kind: "present" },
    };
    const io = fsFromMap({ "package.json": JSON.stringify({ dependencies: {} }) });
    await expect(tryMatchManifest(kp, io)).resolves.toBe(false);
  });

  it("returns false when manifest is missing", async () => {
    const kp: ManifestKeyPath = {
      file: "package.json",
      keypath: "name",
      match: { kind: "present" },
    };
    await expect(tryMatchManifest(kp, fsFromMap({}))).resolves.toBe(false);
  });

  it("returns false when manifest is malformed JSON (silent)", async () => {
    const kp: ManifestKeyPath = {
      file: "package.json",
      keypath: "name",
      match: { kind: "present" },
    };
    await expect(
      tryMatchManifest(kp, fsFromMap({ "package.json": "{ not valid json" })),
    ).resolves.toBe(false);
  });

  it("matches a TOML keypath", async () => {
    const kp: ManifestKeyPath = {
      file: "pyproject.toml",
      keypath: "tool.poetry.dependencies.django",
      match: { kind: "present" },
    };
    const io = fsFromMap({
      "pyproject.toml": '[tool.poetry.dependencies]\ndjango = "^4.0"\n',
    });
    await expect(tryMatchManifest(kp, io)).resolves.toBe(true);
  });

  it("matches a regex against raw file contents via __raw__", async () => {
    const kp: ManifestKeyPath = {
      file: "go.mod",
      keypath: "__raw__",
      match: { kind: "regex", pattern: "github.com/spf13/cobra" },
    };
    const io = fsFromMap({
      "go.mod": "module example\n\nrequire github.com/spf13/cobra v1.7.0\n",
    });
    await expect(tryMatchManifest(kp, io)).resolves.toBe(true);
  });

  it("treats readFile throwing as not-matched (no propagation)", async () => {
    const kp: ManifestKeyPath = {
      file: "package.json",
      keypath: "name",
      match: { kind: "present" },
    };
    const io = {
      readFile: async () => {
        throw new Error("EACCES");
      },
    };
    await expect(tryMatchManifest(kp, io)).resolves.toBe(false);
  });
});

describe("tryMatchAnyManifest", () => {
  it("returns true on the first hit in a list", async () => {
    const list: ManifestKeyPath[] = [
      {
        file: "pyproject.toml",
        keypath: "tool.poetry.dependencies.django",
        match: { kind: "present" },
      },
      {
        file: "requirements.txt",
        keypath: "__raw__",
        match: { kind: "regex", pattern: "^django" },
      },
    ];
    const io = fsFromMap({ "requirements.txt": "django==4.0\nrequests==2.31\n" });
    await expect(tryMatchAnyManifest(list, io)).resolves.toBe(true);
  });

  it("returns false when no entry matches", async () => {
    const list: ManifestKeyPath[] = [
      {
        file: "pyproject.toml",
        keypath: "tool.poetry.dependencies.django",
        match: { kind: "present" },
      },
    ];
    await expect(tryMatchAnyManifest(list, fsFromMap({}))).resolves.toBe(false);
  });
});
