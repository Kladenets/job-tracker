import { getDatabasePool } from "../connection";
import { Pool } from "pg";
import fs from "fs";
import path from "path";

export interface MigrationRunnerOptions {
  pool?: Pool | null;
  migrationsDirectory?: string;
}

export async function runMigrations(options?: MigrationRunnerOptions): Promise<{ success: boolean; message: string; applied?: string[] }> {
  const pool = options?.pool === undefined ? getDatabasePool() : options.pool;
  if (!pool) {
    return {
      success: false,
      message: "No PostgreSQL connection available (DATABASE_URL not set). Skipping Postgres migrations.",
    };
  }

  const migrationsDir = options?.migrationsDirectory || __dirname;
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    return {
      success: false,
      message: `No SQL migration files found in ${migrationsDir}; refusing to continue.`,
    };
  }

  const client = await pool.connect();
  const applied: string[] = [];

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [741029381]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const migrationRows = await client.query("SELECT filename FROM schema_migrations");
    const appliedFiles = new Set(migrationRows.rows.map((row: { filename: string }) => row.filename));

    for (const file of files) {
      if (appliedFiles.has(file)) continue;

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf8");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      applied.push(file);
    }

    await client.query("COMMIT");
    return {
      success: true,
      message: applied.length > 0
        ? `Successfully applied ${applied.length} migration(s): ${applied.join(", ")}`
        : "Database schema is up to date.",
      applied,
    };
  } catch (err: unknown) {
    await client.query("ROLLBACK");
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Migration failed on ${applied.length < files.length ? files[applied.length] : "unknown"}: ${msg}`,
    };
  } finally {
    client.release();
  }
}
