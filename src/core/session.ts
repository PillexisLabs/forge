import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './auth';
import { env } from './env';
import { getUserById, type SessionUser } from './users';

// The database-backed half of session verification (plans/RBAC.md section 5).
// The Edge middleware can only check the signature and expiry; this helper is
// the real boundary. It runs in the Node layer, costs one primary-key read,
// and rejects three things a stateless check cannot: a deleted user, a
// disabled user, and a token whose session_version was bumped (revocation).

export async function getSessionUser(request: NextRequest): Promise<SessionUser | null> {
  return resolveSessionUser(request.cookies.get(SESSION_COOKIE)?.value);
}

/** The same check for server components, which have no request object. */
export async function getSessionUserFromCookies(): Promise<SessionUser | null> {
  return resolveSessionUser(cookies().get(SESSION_COOKIE)?.value);
}

async function resolveSessionUser(token: string | undefined): Promise<SessionUser | null> {
  const claims = await verifySessionToken(token, env.authSecret());
  if (!claims) return null;

  const user = await getUserById(claims.userId);
  if (!user) return null;
  if (user.status !== 'active') return null;
  if (user.sessionVersion !== claims.sessionVersion) return null;
  return user;
}
