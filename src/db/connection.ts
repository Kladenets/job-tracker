import { Pool, PoolConfig } from "pg";
import dotenv from "dotenv";

dotenv.config();

let pool: Pool | null = null;
let isConnected = false;

export function getDatabasePool(): Pool | null {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }

  if (!pool) {
    const config: PoolConfig = {
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    };

    pool = new Pool(config);

    pool.on("error", (err) => {
      console.error("[PostgreSQL Pool Error]", err);
      isConnected = false;
    });
  }

  return pool;
}

export async function checkDatabaseConnection(): Promise<{
  connected: boolean;
  message: string;
}> {
  const currentPool = getDatabasePool();
  if (!currentPool) {
    return {
      connected: false,
      message: "No DATABASE_URL configured in environment.",
    };
  }

  try {
    const client = await currentPool.connect();
    try {
      const res = await client.query("SELECT NOW() as current_time");
      isConnected = true;
      return {
        connected: true,
        message: `Connected to PostgreSQL successfully at ${res.rows[0].current_time}`,
      };
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    isConnected = false;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      connected: false,
      message: `Failed to connect to PostgreSQL: ${msg}`,
    };
  }
}

export function isDbConnected(): boolean {
  return isConnected;
}
