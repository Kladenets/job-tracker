import { JobPostingRepository } from "./repository-interface";
import { PostgresJobRepository } from "./postgres-repository";
import { FileJobRepository } from "./file-repository";
import { checkDatabaseConnection, getDatabasePool } from "./connection";

let activeRepository: JobPostingRepository | null = null;
let activeEngine: "postgres" | "file" = "file";
let initialization: Promise<{ repository: JobPostingRepository; engine: "postgres" | "file" }> | null = null;

export interface RepositorySelectionConfig {
  isProduction: boolean;
  forceFileRepository: boolean;
  databaseUrl?: string;
}

export interface RepositorySelectionDependencies {
  checkDatabaseConnection: typeof checkDatabaseConnection;
  getDatabasePool: typeof getDatabasePool;
  createFileRepository: () => JobPostingRepository;
  createPostgresRepository: (pool: NonNullable<ReturnType<typeof getDatabasePool>>) => JobPostingRepository;
}

const defaultSelectionDependencies: RepositorySelectionDependencies = {
  checkDatabaseConnection,
  getDatabasePool,
  createFileRepository: () => new FileJobRepository(process.env.JOB_TRACKER_STORE_PATH),
  createPostgresRepository: (pool) => new PostgresJobRepository(pool),
};

function activateFileRepository(): { repository: JobPostingRepository; engine: "file" } {
  activeRepository = new FileJobRepository(process.env.JOB_TRACKER_STORE_PATH);
  activeEngine = "file";
  console.log("[Persistence] Active repository: Local File Storage (data/job_tracker_store.json)");
  return { repository: activeRepository, engine: "file" };
}

export async function selectRepository(
  config: RepositorySelectionConfig,
  dependencies: RepositorySelectionDependencies = defaultSelectionDependencies
): Promise<{ repository: JobPostingRepository; engine: "postgres" | "file" }> {
  const useFileRepository = (): { repository: JobPostingRepository; engine: "file" } => ({
    repository: dependencies.createFileRepository(),
    engine: "file",
  });

  if (config.forceFileRepository) {
    if (config.isProduction) {
      throw new Error("JOB_TRACKER_FORCE_FILE cannot be enabled in production.");
    }
    return useFileRepository();
  }

  if (!config.databaseUrl?.trim()) {
    if (config.isProduction) {
      throw new Error("DATABASE_URL is required in production; refusing to start with file storage.");
    }
    return useFileRepository();
  }

  const databaseStatus = await dependencies.checkDatabaseConnection();
  if (!databaseStatus.connected) {
    if (config.isProduction) {
      throw new Error(`PostgreSQL is required in production: ${databaseStatus.message}`);
    }
    console.warn(`[Persistence] ${databaseStatus.message} Falling back to the local file store in development.`);
    return useFileRepository();
  }

  const pool = dependencies.getDatabasePool();
  if (!pool) {
    throw new Error("PostgreSQL connection was verified but its pool is unavailable.");
  }

  return {
    repository: dependencies.createPostgresRepository(pool),
    engine: "postgres",
  };
}

export async function initializeRepository(): Promise<{
  repository: JobPostingRepository;
  engine: "postgres" | "file";
}> {
  if (activeRepository) {
    return { repository: activeRepository, engine: activeEngine };
  }
  if (initialization) return initialization;

  initialization = (async () => {
    const selected = await selectRepository({
      isProduction: process.env.NODE_ENV === "production",
      forceFileRepository: process.env.JOB_TRACKER_FORCE_FILE === "true",
      databaseUrl: process.env.DATABASE_URL,
    });
    activeRepository = selected.repository;
    activeEngine = selected.engine;
    console.log(`[Persistence] Active repository: ${activeEngine === "postgres" ? "PostgreSQL" : "Local File Storage (data/job_tracker_store.json)"}`);
    return { repository: activeRepository, engine: activeEngine };
  })();

  try {
    return await initialization;
  } catch (error) {
    initialization = null;
    throw error;
  }
}

export function getRepository(): { repository: JobPostingRepository; engine: "postgres" | "file" } {
  if (activeRepository) {
    return { repository: activeRepository, engine: activeEngine };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Repository is not initialized. Await initializeRepository before serving production requests.");
  }

  if (process.env.JOB_TRACKER_FORCE_FILE === "true" || !process.env.DATABASE_URL?.trim()) {
    return activateFileRepository();
  }

  throw new Error("Repository is not initialized. Await initializeRepository before using a configured database.");
}
