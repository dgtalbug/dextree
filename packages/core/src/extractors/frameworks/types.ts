/**
 * Runtime types for the framework registry.
 *
 * These mirror the spec contract at
 * `specs/018-framework-detection/contracts/framework-registry.ts`.
 * Production code does not import from `specs/`; the contract is the
 * source of truth for the spec, and this file is the runtime declaration.
 * Keep both in sync.
 */
import type { FrameworkDetectionSource, Logger } from "../../types.js";

export interface ManifestKeyPathPresent {
  kind: "present";
}

export interface ManifestKeyPathRegex {
  kind: "regex";
  pattern: string;
}

export interface ManifestKeyPathEquals {
  kind: "equals";
  value: string;
}

export type ManifestMatchPolicy =
  | ManifestKeyPathPresent
  | ManifestKeyPathRegex
  | ManifestKeyPathEquals;

export interface ManifestKeyPath {
  file: string;
  keypath: string;
  match: ManifestMatchPolicy;
}

export interface StructuralSignal {
  fileGlob: string;
  contentPattern: string;
  maxFilesScanned?: number;
}

export type FileRoleResolver = (filePath: string, fileContent: string) => string | null;

export interface FrameworkDefinition {
  name: string;
  description: string;
  category?: string;
  manifest: ManifestKeyPath | readonly ManifestKeyPath[];
  structural: StructuralSignal;
  fileRole: FileRoleResolver;
  knownRoles: readonly string[];
}

export interface DetectedFramework {
  frameworkName: string;
  detectionSource: FrameworkDetectionSource;
  confidence: number;
}

export interface DetectFrameworksParams {
  workspaceRoot: string;
  readFile: (relativePath: string) => Promise<string | null>;
  listFiles: (glob: string) => Promise<readonly string[]>;
  logger?: Logger;
}

export type DetectFrameworksFn = (
  params: DetectFrameworksParams,
) => Promise<readonly DetectedFramework[]>;

export type FrameworkRegistry = readonly FrameworkDefinition[];
