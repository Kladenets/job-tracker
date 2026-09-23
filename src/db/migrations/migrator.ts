import { getDatabasePool } from "../connection";
import fs from "fs";
import path from "path";

export async function runMigrations(): Promise<{ success: boolean; message: string }> {
  const pool = getDatabasePool();
  if (!pool) {
    return {
      success: false,
      message: "No PostgreSQL connection available (DATABASE_URL not set). Skipping Postgres migrations.",
    };
  }

  const migrationFilePath = path.join(__dirname, "001_initial_schema.sql");
  if (!fs.existsSync(migrationFilePath)) {
    return {
      success: false,
      message: `Migration file not found at ${migrationFilePath}`,
    };
  }

  const sql = fs.readFileSync(migrationFilePath, "utf8");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    return {
      success: true,
      message: "Successfully applied 001_initial_schema.sql migration to PostgreSQL database.",
    };
  } catch (err: unknown) {
    await client.query("ROLLBACK");
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Migration failed: ${msg}`,
    };
  } finally {
    client.release();
  }
}
