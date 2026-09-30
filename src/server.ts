import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { runJobSpyScraper } from "./bridges/jobspy-bridge";
import { JobSpyQuerySchema, RawJobPostingSchema } from "./types/job";
import { sourceRegistry } from "./adapters";
import { GreenhouseAdapter } from "./adapters/greenhouse-adapter";
import { LeverAdapter } from "./adapters/lever-adapter";
import { getRepository } from "./db";
import { checkDatabaseConnection } from "./db/connection";
import { runMigrations } from "./db/migrations/migrator";
import { ingestRawPostings } from "./pipeline/ingestion-pipeline";
import { loadSearchProfile } from "./config/search-profile";
import { geminiAgent } from "./ai/gemini-agent";
import { GeminiAgent } from "./ai/agent/gemini-agent";
import { Conversation } from "./ai/agent/conversation";
import { authMiddleware } from "./middleware/auth";
import { resolveGeminiApiKey } from "./ai/key-resolver";

dotenv.config();

const app = express();
const interactiveAgent = new GeminiAgent();
// AI Studio dev server runs on port 3000 (nginx proxy runs on 8080)
const port = 3000;
const host = "0.0.0.0";

app.use(cors());
app.use(express.json());
app.use(authMiddleware);

// Root health & meta endpoint
app.get("/", (_req: Request, res: Response) => {
  const { engine } = getRepository();
  const profile = loadSearchProfile();
  res.json({
    status: "ok",
    service: "Job Tracker Backend",
    version: "0.4.0",
    persistenceEngine: engine,
    activeSearchProfile: profile.name,
    supportedSources: sourceRegistry.list(),
  });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "healthy" });
});

// Operational Readiness & Health Check Endpoint
app.get("/api/health", (_req: Request, res: Response) => {
  const { engine } = getRepository();
  const profile = loadSearchProfile();
  const keyInfo = resolveGeminiApiKey();
  const hasGeminiKey = Boolean(keyInfo.apiKey);
  const hasJevKey = Boolean(
    (process.env.TYPESAFE_API_KEY && process.env.TYPESAFE_API_KEY.trim() !== "") ||
    (process.env.TYPESAFE_AI_API_KEY && process.env.TYPESAFE_AI_API_KEY.trim() !== "")
  );

  res.json({
    status: "healthy",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    service: "Job Tracker Backend",
    version: "0.4.0",
    persistence: {
      engine,
      activeProfile: profile.name,
    },
    aiProviders: {
      geminiInteractions: {
        configured: hasGeminiKey,
        tier: keyInfo.tier,
        failoverActive: keyInfo.failoverActive,
        mode: hasGeminiKey ? "live" : "resilient-offline-simulation",
        model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
      },
      jevScreening: {
        configured: hasJevKey,
        mode: hasJevKey ? "live" : "simulated-scoring",
      },
    },
  });
});

// Search Profile endpoint
app.get("/api/profile", (_req: Request, res: Response) => {
  try {
    const profile = loadSearchProfile();
    res.json({ success: true, profile });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load profile";
    res.status(500).json({ success: false, error: message });
  }
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
    const missingSalary = req.query.missingSalary === "true";
    const missingLocation = req.query.missingLocation === "true";
    const sortBy = req.query.sortBy === "jev_confidence" ? "jev_confidence" : "created_at";
    const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";
    const limit = parseInt(typeof req.query.limit === "string" ? req.query.limit : "50", 10);
    const offset = parseInt(typeof req.query.offset === "string" ? req.query.offset : "0", 10);

    const postings = await repository.listPostings({
      jobStatus,
      availability,
      company,
      missingSalary,
      missingLocation,
      sortBy,
      sortOrder,
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

// Update Job Workflow Status (e.g. save, dismiss, reviewing)
app.patch("/api/jobs/:id/status", async (req: Request, res: Response) => {
  try {
    const { repository } = getRepository();
    const { status, reason } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, error: "Missing 'status' in request body" });
    }

    await repository.updateStatus(req.params.id, status, "user", reason);
    const updated = await repository.getById(req.params.id);
    return res.json({ success: true, job: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update job status";
    return res.status(500).json({ success: false, error: message });
  }
});

// ====================================================================
// Candidate Profile Endpoints (requirements/api.md section 2.3)
// ====================================================================
const candidateProfilePath = path.join(process.cwd(), "config", "candidate_profile.json");

app.get("/api/candidate-profile", (_req: Request, res: Response) => {
  try {
    if (fs.existsSync(candidateProfilePath)) {
      const data = fs.readFileSync(candidateProfilePath, "utf8");
      return res.json({ success: true, profile: JSON.parse(data) });
    }
    return res.json({
      success: true,
      profile: {
        fullName: "Candidate",
        email: process.env.ALLOWED_USER_EMAIL || "candidate@example.com",
        skills: [],
        yearsExperience: 5,
        bio: "",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to read candidate profile";
    return res.status(500).json({ success: false, error: message });
  }
});

app.put("/api/candidate-profile", (req: Request, res: Response) => {
  try {
    const profile = req.body;
    if (!profile || typeof profile !== "object") {
      return res.status(400).json({ success: false, error: "Invalid profile data" });
    }
    fs.writeFileSync(candidateProfilePath, JSON.stringify(profile, null, 2), "utf8");
    return res.json({ success: true, profile });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to write candidate profile";
    return res.status(500).json({ success: false, error: message });
  }
});

// ====================================================================
// Applications Management Endpoints (requirements/api.md section 2.1)
// ====================================================================
app.get("/api/applications", async (req: Request, res: Response) => {
  try {
    const { repository } = getRepository();
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const applications = await repository.listApplications({ status });
    return res.json({ success: true, count: applications.length, applications });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list applications";
    return res.status(500).json({ success: false, error: message });
  }
});

app.get("/api/applications/:id", async (req: Request, res: Response) => {
  try {
    const { repository } = getRepository();
    const application = await repository.getApplication(req.params.id);
    if (!application) {
      return res.status(404).json({ success: false, error: "Application not found" });
    }
    return res.json({ success: true, application });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to get application";
    return res.status(500).json({ success: false, error: message });
  }
});

app.post("/api/applications", async (req: Request, res: Response) => {
  try {
    const { repository } = getRepository();
    const { job_posting_id, status, application_url, applied_at, next_action_date, user_notes } = req.body;
    if (!job_posting_id) {
      return res.status(400).json({ success: false, error: "Missing 'job_posting_id'" });
    }

    const job = await repository.getById(job_posting_id);
    if (!job) {
      return res.status(404).json({ success: false, error: "Job posting not found" });
    }

    const now = new Date().toISOString();
    const initialStatus = status || "preparing";
    const appData = {
      id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      job_posting_id,
      status: initialStatus,
      application_url: application_url || job.application_url || job.canonical_url || null,
      applied_at: initialStatus === "applied" ? (applied_at || now) : (applied_at || null),
      next_action_date: next_action_date || null,
      user_notes: user_notes || null,
      stage_history: [
        {
          stage: initialStatus,
          entered_at: now,
          notes: user_notes || "Initial application created",
        },
      ],
    };

    const saved = await repository.saveApplication(appData);
    return res.status(201).json({ success: true, application: saved });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create application";
    return res.status(500).json({ success: false, error: message });
  }
});

app.patch("/api/applications/:id", async (req: Request, res: Response) => {
  try {
    const { repository } = getRepository();
    const existing = await repository.getApplication(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Application not found" });
    }

    const { status, next_action_date, user_notes, application_url } = req.body;
    const now = new Date().toISOString();
    const stageHistory = [...(existing.stage_history || [])];

    if (status && status !== existing.status) {
      stageHistory.push({
        stage: status,
        entered_at: now,
        notes: user_notes || `Status advanced to ${status}`,
      });
    }

    const updated = await repository.saveApplication({
      ...existing,
      status: status || existing.status,
      next_action_date: next_action_date !== undefined ? next_action_date : existing.next_action_date,
      user_notes: user_notes !== undefined ? user_notes : existing.user_notes,
      application_url: application_url !== undefined ? application_url : existing.application_url,
      stage_history: stageHistory,
    });

    return res.json({ success: true, application: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update application";
    return res.status(500).json({ success: false, error: message });
  }
});

app.delete("/api/applications/:id", async (req: Request, res: Response) => {
  try {
    const { repository } = getRepository();
    await repository.deleteApplication(req.params.id);
    return res.json({ success: true, message: "Application deleted" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete application";
    return res.status(500).json({ success: false, error: message });
  }
});

// ====================================================================
// Metrics & Funnel Dashboard (requirements/api.md section 2.2)
// ====================================================================
app.get("/api/dashboard/metrics", async (req: Request, res: Response) => {
  try {
    const { repository } = getRepository();
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;

    const metrics = await repository.getMetrics({ startDate, endDate });
    return res.json({ success: true, metrics });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to compute dashboard metrics";
    return res.status(500).json({ success: false, error: message });
  }
});

// Interactive AI Agent (System 2): Deep Qualification Analysis
app.post("/api/jobs/:id/analyze", async (req: Request, res: Response) => {
  try {
    const { repository } = getRepository();
    const job = await repository.getById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, error: "Job posting not found" });
    }

    const analysis = await geminiAgent.generateDeepAnalysis(job);
    return res.json({ success: true, jobId: job.id, analysis });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    return res.status(500).json({ success: false, error: message });
  }
});

// Interactive AI Agent (System 2): Cover Letter Drafting
app.post("/api/jobs/:id/cover-letter", async (req: Request, res: Response) => {
  try {
    const { repository } = getRepository();
    const job = await repository.getById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, error: "Job posting not found" });
    }

    const userNotes = typeof req.body.notes === "string" ? req.body.notes : undefined;
    const coverLetter = await geminiAgent.generateCoverLetter(job, userNotes);
    return res.json({ success: true, jobId: job.id, ...coverLetter });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Cover letter generation failed";
    return res.status(500).json({ success: false, error: message });
  }
});

// ====================================================================
// Tier 2 Conversational AI Agent Endpoints (first-agent architecture)
// ====================================================================

// Create a new conversational session
app.post("/api/agent/conversations", async (req: Request, res: Response) => {
  try {
    const { repository } = getRepository();
    const title = typeof req.body.title === "string" ? req.body.title : undefined;
    const initialJobId = typeof req.body.jobId === "string" ? req.body.jobId : undefined;

    const conv = new Conversation({ title });
    if (initialJobId) {
      conv.tagJobId(initialJobId);
    }

    await repository.saveConversation(conv);
    return res.json({ success: true, conversation: conv.toJSON() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create conversation";
    return res.status(500).json({ success: false, error: message });
  }
});

// List conversations (optional filter by referenced jobId)
app.get("/api/agent/conversations", async (req: Request, res: Response) => {
  try {
    const { repository } = getRepository();
    const jobId = typeof req.query.jobId === "string" ? req.query.jobId : undefined;
    const limit = parseInt(typeof req.query.limit === "string" ? req.query.limit : "20", 10);

    const list = await repository.listConversations({ jobId, limit });
    return res.json({
      success: true,
      count: list.length,
      conversations: list.map((c) => c.toJSON()),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list conversations";
    return res.status(500).json({ success: false, error: message });
  }
});

// Retrieve a specific conversation by ID
app.get("/api/agent/conversations/:id", async (req: Request, res: Response) => {
  try {
    const { repository } = getRepository();
    const conv = await repository.getConversation(req.params.id);
    if (!conv) {
      return res.status(404).json({ success: false, error: "Conversation not found" });
    }
    return res.json({ success: true, conversation: conv.toJSON() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to retrieve conversation";
    return res.status(500).json({ success: false, error: message });
  }
});

// Send a message turn to the agent
app.post("/api/agent/conversations/:id/messages", async (req: Request, res: Response) => {
  try {
    const { repository } = getRepository();
    const conv = await repository.getConversation(req.params.id);
    if (!conv) {
      return res.status(404).json({ success: false, error: "Conversation not found" });
    }

    const prompt = req.body.message;
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ success: false, error: "Missing 'message' string in request body" });
    }

    const userRole = req.user?.role || "owner";
    const agent = new GeminiAgent({ role: userRole });
    const turnResult = await agent.run(prompt, conv);
    await repository.saveConversation(conv);

    const keyResolution = resolveGeminiApiKey({ role: userRole });

    return res.json({
      success: true,
      text: turnResult.text,
      toolCalls: turnResult.toolCalls,
      conversation: conv.toJSON(),
      aiTelemetry: {
        role: userRole,
        tier: keyResolution.tier,
        failoverActive: keyResolution.failoverActive,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Agent turn failed";
    return res.status(500).json({ success: false, error: message });
  }
});

// Delete a conversation
app.delete("/api/agent/conversations/:id", async (req: Request, res: Response) => {
  try {
    const { repository } = getRepository();
    await repository.deleteConversation(req.params.id);
    return res.json({ success: true, message: "Conversation deleted successfully" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete conversation";
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

if (require.main === module) {
  const startServer = async () => {
    // If running in development with Vite or production with built static files
    const isProd = process.env.NODE_ENV === "production";
    const clientDistPath = path.join(process.cwd(), "dist", "client");

    if (isProd && fs.existsSync(clientDistPath)) {
      app.use(express.static(clientDistPath));
      app.get("*", (req: Request, res: Response, next) => {
        if (req.path.startsWith("/api")) return next();
        return res.sendFile(path.join(clientDistPath, "index.html"));
      });
    } else {
      try {
        // Dynamic import to prevent CommonJS typescript resolution error
        const viteModulePath = "vite";
        const { createServer: createViteServer } = await (eval(`import("${viteModulePath}")`) as Promise<any>);
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: "spa",
        });
        app.use(vite.middlewares);
      } catch (err) {
        console.warn("[Job Tracker Server] Vite dev middleware not attached:", err);
      }
    }

    app.listen(port, host, () => {
      console.log(`[Job Tracker Server] Listening on http://${host}:${port}`);
    });
  };

  startServer();
}

export default app;
