import { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

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
 * 5. Public Guest mode: only explicitly allowlisted public reads and the isolated guest-chat
 *    endpoint receive role: "guest". All other API routes require owner credentials.
 */
type AccessTokenVerifier = (token: string, teamDomain: string, audience: string) => Promise<string>;

const remoteJwkSets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

async function verifyCloudflareAccessToken(
  token: string,
  teamDomain: string,
  audience: string
): Promise<string> {
  const issuer = new URL(teamDomain);
  if (issuer.protocol !== "https:") throw new Error("Cloudflare team domain must use HTTPS");
  issuer.pathname = issuer.pathname.replace(/\/$/, "");
  issuer.search = "";
  issuer.hash = "";

  const issuerUrl = issuer.toString().replace(/\/$/, "");
  let jwks = remoteJwkSets.get(issuerUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuerUrl}/cdn-cgi/access/certs`));
    remoteJwkSets.set(issuerUrl, jwks);
  }

  const { payload } = await jwtVerify(token, jwks, { issuer: issuerUrl, audience });
  if (typeof payload.email !== "string" || payload.email.trim() === "") {
    throw new Error("Cloudflare Access token is missing an email claim");
  }
  return payload.email;
}

export function createAuthMiddleware(verifyAccessToken: AccessTokenVerifier = verifyCloudflareAccessToken) {
  return async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    const isReadOnly = req.method === "GET" || req.method === "HEAD";

    // Public operational endpoints
    if (isReadOnly && (req.path === "/api/health" || req.path === "/health" || req.path === "/")) {
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

    const cfUserEmailHeader = req.headers["cf-access-authenticated-user-email"];
    const cfUserEmail = typeof cfUserEmailHeader === "string" ? cfUserEmailHeader : undefined;
    const cfJwtHeader = req.headers["cf-access-jwt-assertion"];
    const cfJwt = typeof cfJwtHeader === "string" ? cfJwtHeader : undefined;
    const allowedEmail = process.env.ALLOWED_USER_EMAIL?.trim().toLowerCase();

    if (cfUserEmail || cfJwt) {
      const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN?.trim();
      const audience = process.env.CF_ACCESS_AUD?.trim();
      if (!cfUserEmail || !cfJwt || !allowedEmail || !teamDomain || !audience) {
        res.status(403).json({ error: "Forbidden", message: "Valid Cloudflare Access credentials are required." });
        return;
      }

      try {
        const verifiedEmail = (await verifyAccessToken(cfJwt, teamDomain, audience)).trim().toLowerCase();
        const headerEmail = cfUserEmail.trim().toLowerCase();
        if (verifiedEmail !== allowedEmail || headerEmail !== verifiedEmail) {
          res.status(403).json({ error: "Forbidden", message: "Your authenticated email is not authorized to access this instance." });
          return;
        }

        req.user = {
          email: verifiedEmail,
          role: "owner",
          authSource: "cloudflare-access",
        };
        return next();
      } catch {
        res.status(403).json({ error: "Forbidden", message: "Cloudflare Access token validation failed." });
        return;
      }
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

    // Guest access is an explicit allowlist. Other API routes fail closed.
    const isPublicGuestRoute =
      (isReadOnly &&
        (req.path === "/api/session" ||
          req.path === "/api/jobs" ||
          /^\/api\/jobs\/[^/]+$/.test(req.path))) ||
      (req.method === "POST" && req.path === "/api/agent/guest-chat") ||
      (!req.path.startsWith("/api") && isReadOnly);

    if (isPublicGuestRoute) {
      req.user = {
        email: "guest@public",
        role: "guest",
        authSource: "public-guest",
      };
      return next();
    }

    res.status(403).json({
      error: "Forbidden",
      message: "This resource requires an authenticated owner session.",
    });
  };
}

export const authMiddleware = createAuthMiddleware();
