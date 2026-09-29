'use client';

import { useEffect, useState } from 'react';
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
  email: { name: 'Email', icon: 'mail', line: 'Works with any mailbox: Gmail, Zoho, Outlook, GoDaddy and more. Emails become enquiries, and Forge replies with the quote PDF.' },
};

function statusOf(id: Id, row: Row): { key: string; label: string } {
  if (!row.enabled) return { key: 'off', label: 'Not connected' };
  if (row.status === 'error') return { key: 'off', label: 'Error' };
  if (id === 'whatsapp' && row.config.testMode === true) return { key: 'test', label: 'Test mode' };
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

type ProviderInfo = {
  id: string; name: string; domain: string; passwordWorks: boolean;
  imap: { host: string; port: number } | null; smtp: { host: string; port: number } | null;
  appPasswordUrl: string | null; appPasswordNote: string; forwardSteps: string[]; forwardNeedsCode: boolean;
};

type EmailStatus = {
  enabled: boolean; mode: string; address: string; forwardAddress: string;
  verification: { provider: string; code: string | null; link: string | null; at: string } | null;
  lastReceived: { from: string; subject: string; at: string } | null;
  inboundReady: boolean; relayReady: boolean;
};

async function emailCall<T>(action: string, extra: Record<string, unknown> = {}): Promise<T & { error?: string }> {
  const response = await fetch('/api/settings/integrations/email', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }),
  });
  const data = await response.json().catch(() => ({}));
  return response.ok ? data : { ...data, error: data.error ?? 'That did not work. Try again.' };
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="em-copy">
      <code>{value}</code>
      <button type="button" className="lf-btn" onClick={async () => {
        try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setCopied(false); }
      }}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
  );
}

// The email setup for people who are not technical: type the sales address,
// Forge recognises the provider, and forwarding (no password) is the default.
function EmailModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const { post } = useAction();
  const c = row.config as Record<string, string | number | boolean>;
  const [step, setStep] = useState<'address' | 'choose' | 'forward' | 'password' | 'done'>(row.enabled ? 'done' : 'address');
  const [address, setAddress] = useState(String(c.address ?? ''));
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [forwardAddress, setForwardAddress] = useState(String(c.forwardAddress ?? ''));
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pw, setPw] = useState({ password: '', imapHost: '', imapPort: '993', smtpHost: '', smtpPort: '465' });
  const [sim, setSim] = useState({ name: 'Anita Desai', from: 'anita@desaifoods.example', subject: 'Enquiry for pouches', text: 'Hi, please quote 4000 stand-up pouches 250 ml 2 colour. Delivery to 560076.' });

  async function run<T>(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setError(null); setNote(null);
    const result = await emailCall<T>(action, extra);
    setBusy(false);
    if (result.error) setError(result.error);
    return result;
  }

  // While the forwarding screen is open, check every few seconds for the first email or a verification code.
  useEffect(() => {
    if (step !== 'forward' && step !== 'done') return;
    let alive = true;
    const tick = async () => {
      const result = await emailCall<EmailStatus>('email.status');
      if (alive && !result.error) setStatus(result);
    };
    tick();
    const timer = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(timer); };
  }, [step]);

  const stepsText = provider
    ? `Please set up email forwarding for ${address} so our quotes system receives enquiries:\n\n${provider.forwardSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nForward to: ${forwardAddress}`
    : '';

  return (
    <Modal open onClose={onClose} icon="mail" title="Connect email" wide>
      {step === 'address' && (
        <form className="lf-form-grid" style={{ marginTop: 0 }} onSubmit={async (e) => {
          e.preventDefault();
          const result = await run<{ provider: ProviderInfo; forwardAddress: string }>('email.detect', { address });
          if (!result.error) {
            setProvider(result.provider);
            setForwardAddress(result.forwardAddress);
            setPw({ password: '', imapHost: result.provider.imap?.host ?? '', imapPort: String(result.provider.imap?.port ?? 993), smtpHost: result.provider.smtp?.host ?? '', smtpPort: String(result.provider.smtp?.port ?? 465) });
            setStep('choose');
          }
        }}>
          <p className="lf-note">Forge reads enquiries that come to your sales email, drafts the quote, and replies after you approve it.</p>
          <label className="lf-field"><span>Your sales email</span><input id="em-address" type="email" required autoFocus value={address} onChange={(e) => setAddress(e.target.value)} placeholder="sales@yourcompany.in" /></label>
          {error && <p className="lf-error">{error}</p>}
          <div className="lf-modal-foot" style={{ padding: 0 }}>
            <span className="lf-grow" />
            <button type="submit" className="lf-btn lf-btn-primary" data-busy={busy}>Continue</button>
          </div>
        </form>
      )}

      {step === 'choose' && provider && (
        <>
          <p className="em-found"><Icon name="check" />{address} uses <strong>{provider.name}</strong>.</p>
          <button type="button" className="em-choice" data-recommended="true" onClick={() => setStep('forward')}>
            <span className="em-choice-head"><strong>Forward emails to Forge</strong><span className="lf-chip" data-tone="green">Recommended</span></span>
            <span>No password needed. You turn on forwarding once in {provider.name}; Forge shows you each step.</span>
          </button>
          <button type="button" className="em-choice" disabled={!provider.passwordWorks} onClick={() => setStep('password')}>
            <span className="em-choice-head"><strong>Sign in with a password</strong><span className="lf-chip">Advanced</span></span>
            <span>{provider.passwordWorks ? 'Forge reads the mailbox and replies from your own address. Needs the mailbox or app password.' : `${provider.name} does not allow this. Use forwarding.`}</span>
          </button>
          <div className="lf-modal-foot" style={{ padding: 0 }}>
            <button type="button" className="lf-btn lf-btn-ghost" onClick={() => setStep('address')}>Back</button>
          </div>
        </>
      )}

      {step === 'forward' && provider && (
        <>
          {!status?.inboundReady && (
            <div className="lf-review" data-tone="amber">
              <div className="lf-review-head"><Icon name="plug" /><span className="lf-grow">Forwarding is not live on this server yet</span></div>
              <div className="lf-review-body">This server has no inbound mail service, so a Forge address cannot receive mail. Do not add it in {provider.name}: the confirmation would never arrive. You can still try the whole flow with a test email below, or use the password option.</div>
            </div>
          )}
          {status?.inboundReady && (
            <>
              <div className="lf-field"><span>1. Copy your Forge address</span><CopyField value={forwardAddress} /></div>
              <div className="lf-field">
                <span>2. Turn on forwarding in {provider.name}</span>
                <ol className="em-steps">{provider.forwardSteps.map((s) => <li key={s}>{s}</li>)}</ol>
              </div>
            </>
          )}
          {status?.verification && (
            <div className="lf-review" data-tone="amber">
              <div className="lf-review-head"><Icon name="mail" /><span className="lf-grow">{status.verification.provider} sent a confirmation{status.verification.code ? '. Paste this code in Gmail:' : '.'}</span></div>
              {status.verification.code && <div className="lf-review-body"><CopyField value={status.verification.code} /></div>}
              {status.verification.link && <div className="lf-review-body"><a className="lf-link" href={status.verification.link} target="_blank" rel="noreferrer">Open the confirmation link</a></div>}
            </div>
          )}
          {status?.inboundReady && (
            <div className="lf-field">
              <span>3. Check it</span>
              {status?.lastReceived
                ? <p className="em-live" data-ok="true"><Icon name="check" />Received an email from {status.lastReceived.from}: “{status.lastReceived.subject}”. Forwarding works.</p>
                : <p className="em-live"><span className="em-pulse" />Waiting for your first email. Send any email to {address} to test it.</p>}
            </div>
          )}
          {!status?.inboundReady && (
            <div className="lf-review">
              <div className="lf-review-head"><Icon name="send" /><span className="lf-grow">Try it with a test email</span></div>
              <div className="lf-review-body lf-form-grid" style={{ marginTop: 0 }}>
                <div className="lf-grid-2">
                  <label className="lf-field"><span>From name</span><input id="sim-name" value={sim.name} onChange={(e) => setSim({ ...sim, name: e.target.value })} /></label>
                  <label className="lf-field"><span>From email</span><input id="sim-from" value={sim.from} onChange={(e) => setSim({ ...sim, from: e.target.value })} /></label>
                </div>
                <label className="lf-field"><span>Subject</span><input id="sim-subject" value={sim.subject} onChange={(e) => setSim({ ...sim, subject: e.target.value })} /></label>
                <label className="lf-field"><span>Message</span><textarea id="sim-text" rows={2} value={sim.text} onChange={(e) => setSim({ ...sim, text: e.target.value })} /></label>
                <div><button type="button" className="lf-btn" data-busy={busy} onClick={async () => {
                  const result = await run<{ message: string }>('email.simulate', sim);
                  if (!result.error) setNote(result.message);
                }}><Icon name="send" />Send test email</button></div>
              </div>
            </div>
          )}
          <p className="lf-note">Replies go out as “your business via Forge”. When a buyer replies, the reply comes to {address}, and a copy of every reply lands in your inbox.</p>
          {(error || note) && <p className={error ? 'lf-error' : 'lf-saved'}>{error ?? note}</p>}
          <div className="lf-modal-foot" style={{ padding: 0 }}>
            {status?.inboundReady && <a className="lf-btn lf-btn-ghost" href={`https://wa.me/?text=${encodeURIComponent(stepsText)}`} target="_blank" rel="noreferrer"><Icon name="whatsapp" />Send steps to someone</a>}
            <span className="lf-grow" />
            <button type="button" className="lf-btn lf-btn-ghost" onClick={() => setStep('choose')}>Back</button>
            <button type="button" className="lf-btn lf-btn-primary" data-busy={busy} onClick={async () => {
              const result = await run<{ message: string }>('email.useForward');
              if (!result.error) { setStep('done'); post('refresh', '/api/settings/integrations/email', { action: 'email.status' }); }
            }}>Done</button>
          </div>
        </>
      )}

      {step === 'password' && provider && (
        <form className="lf-form-grid" style={{ marginTop: 0 }} onSubmit={async (e) => {
          e.preventDefault();
          const result = await run<{ message: string }>('email.savePassword', { address, ...pw });
          if (!result.error) { setNote(result.message); setStep('done'); post('refresh', '/api/settings/integrations/email', { action: 'email.status' }); }
        }}>
          <p className="lf-note">{provider.appPasswordNote}{provider.appPasswordUrl && <> <a className="lf-link" href={provider.appPasswordUrl} target="_blank" rel="noreferrer">Create it here</a>.</>}</p>
          <label className="lf-field"><span>{provider.appPasswordUrl ? 'App password' : 'Mailbox password'}</span><input id="em-pw" type="password" autoComplete="new-password" required value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} /><small>Forge stores it encrypted and uses it only for this mailbox.</small></label>
          <details className="em-advanced">
            <summary>Server settings (filled in for {provider.name})</summary>
            <div className="lf-grid-2" style={{ marginTop: '0.75rem' }}>
              <label className="lf-field"><span>Incoming server (IMAP)</span><input id="em-imap" value={pw.imapHost} onChange={(e) => setPw({ ...pw, imapHost: e.target.value })} /></label>
              <label className="lf-field"><span>Port</span><input id="em-imap-port" value={pw.imapPort} onChange={(e) => setPw({ ...pw, imapPort: e.target.value })} /></label>
              <label className="lf-field"><span>Outgoing server (SMTP)</span><input id="em-smtp" value={pw.smtpHost} onChange={(e) => setPw({ ...pw, smtpHost: e.target.value })} /></label>
              <label className="lf-field"><span>Port</span><input id="em-smtp-port" value={pw.smtpPort} onChange={(e) => setPw({ ...pw, smtpPort: e.target.value })} /></label>
            </div>
          </details>
          {(error || note) && <p className={error ? 'lf-error' : 'lf-saved'}>{error ?? note}</p>}
          <div className="lf-modal-foot" style={{ padding: 0 }}>
            <button type="button" className="lf-btn lf-btn-ghost" onClick={() => setStep('choose')}>Back</button>
            <span className="lf-grow" />
            <button type="button" className="lf-btn" data-busy={busy} onClick={async () => {
              const result = await run<{ message: string }>('email.testPassword', { address, ...pw });
              if (!result.error) setNote(result.message);
            }}>Test connection</button>
            <button type="submit" className="lf-btn lf-btn-primary" data-busy={busy}>Connect</button>
          </div>
        </form>
      )}

      {step === 'done' && (
        <>
          <p className="em-found"><Icon name="check" />Email is connected for <strong>{status?.address ?? address}</strong>{(status?.mode ?? c.mode) === 'password' ? ', with a password.' : ', by forwarding.'}</p>
          {(status?.mode ?? c.mode) !== 'password' && forwardAddress && <div className="lf-field"><span>Forge address</span><CopyField value={status?.forwardAddress || forwardAddress} /></div>}
          <p className="em-live" data-ok={status?.lastReceived ? 'true' : undefined}>
            {status?.lastReceived ? <><Icon name="check" />Last email from {status.lastReceived.from}: “{status.lastReceived.subject}”.</> : <><span className="em-pulse" />No email received yet.</>}
          </p>
          {(status?.mode ?? c.mode) !== 'password' && status && !status.relayReady && <p className="lf-note">Replies stay in test mode on this server until an email relay is set up.</p>}
          {(error || note) && <p className={error ? 'lf-error' : 'lf-saved'}>{error ?? note}</p>}
          <div className="lf-modal-foot" style={{ padding: 0 }}>
            <button type="button" className="lf-btn lf-btn-ghost" data-busy={busy} onClick={async () => {
              const result = await run<{ message: string }>('email.disconnect');
              if (!result.error) { setNote(result.message); setStep('address'); post('refresh', '/api/settings/integrations/email', { action: 'email.status' }); }
            }}>Disconnect</button>
            <span className="lf-grow" />
            <button type="button" className="lf-btn" onClick={() => setStep('address')}>Change</button>
            <button type="button" className="lf-btn lf-btn-primary" onClick={onClose}>Close</button>
          </div>
        </>
      )}
    </Modal>
  );
}
