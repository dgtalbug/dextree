import { FRAMEWORK_REGISTRY } from "./registry.js";
import type { DetectedFramework } from "./types.js";

export interface FileFrameworkAttribution {
  framework: string;
  role: string;
}

/**
 * Walks registered frameworks in declaration order. Only considers frameworks
 * present in `detected` (i.e. the workspace has them). The first non-null
 * `fileRole` result wins. Returns null if no framework claims the file.
 */
export function resolveFileFramework(
  filePath: string,
  fileContent: string,
  detected: readonly DetectedFramework[],
): FileFrameworkAttribution | null {
  if (detected.length === 0) return null;
  const detectedNames = new Set(detected.map((d) => d.frameworkName));

  for (const def of FRAMEWORK_REGISTRY) {
    if (!detectedNames.has(def.name)) continue;
    const role = def.fileRole(filePath, fileContent);
    if (role !== null) {
      return { framework: def.name, role };
    }
  }
  return null;
}
