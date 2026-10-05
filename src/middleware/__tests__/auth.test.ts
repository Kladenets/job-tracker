import assert from "node:assert";
import { authMiddleware, createAuthMiddleware } from "../../middleware/auth";
import { Request, Response, NextFunction } from "express";

console.log("=== Running Authentication & Perimeter Defense Tests ===");

function createMockReq(options: {
  path?: string;
  headers?: Record<string, string>;
  isProduction?: boolean;
}): { req: Request; res: Response; next: NextFunction; result: { statusCalled?: number; jsonSent?: any } } {
  const req = {
    path: options.path || "/api/jobs",
    method: "GET",
    headers: options.headers || {},
  } as unknown as Request;

  const result: { statusCalled?: number; jsonSent?: any } = {};

  const res = {
    status: (code: number) => {
      result.statusCalled = code;
      return res;
    },
    json: (payload: any) => {
      result.jsonSent = payload;
      return res;
    },
  } as unknown as Response;

  const next = () => {};

  return { req, res, next, result };
}

// Save initial env
const originalEnv = { ...process.env };

async function runAuthTests() {
try {
  // Test 1: Public endpoint bypass (/api/health and /)
  console.log("[Test 1] Verifying public endpoint bypass for /api/health and /");
  process.env.NODE_ENV = "production";
  delete process.env.ALLOWED_USER_EMAIL;
  delete process.env.API_SECRET_KEY;

  let testContext = createMockReq({ path: "/api/health" });
  let nextCalled: boolean = false;
  authMiddleware(testContext.req, testContext.res, () => {
    nextCalled = true;
  });
  assert(nextCalled === true, "Health check should bypass auth completely");
  assert(testContext.result.statusCalled === undefined, "Health check should not return error status");
  console.log("✓ Operational health check successfully bypassed auth middleware");

  // Test 2: Local development bypass
  console.log("[Test 2] Verifying local development environment bypass (NODE_ENV=development)");
  process.env.NODE_ENV = "development";
  process.env.ALLOWED_USER_EMAIL = "owner@example.com";

  testContext = createMockReq({ path: "/api/jobs" });
  let nextCalled2: boolean = false;
  authMiddleware(testContext.req, testContext.res, () => {
    nextCalled2 = true;
  });
  assert(nextCalled2 === true, "Development environment should allow requests");
  assert(testContext.req.user?.email === "owner@example.com", "Development user profile attached");
  assert(testContext.req.user?.authSource === "local-development", "Auth source marked as local-development");
  console.log("✓ Local development environment permits requests with attached dev user identity");

  // Test 3: Production guests only reach explicitly public resources
  console.log("[Test 3] Verifying production guest allowlist and private API denial");
  process.env.NODE_ENV = "production";
  delete process.env.AUTH_BYPASS_DEV;
  delete process.env.API_SECRET_KEY;
  testContext = createMockReq({ path: "/api/candidate-profile", headers: {} });
  let nextCalled3: boolean = false;
  authMiddleware(testContext.req, testContext.res, () => {
    nextCalled3 = true;
  });
  assert(nextCalled3 === false, "Guest must not reach the candidate profile endpoint");
  assert(testContext.result.statusCalled === 403, "Expected 403 Forbidden for private profile reads");

  testContext = createMockReq({ path: "/api/jobs", headers: {} });
  let guestJobsAllowed = false;
  authMiddleware(testContext.req, testContext.res, () => {
    guestJobsAllowed = true;
  });
  assert(guestJobsAllowed, "Guest should reach the public jobs list");
  assert(testContext.req.user?.role === "guest", "Public jobs request should be classified as guest");

  testContext = createMockReq({ path: "/api/agent/conversations", headers: {} });
  let guestConversationReadAllowed = false;
  authMiddleware(testContext.req, testContext.res, () => {
    guestConversationReadAllowed = true;
  });
  assert(!guestConversationReadAllowed, "Guest must not list persistent owner conversations");
  assert(testContext.result.statusCalled === 403, "Persistent conversations are owner-only");

  testContext = createMockReq({ path: "/api", headers: {} });
  let bareApiPathAllowed = false;
  authMiddleware(testContext.req, testContext.res, () => {
    bareApiPathAllowed = true;
  });
  assert(!bareApiPathAllowed, "The bare /api path must not be treated as a public static route");
  assert(testContext.result.statusCalled === 403, "The bare /api path must fail closed");
  console.log("✓ Guest allowlist exposes public jobs but denies profiles and persistent conversations");

  // Test 4: Cloudflare Access header allowlist validation
  console.log("[Test 4] Verifying signed Cloudflare Access JWT and owner allowlist");
  process.env.NODE_ENV = "production";
  process.env.ALLOWED_USER_EMAIL = "kkent908@gmail.com";
  process.env.CF_ACCESS_TEAM_DOMAIN = "https://jobtracker.cloudflareaccess.com";
  process.env.CF_ACCESS_AUD = "test-application-audience";
  const verifiedClaimsByToken: Record<string, string> = {
    "valid-owner-token": "kkent908@gmail.com",
    "valid-stranger-token": "stranger@otherdomain.com",
  };
  const testAuthMiddleware = createAuthMiddleware(async (token, teamDomain, audience) => {
    assert.strictEqual(teamDomain, process.env.CF_ACCESS_TEAM_DOMAIN);
    assert.strictEqual(audience, process.env.CF_ACCESS_AUD);
    const email = verifiedClaimsByToken[token];
    if (!email) throw new Error("Invalid test token");
    return email;
  });

  // 4a. A forwarded email without the signed JWT cannot authenticate
  testContext = createMockReq({
    path: "/api/jobs",
    headers: { "cf-access-authenticated-user-email": "kkent908@gmail.com" },
  });
  let nextCalled4a: boolean = false;
  authMiddleware(testContext.req, testContext.res, () => {
    nextCalled4a = true;
  });
  assert(nextCalled4a === false, "Unauthorized email must not proceed");
  assert(testContext.result.statusCalled === 403, "Expected 403 Forbidden for unapproved email");
  console.log("✓ Forwarded email header alone is rejected");

  // 4b. Valid signed token whose email matches both headers and allowlist
  testContext = createMockReq({
    path: "/api/jobs",
    headers: {
      "cf-access-authenticated-user-email": "kkent908@gmail.com",
      "cf-access-jwt-assertion": "valid-owner-token",
    },
  });
  let nextCalled4b: boolean = false;
  await testAuthMiddleware(testContext.req, testContext.res, () => {
    nextCalled4b = true;
  });
  assert(nextCalled4b === true, "Authorized email must proceed");
  assert(testContext.req.user?.email === "kkent908@gmail.com", "Authenticated email attached to req.user");
  assert(testContext.req.user?.authSource === "cloudflare-access", "Auth source set to cloudflare-access");
  console.log("✓ Verified Cloudflare JWT with matching email successfully authorized");

  // 4c. Signed claim must match the separately forwarded email
  testContext = createMockReq({
    path: "/api/jobs",
    headers: {
      "cf-access-authenticated-user-email": "kkent908@gmail.com",
      "cf-access-jwt-assertion": "valid-stranger-token",
    },
  });
  let mismatchedIdentityAllowed = false;
  await testAuthMiddleware(testContext.req, testContext.res, () => {
    mismatchedIdentityAllowed = true;
  });
  assert(!mismatchedIdentityAllowed, "JWT email must match the forwarded email and owner allowlist");
  assert.strictEqual(testContext.result.statusCalled, 403);

  // 4d. Invalid JWT is rejected
  testContext = createMockReq({
    path: "/api/jobs",
    headers: {
      "cf-access-authenticated-user-email": "kkent908@gmail.com",
      "cf-access-jwt-assertion": "invalid-token",
    },
  });
  let invalidTokenAllowed = false;
  await testAuthMiddleware(testContext.req, testContext.res, () => {
    invalidTokenAllowed = true;
  });
  assert(!invalidTokenAllowed, "Invalid JWT must not authenticate");
  assert.strictEqual(testContext.result.statusCalled, 403);

  // 4e. Missing audience configuration fails closed
  delete process.env.CF_ACCESS_AUD;
  testContext = createMockReq({
    path: "/api/jobs",
    headers: {
      "cf-access-authenticated-user-email": "kkent908@gmail.com",
      "cf-access-jwt-assertion": "valid-owner-token",
    },
  });
  let missingAudienceAllowed = false;
  await testAuthMiddleware(testContext.req, testContext.res, () => {
    missingAudienceAllowed = true;
  });
  assert(!missingAudienceAllowed, "Missing Cloudflare audience must fail closed");
  assert.strictEqual(testContext.result.statusCalled, 403);
  process.env.CF_ACCESS_AUD = "test-application-audience";

  // 4f. Missing allowlist also fails closed
  delete process.env.ALLOWED_USER_EMAIL;
  testContext = createMockReq({
    path: "/api/jobs",
    headers: {
      "cf-access-authenticated-user-email": "kkent908@gmail.com",
      "cf-access-jwt-assertion": "valid-owner-token",
    },
  });
  let missingAllowlistAllowed = false;
  await testAuthMiddleware(testContext.req, testContext.res, () => {
    missingAllowlistAllowed = true;
  });
  assert(!missingAllowlistAllowed, "Cloudflare identity must not grant owner access without an allowlist");
  assert(testContext.result.statusCalled === 403, "Missing owner allowlist must be rejected");
  process.env.ALLOWED_USER_EMAIL = "kkent908@gmail.com";
  console.log("✓ Invalid JWTs, mismatched identities, and missing auth configuration fail closed");

  // Test 5: Bearer token for automated cron/scripts
  console.log("[Test 5] Verifying API_SECRET_KEY Bearer token authorization");
  process.env.NODE_ENV = "production";
  process.env.API_SECRET_KEY = "super_secret_cron_token_12345";

  testContext = createMockReq({
    path: "/api/pipeline/run",
    headers: { authorization: "Bearer super_secret_cron_token_12345" },
  });
  let nextCalled5: boolean = false;
  authMiddleware(testContext.req, testContext.res, () => {
    nextCalled5 = true;
  });
  assert(nextCalled5 === true, "Valid Bearer token must proceed");
  assert(testContext.req.user?.authSource === "bearer-token", "Auth source marked as bearer-token");
  assert(testContext.req.user?.role === "owner", "Bearer token user assigned owner role");
  console.log("✓ Bearer token authorization verified for automated pipeline triggers");

  // Test 6: Public Guest mode allows read-only and agent chat in production
  console.log("[Test 6] Verifying public guest portfolio access (read-only allowed, mutations rejected)");
  process.env.NODE_ENV = "production";
  delete process.env.API_SECRET_KEY;
  delete process.env.AUTH_BYPASS_DEV;

  // 6a: Read-only GET /api/jobs as guest
  const guestGetContext = {
    ...createMockReq({ path: "/api/jobs" }),
    req: { path: "/api/jobs", method: "GET", headers: {} } as unknown as Request,
  };
  let nextCalled6a = false;
  authMiddleware(guestGetContext.req, guestGetContext.res, () => {
    nextCalled6a = true;
  });
  assert(nextCalled6a === true, "Public guest should access GET /api/jobs");
  assert(guestGetContext.req.user?.role === "guest", "Guest role assigned");
  assert(guestGetContext.req.user?.authSource === "public-guest", "Auth source set to public-guest");
  console.log("✓ Public guest permitted read-only access with role: 'guest'");

  // 6b: Dedicated guest chat is the only unauthenticated POST allowed
  const guestChatContext = createMockReq({ path: "/api/agent/guest-chat" });
  (guestChatContext.req as any).method = "POST";
  let guestChatAllowed = false;
  authMiddleware(guestChatContext.req, guestChatContext.res, () => {
    guestChatAllowed = true;
  });
  assert(guestChatAllowed, "Public guest chat should be allowed");
  assert(guestChatContext.req.user?.role === "guest", "Guest chat must use guest credentials");

  // Other mutations are rejected in production without auth
  const guestMutationContext = {
    ...createMockReq({ path: "/api/jobs" }),
    req: { path: "/api/jobs", method: "POST", headers: {} } as unknown as Request,
  };
  let nextCalled6b = false;
  authMiddleware(guestMutationContext.req, guestMutationContext.res, () => {
    nextCalled6b = true;
  });
  assert(nextCalled6b === false, "Public guest mutation must NOT proceed");
  assert(guestMutationContext.result.statusCalled === 403, "Expected 403 Forbidden for guest mutations");
  console.log("✓ Only the dedicated guest-chat POST is allowed; guest mutations are forbidden");

  console.log("\n==========================================================");
  console.log("  ALL AUTH & PERIMETER DEFENSE TESTS PASSED SUCCESSFULLY! ");
  console.log("==========================================================\n");
} finally {
  process.env = originalEnv;
}
}

runAuthTests().catch((error: unknown) => {
  console.error("Authentication tests failed:", error);
  process.exitCode = 1;
});
