import { createHash } from "node:crypto";

import type { GraphDbConnection } from "./db.js";
import { runInTransaction } from "./db.js";

/** Deterministic folder id: stable across re-index so the tree doesn't reshuffle. */
function folderId(path: string): string {
  return `folder:${createHash("sha256").update(path, "utf8").digest("hex").slice(0, 32)}`;
}

/**
 * Synthesize `folder` nodes + `CONTAINS` edges from the indexed files' relative
 * paths, producing a connected root→folder→file tree. Deterministic ids (path
 * hash) keep re-indexing stable. Rebuilt wholesale each call (idempotent): clear
 * folders + CONTAINS, then re-derive from current files. Runs in finalize.
 */
export async function synthesizeFolderTree(connection: GraphDbConnection): Promise<void> {
  await runInTransaction(connection, async () => {
    await connection.run("DELETE FROM folder");
    await connection.run("DELETE FROM edge WHERE kind = 'CONTAINS'");

    const reader = await connection.run("SELECT id, relative_path FROM file");
    const files = await reader.getRowObjects();
    if (files.length === 0) return;

    const folders = new Map<string, { id: string; parent: string | null }>();
    const containsFileEdges: { folder: string; file: string }[] = [];

    // The parent path is always registered before its children (root is seeded
    // first, then each path segment is added before we descend into it), so a
    // miss here means the invariant broke — fail loudly rather than via `!`.
    const folderIdFor = (path: string): string => {
      const entry = folders.get(path);
      if (entry === undefined) {
        throw new Error(
          `synthesizeFolderTree: parent folder '${path}' not registered before child`,
        );
      }
      return entry.id;
    };

    for (const f of files) {
      const rel = String(f.relative_path);
      const parts = rel.split("/");
      parts.pop(); // drop the filename
      // Register every ancestor folder ("" = root), chaining parent links.
      let accum = "";
      // Root sentinel so top-level files attach to a single root node.
      if (!folders.has("")) folders.set("", { id: folderId(""), parent: null });
      let parentPath = "";
      for (const part of parts) {
        accum = accum === "" ? part : `${accum}/${part}`;
        if (!folders.has(accum)) {
          folders.set(accum, { id: folderId(accum), parent: folderIdFor(parentPath) });
        }
        parentPath = accum;
      }
      containsFileEdges.push({ folder: folderIdFor(parentPath), file: String(f.id) });
    }

    for (const [path, info] of folders) {
      await connection.run(
        "INSERT INTO folder (id, path, parent_id) VALUES ($id, $path, $parent)",
        { id: info.id, path, parent: info.parent },
      );
      if (info.parent !== null) {
        await connection.run(
          "INSERT INTO edge (id, source_id, target_id, kind, metadata) VALUES ($id, $s, $t, 'CONTAINS', '{}')",
          { id: `contains:${info.parent}->${info.id}`, s: info.parent, t: info.id },
        );
      }
    }
    for (const e of containsFileEdges) {
      await connection.run(
        "INSERT INTO edge (id, source_id, target_id, kind, metadata) VALUES ($id, $s, $t, 'CONTAINS', '{}')",
        { id: `contains:${e.folder}->${e.file}`, s: e.folder, t: e.file },
      );
    }
  });
}
