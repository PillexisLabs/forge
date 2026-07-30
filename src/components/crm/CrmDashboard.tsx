'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState, useTransition } from 'react';
import ForgeShell from '@/components/ForgeShell';
import {
  UiAlert,
  UiAvatar,
  UiBadge,
  UiButton,
  UiDialog,
  UiField,
  UiPanel,
  UiPanelHeader,
  type UiTone,
} from '@/components/ui/Core';
import {
  CRM_OWNERS,
  CRM_STAGES,
  OWNER_LABELS,
  STAGE_LABELS,
  WHATSAPP_CONSENT_LABELS,
  WHATSAPP_STATE_LABELS,
  type CrmDeal,
  type CrmOwner,
  type CrmStage,
  type CrmWorkspace,
  type WhatsAppConsentStatus,
  type WhatsAppWorkflowState,
} from '@/lib/crm-types';
import { CRM_VIEW_PATHS, type CrmView } from '@/lib/crm-routes';
import type { WhatsAppWorkflowAction } from '@/lib/crm-whatsapp-rules';

type DrawerSection = 'overview' | 'whatsapp' | 'activity';

const VIEWS: { id: CrmView; label: string; icon: string; href: string }[] = [
  { id: 'today', label: 'Today', icon: '/icons/dashboard.svg', href: CRM_VIEW_PATHS.today },
  { id: 'automation', label: 'WhatsApp', icon: '/icons/getting-started.svg', href: CRM_VIEW_PATHS.automation },
  { id: 'leads', label: 'Leads', icon: '/icons/categories.svg', href: CRM_VIEW_PATHS.leads },
  { id: 'pipeline', label: 'Pipeline', icon: '/icons/roadmap.svg', href: CRM_VIEW_PATHS.pipeline },
  { id: 'followups', label: 'Follow ups', icon: '/icons/feedbacks.svg', href: CRM_VIEW_PATHS.followups },
  { id: 'calls', label: 'Calls', icon: '/icons/surveys.svg', href: CRM_VIEW_PATHS.calls },
];

const CLOSED_STAGES: CrmStage[] = ['won', 'lost'];

const WHATSAPP_ACTION_LABELS: Record<WhatsAppWorkflowAction, string> = {
  start: 'Queue confirmation',
  confirm: 'Mark confirmed',
  attended: 'Mark attended',
  no_show: 'Mark no-show',
  reschedule: 'Reschedule',
  handoff: 'Human handoff',
  pause: 'Pause',
  opt_out: 'Opt out',
};

const WHATSAPP_ACTION_DESCRIPTIONS: Record<WhatsAppWorkflowAction, string> = {
  start: 'Sends the first WhatsApp confirmation for the booked call.',
  confirm: 'The client said yes outside WhatsApp. Schedules the reminders.',
  attended: 'The call happened. Ends messaging for this lead.',
  no_show: 'They did not join. Sends a rebooking message automatically.',
  reschedule: 'The client wants a new time. Pauses reminders until you set it.',
  handoff: 'You take over the chat personally. Automation steps back.',
  pause: 'Hold all messages for now. You can restart later.',
  opt_out: 'The client said stop. Permanent and cannot be undone.',
};

function sendNowLabel(state: WhatsAppWorkflowState | null) {
  if (state === 'awaiting_confirmation') return 'Send confirmation now';
  if (state === 'confirmed') return 'Send reminder now';
  return 'Send queued message now';
}

// Only the actions that make sense for the lead's current state are shown.
function whatsAppActionsFor(state: WhatsAppWorkflowState | null): {
  primary: WhatsAppWorkflowAction | null;
  secondary: WhatsAppWorkflowAction[];
} {
  switch (state) {
    case 'awaiting_confirmation':
      return { primary: 'confirm', secondary: ['reschedule', 'handoff', 'opt_out'] };
    case 'confirmed':
    case 'attending':
      return { primary: 'attended', secondary: ['no_show', 'reschedule', 'pause', 'opt_out'] };
    case 'no_show':
      return { primary: null, secondary: ['reschedule', 'opt_out'] };
    case 'human_handoff':
      return { primary: null, secondary: ['confirm', 'reschedule', 'attended', 'opt_out'] };
    case 'attended':
      return { primary: null, secondary: ['opt_out'] };
    case 'opted_out':
      return { primary: null, secondary: [] };
    default:
      return { primary: 'start', secondary: ['opt_out'] };
  }
}
const PERSONAL_EMAIL_COMPANIES = new Set([
  'gmail',
  'googlemail',
  'hotmail',
  'icloud',
  'outlook',
  'protonmail',
  'yahoo',
]);

const VIEW_COPY: Record<CrmView, { title: string; description: string }> = {
  today: {
    title: 'Today',
    description: 'The leads that need a founder decision now.',
  },
  leads: {
    title: 'Leads',
    description: 'Every imported and active client conversation.',
  },
  pipeline: {
    title: 'Pipeline',
    description: 'Ownership, stage, and the next commercial action.',
  },
  followups: {
    title: 'Follow ups',
    description: 'Dated next actions across both founders.',
  },
  calls: {
    title: 'Calls',
    description: 'Fireflies summaries and transcripts in one dedicated view.',
  },
  automation: {
    title: 'WhatsApp automation',
    description: 'Confirmation, reminder, exception, and handoff workflow.',
  },
};

function dateKey(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

function friendlyDate(value: string | null) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

function friendlyDateTime(value: string | null) {
  if (!value) return 'Not scheduled';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

// datetime-local fields are rendered and interpreted in IST so reads and
// writes agree regardless of the browser's timezone.
function istToIso(value: string) {
  return new Date(`${value}:00+05:30`).toISOString();
}
function relativeTime(value: string | null) {
  if (!value) return 'Not scheduled';
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60_000);
  const past = minutes < 0;
  const abs = Math.abs(minutes);
  const label = abs < 60
    ? `${abs}m`
    : abs < 48 * 60
      ? `${Math.round(abs / 60)}h`
      : `${Math.round(abs / (24 * 60))}d`;
  return past ? `${label} overdue` : `in ${label}`;
}
function dateTimeLocalValue(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value)).replace(' ', 'T');
}

function followUpDraft(deal: CrmDeal) {
  const firstName = deal.contact_name.split(' ')[0];
  return `Hi ${firstName}, following up on our last conversation. Were you able to review the material we shared? Happy to answer any questions or set up a short call to decide the next step.`;
}

function companyLabel(deal: CrmDeal, fallback = 'Company not added') {
  const company = deal.company_name || deal.company_domain;
  if (!company) return fallback;
  const normalized = company.toLowerCase().replace(/^www\./, '').split('.')[0];
  return PERSONAL_EMAIL_COMPANIES.has(normalized) ? fallback : company;
}

function workflowReadiness(deal: CrmDeal) {
  if (!deal.primary_phone) return 'Needs phone';
  if (!deal.whatsapp || deal.whatsapp.consent_status === 'unknown') return 'Needs consent';
  if (deal.whatsapp.consent_status === 'opted_out') return 'Opted out';
  if (!deal.whatsapp.appointment_at) return 'Needs call time';
  return WHATSAPP_STATE_LABELS[deal.whatsapp.state];
}

function canQueueConfirmation(deal: CrmDeal) {
  return Boolean(
    deal.primary_phone
      && deal.whatsapp?.consent_status === 'granted'
      && deal.whatsapp.appointment_at,
  );
}

function workflowSetupGuidance(deal: CrmDeal) {
  if (!deal.primary_phone) return 'Add the WhatsApp phone number, then save the setup.';
  if (!deal.whatsapp || deal.whatsapp.consent_status === 'unknown') {
    return 'Record consent and save the setup before queueing a confirmation.';
  }
  if (deal.whatsapp.consent_status === 'opted_out') {
    return 'This lead opted out. Confirmation messages cannot be queued.';
  }
  if (!deal.whatsapp.appointment_at) return 'Add the call date and time, then save the setup.';
  return 'Setup is complete. The confirmation can be queued.';
}

function stageTone(stage: CrmStage): UiTone {
  if (stage === 'won') return 'positive';
  if (stage === 'lost') return 'critical';
  if (stage === 'nurture') return 'warning';
  return 'neutral';
}

function automationTone(deal: CrmDeal): UiTone {
  if (deal.whatsapp?.state === 'opted_out') return 'critical';
  if (deal.whatsapp?.state === 'confirmed' || deal.whatsapp?.state === 'attended') return 'positive';
  if (deal.whatsapp?.state === 'human_handoff' || deal.whatsapp?.state === 'no_show') return 'warning';
  return deal.whatsapp?.enabled ? 'accent' : 'neutral';
}

function attentionState(deal: CrmDeal, today: string): { label: string; tone: UiTone; rank: number } {
  const due = dateKey(deal.next_action_due_at);
  if (due && due < today) return { label: 'Overdue', tone: 'critical', rank: 0 };
  if (due === today) return { label: 'Due today', tone: 'warning', rank: 1 };
  if (deal.owner === 'unassigned') return { label: 'Unassigned', tone: 'warning', rank: 2 };
  if (!deal.next_action || !due) return { label: 'Next action missing', tone: 'neutral', rank: 3 };
  return { label: 'Needs review', tone: 'neutral', rank: 4 };
}

function LeadIdentity({ deal }: { deal: CrmDeal }) {
  return (
    <span className="crm-lead-cell">
      <UiAvatar name={deal.contact_name} seed={deal.id} />
      <span>
        <strong>{deal.contact_name}</strong>
        <span>{companyLabel(deal, deal.primary_email || 'Company not added')}</span>
      </span>
    </span>
  );
}

function TodayView({
  deals,
  counts,
  today,
  onSelect,
}: {
  deals: CrmDeal[];
  counts: { overdue: number; dueToday: number; unassigned: number; missing: number };
  today: string;
  onSelect: (dealId: number) => void;
}) {
  const orderedDeals = [...deals].sort((left, right) => {
    const priority = attentionState(left, today).rank - attentionState(right, today).rank;
    if (priority !== 0) return priority;
    return new Date(right.last_interaction_at || 0).getTime()
      - new Date(left.last_interaction_at || 0).getTime();
  });
  // Only dated, urgent work belongs in the queue. Leads that merely lack an
  // owner or a next action collapse into one summary row instead of drowning it.
  const urgentDeals = orderedDeals.filter((deal) => attentionState(deal, today).rank <= 1);
  const setupCount = orderedDeals.length - urgentDeals.length;

  return (
    <>
      <section className="crm-stats">
        {[
          { label: 'Overdue', value: counts.overdue, tone: counts.overdue > 0 ? 'critical' : 'default' },
          { label: 'Due today', value: counts.dueToday, tone: 'default' },
          { label: 'Unassigned', value: counts.unassigned, tone: counts.unassigned > 0 ? 'critical' : 'default' },
          { label: 'Missing next action', value: counts.missing, tone: counts.missing > 0 ? 'critical' : 'default' },
        ].map((stat) => (
          <div key={stat.label} className="crm-stat">
            <p>{stat.label}</p>
            <strong data-tone={stat.tone}>{stat.value}</strong>
          </div>
        ))}
      </section>

      <div className="crm-today-grid">
        <UiPanel className="crm-panel">
          <UiPanelHeader
            className="crm-panel-heading"
            title="Follow up now"
            description="One priority queue, ordered by urgency."
            meta={<span>{urgentDeals.length} due</span>}
          />
          <div className="crm-priority-list">
            {urgentDeals.map((deal) => {
              const attention = attentionState(deal, today);
              return (
                <button key={deal.id} type="button" className="crm-priority-row" onClick={() => onSelect(deal.id)}>
                  <LeadIdentity deal={deal} />
                  <span className="crm-priority-action">
                    <strong>{deal.next_action || 'Set the next action'}</strong>
                    <span>{friendlyDate(deal.next_action_due_at)}</span>
                  </span>
                  <span className="crm-priority-meta">
                    <UiBadge tone={attention.tone}>{attention.label}</UiBadge>
                    <span>{OWNER_LABELS[deal.owner]}</span>
                  </span>
                </button>
              );
            })}
            {!urgentDeals.length && (
              <div className="crm-empty">
                <strong>Nothing due right now</strong>
                <p>Overdue and due-today follow ups will appear here.</p>
              </div>
            )}
            {setupCount > 0 && (
              <Link href={CRM_VIEW_PATHS.leads} className="crm-setup-summary">
                <strong>{setupCount} more {setupCount === 1 ? 'lead needs' : 'leads need'} an owner or a next action</strong>
                <span>Review in Leads →</span>
              </Link>
            )}
          </div>
        </UiPanel>

        <UiPanel as="aside" className="crm-panel">
          <UiPanelHeader
            className="crm-panel-heading"
            title="Pipeline health"
            description="The gaps founders need to close."
          />
          <dl className="crm-health-list">
            <div>
              <dt>Ownership missing</dt>
              <dd>{counts.unassigned}</dd>
              <p>Assign every active opportunity.</p>
            </div>
            <div>
              <dt>Next action missing</dt>
              <dd>{counts.missing}</dd>
              <p>Add a dated decision or follow up.</p>
            </div>
            <div>
              <dt>Due now</dt>
              <dd>{counts.overdue + counts.dueToday}</dd>
              <p>Overdue work plus actions due today.</p>
            </div>
          </dl>
        </UiPanel>
      </div>
    </>
  );
}

function PipelineView({
  deals,
  onSelect,
}: {
  deals: CrmDeal[];
  onSelect: (dealId: number) => void;
}) {
  const stageGroups = CRM_STAGES.map((stage) => ({
    stage,
    deals: deals.filter((deal) => deal.stage === stage),
  }));
  const populatedStages = stageGroups.filter((group) => group.deals.length > 0);

  return (
    <UiPanel className="crm-pipeline-shell">
      <div className="crm-pipeline-board" data-columns={Math.min(populatedStages.length, 3)}>
        {populatedStages.map(({ stage, deals: stageDeals }) => (
            <section key={stage} className="crm-stage-column">
              <header>
                <div>
                  <h3>{STAGE_LABELS[stage]}</h3>
                  <span>{stageDeals.length}</span>
                </div>
              </header>
              <div className="crm-stage-deals">
                {stageDeals.map((deal) => (
                  <button key={deal.id} type="button" className="crm-deal-card" onClick={() => onSelect(deal.id)}>
                    <strong>{deal.title || deal.company_name || deal.contact_name}</strong>
                    <span>{deal.contact_name}</span>
                    {deal.next_action
                      ? <p>{deal.next_action}</p>
                      : <p className="crm-dim">No next action</p>}
                    <footer>
                      {deal.owner === 'unassigned' && !deal.next_action_due_at
                        ? <span className="crm-dim">Needs owner and date</span>
                        : (
                          <>
                            <span className={deal.owner === 'unassigned' ? 'crm-dim' : undefined}>{OWNER_LABELS[deal.owner]}</span>
                            <span className={deal.next_action_due_at ? undefined : 'crm-dim'}>{friendlyDate(deal.next_action_due_at)}</span>
                          </>
                        )}
                    </footer>
                  </button>
                ))}
              </div>
            </section>
        ))}
        {!populatedStages.length && (
          <div className="crm-empty">
            <strong>No pipeline deals</strong>
            <p>New opportunities will appear here after they receive a stage.</p>
          </div>
        )}
      </div>
    </UiPanel>
  );
}

function FollowUpsView({
  deals,
  today,
  onSelect,
}: {
  deals: CrmDeal[];
  today: string;
  onSelect: (dealId: number) => void;
}) {
  const groups = [
    {
      id: 'overdue',
      label: 'Overdue',
      description: 'Needs attention first.',
      deals: deals.filter((deal) => dateKey(deal.next_action_due_at) && dateKey(deal.next_action_due_at)! < today),
    },
    {
      id: 'today',
      label: 'Due today',
      description: 'Planned for today.',
      deals: deals.filter((deal) => dateKey(deal.next_action_due_at) === today),
    },
    {
      id: 'upcoming',
      label: 'Upcoming',
      description: 'Scheduled after today.',
      deals: deals.filter((deal) => dateKey(deal.next_action_due_at) && dateKey(deal.next_action_due_at)! > today),
    },
    {
      id: 'unscheduled',
      label: 'Date missing',
      description: 'Has an action but no due date.',
      deals: deals.filter((deal) => deal.next_action && !deal.next_action_due_at),
    },
  ];

  return (
    <UiPanel className="crm-followup-shell">
      <div className="crm-followup-groups">
        {groups.filter((group) => group.deals.length > 0).map((group) => (
          <section key={group.id} className="crm-followup-group">
            <header>
              <div>
                <h3>{group.label}</h3>
                <p>{group.description}</p>
              </div>
              <span>{group.deals.length}</span>
            </header>
            <div>
              {group.deals.map((deal) => (
                <button key={deal.id} type="button" onClick={() => onSelect(deal.id)}>
                  <LeadIdentity deal={deal} />
                  <span>
                    <strong>{deal.next_action}</strong>
                    <span>{friendlyDate(deal.next_action_due_at)}, {OWNER_LABELS[deal.owner]}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
        {groups.every((group) => !group.deals.length) && (
          <div className="crm-empty">
            <strong>No follow ups scheduled</strong>
            <p>Dated next actions will appear here grouped by urgency.</p>
          </div>
        )}
      </div>
    </UiPanel>
  );
}

export default function CrmDashboard({
  initialWorkspace,
  initialView,
}: {
  initialWorkspace: CrmWorkspace;
  initialView: CrmView;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'all' | 'live' | 'demo'>('all');
  const [stageFilter, setStageFilter] = useState<CrmStage | 'all'>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drawerSection, setDrawerSection] = useState<DrawerSection>('overview');
  const [editingSetup, setEditingSetup] = useState(false);
  const [error, setError] = useState('');
  const [workflowError, setWorkflowError] = useState('');
  const [isPending, startTransition] = useTransition();
  const view = initialView;
  const today = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date());
  const selected = initialWorkspace.deals.find((deal) => deal.id === selectedId) ?? null;
  const workflowConfigured = selected ? canQueueConfirmation(selected) : false;

  const hasDemoDeals = useMemo(
    () => initialWorkspace.deals.some((deal) => deal.lead_source === 'demo'),
    [initialWorkspace.deals],
  );
  const scopedDeals = useMemo(() => {
    if (scope === 'all') return initialWorkspace.deals;
    return initialWorkspace.deals.filter((deal) =>
      scope === 'demo' ? deal.lead_source === 'demo' : deal.lead_source !== 'demo',
    );
  }, [initialWorkspace.deals, scope]);

  const counts = useMemo(() => {
    const active = scopedDeals.filter((deal) => !CLOSED_STAGES.includes(deal.stage));
    return {
      overdue: active.filter((deal) => dateKey(deal.next_action_due_at) && dateKey(deal.next_action_due_at)! < today).length,
      dueToday: active.filter((deal) => dateKey(deal.next_action_due_at) === today).length,
      unassigned: active.filter((deal) => deal.owner === 'unassigned').length,
      missing: active.filter((deal) => !deal.next_action || !deal.next_action_due_at).length,
    };
  }, [initialWorkspace.deals, today]);

  const viewDeals = useMemo(() => {
    if (view === 'today') {
      return scopedDeals.filter((deal) => {
        const due = dateKey(deal.next_action_due_at);
        return !CLOSED_STAGES.includes(deal.stage)
          && (deal.owner === 'unassigned' || !deal.next_action || !due || due <= today);
      });
    }
    if (view === 'followups') {
      return scopedDeals.filter((deal) => (
        Boolean(deal.next_action) && !CLOSED_STAGES.includes(deal.stage)
      ));
    }
    if (view === 'pipeline') {
      return scopedDeals.filter((deal) => !CLOSED_STAGES.includes(deal.stage));
    }
    if (view === 'calls') {
      return scopedDeals.filter((deal) => deal.meeting_count > 0);
    }
    return scopedDeals;
  }, [scopedDeals, today, view]);

  const visibleDeals = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return viewDeals.filter((deal) => {
      const matchesStage = stageFilter === 'all' || deal.stage === stageFilter;
      if (!matchesStage) return false;
      if (!needle) return true;
      return [
        deal.contact_name,
        deal.company_name,
        deal.primary_email,
        deal.primary_phone,
        STAGE_LABELS[deal.stage],
        OWNER_LABELS[deal.owner],
      ].some((value) => value?.toLowerCase().includes(needle));
    });
  }, [search, stageFilter, viewDeals]);

  function refreshWorkspace() {
    startTransition(() => router.refresh());
  }

  function openDeal(dealId: number) {
    setError('');
    setWorkflowError('');
    setEditingSetup(false);
    setDrawerSection(view === 'automation' ? 'whatsapp' : view === 'calls' ? 'activity' : 'overview');
    setSelectedId(dealId);
  }

  function closeDeal() {
    setError('');
    setWorkflowError('');
    setSelectedId(null);
  }

  async function patchDeal(dealId: number, payload: Record<string, unknown>) {
    setError('');
    const response = await fetch(`/api/crm/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, actor: 'Founder' }),
    });
    if (!response.ok) throw new Error('Could not save the update');
    refreshWorkspace();
  }

  async function saveNextAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const dueValue = String(form.get('nextActionDueAt') || '');
    try {
      await patchDeal(selected.id, {
        nextAction: form.get('nextAction'),
        nextActionDueAt: dueValue ? istToIso(dueValue) : null,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the update');
    }
  }

  async function saveWhatsApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setWorkflowError('');
    const form = new FormData(event.currentTarget);
    const appointmentValue = String(form.get('appointmentAt') || '');
    const response = await fetch(`/api/crm/deals/${selected.id}/whatsapp`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        primaryPhone: form.get('primaryPhone'),
        consentStatus: form.get('consentStatus'),
        appointmentAt: appointmentValue ? istToIso(appointmentValue) : null,
        actor: 'Founder',
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setWorkflowError(result.error || 'Could not configure WhatsApp automation');
      return;
    }
    setEditingSetup(false);
    refreshWorkspace();
  }

  async function sendQueuedNow() {
    if (!selected) return;
    setWorkflowError('');
    const response = await fetch(`/api/crm/deals/${selected.id}/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send_now', actor: 'Founder' }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      setWorkflowError(result?.error || 'Could not send the queued message');
      return;
    }
    refreshWorkspace();
  }

  async function runWhatsAppAction(action: WhatsAppWorkflowAction) {
    if (!selected) return;
    if (action === 'start' && !workflowConfigured) return;
    setWorkflowError('');
    const response = await fetch(`/api/crm/deals/${selected.id}/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, actor: 'Founder' }),
    });
    const result = await response.json();
    if (!response.ok) {
      setWorkflowError(result.error || 'Could not update WhatsApp automation');
      return;
    }
    refreshWorkspace();
  }

  async function markSent() {
    if (!selected) return;
    const response = await fetch(`/api/crm/deals/${selected.id}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: 'Founder',
        type: 'whatsapp',
        direction: 'outbound',
        subject: 'WhatsApp follow up sent',
        body: followUpDraft(selected),
      }),
    });
    if (!response.ok) {
      setError('Could not record the follow up');
      return;
    }
    refreshWorkspace();
  }

  const copy = VIEW_COPY[view];

  return (
    <>
      <ForgeShell
        activeArea="crm"
        title={copy.title}
        description={copy.description}
        tabs={VIEWS}
        activeTab={view}
        status={
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            {scopedDeals.length} leads,{' '}
            {scopedDeals.reduce((total, deal) => total + deal.meeting_count, 0)} calls recorded
            {isPending && <span className="crm-saving"> · Updating</span>}
          </p>
        }
        actions={hasDemoDeals ? (
          <div className="forge-scope-toggle" role="group" aria-label="Data scope">
            {([['all', 'All'], ['live', 'Live'], ['demo', 'Demo']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={scope === id}
                onClick={() => setScope(id)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : undefined}
      >
        {view === 'today' && (
          <TodayView
            deals={viewDeals}
            counts={counts}
            today={today}
            onSelect={openDeal}
          />
        )}

        {view === 'pipeline' && (
          <PipelineView
            deals={scopedDeals}
            onSelect={openDeal}
          />
        )}

        {view === 'followups' && (
          <FollowUpsView
            deals={viewDeals}
            today={today}
            onSelect={openDeal}
          />
        )}

        {(view === 'leads' || view === 'calls' || view === 'automation') && (
          <UiPanel className="crm-list-shell">
            <div className="crm-toolbar">
              <label>
                <span className="sr-only">Filter by stage</span>
                <select
                  value={stageFilter}
                  onChange={(event) => setStageFilter(event.target.value as CrmStage | 'all')}
                  className="forge-control crm-filter-control"
                >
                  <option value="all">All stages</option>
                  {CRM_STAGES.map((stage) => (
                    <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>
                  ))}
                </select>
              </label>
              <label className="crm-search">
                <span className="sr-only">Search leads</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name, company, email, or phone"
                  className="forge-control"
                />
              </label>
              <UiButton
                type="button"
                variant="ghost"
                size="small"
                aria-busy={isPending}
                onClick={refreshWorkspace}
              >
                {isPending ? 'Refreshing…' : 'Refresh'}
              </UiButton>
            </div>

            <div className="crm-table-desktop">
              <table>
                <thead>
                  {view === 'calls' ? (
                    <tr>
                      <th>Lead</th>
                      <th>Latest Fireflies summary</th>
                      <th>Calls</th>
                      <th>Last call</th>
                      <th><span className="sr-only">Action</span></th>
                    </tr>
                  ) : view === 'automation' ? (
                    <tr>
                      <th>Lead</th>
                      <th>WhatsApp phone</th>
                      <th>Consent</th>
                      <th>Workflow</th>
                      <th>Next message</th>
                      <th><span className="sr-only">Action</span></th>
                    </tr>
                  ) : (
                    <tr>
                      <th>Lead</th>
                      <th>Company</th>
                      <th>Stage</th>
                      <th>Owner</th>
                      <th>Next action</th>
                      <th>Last activity</th>
                      <th><span className="sr-only">Action</span></th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {visibleDeals.map((deal) => (
                    <tr key={deal.id} className="crm-row-link" onClick={() => openDeal(deal.id)}>
                      <td>
                        <div className="crm-lead-cell">
                          <UiAvatar name={deal.contact_name} seed={deal.id} />
                          <div>
                            <strong>{deal.contact_name}</strong>
                            <span>{deal.primary_email || 'No email'}</span>
                          </div>
                        </div>
                      </td>
                      {view === 'calls' ? (
                        <>
                          <td>
                            {deal.latest_meeting_summary
                              ? <p className="crm-summary-cell">{deal.latest_meeting_summary}</p>
                              : <p className="crm-summary-cell crm-dim">No summary synced</p>}
                          </td>
                          <td>{deal.meeting_count}</td>
                          <td>{friendlyDate(deal.last_interaction_at)}</td>
                        </>
                      ) : view === 'automation' ? (
                        <>
                          <td>{deal.primary_phone || 'Not added'}</td>
                          <td>{deal.whatsapp ? WHATSAPP_CONSENT_LABELS[deal.whatsapp.consent_status] : 'Not configured'}</td>
                          <td><UiBadge tone={automationTone(deal)}>{workflowReadiness(deal)}</UiBadge></td>
                          <td title={friendlyDateTime(deal.whatsapp?.next_message_at ?? null)}>
                            <span className={deal.whatsapp?.next_message_at ? undefined : 'crm-dim'}>
                              {relativeTime(deal.whatsapp?.next_message_at ?? null)}
                            </span>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{companyLabel(deal, 'Not added')}</td>
                          <td><UiBadge tone={stageTone(deal.stage)}>{STAGE_LABELS[deal.stage]}</UiBadge></td>
                          <td>{OWNER_LABELS[deal.owner]}</td>
                          <td>
                            <p className="crm-next-action">{deal.next_action || 'Add next action'}</p>
                            <span>{friendlyDate(deal.next_action_due_at)}</span>
                          </td>
                          <td>{friendlyDate(deal.last_interaction_at)}</td>
                        </>
                      )}
                      <td><button type="button" className="crm-view-link" onClick={() => openDeal(deal.id)}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="crm-mobile-list">
              {visibleDeals.map((deal) => (
                <button key={deal.id} type="button" onClick={() => openDeal(deal.id)} className="crm-mobile-row">
                  <UiAvatar name={deal.contact_name} seed={deal.id} />
                  <span className="crm-mobile-row-copy">
                    <strong>{deal.contact_name}</strong>
                    <span>
                      {view === 'automation'
                        ? workflowReadiness(deal)
                        : view === 'calls'
                          ? `${deal.meeting_count} calls, ${friendlyDate(deal.last_interaction_at)}`
                          : deal.next_action || STAGE_LABELS[deal.stage]}
                    </span>
                  </span>
                  <span className="crm-mobile-row-meta">
                    {view === 'automation'
                      ? deal.primary_phone || 'No phone'
                      : companyLabel(deal, OWNER_LABELS[deal.owner])}
                  </span>
                </button>
              ))}
            </div>

            {!visibleDeals.length && (
              <div className="crm-empty">
                <strong>No matching leads</strong>
                <p>Clear the search or stage filter to see the imported records.</p>
              </div>
            )}
          </UiPanel>
        )}
      </ForgeShell>

      {selected && (
        <UiDialog
          key={selected.id}
          open
          onClose={closeDeal}
          labelId="crm-deal-title"
          className="crm-drawer"
        >
          <header className="crm-drawer-header">
            <div className="crm-lead-cell">
              <UiAvatar name={selected.contact_name} seed={selected.id} size="large" />
              <div>
                <h2 id="crm-deal-title">{selected.contact_name}</h2>
                <span>{selected.primary_email || 'No email added'}</span>
              </div>
            </div>
            <UiButton
              type="button"
              variant="ghost"
              size="small"
              aria-busy={isPending}
              onClick={refreshWorkspace}
            >
              {isPending ? 'Refreshing…' : 'Refresh'}
            </UiButton>
            <UiButton
              type="button"
              variant="ghost"
              className="crm-close"
              size="small"
              aria-label="Close client record"
              onClick={closeDeal}
            >
              ×
            </UiButton>
          </header>

          <nav className="crm-drawer-tabs" aria-label="Client record sections">
            {([
              ['overview', 'Overview'],
              ['whatsapp', 'WhatsApp'],
              ['activity', 'Activity'],
            ] as Array<[DrawerSection, string]>).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={drawerSection === id}
                onClick={() => setDrawerSection(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="crm-drawer-content">
          {drawerSection === 'overview' && (
            <div className="crm-drawer-view">
            <UiPanel className="crm-drawer-section crm-record-section">
              <div className="crm-section-title">
                <div><h3>Deal details</h3><p>Keep ownership and commercial stage current.</p></div>
              </div>
            <div className="crm-drawer-grid">
              <UiField label="Owner">
                <select
                  value={selected.owner}
                  onChange={(event) => patchDeal(selected.id, { owner: event.target.value as CrmOwner }).catch(() => setError('Could not update owner'))}
                >
                  {CRM_OWNERS.map((owner) => <option key={owner} value={owner}>{OWNER_LABELS[owner]}</option>)}
                </select>
              </UiField>
              <UiField label="Stage">
                <select
                  value={selected.stage}
                  onChange={(event) => patchDeal(selected.id, { stage: event.target.value as CrmStage }).catch(() => setError('Could not update stage'))}
                >
                  {CRM_STAGES.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
                </select>
              </UiField>
            </div>
            </UiPanel>

            <form onSubmit={saveNextAction} className="crm-drawer-section">
              <div className="crm-section-title">
                <div><h3>Next action</h3><p>Every active lead needs one owner and one dated action.</p></div>
              </div>
              <div className="crm-next-action-fields">
                <UiField label="Action">
                  <input
                    name="nextAction"
                    defaultValue={selected.next_action ?? ''}
                    placeholder="Review proposal"
                  />
                </UiField>
                <UiField label="Due date">
                  <input
                    name="nextActionDueAt"
                    type="datetime-local"
                    defaultValue={dateTimeLocalValue(selected.next_action_due_at)}
                  />
                </UiField>
              </div>
              <div className="crm-section-actions">
                <UiButton variant="primary">Save action</UiButton>
              </div>
            </form>

            <UiPanel className="crm-drawer-section">
              <div className="crm-section-title">
                <div><h3>Suggested follow up</h3><p>Review before sending through WhatsApp.</p></div>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(followUpDraft(selected))}
                  className="crm-view-link"
                >
                  Copy
                </button>
              </div>
              <p className="crm-draft">{followUpDraft(selected)}</p>
              <UiButton type="button" onClick={markSent} className="crm-log-button" size="small">
                Record as sent
              </UiButton>
            </UiPanel>

            {error && <UiAlert>{error}</UiAlert>}
            </div>
          )}

          {drawerSection === 'whatsapp' && (() => {
            const workflowState = selected.whatsapp?.state ?? null;
            const actions = whatsAppActionsFor(workflowState);
            const optedOut = selected.whatsapp?.consent_status === 'opted_out';
            const setupComplete = Boolean(
              selected.primary_phone
              && selected.whatsapp
              && selected.whatsapp.consent_status !== 'unknown'
              && selected.whatsapp.appointment_at,
            );
            const showSetupForm = editingSetup || !setupComplete;
            return (
              <form onSubmit={saveWhatsApp} className="crm-drawer-section crm-whatsapp-panel">
                <div className="crm-section-title">
                  <div>
                    <h3>WhatsApp automation</h3>
                    <p>
                      {optedOut
                        ? 'This lead opted out. Messaging is permanently off.'
                        : 'Confirmation and reminders for the booked call.'}
                    </p>
                  </div>
                  <UiBadge tone={automationTone(selected)}>{workflowReadiness(selected)}</UiBadge>
                </div>

                {showSetupForm ? (
                  <>
                    <div className="crm-drawer-grid">
                      <UiField label="WhatsApp phone">
                        <input
                          name="primaryPhone"
                          type="tel"
                          defaultValue={selected.primary_phone ?? ''}
                          placeholder="+91 98765 43210"
                        />
                      </UiField>
                      <UiField label="Consent">
                        <select
                          name="consentStatus"
                          defaultValue={selected.whatsapp?.consent_status ?? 'unknown'}
                        >
                          <option value="unknown">Consent unknown</option>
                          <option value="granted">Consent granted</option>
                          <option value="opted_out">Opted out</option>
                        </select>
                      </UiField>
                    </div>
                    <UiField label="Call date and time" className="crm-field">
                      <input
                        name="appointmentAt"
                        type="datetime-local"
                        defaultValue={dateTimeLocalValue(selected.whatsapp?.appointment_at ?? null)}
                      />
                    </UiField>
                    <div className="crm-form-row crm-workflow-actions">
                      <UiButton variant="primary" type="submit">Save setup</UiButton>
                      {setupComplete && (
                        <UiButton variant="ghost" type="button" onClick={() => setEditingSetup(false)}>Cancel</UiButton>
                      )}
                    </div>
                    {!setupComplete && (
                      <p className="crm-workflow-guidance" data-ready={workflowConfigured}>
                        {workflowSetupGuidance(selected)}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="crm-setup-line">
                    <span>{selected.primary_phone}</span>
                    <span>{WHATSAPP_CONSENT_LABELS[selected.whatsapp!.consent_status]}</span>
                    <span>Call {friendlyDateTime(selected.whatsapp!.appointment_at)}</span>
                    {!optedOut && (
                      <button type="button" className="crm-view-link" onClick={() => setEditingSetup(true)}>Edit</button>
                    )}
                  </div>
                )}

                {workflowError && <UiAlert>{workflowError}</UiAlert>}

                {!optedOut && setupComplete && (
                  <>
                    <div className="crm-workflow-state">
                      <dl>
                        <div><dt>State</dt><dd>{workflowState ? WHATSAPP_STATE_LABELS[workflowState] : 'Not started'}</dd></div>
                        <div>
                          <dt>Next message</dt>
                          <dd title={friendlyDateTime(selected.whatsapp?.next_message_at ?? null)}>
                            {relativeTime(selected.whatsapp?.next_message_at ?? null)}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    {selected.whatsapp?.enabled && selected.whatsapp.next_message_at && (
                      <div className="crm-send-now-row">
                        <UiButton size="small" variant="ghost" type="button" onClick={sendQueuedNow}>
                          {sendNowLabel(workflowState)}
                        </UiButton>
                        <span>Skips the schedule and delivers the queued message immediately.</span>
                      </div>
                    )}

                    <div className="crm-action-cards">
                      {actions.primary && (
                        <button
                          type="button"
                          className="crm-action-card"
                          data-variant="primary"
                          disabled={actions.primary === 'start' && !workflowConfigured}
                          onClick={() => runWhatsAppAction(actions.primary!)}
                        >
                          <strong>{WHATSAPP_ACTION_LABELS[actions.primary]}</strong>
                          <span>{WHATSAPP_ACTION_DESCRIPTIONS[actions.primary]}</span>
                        </button>
                      )}
                      {actions.secondary.map((action) => (
                        <button
                          key={action}
                          type="button"
                          className="crm-action-card"
                          data-variant={action === 'opt_out' ? 'danger' : 'default'}
                          onClick={() => runWhatsAppAction(action)}
                        >
                          <strong>{WHATSAPP_ACTION_LABELS[action]}</strong>
                          <span>{WHATSAPP_ACTION_DESCRIPTIONS[action]}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </form>
            );
          })()}

          {drawerSection === 'activity' && (
            <div className="crm-drawer-view">
            {selected.latest_meeting_summary && (
              <UiPanel className="crm-drawer-section">
                <div className="crm-section-title">
                  <div><h3>Latest call</h3><p>{selected.meeting_count} Fireflies calls linked.</p></div>
                  {selected.latest_meeting_url && (
                    <a className="crm-view-link" href={selected.latest_meeting_url} target="_blank" rel="noreferrer">
                      Transcript
                    </a>
                  )}
                </div>
                <p className="crm-call-summary">{selected.latest_meeting_summary}</p>
              </UiPanel>
            )}

            <UiPanel className="crm-drawer-section crm-activity-section">
              <div className="crm-section-title"><div><h3>Activity</h3><p>Newest recorded event first.</p></div></div>
              <div className="crm-activity-list">
                {selected.activities.map((activity) => (
                  <div key={activity.id}>
                    <span className="crm-activity-dot" />
                    <div>
                      <strong>{activity.subject}</strong>
                      {activity.body && <p>{activity.body}</p>}
                    </div>
                    <time>{friendlyDateTime(activity.occurred_at)}</time>
                  </div>
                ))}
                {!selected.activities.length && <p>No activity recorded yet.</p>}
              </div>
            </UiPanel>
            </div>
          )}
          </div>
        </UiDialog>
      )}
    </>
  );
}
