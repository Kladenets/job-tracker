import assert from "node:assert";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

console.log("=== Running End-to-End HTTP API Endpoint Tests ===");

// Helper to make local HTTP requests to the Express app
function makeRequest(
  server: http.Server,
  options: {
    method: string;
    path: string;
    body?: any;
    headers?: Record<string, string>;
  }
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const address = server.address();
    if (!address || typeof address === "string") {
      return reject(new Error("Server address not available"));
    }

    const payload = options.body ? JSON.stringify(options.body) : undefined;
    const reqHeaders: Record<string, string> = {
      ...(options.headers || {}),
      ...(payload
        ? {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload).toString(),
          }
        : {}),
    };

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: address.port,
        path: options.path,
        method: options.method,
        headers: reqHeaders,
      },
      (res) => {
        let rawData = "";
        res.on("data", (chunk) => {
          rawData += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = rawData ? JSON.parse(rawData) : null;
            resolve({ statusCode: res.statusCode || 500, headers: res.headers, body: parsed });
          } catch {
            resolve({ statusCode: res.statusCode || 500, headers: res.headers, body: rawData });
          }
        });
      }
    );

    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function runApiTests() {
  const originalEnv = { ...process.env };
  const testDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "job-tracker-api-"));
  process.env.NODE_ENV = "test";
  process.env.JOB_TRACKER_FORCE_FILE = "true";
  process.env.JOB_TRACKER_STORE_PATH = path.join(testDataDirectory, "job_tracker_store.json");
  const app = require("../../server").default;
  // Start ephemeral test server on random port
  const testServer = http.createServer(app);
  await new Promise<void>((resolve) => testServer.listen(0, "127.0.0.1", () => resolve()));

  try {
    // 1. Test GET /api/candidate-profile
    console.log("[Test 1] Testing GET /api/candidate-profile...");
    const profileRes = await makeRequest(testServer, {
      method: "GET",
      path: "/api/candidate-profile",
    });
    assert.strictEqual(profileRes.statusCode, 200, "Profile endpoint returns 200");
    assert.strictEqual(profileRes.body.success, true, "Profile response marked success");
    assert.ok(Array.isArray(profileRes.body.profile.skills), "Profile has skills array");
    console.log("✓ GET /api/candidate-profile returned candidate profile");

    // 2. Test PUT /api/candidate-profile
    console.log("[Test 2] Testing PUT /api/candidate-profile...");
    const updatedBio = `Test bio updated at ${new Date().toISOString()}`;
    const updateRes = await makeRequest(testServer, {
      method: "PUT",
      path: "/api/candidate-profile",
      body: {
        ...profileRes.body.profile,
        bio: updatedBio,
      },
    });
    assert.strictEqual(updateRes.statusCode, 200, "Profile update returns 200");
    assert.strictEqual(updateRes.body.profile.bio, updatedBio, "Updated bio matches");
    console.log("✓ PUT /api/candidate-profile persisted updated profile to repository");

    // 2a. Test resume upload persists normalized resume and derived profile to the repository
    const resumeUploadRes = await makeRequest(testServer, {
      method: "POST",
      path: "/api/candidate-profile/upload-resume",
      body: {
        fileName: "api-test-resume.json",
        content: JSON.stringify({
          basics: { name: "API Test Candidate", label: "Platform Engineer" },
          work: [{ company: "Example Co", position: "Engineer", startDate: "2020-01", endDate: "2024-01" }],
          skills: [{ name: "Backend", keywords: ["Node.js", "PostgreSQL"] }],
        }),
      },
    });
    assert.strictEqual(resumeUploadRes.statusCode, 200);
    const reloadedProfileRes = await makeRequest(testServer, {
      method: "GET",
      path: "/api/candidate-profile",
    });
    assert.strictEqual(reloadedProfileRes.statusCode, 200);
    assert.strictEqual(reloadedProfileRes.body.resumeData.basics.name, "API Test Candidate");
    assert.strictEqual(reloadedProfileRes.body.profile.targetTitle, "Platform Engineer");
    assert.ok(reloadedProfileRes.body.profile.skills.includes("PostgreSQL"));
    console.log("✓ Resume upload and derived candidate profile reload from the selected repository");

    // 2b. Test GET & PUT /api/search-profile repository persistence
    console.log("[Test 2b] Testing GET /api/search-profile & PUT /api/search-profile...");
    const searchRes = await makeRequest(testServer, {
      method: "GET",
      path: "/api/search-profile",
    });
    assert.strictEqual(searchRes.statusCode, 200, "Search profile returns 200");
    assert.ok(searchRes.body.profile, "Search profile returned");

    const putSearchRes = await makeRequest(testServer, {
      method: "PUT",
      path: "/api/search-profile",
      body: {
        ...searchRes.body.profile,
        name: "Updated Full-Stack Remote",
      },
    });
    assert.strictEqual(putSearchRes.statusCode, 200, "Search profile PUT returns 200");
    assert.strictEqual(putSearchRes.body.profile.name, "Updated Full-Stack Remote");
    const persistedSearchRes = await makeRequest(testServer, {
      method: "GET",
      path: "/api/search-profile",
    });
    assert.strictEqual(persistedSearchRes.body.profile.name, "Updated Full-Stack Remote");
    console.log("✓ GET & PUT /api/search-profile persisted to repository");

    // 3. Test POST /api/jobs/manual to create a test job
    console.log("[Test 3] Testing POST /api/jobs/manual...");
    const manualJobRes = await makeRequest(testServer, {
      method: "POST",
      path: "/api/jobs/manual",
      body: {
        title: "Staff Platform Engineer",
        company: "Venture Corp",
        location: "Remote",
        description: "Looking for an expert distributed systems engineer.",
        min_amount: 175000,
        max_amount: 200000,
        job_url_direct: "https://venturecorp.example.com/jobs/staff-eng",
      },
    });
    assert.strictEqual(manualJobRes.statusCode, 200, "Manual job entry returns 200");
    const createdJob = manualJobRes.body.result.items[0];
    assert.ok(createdJob.id, "Created job has an ID");
    console.log(`✓ POST /api/jobs/manual created job ${createdJob.id}`);

    // 4. Test PATCH /api/jobs/:id/status
    console.log("[Test 4] Testing PATCH /api/jobs/:id/status...");
    const statusPatchRes = await makeRequest(testServer, {
      method: "PATCH",
      path: `/api/jobs/${createdJob.id}/status`,
      body: {
        status: "saved",
        reason: "User bookmarked job for application",
      },
    });
    assert.strictEqual(statusPatchRes.statusCode, 200, "Status patch returns 200");
    assert.strictEqual(statusPatchRes.body.job.job_status, "saved", "Job status updated to saved");
    console.log("✓ PATCH /api/jobs/:id/status advanced job workflow status to 'saved'");

    // 5. Test POST /api/applications
    console.log("[Test 5] Testing POST /api/applications...");
    const createPostAppRes = await makeRequest(testServer, {
      method: "POST",
      path: "/api/applications",
      body: {
        job_posting_id: createdJob.id,
        status: "applied",
        user_notes: "Applied via direct careers page.",
      },
    });
    assert.strictEqual(createPostAppRes.statusCode, 201, "Create application returns 201");
    const createdApp = createPostAppRes.body.application;
    assert.strictEqual(createdApp.job_posting_id, createdJob.id, "Application links to correct job");
    assert.strictEqual(createdApp.status, "applied", "Application stage is applied");
    console.log(`✓ POST /api/applications created application ${createdApp.id}`);

    // 6. Test GET /api/applications (with joined job metadata)
    console.log("[Test 6] Testing GET /api/applications...");
    const listAppsRes = await makeRequest(testServer, {
      method: "GET",
      path: "/api/applications",
    });
    assert.strictEqual(listAppsRes.statusCode, 200, "List applications returns 200");
    const foundApp = listAppsRes.body.applications.find((a: any) => a.id === createdApp.id);
    assert.ok(foundApp, "Created application is present in list");
    assert.strictEqual(foundApp.job.title, "Staff Platform Engineer", "Joined job title verified");
    console.log("✓ GET /api/applications verified with enriched job relation");

    // 7. Test PATCH /api/applications/:id
    console.log("[Test 7] Testing PATCH /api/applications/:id...");
    const patchAppRes = await makeRequest(testServer, {
      method: "PATCH",
      path: `/api/applications/${createdApp.id}`,
      body: {
        status: "recruiter_screen",
        user_notes: "Recruiter emailed to set up 30min intro call.",
      },
    });
    assert.strictEqual(patchAppRes.statusCode, 200, "Patch application returns 200");
    assert.strictEqual(patchAppRes.body.application.status, "recruiter_screen", "Status updated");
    assert.strictEqual(patchAppRes.body.application.stage_history.length, 2, "Stage history appended transition");
    console.log("✓ PATCH /api/applications/:id updated stage with history tracking");

    // 8. Test GET /api/dashboard/metrics
    console.log("[Test 8] Testing GET /api/dashboard/metrics...");
    const metricsRes = await makeRequest(testServer, {
      method: "GET",
      path: "/api/dashboard/metrics",
    });
    assert.strictEqual(metricsRes.statusCode, 200, "Metrics endpoint returns 200");
    assert.ok(metricsRes.body.metrics.funnel.discoveredCount > 0, "Discovered count > 0");
    assert.ok(metricsRes.body.metrics.applications.appliedCount > 0, "Applied count > 0");
    assert.strictEqual(metricsRes.body.metrics.applications.isSmallSample, true, "Small sample guard active");
    console.log("✓ GET /api/dashboard/metrics returned valid funnel and conversion rates");

    // 9. Test DELETE /api/applications/:id
    console.log("[Test 9] Testing DELETE /api/applications/:id...");
    const deleteAppRes = await makeRequest(testServer, {
      method: "DELETE",
      path: `/api/applications/${createdApp.id}`,
    });
    assert.strictEqual(deleteAppRes.statusCode, 200, "Delete application returns 200");
    console.log("✓ DELETE /api/applications/:id deleted application cleanly");

    // 10. Production guest boundary and public job sanitization
    console.log("[Test 10] Testing production guest access boundaries...");
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_USER_EMAIL = "owner@example.com";
    delete process.env.API_SECRET_KEY;
    for (const keyName of [
      "GEMINI_API_KEY",
      "DEVELOPMENT_GEMINI_API_KEY",
      "PROD_GUEST_GEMINI_API_KEY_FREE",
      "GUEST_GEMINI_API_KEY",
      "PROD_GEMINI_API_KEY_FREE",
      "PROD_GEMINI_API_KEY_PRO",
      "GEMINI_API_KEY_FREE",
      "GEMINI_API_KEY_PRO",
    ]) {
      delete process.env[keyName];
    }

    const sessionRes = await makeRequest(testServer, {
      method: "GET",
      path: "/api/session",
    });
    assert.strictEqual(sessionRes.statusCode, 200);
    assert.strictEqual(sessionRes.body.role, "guest");

    const guestJobsRes = await makeRequest(testServer, {
      method: "GET",
      path: "/api/jobs?limit=50",
    });
    assert.strictEqual(guestJobsRes.statusCode, 200);
    const guestJob = guestJobsRes.body.postings.find((posting: any) => posting.id === createdJob.id);
    assert.ok(guestJob, "Guest can browse public job postings");
    for (const privateField of ["job_status", "jev_fit", "jev_confidence", "ai_analysis", "user_overrides", "crawler_data"]) {
      assert.ok(!(privateField in guestJob), `Guest job DTO must omit ${privateField}`);
    }

    const guestJobRes = await makeRequest(testServer, {
      method: "GET",
      path: `/api/jobs/${createdJob.id}`,
    });
    assert.strictEqual(guestJobRes.statusCode, 200);
    assert.ok(!("job_status" in guestJobRes.body.job), "Guest job detail must omit owner workflow status");

    for (const privatePath of [
      "/api/candidate-profile",
      "/api/profile",
      "/api/applications",
      "/api/dashboard/metrics",
      "/api/agent/conversations",
    ]) {
      const privateRes = await makeRequest(testServer, { method: "GET", path: privatePath });
      assert.strictEqual(privateRes.statusCode, 403, `${privatePath} must be owner-only`);
    }

    process.env.API_SECRET_KEY = "api-test-owner-token";
    const ownerHeaders = { authorization: "Bearer api-test-owner-token" };
    const beforeGuestChat = await makeRequest(testServer, {
      method: "GET",
      path: "/api/agent/conversations",
      headers: ownerHeaders,
    });
    assert.strictEqual(beforeGuestChat.statusCode, 200);

    const guestChatRes = await makeRequest(testServer, {
      method: "POST",
      path: "/api/agent/guest-chat",
      body: {
        message: "Summarize this role.",
        jobId: createdJob.id,
        history: [{ role: "user", content: "What should I look for?" }],
      },
    });
    assert.strictEqual(guestChatRes.statusCode, 200, "Guest chat is available without owner authentication");
    assert.strictEqual(guestChatRes.body.aiTelemetry.role, "guest");

    const afterGuestChat = await makeRequest(testServer, {
      method: "GET",
      path: "/api/agent/conversations",
      headers: ownerHeaders,
    });
    assert.strictEqual(afterGuestChat.statusCode, 200);
    assert.strictEqual(
      afterGuestChat.body.count,
      beforeGuestChat.body.count,
      "Guest chat must not persist into the owner's conversation directory"
    );
    console.log("✓ Guest job reads are sanitized, private APIs are denied, and guest AI is isolated");

    console.log("\n==========================================================");
    console.log("  ALL END-TO-END HTTP API TESTS PASSED WITH 100% SUCCESS! ");
    console.log("==========================================================\n");
  } finally {
    testServer.close();
    process.env = originalEnv;
    fs.rmSync(testDataDirectory, { recursive: true, force: true });
  }
}

runApiTests().catch((err) => {
  console.error("API test failure:", err);
  process.exit(1);
});
