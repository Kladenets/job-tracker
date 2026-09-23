import { JobPostingRepository } from "./repository-interface";
import { PostgresJobRepository } from "./postgres-repository";
import { FileJobRepository } from "./file-repository";
import { getDatabasePool } from "./connection";

let activeRepository: JobPostingRepository | null = null;
let activeEngine: "postgres" | "file" = "file";

export function getRepository(): { repository: JobPostingRepository; engine: "postgres" | "file" } {
  if (activeRepository) {
    return { repository: activeRepository, engine: activeEngine };
  }

  const pool = getDatabasePool();
  if (pool) {
    try {
      activeRepository = new PostgresJobRepository(pool);
      activeEngine = "postgres";
      console.log("[Persistence] Active repository: PostgreSQL");
      return { repository: activeRepository, engine: "postgres" };
    } catch (err) {
      console.warn("[Persistence] Failed initializing Postgres repository, falling back to local file store:", err);
    }
  }

  activeRepository = new FileJobRepository();
  activeEngine = "file";
  console.log("[Persistence] Active repository: Local File Storage (data/job_tracker_store.json)");
  return { repository: activeRepository, engine: "file" };
}
