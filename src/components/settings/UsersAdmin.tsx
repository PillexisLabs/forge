'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserListRow, UserRole } from '@/core/users';
import {
  UiAlert,
  UiAvatar,
  UiBadge,
  UiButton,
  UiDialog,
  UiField,
  UiPanel,
  UiPanelHeader,
} from '@/components/ui/Core';

const ROLES: UserRole[] = ['admin', 'member', 'viewer'];

const ROLE_TONES = { admin: 'accent', member: 'positive', viewer: 'neutral' } as const;

type EditState = {
  user: UserListRow;
  role: UserRole;
  modules: string[];
  newPassword: string;
};

export default function UsersAdmin({
  initialUsers,
  moduleNames,
  selfId,
}: {
  initialUsers: UserListRow[];
  moduleNames: string[];
  selfId: number;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [create, setCreate] = useState({
    name: '', email: '', password: '', role: 'member' as UserRole, modules: [] as string[],
  });
  const [edit, setEdit] = useState<EditState | null>(null);

  async function refresh() {
    const res = await fetch('/api/settings/users');
    if (res.ok) setUsers((await res.json()).users);
    router.refresh();
  }

  async function call(url: string, method: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError('');
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? 'The request failed');
      return false;
    }
    await refresh();
    return true;
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (await call('/api/settings/users', 'POST', create)) {
      setCreateOpen(false);
      setCreate({ name: '', email: '', password: '', role: 'member', modules: [] });
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    const body: Record<string, unknown> = { role: edit.role, modules: edit.modules };
    if (edit.user.id === selfId) {
      // The API refuses self role/status changes; only send what it accepts.
      delete body.role;
    }
    if (edit.newPassword) body.password = edit.newPassword;
    if (await call(`/api/settings/users/${edit.user.id}`, 'PATCH', body)) setEdit(null);
  }

  async function toggleStatus(user: UserListRow) {
    await call(`/api/settings/users/${user.id}`, 'PATCH', {
      status: user.status === 'active' ? 'disabled' : 'active',
    });
  }

  function toggleModule(list: string[], name: string): string[] {
    return list.includes(name) ? list.filter((m) => m !== name) : [...list, name];
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <UiPanel>
        <UiPanelHeader
          title="Users"
          description="Who can sign in, what role they hold, and which modules they see. An empty module list means all modules."
          meta={(
            <UiButton variant="primary" onClick={() => setCreateOpen(true)}>
              Add user
            </UiButton>
          )}
        />
        {error && !createOpen && !edit && <UiAlert tone="critical">{error}</UiAlert>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--color-faint)]">
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Modules</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Last login</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-[var(--color-rule)]">
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-2">
                      <UiAvatar name={user.name} seed={user.id} size="small" />
                      <span className="grid">
                        <span className="font-medium text-[var(--color-ink)]">
                          {user.name}
                          {user.id === selfId && <span className="text-[var(--color-faint)]"> (you)</span>}
                        </span>
                        <span className="text-xs text-[var(--color-muted)]">{user.email}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <UiBadge tone={ROLE_TONES[user.role]}>{user.role}</UiBadge>
                  </td>
                  <td className="px-3 py-3 text-[var(--color-muted)]">
                    {user.modules.length ? user.modules.join(', ') : 'All'}
                  </td>
                  <td className="px-3 py-3">
                    <UiBadge tone={user.status === 'active' ? 'positive' : 'critical'}>
                      {user.status}
                    </UiBadge>
                  </td>
                  <td className="px-3 py-3 text-[var(--color-muted)]">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex justify-end gap-2">
                      <UiButton
                        size="small"
                        onClick={() => setEdit({
                          user, role: user.role, modules: user.modules, newPassword: '',
                        })}
                      >
                        Edit
                      </UiButton>
                      {user.id !== selfId && (
                        <UiButton
                          size="small"
                          variant={user.status === 'active' ? 'danger' : 'secondary'}
                          disabled={busy}
                          onClick={() => toggleStatus(user)}
                        >
                          {user.status === 'active' ? 'Disable' : 'Enable'}
                        </UiButton>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </UiPanel>

      <UiDialog open={createOpen} onClose={() => setCreateOpen(false)} labelId="create-user-title">
        <form onSubmit={submitCreate} className="grid gap-4 p-6">
          <h2 id="create-user-title" className="text-base font-semibold text-[var(--color-ink)]">
            Add a user
          </h2>
          {error && <UiAlert tone="critical">{error}</UiAlert>}
          <UiField label="Name">
            <input
              required
              value={create.name}
              onChange={(e) => setCreate({ ...create, name: e.target.value })}
            />
          </UiField>
          <UiField label="Email">
            <input
              type="email"
              required
              value={create.email}
              onChange={(e) => setCreate({ ...create, email: e.target.value })}
            />
          </UiField>
          <UiField label="Temporary password" hint="At least 8 characters. Share it directly; they can change it after signing in.">
            <input
              type="text"
              required
              minLength={8}
              value={create.password}
              onChange={(e) => setCreate({ ...create, password: e.target.value })}
            />
          </UiField>
          <UiField label="Role">
            <select
              value={create.role}
              onChange={(e) => setCreate({ ...create, role: e.target.value as UserRole })}
            >
              {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </UiField>
          <ModulePicker
            moduleNames={moduleNames}
            selected={create.modules}
            onToggle={(name) => setCreate({ ...create, modules: toggleModule(create.modules, name) })}
          />
          <div className="flex justify-end gap-2">
            <UiButton type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</UiButton>
            <UiButton type="submit" variant="primary" state={busy ? 'loading' : 'default'}>Create</UiButton>
          </div>
        </form>
      </UiDialog>

      <UiDialog open={edit !== null} onClose={() => setEdit(null)} labelId="edit-user-title">
        {edit && (
          <form onSubmit={submitEdit} className="grid gap-4 p-6">
            <h2 id="edit-user-title" className="text-base font-semibold text-[var(--color-ink)]">
              Edit {edit.user.name}
            </h2>
            {error && <UiAlert tone="critical">{error}</UiAlert>}
            {edit.user.id === selfId ? (
              <p className="text-sm text-[var(--color-muted)]">
                You cannot change your own role or status. Ask another admin.
              </p>
            ) : (
              <UiField label="Role">
                <select
                  value={edit.role}
                  onChange={(e) => setEdit({ ...edit, role: e.target.value as UserRole })}
                >
                  {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
              </UiField>
            )}
            <ModulePicker
              moduleNames={moduleNames}
              selected={edit.modules}
              onToggle={(name) => setEdit({ ...edit, modules: toggleModule(edit.modules, name) })}
            />
            <UiField label="Reset password" hint="Leave empty to keep the current password. Any change signs them out everywhere.">
              <input
                type="text"
                minLength={8}
                value={edit.newPassword}
                onChange={(e) => setEdit({ ...edit, newPassword: e.target.value })}
              />
            </UiField>
            <div className="flex justify-end gap-2">
              <UiButton type="button" variant="ghost" onClick={() => setEdit(null)}>Cancel</UiButton>
              <UiButton type="submit" variant="primary" state={busy ? 'loading' : 'default'}>Save</UiButton>
            </div>
          </form>
        )}
      </UiDialog>
    </main>
  );
}

function ModulePicker({
  moduleNames,
  selected,
  onToggle,
}: {
  moduleNames: string[];
  selected: string[];
  onToggle: (name: string) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="ui-field-label">Module access</legend>
      <p className="text-xs text-[var(--color-muted)]">
        Leave all unchecked for full access. Checking any restricts the user to those modules.
      </p>
      <div className="flex flex-wrap gap-3">
        {moduleNames.map((name) => (
          <label key={name} className="flex items-center gap-1.5 text-sm text-[var(--color-ink)]">
            <input
              type="checkbox"
              checked={selected.includes(name)}
              onChange={() => onToggle(name)}
            />
            {name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
