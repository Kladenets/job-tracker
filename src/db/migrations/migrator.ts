import { getDatabasePool } from "../connection";
import fs from "fs";
import path from "path";

export async function runMigrations(): Promise<{ success: boolean; message: string; applied?: string[] }> {
  const pool = getDatabasePool();
  if (!pool) {
    return {
      success: false,
      message: "No PostgreSQL connection available (DATABASE_URL not set). Skipping Postgres migrations.",
    };
  }

  const migrationsDir = __dirname;
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    return {
      success: true,
      message: "No SQL migration files found.",
    };
  }

  const client = await pool.connect();
  const applied: string[] = [];

  try {
    await client.query("BEGIN");

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf8");
      await client.query(sql);
      applied.push(file);
    }

    await client.query("COMMIT");
    return {
      success: true,
      message: `Successfully applied ${applied.length} migration(s): ${applied.join(", ")}`,
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
