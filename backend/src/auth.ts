import { createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Config } from './config.js';
import { randomId } from './crypto.js';

const issuer = 'fairpass-api';
const audience = 'fairpass-web';
export function createSessionTokens(config: Config) {
  // Stable across restarts; a dedicated random secret can rotate browser sessions
  // independently from machine credentials. The fallback keeps existing installs working.
  const key = createHash('sha256').update(config.SESSION_JWT_SECRET ?? `fairpass-session-v1:${config.ADMIN_API_TOKEN}`).digest();
  const lifetime = config.SESSION_TTL_SECONDS ?? 7 * 24 * 60 * 60;
  return {
    async issue(role: 'student' | 'institution') {
      const now = Math.floor(Date.now() / 1000);
      const exp = now + lifetime;
      const token = await new SignJWT({ role })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuer(issuer).setAudience(audience).setSubject(randomId())
        .setIssuedAt(now).setExpirationTime(exp).sign(key);
      // No names, account identifiers, scores or preferences in the JWT payload.
      return { token, expiresAt: new Date(exp * 1000) };
    },
    async valid(token: string, role: 'student' | 'institution') {
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: ['HS256'], typ: 'JWT', issuer, audience,
          requiredClaims: ['sub', 'iat', 'exp', 'role'],
        });
        return payload.role === role && typeof payload.sub === 'string';
      } catch { return false; }
    },
  };
}
