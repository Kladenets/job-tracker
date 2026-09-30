import { Request, Response, NextFunction } from "express";

export interface AuthenticatedUser {
  email: string;
  role: "owner" | "guest";
  authSource: "cloudflare-access" | "bearer-token" | "local-development" | "public-guest";
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Defense-in-depth authentication middleware enforcing requirements in requirements/auth.md:
 * 1. Health check bypass: /api/health and / are public for load-balancer readiness.
 * 2. Local development: allows requests through with owner role when NODE_ENV != "production".
 * 3. Production: checks Cloudflare Access identity headers (Cf-Access-Authenticated-User-Email)
 *    and verifies the email against ALLOWED_USER_EMAIL.
 * 4. Token fallback: checks Authorization: Bearer <API_SECRET_KEY> for automated cron/triggers.
 * 5. Public Guest mode: unauthenticated requests to read-only endpoints and conversational agents
 *    receive role: "guest". Mutations from guests are rejected with 403 Forbidden.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Public operational endpoints
  if (req.path === "/api/health" || req.path === "/health" || req.path === "/") {
    return next();
  }

  const isProduction = process.env.NODE_ENV === "production";
  const authBypassDev = process.env.AUTH_BYPASS_DEV === "true";

  // Bearer token check (for automated scheduler / script triggers)
  const authHeader = req.headers.authorization;
  const apiSecretKey = process.env.API_SECRET_KEY;
  if (apiSecretKey && authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token === apiSecretKey) {
      req.user = {
        email: process.env.ALLOWED_USER_EMAIL || "system@local",
        role: "owner",
        authSource: "bearer-token",
      };
      return next();
    }
  }

  // Cloudflare Access headers check
  const cfUserEmail = req.headers["cf-access-authenticated-user-email"] as string | undefined;
  const allowedEmail = process.env.ALLOWED_USER_EMAIL?.trim().toLowerCase();

  if (cfUserEmail) {
    const normalizedCfEmail = cfUserEmail.trim().toLowerCase();
    if (allowedEmail && normalizedCfEmail !== allowedEmail) {
      res.status(403).json({
        error: "Forbidden",
        message: "Your authenticated email is not authorized to access this private instance.",
      });
      return;
    }

    req.user = {
      email: normalizedCfEmail,
      role: "owner",
      authSource: "cloudflare-access",
    };
    return next();
  }

  // Local development / non-production environment allowance
  if (!isProduction || authBypassDev) {
    req.user = {
      email: allowedEmail || "developer@local",
      role: "owner",
      authSource: "local-development",
    };
    return next();
  }

  // Guest Portfolio Mode in production:
  // Read-only endpoints (/api/jobs, /api/jobs/:id) and conversational agent endpoints
  // are allowed in guest mode. Mutations are rejected.
  const isReadOnly = req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
  const isAgentChat = req.path.startsWith("/api/agent/conversations");

  if (isReadOnly || isAgentChat) {
    req.user = {
      email: "guest@public",
      role: "guest",
      authSource: "public-guest",
    };
    return next();
  }

  // If attempting mutations in production without valid Cloudflare Access headers or valid bearer token
  res.status(401).json({
    error: "Unauthorized",
    message: "Missing trusted edge authentication headers or valid credentials.",
  });
}
