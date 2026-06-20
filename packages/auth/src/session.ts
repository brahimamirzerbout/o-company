// =============================================================================
// o.company · session management
// =============================================================================
// Sessions are signed JWTs (jose) with a refresh-token pair. The access
// token is short-lived (15 min) and lives in memory; the refresh token is
// long-lived (30 days) and lives in an httpOnly cookie. Every refresh
// rotates the refresh token — stolen refresh tokens can only be used once.

import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "crypto";

const JWT_SECRET = () => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters. Set it in .env.local.");
  }
  return new TextEncoder().encode(s);
};

const ISSUER = "o.company";
const AUDIENCE = "o.company.app";

export interface AccessTokenClaims {
  sub: string;        // personId
  org: string;        // orgId
  role: string;       // Role
  email: string;
  /** Extra permission grants (overrides role defaults). */
  perms?: string[];
}

/** Sign a short-lived access token (15 minutes). */
export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(JWT_SECRET());
}

/** Verify an access token, returning the claims if valid. */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return payload as unknown as AccessTokenClaims;
  } catch {
    return null;
  }
}

/** Generate a refresh token: a long random string. We store its SHA-256 hash
 *  in the database, never the plaintext. */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(48).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
