import type { DuckDBConnection, DuckDBInstance, DuckDBMaterializedResult } from "@duckdb/node-api";

export interface DatabaseHandle {
  instance: DuckDBInstance;
  connection: DuckDBConnection;
  close(): void;
}

export async function openDatabase(dbPath: string): Promise<DatabaseHandle> {
  const { DuckDBInstance } = await import("@duckdb/node-api");
  const instance = await DuckDBInstance.create(dbPath);
  const connection = await instance.connect();

  return {
    instance,
    connection,
    close() {
      connection.closeSync();
      instance.closeSync();
    },
  };
}

export async function runInTransaction<T>(
  connection: DuckDBConnection,
  operation: () => Promise<T>,
): Promise<T> {
  await connection.run("BEGIN TRANSACTION");

  try {
    const result = await operation();
    await connection.run("COMMIT");
    return result;
  } catch (error) {
    await connection.run("ROLLBACK");
    throw error;
  }
}

export async function readRows(
  result: Promise<DuckDBMaterializedResult> | DuckDBMaterializedResult,
): Promise<Record<string, unknown>[]> {
  return (await result).getRowObjectsJS();
}
