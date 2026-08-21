import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/core/permissions';
import { getSessionUser } from '@/core/session';
import {
  getUserByEmail,
  getUserById,
  updateUser,
  verifyPassword,
  type UserRole,
} from '@/core/users';
import { MODULES } from '@/modules/registry';

export const runtime = 'nodejs';

const ROLES: UserRole[] = ['admin', 'member', 'viewer'];
const MODULE_NAMES = MODULES.map((mod) => mod.name);

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: 'Invalid user' }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  // Self-service path: any signed-in user may change their own password by
  // proving the current one. Everything else requires core:users.
  const self = await getSessionUser(request);
  const selfPasswordChange =
    self?.id === id && typeof body.password === 'string'
    && Object.keys(body).every((key) => key === 'password' || key === 'currentPassword');

  if (selfPasswordChange) {
    const row = await getUserByEmail(self!.email);
    const currentOk = row
      && typeof body.currentPassword === 'string'
      && (await verifyPassword(body.currentPassword, row.passwordHash));
    if (!currentOk) {
      return NextResponse.json({ error: 'The current password is wrong' }, { status: 403 });
    }
    if (body.password.length < 8) {
      return NextResponse.json({ error: 'The new password needs at least 8 characters' }, { status: 400 });
    }
    await updateUser(id, { password: body.password });
    return NextResponse.json({ ok: true, reauth: true });
  }

  const auth = await requirePermission(request, 'core:users');
  if (!auth.ok) return auth.response;

  const target = await getUserById(id);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Lockout protection: an admin cannot demote or disable their own account.
  // A different admin has to do it, so the workspace always keeps one admin.
  if (auth.user.id === id && (body.role !== undefined || body.status !== undefined)) {
    return NextResponse.json(
      { error: 'You cannot change your own role or status. Ask another admin.' },
      { status: 400 },
    );
  }

  const changes: Parameters<typeof updateUser>[1] = {};
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    changes.name = name;
  }
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) {
      return NextResponse.json({ error: 'Role must be admin, member, or viewer' }, { status: 400 });
    }
    changes.role = body.role;
  }
  if (body.modules !== undefined) {
    if (
      !Array.isArray(body.modules)
      || !body.modules.every((m: unknown) => typeof m === 'string' && MODULE_NAMES.includes(m))
    ) {
      return NextResponse.json({ error: 'Unknown module in the allowlist' }, { status: 400 });
    }
    changes.modules = body.modules;
  }
  if (body.status !== undefined) {
    if (body.status !== 'active' && body.status !== 'disabled') {
      return NextResponse.json({ error: 'Status must be active or disabled' }, { status: 400 });
    }
    changes.status = body.status;
  }
  if (body.password !== undefined) {
    if (typeof body.password !== 'string' || body.password.length < 8) {
      return NextResponse.json({ error: 'The temporary password needs at least 8 characters' }, { status: 400 });
    }
    changes.password = body.password;
  }
  if (!Object.keys(changes).length) {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
  }

  await updateUser(id, changes);
  return NextResponse.json({ ok: true });
}
