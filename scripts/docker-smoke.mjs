import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const repositoryRoot = new URL("../", import.meta.url);
const rootPath = decodeURIComponent(repositoryRoot.pathname);
const resourceId = randomUUID();
const image = `job-tracker-smoke:${resourceId.slice(0, 12)}`;
const network = `job-tracker-smoke-${resourceId}`;
const jobspyVolume = `job-tracker-jobspy-smoke-${resourceId}`;
const databaseContainer = `job-tracker-db-smoke-${resourceId}`;
const firstAppContainer = `job-tracker-app-smoke-${resourceId}`;
const restartedAppContainer = `job-tracker-app-restarted-smoke-${resourceId}`;
const postgresPassword = randomUUID();
const apiSecret = randomUUID();
const appContainers = new Set();
const cleanupErrors = [];
let imageBuilt = false;
let networkCreated = false;
let volumeCreated = false;
let databaseStarted = false;
let testError;

function docker(args, { timeout = 30_000, inheritOutput = false } = {}) {
  const result = spawnSync("docker", args, {
    cwd: rootPath,
    encoding: "utf8",
    timeout,
    maxBuffer: 20 * 1024 * 1024,
    stdio: inheritOutput ? "inherit" : "pipe",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const details = `${result.stderr ?? ""}\n${result.stdout ?? ""}`.trim() || "no command output";
    throw new Error(`docker ${args[0]} failed: ${details}`);
  }
  return String(result.stdout ?? "").trim();
}

function outputFor(error) {
  return error instanceof Error ? error.message : String(error);
}

function loopbackPort(container, privatePort) {
  const output = docker(["port", container, `${privatePort}/tcp`]);
  const match = output.match(/^127\.0\.0\.1:(\d+)$/m);
  assert.ok(match, `Expected a loopback-only port mapping, received: ${output}`);
  return Number(match[1]);
}

async function waitFor(description, check, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "not ready";

  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = outputFor(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${description}: ${lastError}`);
}

async function waitForPostgres() {
  await waitFor("the disposable PostgreSQL container", () => {
    docker([
      "exec",
      databaseContainer,
      "pg_isready",
      "-U",
      "job_tracker",
      "-d",
      "job_tracker_docker_smoke",
    ]);
    return true;
  });
}

async function waitForAppHealth(container, baseUrl) {
  try {
    await waitFor(`the ${container} readiness endpoint`, async () => {
      const response = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) {
        throw new Error(`GET /api/health returned HTTP ${response.status}`);
      }
      const body = await response.json();
      assert.equal(body.status, "healthy");
      return true;
    });
    await waitFor(`the ${container} Docker health check`, () => {
      const status = docker([
        "inspect",
        "--format={{.State.Health.Status}}",
        container,
      ]);
      if (status === "unhealthy") {
        throw new Error(`Docker health check failed:\n${docker(["logs", container])}`);
      }
      return status === "healthy";
    }, 30_000);
  } catch (error) {
    let logs = "";
    try {
      logs = docker(["logs", container]);
    } catch (logError) {
      logs = outputFor(logError);
    }
    throw new Error(`${outputFor(error)}\nContainer logs:\n${logs}`);
  }
}

async function requestJson(baseUrl, route, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${route} returned non-JSON HTTP ${response.status}: ${text}`);
  }
  return { response, value };
}

function startApp(containerName) {
  docker([
    "run",
    "--detach",
    "--name",
    containerName,
    "--network",
    network,
    "--publish",
    "127.0.0.1::3000",
    "--volume",
    `${jobspyVolume}:/jobspy-test:ro`,
    "--env",
    "NODE_ENV=production",
    "--env",
    "PORT=3000",
    "--env",
    "HOST=0.0.0.0",
    "--env",
    `DATABASE_URL=postgresql://job_tracker:${postgresPassword}@db:5432/job_tracker_docker_smoke`,
    "--env",
    "DATABASE_SSL=false",
    "--env",
    "ALLOWED_USER_EMAIL=docker-smoke@local",
    "--env",
    `API_SECRET_KEY=${apiSecret}`,
    "--env",
    "PYTHON_PATH=/opt/jobspy-venv/bin/python",
    "--env",
    "PYTHONPATH=/jobspy-test",
    "--health-interval=2s",
    "--health-timeout=2s",
    "--health-retries=3",
    image,
  ]);
  appContainers.add(containerName);
  const port = loopbackPort(containerName, 3000);
  return `http://127.0.0.1:${port}`;
}

function removeResource(args, missingPattern) {
  try {
    docker(args);
  } catch (error) {
    if (!missingPattern.test(outputFor(error))) cleanupErrors.push(error);
  }
}

async function runSmokeTest() {
  docker(["build", "--tag", image, "."], {
    timeout: 600_000,
    inheritOutput: true,
  });
  imageBuilt = true;

  const pythonModulePath = docker([
    "run",
    "--rm",
    "--network",
    "none",
    image,
    "/opt/jobspy-venv/bin/python",
    "-c",
    "import jobspy; print(jobspy.__file__)",
  ]);
  assert.match(pythonModulePath, /site-packages/);

  docker(["network", "create", network]);
  networkCreated = true;
  docker(["volume", "create", jobspyVolume]);
  volumeCreated = true;

  docker([
    "run",
    "--detach",
    "--name",
    databaseContainer,
    "--network",
    network,
    "--network-alias",
    "db",
    "--env",
    "POSTGRES_DB=job_tracker_docker_smoke",
    "--env",
    "POSTGRES_USER=job_tracker",
    "--env",
    `POSTGRES_PASSWORD=${postgresPassword}`,
    "postgres:16-alpine",
  ]);
  databaseStarted = true;
  await waitForPostgres();

  const failingJobspyModule = [
    "def scrape_jobs(**kwargs):",
    '    raise RuntimeError("synthetic JobSpy upstream failure")',
    "",
  ].join("\n");
  const seedModule = [
    "import { writeFileSync } from 'node:fs';",
    `writeFileSync('/jobspy-test/jobspy.py', ${JSON.stringify(failingJobspyModule)});`,
  ].join("\n");
  docker([
    "run",
    "--rm",
    "--network",
    "none",
    "--user",
    "0:0",
    "--volume",
    `${jobspyVolume}:/jobspy-test`,
    image,
    "node",
    "--input-type=module",
    "-e",
    seedModule,
  ]);

  const firstBaseUrl = startApp(firstAppContainer);
  await waitForAppHealth(firstAppContainer, firstBaseUrl);

  const marker = randomUUID();
  const manualPosting = await requestJson(firstBaseUrl, "/api/jobs/manual", {
    method: "POST",
    token: apiSecret,
    body: {
      id: `docker-smoke-${marker}`,
      site: "manual",
      job_url: `https://example.test/jobs/${marker}`,
      title: "Docker Persistence Smoke Test",
      company: "Docker Persistence Smoke Company",
      description: "Sanitized posting written by the container smoke test.",
      location: "Remote, US",
    },
  });
  assert.equal(manualPosting.response.status, 200, JSON.stringify(manualPosting.value));
  assert.equal(manualPosting.value.success, true);

  const jobspyFailure = await requestJson(firstBaseUrl, "/api/sources/jobspy/scrape", {
    method: "POST",
    token: apiSecret,
    body: {
      searchTerm: "Smoke test",
      sites: ["indeed"],
      resultsWanted: 1,
    },
  });
  assert.equal(jobspyFailure.response.status, 200, JSON.stringify(jobspyFailure.value));
  assert.equal(jobspyFailure.value.success, false);
  assert.match(jobspyFailure.value.errors.scrape_execution, /synthetic JobSpy upstream failure/);

  docker(["rm", "--force", firstAppContainer]);
  appContainers.delete(firstAppContainer);

  const restartedBaseUrl = startApp(restartedAppContainer);
  await waitForAppHealth(restartedAppContainer, restartedBaseUrl);
  const persistedJobs = await requestJson(
    restartedBaseUrl,
    "/api/jobs?company=Docker%20Persistence%20Smoke%20Company",
    { token: apiSecret }
  );
  assert.equal(persistedJobs.response.status, 200);
  assert.ok(
    persistedJobs.value.postings.some(
      (posting) => posting.title === "Docker Persistence Smoke Test"
    ),
    "A posting written through the production API must remain after recreating the app container"
  );
}

try {
  await runSmokeTest();
} catch (error) {
  testError = error;
}

for (const container of appContainers) {
  removeResource(["rm", "--force", container], /No such container/i);
}
if (databaseStarted) {
  removeResource(["rm", "--force", databaseContainer], /No such container/i);
}
if (volumeCreated) {
  removeResource(["volume", "rm", "--force", jobspyVolume], /No such volume/i);
}
if (networkCreated) {
  removeResource(["network", "rm", network], /No such network/i);
}
if (imageBuilt) {
  removeResource(["image", "rm", "--force", image], /No such image/i);
}

if (testError && cleanupErrors.length > 0) {
  throw new AggregateError([testError, ...cleanupErrors], "Docker smoke test and cleanup failed");
}
if (testError) {
  throw testError;
}
if (cleanupErrors.length > 0) {
  throw new AggregateError(cleanupErrors, "Docker smoke test cleanup failed");
}

console.log(
  "Docker smoke test passed: production image, Python JobSpy runtime, readiness health check, API persistence after app recreation, and structured JobSpy failure."
);
