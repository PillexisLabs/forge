'use client';

import { useState } from 'react';
import Icon from '@/components/lf/Icon';
import Modal from '@/components/lf/Modal';
import { useAction } from '@/components/lf/useAction';

type Row = {
  enabled: boolean;
  status: 'not_connected' | 'connected' | 'error';
  config: Record<string, unknown>;
  hasSecret: boolean;
  lastActivity: string | null;
  lastError: string | null;
  cursor: { lastRows: number | null; columns: string[] | null };
};

type Id = 'whatsapp' | 'sheets' | 'webhook' | 'email';

const INFO: Record<Id, { name: string; icon: string; line: string }> = {
  whatsapp: { name: 'WhatsApp', icon: 'whatsapp', line: 'Buyer messages become enquiries. Forge asks for missing details, sends quotes with the PDF, and reads “confirm”.' },
  sheets: { name: 'Google Sheets', icon: 'sheet', line: 'Each new row in a sheet becomes an enquiry, for example from a Google Form or an IndiaMART export.' },
  webhook: { name: 'Webhook / API', icon: 'webhook', line: 'Any tool that can POST sends enquiries: a website form, Zapier, Make, IndiaMART push.' },
  email: { name: 'Email', icon: 'mail', line: 'Emails to your sales address become enquiries, and Forge replies with the quote PDF.' },
};

function statusOf(id: Id, row: Row): { key: string; label: string } {
  if (!row.enabled) return { key: 'off', label: 'Not connected' };
  if (row.status === 'error') return { key: 'off', label: 'Error' };
  if ((id === 'whatsapp' || id === 'email') && row.config.testMode === true) return { key: 'test', label: 'Test mode' };
  return { key: 'connected', label: 'Connected' };
}

export default function IntegrationsPanel({
  rows, whatsappEnv, webhookUrl, intakeUrl,
}: {
  rows: Record<Id, Row>;
  whatsappEnv: { hasCredentials: boolean; phoneNumberId: string | null };
  webhookUrl: string;
  intakeUrl: string;
}) {
  const [open, setOpen] = useState<Id | null>(null);
  return (
    <div className="lf-settings-list">
      {(Object.keys(INFO) as Id[]).map((id) => {
        const row = rows[id];
        const status = statusOf(id, row);
        return (
          <div key={id} className="lf-connector">
            <span className="lf-connector-logo" data-kind={id}><Icon name={INFO[id].icon} size={18} /></span>
            <span className="lf-connector-text">
              <strong>{INFO[id].name}</strong>
              <span>{INFO[id].line}</span>
            </span>
            <span className="lf-status" data-status={status.key}>{status.label}{row.lastActivity ? ` · ${row.lastActivity}` : ''}</span>
            <button type="button" className="lf-btn" onClick={() => setOpen(id)}>{row.enabled ? 'Manage' : 'Connect'}</button>
          </div>
        );
      })}
      {open === 'whatsapp' && <WhatsAppModal row={rows.whatsapp} env={whatsappEnv} webhookUrl={webhookUrl} onClose={() => setOpen(null)} />}
      {open === 'sheets' && <SheetsModal row={rows.sheets} onClose={() => setOpen(null)} />}
      {open === 'webhook' && <WebhookModal row={rows.webhook} intakeUrl={intakeUrl} onClose={() => setOpen(null)} />}
      {open === 'email' && <EmailModal row={rows.email} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Result({ error, message }: { error: string | null; message: string | null }) {
  if (error) return <span className="lf-grow">{error}</span>;
  if (message) return <span className="lf-grow" style={{ color: 'var(--lf-green-ink)' }}>{message}</span>;
  return <span className="lf-grow" />;
}

function WhatsAppModal({ row, env, webhookUrl, onClose }: { row: Row; env: { hasCredentials: boolean; phoneNumberId: string | null }; webhookUrl: string; onClose: () => void }) {
  const { post, busy, error } = useAction();
  const [message, setMessage] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(row.enabled);
  const [testMode, setTestMode] = useState(row.config.testMode === true || !env.hasCredentials);
  const [test, setTest] = useState({ name: 'Rahul Mehta', phone: '98450 11223', text: 'Hi, need 5000 stand-up pouches 250 ml, 2 colour. Delivery 560058' });
  return (
    <Modal open onClose={onClose} icon="whatsapp" title="WhatsApp" wide footer={(
      <>
        <Result error={error} message={message} />
        <button type="button" className="lf-btn lf-btn-ghost" onClick={onClose}>Close</button>
        <button type="button" className="lf-btn lf-btn-primary" data-busy={busy === 'save'} onClick={async () => {
          const r = await post<{ message: string }>('save', '/api/settings/integrations/whatsapp', { action: 'save', enabled, testMode });
          if (r) setMessage(r.message);
        }}>Save</button>
      </>
    )}>
      <label className="lf-check"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>Use WhatsApp for enquiries and replies<small>Messages to the business number become enquiries. Forge replies inside WhatsApp’s 24-hour window.</small></span></label>
      <label className="lf-check"><input type="checkbox" checked={testMode} disabled={!env.hasCredentials} onChange={(e) => setTestMode(e.target.checked)} />
        <span>Test mode<small>{env.hasCredentials ? 'Forge records replies but does not send them. Use it for a demo on this computer.' : 'This server has no WhatsApp number set, so replies stay in test mode.'}</small></span></label>
      <div className="lf-field">
        <span>Number</span>
        <p className="lf-note">{env.hasCredentials ? `Cloud API phone number id ${env.phoneNumberId}. Point the Meta app webhook at the URL below.` : 'No number set. Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID to the server.'}</p>
        <code className="lf-code">{webhookUrl}</code>
      </div>
      <div className="lf-form-section" style={{ marginTop: '0.75rem' }}>
        <h2>Send a test message</h2>
        <p>Runs the same path as a real WhatsApp message from a buyer.</p>
        <div className="lf-form-grid">
          <div className="lf-grid-2">
            <label className="lf-field"><span>Buyer name</span><input id="wa-name" value={test.name} onChange={(e) => setTest({ ...test, name: e.target.value })} /></label>
            <label className="lf-field"><span>Buyer phone</span><input id="wa-phone" value={test.phone} onChange={(e) => setTest({ ...test, phone: e.target.value })} /></label>
          </div>
          <label className="lf-field"><span>Message</span><textarea id="wa-text" rows={2} value={test.text} onChange={(e) => setTest({ ...test, text: e.target.value })} /></label>
          <div><button type="button" className="lf-btn" data-busy={busy === 'test'} disabled={!row.enabled} onClick={async () => {
            const r = await post<{ message: string }>('test', '/api/settings/integrations/whatsapp', { action: 'test', ...test });
            if (r) setMessage(r.message);
          }}><Icon name="send" />Send as the buyer</button>{!row.enabled && <span className="lf-note"> Save with WhatsApp on first.</span>}</div>
        </div>
      </div>
    </Modal>
  );
}

function SheetsModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const { post, busy, error } = useAction();
  const [message, setMessage] = useState<string | null>(null);
  const [url, setUrl] = useState(String(row.config.url ?? ''));
  const [importExisting, setImportExisting] = useState(row.config.importExisting === true);
  return (
    <Modal open onClose={onClose} icon="sheet" title="Google Sheets" wide footer={(
      <>
        <Result error={error} message={message} />
        {row.enabled && <button type="button" className="lf-btn" data-busy={busy === 'sync'} onClick={async () => {
          const r = await post<{ message: string }>('sync', '/api/settings/integrations/sheets', { action: 'sync' });
          if (r) setMessage(r.message);
        }}><Icon name="refresh" />Read now</button>}
        {row.enabled && <button type="button" className="lf-btn lf-btn-ghost" onClick={async () => {
          const r = await post<{ message: string }>('off', '/api/settings/integrations/sheets', { action: 'save', enabled: false, url, importExisting });
          if (r) setMessage('Disconnected.');
        }}>Disconnect</button>}
        <button type="button" className="lf-btn lf-btn-primary" data-busy={busy === 'save'} onClick={async () => {
          const r = await post<{ message: string }>('save', '/api/settings/integrations/sheets', { action: 'save', enabled: true, url, importExisting });
          if (r) setMessage(r.message);
        }}>{row.enabled ? 'Save' : 'Connect'}</button>
      </>
    )}>
      <label className="lf-field">
        <span>Sheet link</span>
        <input id="sh-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0" />
        <small>In Google Sheets, click Share and set “Anyone with the link can view”. Forge reads the sheet every minute.</small>
      </label>
      <label className="lf-check"><input type="checkbox" checked={importExisting} onChange={(e) => setImportExisting(e.target.checked)} />
        <span>Also import the rows that are in the sheet now<small>Off: only rows added after you connect become enquiries.</small></span></label>
      <div className="lf-field">
        <span>Columns Forge reads</span>
        <p className="lf-note">Name, phone or WhatsApp, email, company, and a message or requirement column. Quantity and pincode columns are added to the message. Other names work too, for example the headers of a Google Form.</p>
        {row.cursor.columns && <code className="lf-code">{row.cursor.columns.join('\n')}</code>}
      </div>
      {row.lastError && <p className="lf-error">Last error: {row.lastError}</p>}
    </Modal>
  );
}

function WebhookModal({ row, intakeUrl, onClose }: { row: Row; intakeUrl: string; onClose: () => void }) {
  const { post, busy, error } = useAction();
  const [message, setMessage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const example = `curl -X POST ${intakeUrl} \\\n  -H "Authorization: Bearer ${token ?? '<token>'}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name":"Rahul Mehta","phone":"9845011223","company":"Mehta Namkeen","message":"Need 5000 stand-up pouches 250 ml, delivery 560058"}'`;
  return (
    <Modal open onClose={onClose} icon="webhook" title="Webhook / API" wide footer={(
      <>
        <Result error={error} message={message} />
        {row.enabled && <button type="button" className="lf-btn lf-btn-ghost" onClick={async () => {
          const r = await post('off', '/api/settings/integrations/webhook', { action: 'save', enabled: false });
          if (r) setMessage('Switched off. Requests now get 403.');
        }}>Switch off</button>}
        <button type="button" className="lf-btn lf-btn-primary" data-busy={busy === 'token'} onClick={async () => {
          const r = await post<{ token: string; message: string }>('token', '/api/settings/integrations/webhook', { action: 'token' });
          if (r) { setToken(r.token); setMessage(r.message); }
        }}>{row.hasSecret ? 'Make a new token' : 'Create token'}</button>
      </>
    )}>
      <div className="lf-field"><span>Endpoint</span><code className="lf-code">{intakeUrl}</code></div>
      <div className="lf-field">
        <span>Token</span>
        {token ? <code className="lf-code">{token}</code> : <p className="lf-note">{row.hasSecret ? 'A token exists. Forge does not show it again. Make a new one if you lost it; the old one stops working.' : 'No token yet.'}</p>}
      </div>
      <div className="lf-field"><span>Example</span><code className="lf-code">{example}</code>
        <small>Fields: name, phone, email, company, message, and an optional id so a retry does not create a second enquiry. IndiaMART push fields (SENDER_NAME, SENDER_MOBILE, QUERY_MESSAGE) work as they are.</small></div>
    </Modal>
  );
}

function EmailModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const { post, busy, error } = useAction();
  const [message, setMessage] = useState<string | null>(null);
  const c = row.config as Record<string, string | number | boolean>;
  const [form, setForm] = useState({
    address: String(c.address ?? ''), imapHost: String(c.imapHost ?? 'imap.gmail.com'), imapPort: String(c.imapPort ?? 993),
    smtpHost: String(c.smtpHost ?? 'smtp.gmail.com'), smtpPort: String(c.smtpPort ?? 465), password: '', testMode: c.testMode === true,
  });
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });
  return (
    <Modal open onClose={onClose} icon="mail" title="Email" wide footer={(
      <>
        <Result error={error} message={message} />
        {row.enabled && <button type="button" className="lf-btn" data-busy={busy === 'sync'} onClick={async () => {
          const r = await post<{ message: string }>('sync', '/api/settings/integrations/email', { action: 'sync' });
          if (r) setMessage(r.message);
        }}><Icon name="refresh" />Check now</button>}
        {row.enabled && <button type="button" className="lf-btn lf-btn-ghost" onClick={async () => {
          const r = await post('off', '/api/settings/integrations/email', { action: 'save', enabled: false, ...form });
          if (r) setMessage('Disconnected.');
        }}>Disconnect</button>}
        <button type="button" className="lf-btn lf-btn-primary" data-busy={busy === 'save'} onClick={async () => {
          const r = await post<{ message: string }>('save', '/api/settings/integrations/email', { action: 'save', enabled: true, ...form });
          if (r) setMessage(r.message);
        }}>{row.enabled ? 'Save' : 'Connect'}</button>
      </>
    )}>
      <label className="lf-field"><span>Sales address</span><input id="em-address" value={form.address} onChange={set('address')} placeholder="sales@yourcompany.in" /></label>
      <label className="lf-field"><span>App password</span><input id="em-password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} placeholder={row.hasSecret ? 'Saved. Type a new one to change it.' : ''} />
        <small>Use an app password, not the normal password. Gmail: Google Account → Security → App passwords. Forge stores it encrypted.</small></label>
      <div className="lf-grid-2">
        <label className="lf-field"><span>IMAP server</span><input id="em-imap" value={form.imapHost} onChange={set('imapHost')} /></label>
        <label className="lf-field"><span>IMAP port</span><input id="em-imap-port" value={form.imapPort} onChange={set('imapPort')} /></label>
        <label className="lf-field"><span>SMTP server</span><input id="em-smtp" value={form.smtpHost} onChange={set('smtpHost')} /></label>
        <label className="lf-field"><span>SMTP port</span><input id="em-smtp-port" value={form.smtpPort} onChange={set('smtpPort')} /></label>
      </div>
      <label className="lf-check"><input type="checkbox" checked={form.testMode} onChange={(e) => setForm({ ...form, testMode: e.target.checked })} />
        <span>Test mode<small>Forge records replies but does not send them.</small></span></label>
      <p className="lf-note">Only emails that arrive after you connect become enquiries. Forge never imports the old mailbox.</p>
      {row.lastError && <p className="lf-error">Last error: {row.lastError}</p>}
    </Modal>
  );
}
