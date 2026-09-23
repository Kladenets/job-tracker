import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { runJobSpyScraper } from "./bridges/jobspy-bridge";
import { JobSpyQuerySchema, RawJobPostingSchema } from "./types/job";
import { sourceRegistry } from "./adapters";
import { GreenhouseAdapter } from "./adapters/greenhouse-adapter";
import { LeverAdapter } from "./adapters/lever-adapter";
import { getRepository } from "./db";
import { checkDatabaseConnection } from "./db/connection";
import { runMigrations } from "./db/migrations/migrator";
import { ingestRawPostings } from "./pipeline/ingestion-pipeline";

dotenv.config();

const app = express();
// AI Studio dev server runs on port 3000 (nginx proxy runs on 8080)
const port = 3000;
const host = "0.0.0.0";

app.use(cors());
app.use(express.json());

// Root health & meta endpoint
app.get("/", (_req: Request, res: Response) => {
  const { engine } = getRepository();
  res.json({
    status: "ok",
    service: "Job Tracker Backend",
    version: "0.3.0",
    persistenceEngine: engine,
    supportedSources: sourceRegistry.list(),
  });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "healthy" });
});

// Database status & migration endpoints
app.get("/api/db/status", async (_req: Request, res: Response) => {
  const dbStatus = await checkDatabaseConnection();
  const { engine } = getRepository();
  res.json({
    activeEngine: engine,
    postgres: dbStatus,
  });
});

app.post("/api/db/migrate", async (_req: Request, res: Response) => {
  const result = await runMigrations();
  return res.status(result.success ? 200 : 400).json(result);
});

// Query persisted job postings with filters
app.get("/api/jobs", async (req: Request, res: Response) => {
  try {
    const { repository } = getRepository();
    const jobStatus = typeof req.query.status === "string" ? req.query.status : undefined;
    const availability = typeof req.query.availability === "string" ? req.query.availability : undefined;
    const company = typeof req.query.company === "string" ? req.query.company : undefined;
    const limit = parseInt(typeof req.query.limit === "string" ? req.query.limit : "50", 10);
    const offset = parseInt(typeof req.query.offset === "string" ? req.query.offset : "0", 10);

    const postings = await repository.listPostings({
      jobStatus,
      availability,
      company,
      limit,
      offset,
    });

    res.json({
      count: postings.length,
      limit,
      offset,
      postings,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to query jobs";
    res.status(500).json({ success: false, error: message });
  }
});

// Get a single persisted job by ID
app.get("/api/jobs/:id", async (req: Request, res: Response) => {
  try {
    const { repository } = getRepository();
    const job = await repository.getById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, error: "Job posting not found" });
    }
    return res.json({ success: true, job });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to retrieve job";
    return res.status(500).json({ success: false, error: message });
  }
});

// Update review status with audit history
app.patch("/api/jobs/:id/status", async (req: Request, res: Response) => {
  try {
    const { repository } = getRepository();
    const { status, changedBy = "user", reason } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, error: "Missing required 'status' field" });
    }

    await repository.updateStatus(req.params.id, status, changedBy, reason);
    const updated = await repository.getById(req.params.id);
    return res.json({ success: true, job: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update status";
    return res.status(500).json({ success: false, error: message });
  }
});

// Ingest and persist from Greenhouse
app.post("/api/ingest/greenhouse", async (req: Request, res: Response) => {
  try {
    const boardToken = typeof req.body.board === "string" ? req.body.board : "gitlab";
    const searchTerm = typeof req.body.searchTerm === "string" ? req.body.searchTerm : undefined;
    const adapter = sourceRegistry.get("greenhouse") as GreenhouseAdapter;

    const rawJobs = await adapter.fetchJobs({ boardToken, searchTerm });
    const ingestResult = await ingestRawPostings(rawJobs);

    return res.json({
      success: true,
      source: "greenhouse",
      board: boardToken,
      ...ingestResult,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to ingest Greenhouse jobs";
    return res.status(500).json({ success: false, error: message });
  }
});

// Ingest and persist from Lever
app.post("/api/ingest/lever", async (req: Request, res: Response) => {
  try {
    const company = typeof req.body.company === "string" ? req.body.company : "palantir";
    const searchTerm = typeof req.body.searchTerm === "string" ? req.body.searchTerm : undefined;
    const adapter = sourceRegistry.get("lever") as LeverAdapter;

    const rawJobs = await adapter.fetchJobs({ company, searchTerm });
    const ingestResult = await ingestRawPostings(rawJobs);

    return res.json({
      success: true,
      source: "lever",
      company,
      ...ingestResult,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to ingest Lever jobs";
    return res.status(500).json({ success: false, error: message });
  }
});

// List all registered source adapters
app.get("/api/sources", (_req: Request, res: Response) => {
  res.json({
    sources: sourceRegistry.list(),
  });
});

// Greenhouse board direct fetch endpoint
app.get("/api/sources/greenhouse", async (req: Request, res: Response) => {
  try {
    const boardToken = typeof req.query.board === "string" ? req.query.board : "gitlab";
    const searchTerm = typeof req.query.searchTerm === "string" ? req.query.searchTerm : undefined;
    const adapter = sourceRegistry.get("greenhouse") as GreenhouseAdapter;

    const jobs = await adapter.fetchJobs({
      boardToken,
      searchTerm,
    });

    return res.json({
      success: true,
      source: "greenhouse",
      board: boardToken,
      count: jobs.length,
      jobs,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch Greenhouse postings";
    return res.status(500).json({ success: false, error: message });
  }
});

// Greenhouse single-job availability check
app.get("/api/sources/greenhouse/check", async (req: Request, res: Response) => {
  try {
    const boardToken = typeof req.query.board === "string" ? req.query.board : "gitlab";
    const jobId = typeof req.query.id === "string" ? req.query.id : "";
    if (!jobId) {
      return res.status(400).json({ success: false, error: "Missing 'id' parameter" });
    }

    const adapter = sourceRegistry.get("greenhouse") as GreenhouseAdapter;
    const result = await adapter.checkAvailability(jobId, { boardToken });
    return res.json({ success: true, jobId, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Check failed";
    return res.status(500).json({ success: false, error: message });
  }
});

// Lever postings direct fetch endpoint
app.get("/api/sources/lever", async (req: Request, res: Response) => {
  try {
    const company = typeof req.query.company === "string" ? req.query.company : "palantir";
    const searchTerm = typeof req.query.searchTerm === "string" ? req.query.searchTerm : undefined;
    const adapter = sourceRegistry.get("lever") as LeverAdapter;

    const jobs = await adapter.fetchJobs({
      company,
      searchTerm,
    });

    return res.json({
      success: true,
      source: "lever",
      company,
      count: jobs.length,
      jobs,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch Lever postings";
    return res.status(500).json({ success: false, error: message });
  }
});

// Lever single-job availability check
app.get("/api/sources/lever/check", async (req: Request, res: Response) => {
  try {
    const company = typeof req.query.company === "string" ? req.query.company : "palantir";
    const jobId = typeof req.query.id === "string" ? req.query.id : "";
    if (!jobId) {
      return res.status(400).json({ success: false, error: "Missing 'id' parameter" });
    }

    const adapter = sourceRegistry.get("lever") as LeverAdapter;
    const result = await adapter.checkAvailability(jobId, { company });
    return res.json({ success: true, jobId, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Check failed";
    return res.status(500).json({ success: false, error: message });
  }
});

// Manual Job Entry endpoint (with deduplication & persistent storage)
app.post("/api/jobs/manual", async (req: Request, res: Response) => {
  try {
    const parsed = RawJobPostingSchema.safeParse({
      ...req.body,
      id: req.body.id || `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      site: req.body.site || "manual",
    });

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid job posting fields",
        details: parsed.error.flatten(),
      });
    }

    const result = await ingestRawPostings([parsed.data]);
    return res.json({
      success: true,
      message: "Job processed and persisted",
      result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process manual job entry";
    return res.status(500).json({ success: false, error: message });
  }
});

// Trigger a scrape across JobSpy sources (Indeed, LinkedIn, Glassdoor, ZipRecruiter, Google) and persist
app.post("/api/sources/jobspy/scrape", async (req: Request, res: Response) => {
  try {
    const parseResult = JobSpyQuerySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid query parameters",
        details: parseResult.error.flatten(),
      });
    }

    const scrapeResult = await runJobSpyScraper(parseResult.data);
    const ingestResult = await ingestRawPostings(scrapeResult.jobs);

    return res.json({
      ...scrapeResult,
      persistence: ingestResult,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to execute JobSpy scrape";
    return res.status(500).json({
      success: false,
      error: message,
    });
  }
});

// Fast test endpoint for immediate verification
app.get("/api/sources/jobspy/test", async (req: Request, res: Response) => {
  try {
    const searchTerm = typeof req.query.searchTerm === "string" ? req.query.searchTerm : "Software Engineer";
    const location = typeof req.query.location === "string" ? req.query.location : "Doylestown, PA";
    const site = typeof req.query.site === "string" ? req.query.site : "indeed";
    const resultsWanted = parseInt(typeof req.query.resultsWanted === "string" ? req.query.resultsWanted : "2", 10);

    const result = await runJobSpyScraper({
      searchTerm,
      location,
      sites: [site],
      resultsWanted,
    });

    return res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Test query failed";
    return res.status(500).json({
      success: false,
      error: message,
    });
  }
});

app.listen(port, host, () => {
  console.log(`[Job Tracker Server] Listening on http://${host}:${port}`);
});

export default app;
