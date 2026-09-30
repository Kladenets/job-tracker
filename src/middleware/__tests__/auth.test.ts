import assert from "node:assert";
import { authMiddleware, AuthenticatedUser } from "../../middleware/auth";
import { Request, Response, NextFunction } from "express";

console.log("=== Running Authentication & Perimeter Defense Tests ===");

function createMockReq(options: {
  path?: string;
  headers?: Record<string, string>;
  isProduction?: boolean;
}): { req: Request; res: Response; next: NextFunction; result: { statusCalled?: number; jsonSent?: any } } {
  const req = {
    path: options.path || "/api/jobs",
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

  // Test 3: Production rejection when missing headers
  console.log("[Test 3] Verifying production rejection when Cloudflare Access headers are absent");
  process.env.NODE_ENV = "production";
  delete process.env.AUTH_BYPASS_DEV;
  delete process.env.API_SECRET_KEY;
  testContext = createMockReq({ path: "/api/jobs", headers: {} });
  let nextCalled3: boolean = false;
  authMiddleware(testContext.req, testContext.res, () => {
    nextCalled3 = true;
  });
  assert(nextCalled3 === false, "Production should NOT call next() without auth");
  assert(testContext.result.statusCalled === 401, `Expected 401 Unauthorized for missing headers in production, got ${testContext.result.statusCalled}`);
  console.log("✓ Production safely returns 401 Unauthorized when edge headers are absent");

  // Test 4: Cloudflare Access header allowlist validation
  console.log("[Test 4] Verifying Cloudflare Access allowlist validation (valid vs unauthorized email)");
  process.env.NODE_ENV = "production";
  process.env.ALLOWED_USER_EMAIL = "kkent908@gmail.com";

  // 4a. Unauthorized email
  testContext = createMockReq({
    path: "/api/jobs",
    headers: { "cf-access-authenticated-user-email": "stranger@otherdomain.com" },
  });
  let nextCalled4a: boolean = false;
  authMiddleware(testContext.req, testContext.res, () => {
    nextCalled4a = true;
  });
  assert(nextCalled4a === false, "Unauthorized email must not proceed");
  assert(testContext.result.statusCalled === 403, "Expected 403 Forbidden for unapproved email");
  console.log("✓ Cloudflare Access with unlisted email correctly rejected with 403 Forbidden");

  // 4b. Authorized email
  testContext = createMockReq({
    path: "/api/jobs",
    headers: { "cf-access-authenticated-user-email": "kkent908@gmail.com" },
  });
  let nextCalled4b: boolean = false;
  authMiddleware(testContext.req, testContext.res, () => {
    nextCalled4b = true;
  });
  assert(nextCalled4b === true, "Authorized email must proceed");
  assert(testContext.req.user?.email === "kkent908@gmail.com", "Authenticated email attached to req.user");
  assert(testContext.req.user?.authSource === "cloudflare-access", "Auth source set to cloudflare-access");
  console.log("✓ Cloudflare Access with allowed email successfully authorized");

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

  // 6b: Mutations rejected in production without auth
  const guestMutationContext = {
    ...createMockReq({ path: "/api/jobs" }),
    req: { path: "/api/jobs", method: "POST", headers: {} } as unknown as Request,
  };
  let nextCalled6b = false;
  authMiddleware(guestMutationContext.req, guestMutationContext.res, () => {
    nextCalled6b = true;
  });
  assert(nextCalled6b === false, "Public guest mutation must NOT proceed");
  assert(guestMutationContext.result.statusCalled === 401, "Expected 401 Unauthorized for mutation without credentials");
  console.log("✓ Unauthenticated mutations safely rejected in production");

  console.log("\n==========================================================");
  console.log("  ALL AUTH & PERIMETER DEFENSE TESTS PASSED SUCCESSFULLY! ");
  console.log("==========================================================\n");
} finally {
  process.env = originalEnv;
}
