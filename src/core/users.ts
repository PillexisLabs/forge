import bcrypt from 'bcryptjs';
import { getSql } from './db';
import { env } from './env';

// Data access for the users table (plans/RBAC.md section 4). Node-only —
// never import from the Edge middleware.

export type UserRole = 'admin' | 'member' | 'viewer';

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  /** Module allowlist. Empty = all modules. */
  modules: string[];
  sessionVersion: number;
  status: 'active' | 'disabled';
};

type UserRow = SessionUser & { passwordHash: string };

// postgres.js returns bigint columns as strings; the ::int cast keeps ids as
// JS numbers so identity comparisons (self.id === id) behave.
const USER_COLUMNS = `
  id::int as id, email, name, password_hash as "passwordHash", role, modules,
  session_version as "sessionVersion", status
`;

export async function getUserById(id: number): Promise<SessionUser | null> {
  const sql = getSql();
  const rows = await sql<UserRow[]>`
    select ${sql.unsafe(USER_COLUMNS)} from users where id = ${id}
  `;
  if (!rows.length) return null;
  const { passwordHash: _drop, ...user } = rows[0];
  return user;
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const sql = getSql();
  const rows = await sql<UserRow[]>`
    select ${sql.unsafe(USER_COLUMNS)} from users
    where lower(email) = ${email.trim().toLowerCase()}
  `;
  return rows[0] ?? null;
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function recordLogin(id: number): Promise<void> {
  const sql = getSql();
  await sql`update users set last_login_at = now() where id = ${id}`;
}

export type UserListRow = SessionUser & { createdAt: string; lastLoginAt: string | null };

export async function listUsers(): Promise<UserListRow[]> {
  const sql = getSql();
  return sql<UserListRow[]>`
    select id::int as id, email, name, role, modules,
           session_version as "sessionVersion", status,
           created_at as "createdAt", last_login_at as "lastLoginAt"
    from users
    order by created_at
  `;
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: UserRole;
  modules: string[];
}): Promise<{ id: number } | { error: 'email_taken' }> {
  const sql = getSql();
  const passwordHash = await hashPassword(input.password);
  const rows = await sql<{ id: number }[]>`
    insert into users (email, name, password_hash, role, modules)
    values (${input.email.trim().toLowerCase()}, ${input.name.trim()},
            ${passwordHash}, ${input.role}, ${input.modules})
    on conflict (email) do nothing
    returning id::int as id
  `;
  return rows[0] ?? { error: 'email_taken' };
}

/**
 * Role, allowlist, status, and password changes must take effect on the
 * user's next request, not their next login — so every change here bumps
 * session_version, which invalidates the tokens they already hold.
 */
export async function updateUser(
  id: number,
  changes: {
    name?: string;
    role?: UserRole;
    modules?: string[];
    status?: 'active' | 'disabled';
    password?: string;
  },
): Promise<boolean> {
  const sql = getSql();
  const passwordHash = changes.password ? await hashPassword(changes.password) : undefined;
  const rows = await sql<{ id: number }[]>`
    update users set
      name = coalesce(${changes.name ?? null}, name),
      role = coalesce(${changes.role ?? null}, role),
      modules = coalesce(${changes.modules ?? null}, modules),
      status = coalesce(${changes.status ?? null}, status),
      password_hash = coalesce(${passwordHash ?? null}, password_hash),
      session_version = session_version + 1
    where id = ${id}
    returning id
  `;
  return rows.length > 0;
}

/**
 * First-deploy bootstrap (plans/RBAC.md section 7): when the users table is
 * empty and SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD are set, create the one
 * admin. Runs from the login route so no separate seed step exists — deploy,
 * sign in, done. A non-empty table makes this a no-op, so the env vars can be
 * removed after the first successful login.
 */
export async function seedAdminIfEmpty(): Promise<void> {
  const email = env.seedAdminEmail();
  const password = env.seedAdminPassword();
  if (!email || !password) return;

  const sql = getSql();
  const [{ count }] = await sql<{ count: string }[]>`select count(*) as count from users`;
  if (Number(count) > 0) return;

  const passwordHash = await hashPassword(password);
  await sql`
    insert into users (email, name, password_hash, role)
    values (${email.trim().toLowerCase()}, 'Anurag', ${passwordHash}, 'admin')
    on conflict (email) do nothing
  `;
}
