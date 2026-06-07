import { tryMatchAnyManifest } from "./matchers/manifest.js";
import { tryMatchStructural } from "./matchers/structural.js";
import { FRAMEWORK_REGISTRY } from "./registry.js";
import type {
  DetectFrameworksFn,
  DetectFrameworksParams,
  DetectedFramework,
  FrameworkDefinition,
} from "./types.js";

/**
 * Pure entrypoint for workspace-level framework detection. Walks the
 * registry; per framework wraps both matchers in try/catch for isolation.
 * Returns results in registry order. Empty array — never null — when nothing
 * matched.
 */
export const detectFrameworks: DetectFrameworksFn = async (
  params: DetectFrameworksParams,
): Promise<readonly DetectedFramework[]> => {
  const results: DetectedFramework[] = [];

  for (const def of FRAMEWORK_REGISTRY) {
    try {
      const hit = await runMatchersFor(def, params);
      if (hit !== null) results.push(hit);
    } catch (err) {
      params.logger?.warn("Framework matcher failed", {
        framework: def.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
};

async function runMatchersFor(
  def: FrameworkDefinition,
  params: DetectFrameworksParams,
): Promise<DetectedFramework | null> {
  const manifestIO = { readFile: params.readFile };
  const structuralIO = { readFile: params.readFile, listFiles: params.listFiles };

  const [manifestHit, structuralHit] = await Promise.all([
    tryMatchAnyManifest(def.manifest, manifestIO),
    tryMatchStructural(def.structural, structuralIO),
  ]);

  // BOTH signals required.
  if (!manifestHit || !structuralHit) {
    return null;
  }

  return {
    frameworkName: def.name,
    detectionSource: "manifest+structural",
    confidence: 1.0,
  };
}
