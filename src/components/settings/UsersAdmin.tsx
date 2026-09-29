'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Chip } from '@/components/lf/Chips';
import { timeAgo } from '@/components/lf/format';
import Icon from '@/components/lf/Icon';
import Modal from '@/components/lf/Modal';
import type { UserListRow, UserRole } from '@/core/users';
import { Card, Row, Segmented, Switch } from './kit';
import SettingsHeader from './SettingsHeader';

const ROLE_INFO: Record<UserRole, { label: string; detail: string }> = {
  admin: { label: 'Admin', detail: 'Everything, including approvals above the limit and Settings.' },
  member: { label: 'Member', detail: 'Works on quotes, orders and stock. No Settings.' },
  viewer: { label: 'Viewer', detail: 'Sees everything, changes nothing.' },
};

const MODULE_LABELS: Record<string, string> = {
  sales: 'Quotes', orders: 'Orders', inventory: 'Stock', purchasing: 'Purchase orders', analytics: 'Analytics', crm: 'CRM',
  whatsapp: 'WhatsApp', voice: 'Voice', sheets: 'Google Sheets', email: 'Email',
};

type Draft = { name: string; email: string; password: string; role: UserRole; modules: string[] };

function Access({ moduleNames, selected, onChange }: { moduleNames: string[]; selected: string[]; onChange: (m: string[]) => void }) {
  const all = selected.length === 0;
  return (
    <div className="st-card">
      <div className="st-rows">
        <Row label="All modules" description="Off: choose the modules this person can open.">
          <Switch id="acc-all" label="All modules" checked={all} onChange={(v) => onChange(v ? [] : [moduleNames[0]])} />
        </Row>
        {!all && moduleNames.map((name) => (
          <Row key={name} label={MODULE_LABELS[name] ?? name}>
            <Switch id={`acc-${name}`} label={MODULE_LABELS[name] ?? name} checked={selected.includes(name)} onChange={(v) => {
              const next = v ? [...selected, name] : selected.filter((m) => m !== name);
              onChange(next.length ? next : selected);
            }} />
          </Row>
        ))}
      </div>
    </div>
  );
}

// Members: who can sign in, their role, and which modules they can open.
export default function UsersAdmin({ initialUsers, moduleNames, selfId, emailDomain }: {
  initialUsers: UserListRow[];
  moduleNames: string[];
  selfId: number;
  /** The allowed sign-in domain (AUTH_EMAIL_DOMAIN); '*' means any. */
  emailDomain: string;
}) {
  const domainRestricted = emailDomain && emailDomain !== '*';
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<Draft | null>(null);
  const [edit, setEdit] = useState<{ user: UserListRow; role: UserRole; modules: string[]; newPassword: string } | null>(null);

  async function refresh() {
    const res = await fetch('/api/settings/users');
    if (res.ok) setUsers((await res.json()).users);
    router.refresh();
  }

  async function call(url: string, method: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError('');
    const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? 'That did not work. Try again.');
      return false;
    }
    await refresh();
    return true;
  }

  const active = users.filter((u) => u.status === 'active');
  const disabled = users.filter((u) => u.status !== 'active');

  const rowFor = (user: UserListRow) => (
    <div key={user.id} className="st-list-row">
      <span className="mb-avatar" aria-hidden="true">{user.name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()}</span>
      <span className="st-list-text">
        <strong>{user.name}{user.id === selfId && <span className="lf-dim"> · you</span>}</strong>
        <span>{user.email} · {user.lastLoginAt ? `signed in ${timeAgo(user.lastLoginAt)}` : 'never signed in'}</span>
      </span>
      <span className="mb-access">{user.modules.length ? user.modules.map((m) => MODULE_LABELS[m] ?? m).join(', ') : 'All modules'}</span>
      <Chip tone={user.role === 'admin' ? 'blue' : user.role === 'member' ? 'green' : 'grey'}>{ROLE_INFO[user.role].label}</Chip>
      <button type="button" className="lf-btn lf-btn-ghost" onClick={() => { setError(''); setEdit({ user, role: user.role, modules: user.modules, newPassword: '' }); }}>Edit</button>
    </div>
  );

  return (
    <main className="lf-page">
      <div className="st">
        <SettingsHeader
          title="Members"
          description="Who can sign in, what they can do, and which modules they can open."
          actions={<button type="button" className="lf-btn lf-btn-primary" onClick={() => { setError(''); setInvite({ name: '', email: '', password: '', role: 'member', modules: [] }); }}><Icon name="plus" />Add member</button>}
        />
        <div className="st-stack">
          {error && !invite && !edit && <p className="lf-error">{error}</p>}
          <Card title={`Active · ${active.length}`}>{active.map(rowFor)}</Card>
          {disabled.length > 0 && <Card title={`Disabled · ${disabled.length}`} description="They cannot sign in. Enable them again from Edit.">{disabled.map(rowFor)}</Card>}
        </div>
      </div>

      {invite && (
        <Modal open onClose={() => setInvite(null)} icon="person" title="Add member" wide footer={(
          <>
            <span className="lf-grow">{error}</span>
            <button type="button" className="lf-btn lf-btn-ghost" onClick={() => setInvite(null)}>Cancel</button>
            <button type="button" className="lf-btn lf-btn-primary" data-busy={busy} disabled={!invite.name || !invite.email || invite.password.length < 8} onClick={async () => {
              if (await call('/api/settings/users', 'POST', invite)) setInvite(null);
            }}>Add member</button>
          </>
        )}>
          <div className="lf-grid-2">
            <label className="lf-field"><span>Name</span><input id="inv-name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} autoFocus /></label>
            <label className="lf-field"><span>Email</span><input id="inv-email" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder={domainRestricted ? `name@${emailDomain}` : ''} />{domainRestricted && <small>Must be an @{emailDomain} address.</small>}</label>
          </div>
          <label className="lf-field"><span>Temporary password</span><input id="inv-pw" value={invite.password} onChange={(e) => setInvite({ ...invite, password: e.target.value })} /><small>At least 8 characters. Share it with them directly; they can change it after signing in.</small></label>
          <div className="lf-field"><span>Role</span>
            <Segmented<UserRole> label="Role" value={invite.role} onChange={(v) => setInvite({ ...invite, role: v })} options={(Object.keys(ROLE_INFO) as UserRole[]).map((r) => ({ id: r, label: ROLE_INFO[r].label }))} />
            <small>{ROLE_INFO[invite.role].detail}</small>
          </div>
          <div className="lf-field"><span>Access</span><Access moduleNames={moduleNames} selected={invite.modules} onChange={(m) => setInvite({ ...invite, modules: m })} /></div>
        </Modal>
      )}

      {edit && (
        <Modal open onClose={() => setEdit(null)} icon="person" title={edit.user.name} wide footer={(
          <>
            <span className="lf-grow">{error}</span>
            <button type="button" className="lf-btn lf-btn-ghost" onClick={() => setEdit(null)}>Cancel</button>
            <button type="button" className="lf-btn lf-btn-primary" data-busy={busy} onClick={async () => {
              const body: Record<string, unknown> = { modules: edit.modules };
              if (edit.user.id !== selfId) body.role = edit.role;
              if (edit.newPassword) body.password = edit.newPassword;
              if (await call(`/api/settings/users/${edit.user.id}`, 'PATCH', body)) setEdit(null);
            }}>Save</button>
          </>
        )}>
          <p className="lf-note">{edit.user.email}</p>
          {edit.user.id === selfId ? <p className="lf-note">You cannot change your own role or status. Ask another admin.</p> : (
            <div className="lf-field"><span>Role</span>
              <Segmented<UserRole> label="Role" value={edit.role} onChange={(v) => setEdit({ ...edit, role: v })} options={(Object.keys(ROLE_INFO) as UserRole[]).map((r) => ({ id: r, label: ROLE_INFO[r].label }))} />
              <small>{ROLE_INFO[edit.role].detail}</small>
            </div>
          )}
          <div className="lf-field"><span>Access</span><Access moduleNames={moduleNames} selected={edit.modules} onChange={(m) => setEdit({ ...edit, modules: m })} /></div>
          <label className="lf-field"><span>Reset password</span><input id="ed-pw" value={edit.newPassword} onChange={(e) => setEdit({ ...edit, newPassword: e.target.value })} /><small>Leave empty to keep it. A change signs them out everywhere.</small></label>
          {edit.user.id !== selfId && (
            <div className="st-card" data-tone={edit.user.status === 'active' ? 'danger' : undefined}>
              <div className="st-rows">
                <Row label={edit.user.status === 'active' ? 'Disable this member' : 'Enable this member'} description={edit.user.status === 'active' ? 'They are signed out and cannot sign in. Their work stays.' : 'They can sign in again.'}>
                  <button type="button" className={edit.user.status === 'active' ? 'lf-btn lf-btn-danger' : 'lf-btn'} disabled={busy} onClick={async () => {
                    if (await call(`/api/settings/users/${edit.user.id}`, 'PATCH', { status: edit.user.status === 'active' ? 'disabled' : 'active' })) setEdit(null);
                  }}>{edit.user.status === 'active' ? 'Disable' : 'Enable'}</button>
                </Row>
              </div>
            </div>
          )}
        </Modal>
      )}
    </main>
  );
}
