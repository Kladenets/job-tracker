import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileJobRepository } from "../../db/file-repository.js";
import { RawJobPostingSchema } from "../../types/job.js";
import { executeDiscoveryBatch } from "../../pipeline/discovery-runner.js";
import { HackerNewsAdapter } from "../hackernews-adapter.js";
import { JobicyAdapter } from "../jobicy-adapter.js";
import { RemoteOkAdapter } from "../remoteok-adapter.js";
import { WeWorkRemotelyAdapter } from "../weworkremotely-adapter.js";
import { sourceRegistry } from "../index.js";

const remoteOkFixture = fs.readFileSync(new URL("./fixtures/remoteok.json", import.meta.url), "utf8");
const jobicyFixture = fs.readFileSync(new URL("./fixtures/jobicy.json", import.meta.url), "utf8");
const hackerNewsStoryFixture = fs.readFileSync(new URL("./fixtures/hn-stories.json", import.meta.url), "utf8");
const hackerNewsCommentsFixture = fs.readFileSync(new URL("./fixtures/hn-comments.json", import.meta.url), "utf8");
const wwrFixture = fs.readFileSync(new URL("./fixtures/wwr.xml", import.meta.url), "utf8");

function jsonResponse(body: string, headers?: HeadersInit): Response {
  return new Response(body, { status: 200, headers });
}

async function runTests(): Promise<void> {
  const registered = sourceRegistry.list();
  for (const source of ["remoteok", "jobicy", "hackernews", "weworkremotely"]) {
    assert.ok(registered.includes(source), `${source} must be registered with the common adapter registry`);
  }

  let remoteRateRequests = 0;
  const retryDelays: number[] = [];
  const remoteOk = new RemoteOkAdapter({
    fetcher: async (_input, init) => {
      remoteRateRequests++;
      if (remoteRateRequests === 1) {
        return new Response("rate limited", {
          status: 429,
          headers: { "Retry-After": "2" },
        });
      }
      assert.equal(new Headers(init?.headers).get("User-Agent"), "JobTracker/1.0 (public job discovery)");
      return jsonResponse(remoteOkFixture, { ETag: '"remoteok-fixture-v1"' });
    },
    sleep: async (delay) => {
      retryDelays.push(delay);
    },
  });
  const remoteJobs = await remoteOk.fetchJobs();
  assert.equal(remoteRateRequests, 2);
  assert.deepEqual(retryDelays, [2_000], "429 responses must honor a bounded Retry-After delay");
  assert.equal(remoteJobs.length, 1);
  assert.equal(remoteJobs[0].id, "remoteok-123");
  assert.equal(remoteJobs[0].company, "Example Remote Company");
  assert.equal(remoteJobs[0].job_url_direct, "https://example.test/careers/platform-engineer");
  assert.equal(remoteJobs[0].min_amount, 140_000);
  RawJobPostingSchema.parse(remoteJobs[0]);

  const jobicy = new JobicyAdapter({
    fetcher: async (input) => {
      const url = new URL(String(input));
      assert.equal(url.hostname, "jobicy.com");
      assert.equal(url.searchParams.get("count"), "50");
      assert.equal(url.searchParams.get("industry"), "tech");
      return jsonResponse(jobicyFixture);
    },
  });
  const jobicyJobs = await jobicy.fetchJobs();
  assert.equal(jobicyJobs.length, 1);
  assert.equal(jobicyJobs[0].id, "jobicy-456");
  assert.equal(jobicyJobs[0].company, "Example Jobicy Company");
  assert.equal(jobicyJobs[0].description, "Build thoughtful software with React.");
  assert.equal(jobicyJobs[0].currency, "USD");
  RawJobPostingSchema.parse(jobicyJobs[0]);

  const hackerNews = new HackerNewsAdapter({
    fetcher: async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "hn.algolia.com") {
        return url.searchParams.get("tags") === "story,author_whoishiring"
          ? jsonResponse(hackerNewsStoryFixture)
          : jsonResponse(hackerNewsCommentsFixture);
      }
      if (url.hostname === "hacker-news.firebaseio.com") {
        return jsonResponse(JSON.stringify({ id: 789012, type: "comment", text: "Active item" }));
      }
      throw new Error(`Unexpected Hacker News URL: ${url.toString()}`);
    },
  });
  const hackerNewsJobs = await hackerNews.fetchJobs();
  assert.equal(hackerNewsJobs.length, 2);
  assert.equal(hackerNewsJobs[0].id, "789012");
  assert.equal(hackerNewsJobs[0].company, "Example Systems");
  assert.equal(hackerNewsJobs[0].title, "Senior Backend Engineer");
  assert.equal(hackerNewsJobs[0].job_url_direct, "https://example.test/careers/backend");
  assert.equal(hackerNewsJobs[0].is_remote, true);
  RawJobPostingSchema.parse(hackerNewsJobs[0]);
  assert.equal((await hackerNews.checkAvailability("789012")).status, "open");

  const cacheHeaders: string[] = [];
  const wwr = new WeWorkRemotelyAdapter({
    fetcher: async (_input, init) => {
      const headers = new Headers(init?.headers);
      cacheHeaders.push(headers.get("If-None-Match") || "");
      return cacheHeaders.at(-1)
        ? new Response(null, { status: 304 })
        : jsonResponse(wwrFixture, { ETag: '"wwr-fixture-v1"' });
    },
  });
  const firstWwrJobs = await wwr.fetchJobs();
  const secondWwrJobs = await wwr.fetchJobs();
  assert.equal(firstWwrJobs.length, 3, "Each configured WWR feed should be consumed");
  assert.equal(secondWwrJobs.length, 3, "HTTP 304 should reuse the cached feed body");
  assert.equal(firstWwrJobs[0].company, "Example WWR Company");
  assert.equal(firstWwrJobs[0].title, "Senior Full Stack Engineer");
  assert.equal(firstWwrJobs[0].location, "United States");
  assert.ok(cacheHeaders.slice(3).every((value) => value === '"wwr-fixture-v1"'));
  RawJobPostingSchema.parse(firstWwrJobs[0]);

  const unavailableWwr = new WeWorkRemotelyAdapter({
    fetcher: async () => new Response("not found", { status: 404 }),
  });
  const wwrClosedResult = await unavailableWwr.checkAvailability("wwr-sanitized-001", {
    url: firstWwrJobs[0].job_url,
  });
  assert.equal(wwrClosedResult.status, "closed");
  assert.match(wwrClosedResult.evidence || "", /404/);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "job-tracker-source-isolation-"));
  try {
    const repository = new FileJobRepository(path.join(directory, "source-store.json"));
    const isolatedBatch = await executeDiscoveryBatch({
      repository,
      sources: ["remoteok", "jobicy"],
      triggerType: "manual",
      concurrency: 2,
      maxAttempts: 1,
      fetchJobs: async (source) => {
        if (source === "remoteok") return remoteJobs;
        throw new Error("Synthetic Jobicy outage");
      },
      ingestJobs: async (jobs) => ({
        totalProcessed: jobs.length,
        newImported: jobs.length,
        filteredOut: 0,
        screenedWithJev: 0,
        duplicatesMatched: 0,
        items: jobs.map((job) => ({
          id: job.id,
          isNew: true,
          title: job.title,
          company: job.company || "Unknown",
          status: "discovered",
          availability: "open",
        })),
      }),
    });
    assert.equal(isolatedBatch.status, "partial");
    assert.equal(isolatedBatch.details.find((item) => item.source === "remoteok")?.status, "succeeded");
    assert.equal(isolatedBatch.details.find((item) => item.source === "jobicy")?.status, "failed");
    assert.match(isolatedBatch.errors[0].error, /Synthetic Jobicy outage/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }

  console.log(
    "Source adapter tests passed: RemoteOK, Jobicy, Hacker News, WWR, common-contract validation, cache validators, Retry-After handling, and per-source failure isolation."
  );
}

runTests().catch((error: unknown) => {
  console.error("Source adapter tests failed:", error);
  process.exitCode = 1;
});
