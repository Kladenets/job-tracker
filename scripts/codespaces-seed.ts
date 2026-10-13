import { createHash } from "node:crypto";
import { Pool } from "pg";
import { runMigrations } from "../src/db/migrations/migrator.js";

const fixtureSource = "codespaces_fixture";
const fixtureMarker = "codespaces-demo-seed-v1";

const fixtureJobs = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    sourceJobId: "codespaces-demo-001",
    title: "[SYNTHETIC FIXTURE - NOT CURRENT] Senior TypeScript Engineer",
    company: "Example Works (Synthetic)",
    location: "Remote - Example Region",
    workplaceType: "remote",
    employmentType: "full_time",
    seniority: "senior",
    salaryMin: 140000,
    salaryMax: 165000,
    description:
      "Synthetic Codespaces fixture only. This is not a real vacancy, is not current, and must not be used to apply for a job.",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    sourceJobId: "codespaces-demo-002",
    title: "[SYNTHETIC FIXTURE - NOT CURRENT] Full-Stack Developer",
    company: "Demo Systems (Synthetic)",
    location: "Example City, ZZ",
    workplaceType: "hybrid",
    employmentType: "full_time",
    seniority: "mid",
    salaryMin: 110000,
    salaryMax: 130000,
    description:
      "Synthetic Codespaces fixture only. This is not a real vacancy, is not current, and must not be used to apply for a job.",
  },
];

const candidateProfile = {
  fixtureLabel: "SYNTHETIC CODESPACES FIXTURE - NOT A REAL PERSON",
  fullName: "Codespaces Demo Candidate (Synthetic)",
  email: "demo@example.test",
  targetTitle: "Software Engineer",
  skills: ["TypeScript", "React", "PostgreSQL"],
  yearsExperience: 5,
  location: "Example City, ZZ",
  remotePreference: "remote_or_hybrid",
  additionalExperience: "Synthetic profile for local UI development only.",
};

const searchProfile = {
  id: "codespaces-demo-search-profile",
  name: "SYNTHETIC CODESPACES FIXTURE - NOT A REAL PROFILE",
  isActive: true,
  candidate: {
    targetTitles: ["Senior Software Engineer"],
    skills: ["TypeScript", "React", "PostgreSQL"],
    requiresSponsorship: false,
    hasSecurityClearance: false,
  },
  discovery: {
    searchTerms: ["Synthetic fixture search term"],
    targetLocation: {
      city: "Example City",
      state: "ZZ",
      zip: "00000",
      radiusMiles: 25,
      bufferMiles: 0,
    },
  },
  deterministicFilterRules: {
    workplace: {
      allowedTypes: ["remote", "hybrid"],
      maxOnsiteDaysPerWeek: 2,
    },
    compensation: {
      minSalaryAnnual: 100000,
      tolerancePercentage: 10,
      allowMissingSalary: true,
    },
    postingAge: { maxAgeDays: 365 },
    seniority: { excludedLevels: [] },
    title: { excludedTitleKeywords: [] },
    companies: { excludedCompanies: [] },
    workAuthorization: {
      excludeUsCitizenshipOnly: false,
      excludeRequiresActiveClearance: true,
    },
  },
  jevScreening: {
    enabled: false,
    model: "fixture-only",
    minConfidenceRecommend: 0.7,
  },
};

function validateDevelopmentTarget(): string {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The Codespaces fixture seed cannot run in production.");
  }
  if (process.env.JOB_TRACKER_DEV_SEED_ALLOWED !== "true") {
    throw new Error("The Codespaces fixture seed is disabled outside the devcontainer.");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must point to the Codespaces development database.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL for the Codespaces development database.");
  }

  if (
    !["postgres:", "postgresql:"].includes(parsedUrl.protocol) ||
    parsedUrl.hostname !== "db" ||
    parsedUrl.pathname !== "/job_tracker_dev"
  ) {
    throw new Error("Refusing to seed: DATABASE_URL must target db/job_tracker_dev.");
  }
  return databaseUrl;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function getTableRowCounts(
  client: import("pg").PoolClient,
): Promise<Map<string, bigint>> {
  const { rows } = await client.query<{ tablename: string }>(
    `SELECT tablename
     FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> 'schema_migrations'
     ORDER BY tablename`,
  );
  const counts = new Map<string, bigint>();

  for (const { tablename } of rows) {
    const countResult = await client.query<{ row_count: string }>(
      `SELECT COUNT(*)::text AS row_count
       FROM "public".${quoteIdentifier(tablename)}`,
    );
    counts.set(tablename, BigInt(countResult.rows[0].row_count));
  }
  return counts;
}

function hasOnlyExpectedFixtureData(counts: Map<string, bigint>): boolean {
  const expectedJobs = BigInt(fixtureJobs.length);
  const expectedProfiles = 3n;
  return [...counts].every(([table, count]) => {
    if (table === "job_postings") return count === expectedJobs;
    if (table === "user_profiles") return count === expectedProfiles;
    return count === 0n;
  });
}

async function verifyExistingFixtureData(client: import("pg").PoolClient): Promise<boolean> {
  const jobs = await client.query<{ id: string; source: string; source_job_id: string }>(
    `SELECT id, source, source_job_id
     FROM job_postings
     ORDER BY id`,
  );
  if (
    jobs.rows.length !== fixtureJobs.length ||
    fixtureJobs.some((expected) =>
      !jobs.rows.some((job) =>
        job.id === expected.id &&
        job.source === fixtureSource &&
        job.source_job_id === expected.sourceJobId
      )
    )
  ) {
    return false;
  }

  const profiles = await client.query<{ key: string; marker: string | null }>(
    `SELECT key, data->>'marker' AS marker
     FROM user_profiles
     ORDER BY key`,
  );
  const expectedProfileKeys = [
    "candidate_profile",
    "codespaces_fixture_metadata",
    "search_profile",
  ];
  return (
    profiles.rows.length === expectedProfileKeys.length &&
    expectedProfileKeys.every((key) => profiles.rows.some((profile) => profile.key === key)) &&
    profiles.rows.find((profile) => profile.key === "codespaces_fixture_metadata")?.marker === fixtureMarker
  );
}

async function insertFixtureData(client: import("pg").PoolClient): Promise<void> {
  const oldPostingDate = "2020-01-15T00:00:00.000Z";
  for (const job of fixtureJobs) {
    const contentHash = createHash("sha256").update(job.description).digest("hex");
    await client.query(
      `INSERT INTO job_postings (
         id, source, source_job_id, source_url, canonical_url, application_url, content_hash,
         title, company, location, workplace_type, employment_type, seniority,
         salary_min_annual, salary_max_annual, currency, interval, raw_salary_text,
         description_text, date_posted, date_discovered, job_status, availability,
         availability_evidence, jev_fit, jev_confidence, crawler_data
       ) VALUES (
         $1, $2, $3, $4, $4, $4, $5,
         $6, $7, $8, $9, $10, $11,
         $12, $13, 'USD', 'yearly', $14,
         $15, $16, $16, 'discovered', 'unknown',
         'Synthetic fixture; source availability has not been checked.', NULL, NULL, $17
       )`,
      [
        job.id,
        fixtureSource,
        job.sourceJobId,
        `https://example.test/codespaces-fixtures/${job.sourceJobId}`,
        contentHash,
        job.title,
        job.company,
        job.location,
        job.workplaceType,
        job.employmentType,
        job.seniority,
        job.salaryMin,
        job.salaryMax,
        `$${job.salaryMin.toLocaleString()}-$${job.salaryMax.toLocaleString()} (synthetic)`,
        job.description,
        oldPostingDate,
        JSON.stringify({
          source: fixtureSource,
          fixture_label: "SYNTHETIC FIXTURE - NOT CURRENT",
          raw_title: job.title,
        }),
      ],
    );
  }

  const profiles = [
    ["candidate_profile", candidateProfile],
    ["search_profile", searchProfile],
    ["codespaces_fixture_metadata", { marker: fixtureMarker }],
  ] as const;
  for (const [key, profile] of profiles) {
    await client.query(
      "INSERT INTO user_profiles (key, data) VALUES ($1, $2::jsonb)",
      [key, JSON.stringify(profile)],
    );
  }
}

async function seed(): Promise<void> {
  const databaseUrl = validateDevelopmentTarget();
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    max: 1,
  });

  try {
    const migrationResult = await runMigrations({ pool });
    if (!migrationResult.success) {
      throw new Error(`Could not prepare the Codespaces development schema: ${migrationResult.message}`);
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [741029382]);

      const tables = await client.query<{ tablename: string }>(
        `SELECT tablename
         FROM pg_tables
         WHERE schemaname = 'public' AND tablename <> 'schema_migrations'
         ORDER BY tablename`,
      );
      if (tables.rows.length > 0) {
        const lockedTables = tables.rows
          .map(({ tablename }) => `"public".${quoteIdentifier(tablename)}`)
          .join(", ");
        await client.query(`LOCK TABLE ${lockedTables} IN EXCLUSIVE MODE`);
      }

      const counts = await getTableRowCounts(client);
      if ([...counts.values()].every((count) => count === 0n)) {
        await insertFixtureData(client);
        await client.query("COMMIT");
        console.log(
          `Seeded ${fixtureJobs.length} synthetic Codespaces jobs and synthetic profiles. These listings are not real or current.`,
        );
        return;
      }

      if (hasOnlyExpectedFixtureData(counts) && await verifyExistingFixtureData(client)) {
        await client.query("COMMIT");
        console.log("Synthetic Codespaces fixtures are already present; no changes made.");
        return;
      }

      throw new Error(
        "Refusing to seed: the development database is not empty or does not contain only this complete fixture set. Reset the Codespace database before seeding.",
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

seed().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Codespaces fixture seeding failed for an unknown reason.",
  );
  process.exitCode = 1;
});
