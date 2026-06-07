import { describe, expect, it } from "vitest";

import { ingestScip } from "./scipIngest.js";

describe("ingestScip (optional, opt-in)", () => {
  it("reports not-configured when no index path is given", async () => {
    const result = await ingestScip(undefined);
    expect(result.status).toBe("not-configured");
    expect(result.edges).toEqual([]);
  });

  it("reports not-configured for an empty path", async () => {
    const result = await ingestScip({ indexPath: "   " });
    expect(result.status).toBe("not-configured");
  });

  it("reports unavailable (never throws) when a path is given but the decoder is not installed", async () => {
    const result = await ingestScip({ indexPath: "/repo/index.scip" });
    expect(result.status).toBe("unavailable");
    expect(result.edges).toEqual([]);
    expect(result.reason).toBeTruthy();
  });
});
