import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { runMigrations } from "../migrations/migrator";

function createMigrationPool(options?: { failingSql?: string }) {
  const appliedFiles: string[] = [];
  const executedMigrations: string[] = [];
  const transactionCommands: string[] = [];

  const client = {
    query: async (query: string, values?: unknown[]) => {
      const normalized = query.trim();
      if (normalized === "BEGIN" || normalized === "COMMIT" || normalized === "ROLLBACK") {
        transactionCommands.push(normalized);
        return { rows: [] };
      }
      if (normalized.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [] };
      if (normalized.startsWith("CREATE TABLE IF NOT EXISTS schema_migrations")) return { rows: [] };
      if (normalized === "SELECT filename FROM schema_migrations") {
        return { rows: appliedFiles.map((filename) => ({ filename })) };
      }
      if (normalized.startsWith("INSERT INTO schema_migrations")) {
        appliedFiles.push(String(values?.[0]));
        return { rows: [] };
      }
      if (options?.failingSql && normalized.includes(options.failingSql)) {
        throw new Error("synthetic migration failure");
      }
      executedMigrations.push(normalized);
      return { rows: [] };
    },
    release: () => undefined,
  };

  const pool = {
    connect: async () => client,
  } as unknown as Pool;

  return { pool, appliedFiles, executedMigrations, transactionCommands };
}

async function runTests() {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "job-tracker-migrations-"));
  const migrationsDirectory = path.join(tempDirectory, "migrations");
  const emptyDirectory = path.join(tempDirectory, "empty");
  const failingDirectory = path.join(tempDirectory, "failing");
  fs.mkdirSync(migrationsDirectory);
  fs.mkdirSync(emptyDirectory);
  fs.mkdirSync(failingDirectory);
  fs.writeFileSync(path.join(migrationsDirectory, "001_base.sql"), "CREATE TABLE base_table (id integer);");
  fs.writeFileSync(path.join(migrationsDirectory, "002_profiles.sql"), "CREATE TABLE profiles (id integer);");
  fs.writeFileSync(path.join(failingDirectory, "001_failure.sql"), "FAIL THIS MIGRATION;");

  try {
    const migrationDb = createMigrationPool();
    const firstRun = await runMigrations({ pool: migrationDb.pool, migrationsDirectory });
    assert.strictEqual(firstRun.success, true);
    assert.deepStrictEqual(firstRun.applied, ["001_base.sql", "002_profiles.sql"]);
    assert.deepStrictEqual(migrationDb.transactionCommands, ["BEGIN", "COMMIT"]);

    const secondRun = await runMigrations({ pool: migrationDb.pool, migrationsDirectory });
    assert.strictEqual(secondRun.success, true);
    assert.deepStrictEqual(secondRun.applied, []);
    assert.strictEqual(migrationDb.executedMigrations.length, 2, "Applied migrations must not execute again");

    const emptyRun = await runMigrations({ pool: migrationDb.pool, migrationsDirectory: emptyDirectory });
    assert.strictEqual(emptyRun.success, false, "An empty migration directory must not report success");

    const failingDb = createMigrationPool({ failingSql: "FAIL THIS MIGRATION" });
    const failedRun = await runMigrations({ pool: failingDb.pool, migrationsDirectory: failingDirectory });
    assert.strictEqual(failedRun.success, false);
    assert.deepStrictEqual(failingDb.transactionCommands, ["BEGIN", "ROLLBACK"]);
    assert.deepStrictEqual(failingDb.appliedFiles, [], "Failed migrations must not be recorded as applied");
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }

  console.log("Migration runner tests passed: ordered apply, idempotent rerun, empty-dir failure, and rollback.");
}

runTests().catch((error: unknown) => {
  console.error("Migration runner tests failed:", error);
  process.exitCode = 1;
});