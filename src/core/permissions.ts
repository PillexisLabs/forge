import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionUser } from './session';
import type { SessionUser } from './users';

// The permission model (plans/RBAC.md section 3). A permission string is
// `<module>:<action>`. Actions are `read`, `write`, or a module-declared
// special action (whatsapp:send, analytics:sync). `core:` names the two
// admin-only capabilities: core:users and core:config.
//
// The role mapping is fixed in code, not editable in the UI:
//   admin  — everything.
//   member — read, write, and special actions; never core:*.
//   viewer — read only.
// Every check intersects with the user's module allowlist: an empty list
// means all modules; a non-empty list denies everything outside it.

export function hasPermission(user: SessionUser, permission: string): boolean {
  const [module, action] = permission.split(':');
  if (!module || !action) return false;

  if (module === 'core') return user.role === 'admin';

  if (user.modules.length > 0 && !user.modules.includes(module)) return false;

  if (user.role === 'admin') return true;
  if (user.role === 'member') return true;
  return action === 'read'; // viewer
}

export type PermissionResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

/**
 * The route guard (plans/RBAC.md section 5). Use at the top of every API
 * handler:
 *
 *   const auth = await requirePermission(request, 'crm:write');
 *   if (!auth.ok) return auth.response;
 *   // ... auth.user is the acting user
 */
export async function requirePermission(
  request: NextRequest,
  permission: string,
): Promise<PermissionResult> {
  const user = await getSessionUser(request);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  if (!hasPermission(user, permission)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Your account does not have ${permission} access.` },
        { status: 403 },
      ),
    };
  }
  return { ok: true, user };
}
