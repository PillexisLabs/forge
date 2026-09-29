'use client';

import { useState } from 'react';
import { Chip, type Tone } from '@/components/lf/Chips';
import Icon from '@/components/lf/Icon';
import Modal from '@/components/lf/Modal';
import type { NewTemplate, WhatsAppTemplate } from '@/modules/whatsapp/whatsapp-templates';
import { Card, Segmented } from './kit';
import SettingsHeader from './SettingsHeader';

type Suggested = Omit<NewTemplate, 'language'> & { purpose: string };

const STATUS: Record<string, { label: string; tone: Tone }> = {
  APPROVED: { label: 'Approved', tone: 'green' },
  PENDING: { label: 'In review', tone: 'amber' },
  IN_APPEAL: { label: 'In appeal', tone: 'amber' },
  REJECTED: { label: 'Rejected', tone: 'red' },
  PAUSED: { label: 'Paused', tone: 'amber' },
  DISABLED: { label: 'Disabled', tone: 'grey' },
};

const vars = (body: string) => Array.from(new Set(Array.from(body.matchAll(/\{\{(\d+)\}\}/g), (m) => Number(m[1])))).sort((a, b) => a - b);

function preview(body: string, examples: string[]) {
  return body.replace(/\{\{(\d+)\}\}/g, (all, n) => examples[Number(n) - 1]?.trim() || all);
}

// Settings → WhatsApp templates: the approved messages Forge can send
// outside the buyer's 24-hour window. Creating one sends it to Meta for review.
export default function TemplatesPanel({ initial, loadError, suggested, languages }: {
  initial: WhatsAppTemplate[];
  loadError: string | null;
  suggested: Suggested[];
  languages: { code: string; label: string }[];
}) {
  const [templates, setTemplates] = useState(initial);
  const [error, setError] = useState(loadError);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<NewTemplate | null>(null);
  const [draftError, setDraftError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function refresh() {
    setBusy('refresh');
    const res = await fetch('/api/settings/whatsapp/templates', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(data.error ?? 'Forge could not read the templates.'); return; }
    setError(null);
    setTemplates(data.templates);
  }

  async function create() {
    if (!draft) return;
    setBusy('create');
    setDraftError('');
    const res = await fetch('/api/settings/whatsapp/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setDraftError(data.error ?? 'Meta did not accept the template.'); return; }
    setNotice(`Created “${draft.name}”. Meta is reviewing it (template ID ${data.id}). Approval usually takes minutes to a day.`);
    setDraft(null);
    await refresh();
  }

  async function remove(name: string) {
    setBusy(`delete:${name}`);
    const res = await fetch(`/api/settings/whatsapp/templates?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    setConfirmDelete(null);
    if (!res.ok) { setError(data.error ?? 'Forge could not delete the template.'); return; }
    setNotice(`Deleted “${name}”.`);
    await refresh();
  }

  const names = new Set(templates.map((t) => t.name));
  const open = (s?: Suggested) => {
    setDraftError('');
    setDraft(s ? { name: s.name, category: s.category, language: 'en', body: s.body, examples: [...s.examples], footer: s.footer } : { name: '', category: 'UTILITY', language: 'en', body: '', examples: [], footer: null });
  };

  const draftVars = draft ? vars(draft.body) : [];

  return (
    <main className="lf-page">
      <div className="st st-stack" data-wide="true">
        <SettingsHeader
          title="WhatsApp templates"
          description="Messages Meta approved in advance. Forge uses them when the buyer last wrote more than 24 hours ago, for example a quote, a payment reminder or a dispatch note."
          actions={(
            <div className="tp-actions">
              <button type="button" className="lf-btn lf-btn-ghost" data-busy={busy === 'refresh'} onClick={() => void refresh()}><Icon name="refresh" />Refresh status</button>
              <button type="button" className="lf-btn lf-btn-primary" onClick={() => open()}><Icon name="plus" />New template</button>
            </div>
          )}
        />
        {error && <div className="lf-review" data-tone="red"><div className="lf-review-head"><Icon name="x" /><span className="lf-grow">{error}</span></div></div>}
        {notice && <div className="lf-review" data-tone="green"><div className="lf-review-head"><Icon name="check" /><span className="lf-grow">{notice}</span></div></div>}

        <Card title={`Templates · ${templates.length}`} description="From the WhatsApp business account, with Meta’s review status.">
          {templates.length === 0 && <p className="st-empty">No templates yet. Start with one of the suggestions below.</p>}
          {templates.map((t) => {
            const s = STATUS[t.status] ?? { label: t.status, tone: 'grey' as Tone };
            return (
              <div key={t.id} className="tp-row">
                <div className="tp-main">
                  <div className="tp-name"><code>{t.name}</code><span className="lf-dim">{t.language} · {t.category.toLowerCase()}</span></div>
                  <p className="tp-body">{t.body}</p>
                  {t.rejectedReason && <p className="tp-reason">Meta’s reason: {t.rejectedReason.replace(/_/g, ' ').toLowerCase()}</p>}
                </div>
                <Chip tone={s.tone}>{s.label}</Chip>
                {confirmDelete === t.name ? (
                  <span className="tp-confirm">
                    <button type="button" className="lf-btn lf-btn-ghost" onClick={() => setConfirmDelete(null)}>Keep</button>
                    <button type="button" className="lf-btn lf-btn-danger" data-busy={busy === `delete:${t.name}`} onClick={() => void remove(t.name)}>Delete</button>
                  </span>
                ) : (
                  <button type="button" className="lf-btn lf-btn-ghost lf-btn-icon" aria-label={`Delete ${t.name}`} onClick={() => setConfirmDelete(t.name)}><Icon name="x" /></button>
                )}
              </div>
            );
          })}
        </Card>

        <Card title="Suggested for Forge" description="One template for each message Forge sends outside the 24-hour window. Open one, check the text, and create it.">
          {suggested.map((s) => (
            <div key={s.name} className="tp-row">
              <div className="tp-main">
                <div className="tp-name"><code>{s.name}</code><span className="lf-dim">{s.purpose}</span></div>
                <p className="tp-body">{s.body}</p>
              </div>
              {names.has(s.name)
                ? <Chip tone="grey">Created</Chip>
                : <button type="button" className="lf-btn" onClick={() => open(s)}>Use</button>}
            </div>
          ))}
        </Card>
      </div>

      {draft && (
        <Modal open onClose={() => setDraft(null)} icon="whatsapp" title="New WhatsApp template" wide footer={(
          <>
            <span className="lf-grow lf-error">{draftError}</span>
            <button type="button" className="lf-btn lf-btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
            <button type="button" className="lf-btn lf-btn-primary" data-busy={busy === 'create'} disabled={busy === 'create' || !draft.name || !draft.body.trim()} onClick={() => void create()}>Send to Meta for review</button>
          </>
        )}>
          <div className="tp-editor">
            <div className="tp-form">
              <label className="lf-field"><span>Name</span>
                <input id="tp-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, '_') })} placeholder="payment_reminder" />
                <small>Lowercase letters, numbers and underscores. You cannot rename it later.</small>
              </label>
              <div className="lf-grid-2">
                <div className="lf-field"><span>Category</span>
                  <Segmented<'UTILITY' | 'MARKETING'> label="Category" value={draft.category} onChange={(v) => setDraft({ ...draft, category: v })} options={[{ id: 'UTILITY', label: 'Utility' }, { id: 'MARKETING', label: 'Marketing' }]} />
                  <small>{draft.category === 'UTILITY' ? 'About an order or request the buyer made.' : 'Offers and promotions. Meta charges more for these.'}</small>
                </div>
                <label className="lf-field"><span>Language</span>
                  <select id="tp-lang" value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value })}>
                    {languages.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                  </select>
                </label>
              </div>
              <label className="lf-field"><span>Message</span>
                <textarea id="tp-body" rows={4} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="Hello {{1}}, your order {{2}} is dispatched." />
                <small>Write {'{{1}}'}, {'{{2}}'} where Forge fills in the buyer’s details. Do not start or end with one.</small>
              </label>
              {draftVars.length > 0 && (
                <div className="lf-field"><span>Sample values</span>
                  <div className="tp-samples">
                    {draftVars.map((n) => (
                      <label key={n} className="tp-sample"><code>{`{{${n}}}`}</code>
                        <input id={`tp-ex-${n}`} value={draft.examples[n - 1] ?? ''} onChange={(e) => { const ex = [...draft.examples]; ex[n - 1] = e.target.value; setDraft({ ...draft, examples: ex }); }} />
                      </label>
                    ))}
                  </div>
                  <small>Meta reads these to review the template. Use realistic values.</small>
                </div>
              )}
              <label className="lf-field"><span>Footer (optional)</span>
                <input id="tp-footer" value={draft.footer ?? ''} maxLength={60} onChange={(e) => setDraft({ ...draft, footer: e.target.value || null })} placeholder="Sent by Forge" />
              </label>
            </div>
            <div className="tp-preview" aria-label="Preview">
              <span className="tp-preview-label">Preview</span>
              <div className="tp-bubble">
                <p>{preview(draft.body, draft.examples) || 'Your message appears here.'}</p>
                {draft.footer && <small>{draft.footer}</small>}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </main>
  );
}
