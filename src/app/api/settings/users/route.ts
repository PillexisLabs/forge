import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/core/env';
import { requirePermission } from '@/core/permissions';
import { createUser, emailDomainAllowed, listUsers, type UserRole } from '@/core/users';
import { MODULES } from '@/modules/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROLES: UserRole[] = ['admin', 'member', 'viewer'];
const MODULE_NAMES = MODULES.map((mod) => mod.name);

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'core:users');
  if (!auth.ok) return auth.response;

  const users = await listUsers();
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'core:users');
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const role = body?.role;
  const modules = Array.isArray(body?.modules) ? body.modules : [];

  if (!email.includes('@') || !name) {
    return NextResponse.json({ error: 'A name and a valid email are required' }, { status: 400 });
  }
  if (!emailDomainAllowed(email)) {
    return NextResponse.json(
      { error: `Only @${env.authEmailDomain()} emails can sign in to this workspace` },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'The temporary password needs at least 8 characters' }, { status: 400 });
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: 'Role must be admin, member, or viewer' }, { status: 400 });
  }
  if (!modules.every((m: unknown) => typeof m === 'string' && MODULE_NAMES.includes(m))) {
    return NextResponse.json({ error: 'Unknown module in the allowlist' }, { status: 400 });
  }

  const result = await createUser({ email, name, password, role, modules });
  if ('error' in result) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
  }
  return NextResponse.json({ ok: true, id: result.id });
}
