import { JobPostingRepository } from "./repository-interface";
import { PostgresJobRepository } from "./postgres-repository";
import { FileJobRepository } from "./file-repository";
import { getDatabasePool, isDbConnected } from "./connection";

let activeRepository: JobPostingRepository | null = null;
let activeEngine: "postgres" | "file" = "file";
let postgresAttemptFailed = false;

export function getRepository(): { repository: JobPostingRepository; engine: "postgres" | "file" } {
  if (activeRepository) {
    return { repository: activeRepository, engine: activeEngine };
  }

  const forceFileRepository = process.env.JOB_TRACKER_FORCE_FILE === "true";
  const pool = forceFileRepository ? null : getDatabasePool();
  if (pool && !postgresAttemptFailed && isDbConnected()) {
    try {
      activeRepository = new PostgresJobRepository(pool);
      activeEngine = "postgres";
      console.log("[Persistence] Active repository: PostgreSQL");
      return { repository: activeRepository, engine: "postgres" };
    } catch (err) {
      postgresAttemptFailed = true;
      console.warn("[Persistence] Failed initializing Postgres repository, falling back to local file store:", err);
    }
  }

  activeRepository = new FileJobRepository(process.env.JOB_TRACKER_STORE_PATH);
  activeEngine = "file";
  console.log("[Persistence] Active repository: Local File Storage (data/job_tracker_store.json)");
  return { repository: activeRepository, engine: "file" };
}
