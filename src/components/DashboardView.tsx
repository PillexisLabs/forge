'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, subDays, parseISO, differenceInCalendarDays } from 'date-fns';
import {
  Card,
  Title,
  Text,
  Metric,
  Flex,
  Grid,
  AreaChart,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Badge,
} from '@tremor/react';
import type { CampaignOption, DailySummaryRow, AdRow, SourceRow, SyncRunRow, PeriodTotals } from '@/modules/analytics/types';
import { buildInsights, type Severity } from '@/modules/analytics/insights';
import ForgeShell from './ForgeShell';

function DeltaBadge({ curr, prev, mode }: { curr: number | null; prev: number; mode: 'higher' | 'lower' | 'neutral' }) {
  if (curr == null || prev === 0) return null;
  const change = ((curr - prev) / prev) * 100;
  if (!isFinite(change) || Math.abs(change) < 0.5) {
    return <span className="text-xs font-medium text-[var(--color-faint)]">~0%</span>;
  }
  const up = change > 0;
  let color = 'text-[var(--color-muted)]';
  if (mode !== 'neutral') {
    const good = mode === 'higher' ? up : !up;
    color = good ? 'text-[var(--color-positive)]' : 'text-[var(--color-critical)]';
  }
  return (
    <span className={`text-xs font-medium ${color}`}>
      {up ? '▲' : '▼'} {up ? '+' : ''}
      {change.toFixed(0)}%
    </span>
  );
}

const CARD = '!rounded-[var(--radius-card)] !border-[var(--color-rule)] !bg-[var(--color-surface-raised)] !shadow-[var(--shadow-card)]';
const titleCls = '!text-[var(--color-ink)]';
const labelCls = '!text-[var(--color-muted)]';
const cellCls = '!text-[var(--color-ink-2)]';

const inr = (v: number | null | undefined) =>
  v == null
    ? '—'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
const num = (v: number | null | undefined) =>
  v == null ? '—' : new Intl.NumberFormat('en-IN').format(Math.round(v));
const pct = (v: number) => `${v.toFixed(1)}%`;
const SEV_DOT: Record<Severity, string> = {
  critical: 'bg-[var(--color-critical)]',
  warning: 'bg-[var(--color-warning)]',
  good: 'bg-[var(--color-positive)]',
  info: 'bg-[var(--color-info)]',
};

function timeAgo(iso: string | null) {
  if (!iso) return '—';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const statusColor = (s: string): 'emerald' | 'amber' | 'rose' =>
  s === 'ok' ? 'emerald' : s === 'partial' ? 'amber' : 'rose';

type ViewId = 'overview' | 'funnel' | 'ads' | 'traffic' | 'sync';

const ANALYTICS_TABS: { id: ViewId; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '/icons/dashboard.svg' },
  { id: 'funnel', label: 'Funnel', icon: '/icons/roadmap.svg' },
  { id: 'ads', label: 'Ads', icon: '/icons/rewards.svg' },
  { id: 'traffic', label: 'Traffic', icon: '/icons/categories.svg' },
  { id: 'sync', label: 'Sync', icon: '/icons/settings.svg' },
];

// ── Pieces ────────────────────────────────────────────────────
function RefreshButton({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  async function refresh() {
    setLoading(true);
    setMsg('');
    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/sync?${params}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Sync failed');
      setMsg(json.status === 'ok' ? 'Synced' : `Synced (${json.status})`);
      router.refresh();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(''), 4000);
    }
  }
  return (
    <div className="flex items-center gap-2">
      {msg && <span className="sync-message hidden text-xs text-[var(--color-muted)] sm:inline">{msg}</span>}
      <button
        type="button"
        onClick={refresh}
        disabled={loading}
        aria-busy={loading}
        className="forge-primary gap-1.5 whitespace-nowrap px-3 py-2 text-[13px] disabled:opacity-60 sm:text-sm"
      >
        <svg
          className={loading ? 'animate-spin' : undefined}
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {loading ? (
            <>
              <circle cx="12" cy="12" r="9" className="opacity-30" />
              <path d="M12 3a9 9 0 0 1 9 9" />
            </>
          ) : (
            <path d="M20 11a8 8 0 1 0 2 5M20 4v7h-7" />
          )}
        </svg>
        {loading ? 'Syncing' : 'Sync data'}
      </button>
    </div>
  );
}

function RangeControls({
  from,
  to,
  onRange,
}: {
  from: string;
  to: string;
  onRange: (from: string, to: string) => void;
}) {
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [customOpen, setCustomOpen] = useState(false);
  const selectedDays = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
  const maxDate = format(new Date(), 'yyyy-MM-dd');
  const valid = draftFrom <= draftTo && draftTo <= maxDate;

  function selectPreset(days: number) {
    const nextTo = format(new Date(), 'yyyy-MM-dd');
    onRange(format(subDays(new Date(), days - 1), 'yyyy-MM-dd'), nextTo);
  }

  return (
    <div className="w-full min-w-0 md:w-auto">
      <div className="forge-control flex w-full p-1 md:w-auto">
        {[7, 30, 90].map((days) => (
          <button
            key={days}
            type="button"
            onClick={() => selectPreset(days)}
            className={`min-h-10 flex-1 whitespace-nowrap rounded-md px-2 py-2 text-[13px] font-medium transition sm:px-3 md:flex-none ${
              selectedDays === days
                ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]'
                : 'text-[var(--color-muted)] hover:bg-[var(--color-surface)]'
            }`}
          >
            {days} days
          </button>
        ))}
        <button
          type="button"
          aria-expanded={customOpen}
          onClick={() => setCustomOpen((open) => !open)}
          className={`min-h-10 flex-1 whitespace-nowrap rounded-md px-2 py-2 text-[13px] font-medium transition sm:px-3 md:flex-none ${
            customOpen || ![7, 30, 90].includes(selectedDays)
              ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]'
              : 'text-[var(--color-muted)] hover:bg-[var(--color-surface)]'
          }`}
        >
          Custom
        </button>
      </div>
      {customOpen && (
        <div className="forge-card mt-2 grid grid-cols-2 gap-2 p-3 md:flex md:items-end">
          <label className="grid min-w-0 gap-1 text-xs font-medium text-[var(--color-muted)]">
            From
            <input
              type="date"
              value={draftFrom}
              max={draftTo}
              onChange={(event) => setDraftFrom(event.target.value)}
              className="forge-control min-w-0 px-2.5 py-2 text-sm font-normal"
            />
          </label>
          <label className="grid min-w-0 gap-1 text-xs font-medium text-[var(--color-muted)]">
            To
            <input
              type="date"
              value={draftTo}
              min={draftFrom}
              max={maxDate}
              onChange={(event) => setDraftTo(event.target.value)}
              className="forge-control min-w-0 px-2.5 py-2 text-sm font-normal"
            />
          </label>
          <button
            type="button"
            disabled={!valid || (draftFrom === from && draftTo === to)}
            onClick={() => {
              onRange(draftFrom, draftTo);
              setCustomOpen(false);
            }}
            className="forge-primary col-span-2 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 md:col-span-1"
          >
            Apply range
          </button>
        </div>
      )}
    </div>
  );
}

function SyncStatus({ run }: { run: SyncRunRow | null }) {
  if (!run) return null;
  // A green dot next to week-old data reads as "healthy" when it isn't.
  const ageDays = run.finished_at
    ? (Date.now() - new Date(run.finished_at).getTime()) / 86_400_000
    : Number.POSITIVE_INFINITY;
  const staleness = ageDays >= 7 ? 'stale' : ageDays >= 2 ? 'aging' : 'fresh';
  const dot = run.status !== 'ok'
    ? run.status === 'partial' ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-critical)]'
    : staleness === 'stale'
      ? 'bg-[var(--color-critical)]'
      : staleness === 'aging'
        ? 'bg-[var(--color-warning)]'
        : 'bg-[var(--color-positive)]';
  const label = run.status !== 'ok'
    ? `${run.error_count} issue${run.error_count === 1 ? '' : 's'}`
    : staleness === 'fresh'
      ? 'All sources synced'
      : 'Sync overdue — run a sync for current numbers';
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5 text-[var(--color-muted)]">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <span>Updated {timeAgo(run.finished_at)}</span>
      <span className="text-[var(--color-rule-strong)]">·</span>
      <span>{label}</span>
    </div>
  );
}

function InsightsPanel({ insights }: { insights: ReturnType<typeof buildInsights> }) {
  return (
    <Card className={`${CARD} !h-full !p-4 sm:!p-6`}>
      <Flex alignItems="baseline">
        <Title className={`${titleCls} !text-lg sm:!text-xl`}>What&apos;s happening</Title>
        <Text className="!text-xs !text-[var(--color-muted)] sm:!text-sm">This range</Text>
      </Flex>
      <div className="mt-4 space-y-4">
        {insights.map((ins, i) => (
          <div key={i} className={`${i >= 3 ? 'hidden md:flex' : 'flex'} gap-2.5`}>
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEV_DOT[ins.severity]}`} />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-5 text-[var(--color-ink)]">{ins.title}</p>
              <p className="mt-0.5 text-[13px] leading-[1.45] text-[var(--color-muted)] sm:text-sm">{ins.detail}</p>
              {ins.action && (
                <p className="mt-1 text-xs leading-4 text-[var(--color-muted)] sm:text-[13px]">
                  <span className="font-semibold text-[var(--color-ink-2)]">→ Do: </span>
                  {ins.action}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ConversionFunnel({
  clicks,
  sessions,
  engagedSessions,
  bookCallClicks,
  bookings,
  impressions,
  ctr,
}: {
  clicks: number;
  sessions: number;
  engagedSessions: number;
  bookCallClicks: number;
  bookings: number;
  impressions: number;
  ctr: number;
}) {
  const stages = [
    { label: 'Ad clicks', value: clicks },
    { label: 'Sessions', value: sessions },
    { label: 'Engaged sessions', value: engagedSessions },
    { label: 'Book-call clicks', value: bookCallClicks },
    { label: 'Bookings', value: bookings },
  ];
  const conv = stages.map((s, idx) =>
    idx === 0 ? 100 : stages[idx - 1].value > 0 ? (s.value / stages[idx - 1].value) * 100 : 0,
  );
  let leakIdx = -1;
  let leakVal = Infinity;
  for (let idx = 1; idx < stages.length; idx++) {
    if (conv[idx] < leakVal) {
      leakVal = conv[idx];
      leakIdx = idx;
    }
  }
  return (
    <div>
      <Text className="!text-[13px] !leading-5 !text-[var(--color-muted)] sm:!text-sm">
        {num(impressions)} impressions · {ctr.toFixed(2)}% CTR → {num(clicks)} clicks
      </Text>
      <div className="mt-3">
        {stages.map((s, idx) => {
          const isLeak = idx === leakIdx;
          const width = Math.max(3, conv[idx]);
          return (
            <div key={idx} className="py-1.5">
              <Flex>
                <Text className={`${isLeak ? '!text-[var(--color-critical)] !font-medium' : '!text-[var(--color-ink-2)]'} !text-[13px] sm:!text-sm`}>
                  {s.label}
                  {isLeak ? ' · leak' : ''}
                </Text>
                <Text className="!text-[13px] !text-[var(--color-muted)] sm:!text-sm">
                  {num(s.value)}
                  {idx > 0 ? ` · ${conv[idx].toFixed(0)}%` : ''}
                </Text>
              </Flex>
              <div className="mt-1 h-2 w-full rounded-[var(--radius-small)] bg-[var(--color-surface)]">
                <div
                  className={`h-2 rounded-[var(--radius-small)] ${isLeak ? 'bg-[var(--color-critical)]' : 'bg-[var(--color-accent)]'}`}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdsTable({ ads, rangeTo }: { ads: AdRow[]; rangeTo: string }) {
  if (ads.length === 0) return <Text className="mt-2 !text-[var(--color-muted)]">No ad data in this range.</Text>;
  // An ad counts as "ended" if its last delivery was 2+ days before the range
  // end — enough buffer for today's partial day + Meta reporting lag, so a
  // still-running ad that just hasn't spent yet today is not mislabelled. Ended
  // ads stay in the table (their historical spend is real) but are dimmed and
  // dated so a removed ad reads differently from a live one.
  const endedBefore = (last: string | null) =>
    last != null && differenceInCalendarDays(parseISO(rangeTo), parseISO(last)) >= 2 ? last : null;
  return (
    <>
      <div className="mt-4 space-y-2.5 md:hidden">
        {ads.map((ad, index) => {
          const ended = endedBefore(ad.last_active);
          return (
            <div key={index} className={`forge-subtle-card p-3.5 ${ended ? 'opacity-70' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-5 text-[var(--color-ink)]">{ad.ad_name ?? 'Unnamed ad'}</p>
                  <p className="truncate text-xs leading-4 text-[var(--color-muted)]">{ad.campaign_name ?? 'No campaign'}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-[var(--color-ink)]">{inr(ad.spend)}</p>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs leading-4">
                <div className="min-w-0"><span className="block text-[var(--color-faint)]">CTR</span><span className="font-medium text-[var(--color-ink-2)]">{pct(ad.ctr)}</span></div>
                <div className="min-w-0"><span className="block text-[var(--color-faint)]">Bookings</span><span className="font-medium text-[var(--color-ink-2)]">{ad.schedules}</span></div>
                <div className="min-w-0"><span className="block whitespace-nowrap text-[var(--color-faint)]">Cost / booking</span><span className="font-medium text-[var(--color-ink-2)]">{inr(ad.cost_per_schedule)}</span></div>
              </div>
            </div>
          );
        })}
      </div>
      <Table className="mt-4 hidden md:table">
      <TableHead>
        <TableRow>
          <TableHeaderCell className={labelCls}>Ad</TableHeaderCell>
          <TableHeaderCell className={labelCls}>Campaign</TableHeaderCell>
          <TableHeaderCell className={`${labelCls} text-right`}>Spend</TableHeaderCell>
          <TableHeaderCell className={`${labelCls} text-right`}>CTR</TableHeaderCell>
          <TableHeaderCell className={`${labelCls} text-right`}>Bookings</TableHeaderCell>
          <TableHeaderCell className={`${labelCls} text-right`}>Cost / booking</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {ads.map((a, i) => {
          const ended = endedBefore(a.last_active);
          return (
          <TableRow key={i} className={ended ? 'opacity-55' : undefined}>
            <TableCell className={`${cellCls} max-w-[220px] truncate`}>
              {a.ad_name ?? '—'}
              {ended && (
                <span className="ml-2 whitespace-nowrap text-xs font-normal text-[var(--color-faint)]">
                  · ended {format(parseISO(ended), 'MMM d')}
                </span>
              )}
            </TableCell>
            <TableCell className="max-w-[180px] truncate !text-[var(--color-muted)]">{a.campaign_name ?? '—'}</TableCell>
            <TableCell className={`${cellCls} text-right`}>{inr(a.spend)}</TableCell>
            <TableCell className={`${labelCls} text-right`}>{pct(a.ctr)}</TableCell>
            <TableCell className="text-right">
              {a.schedules > 0 ? <Badge color="emerald">{a.schedules}</Badge> : <span className="text-[var(--color-faint)]">0</span>}
            </TableCell>
            <TableCell className={`${cellCls} text-right`}>{inr(a.cost_per_schedule)}</TableCell>
          </TableRow>
          );
        })}
      </TableBody>
      </Table>
    </>
  );
}

function SourcesTable({ sources }: { sources: SourceRow[] }) {
  if (sources.length === 0) return <Text className="mt-2 !text-[var(--color-muted)]">No source data in this range.</Text>;
  return (
    <>
      <div className="mt-4 space-y-2 md:hidden">
        {sources.map((source, index) => {
          const rate = source.sessions > 0 ? (source.leads / source.sessions) * 100 : 0;
          return (
            <div key={index} className="forge-subtle-card p-3">
              <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
                {source.source} <span className="font-normal text-[var(--color-faint)]">/ {source.medium}</span>
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div><span className="block text-[var(--color-faint)]">Sessions</span><span className="font-medium text-[var(--color-ink-2)]">{num(source.sessions)}</span></div>
                <div><span className="block text-[var(--color-faint)]">Bookings</span><span className="font-medium text-[var(--color-ink-2)]">{num(source.leads)}</span></div>
                <div><span className="block text-[var(--color-faint)]">Conversion</span><span className="font-medium text-[var(--color-ink-2)]">{rate > 0 ? pct(rate) : '—'}</span></div>
              </div>
            </div>
          );
        })}
      </div>
      <Table className="mt-4 hidden md:table">
      <TableHead>
        <TableRow>
          <TableHeaderCell className={labelCls}>Source / Medium</TableHeaderCell>
          <TableHeaderCell className={`${labelCls} text-right`}>Sessions</TableHeaderCell>
          <TableHeaderCell className={`${labelCls} text-right`}>Book-call clicks</TableHeaderCell>
          <TableHeaderCell className={`${labelCls} text-right`}>Bookings</TableHeaderCell>
          <TableHeaderCell className={`${labelCls} text-right`}>Conv. rate</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {sources.map((s, i) => {
          const rate = s.sessions > 0 ? (s.leads / s.sessions) * 100 : 0;
          return (
            <TableRow key={i}>
              <TableCell className={cellCls}>
                {s.source} <span className="text-[var(--color-faint)]">/ {s.medium}</span>
              </TableCell>
              <TableCell className={`${cellCls} text-right`}>{num(s.sessions)}</TableCell>
              <TableCell className={`${labelCls} text-right`}>{num(s.book_call_clicks)}</TableCell>
              <TableCell className="text-right">
                {s.leads > 0 ? <Badge color="emerald">{s.leads}</Badge> : <span className="text-[var(--color-faint)]">0</span>}
              </TableCell>
              <TableCell className={`${labelCls} text-right`}>{rate > 0 ? pct(rate) : '—'}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      </Table>
    </>
  );
}

function SyncLog({ runs }: { runs: SyncRunRow[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (runs.length === 0) return <Text className="mt-2 !text-[var(--color-muted)]">No sync runs recorded yet.</Text>;
  return (
    <div className="mt-4 divide-y divide-[var(--color-rule)]">
      {runs.map((r, i) => (
        <div key={i} className="py-2.5">
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left text-sm"
            disabled={r.error_count === 0}
          >
            <Badge color={statusColor(r.status)}>{r.status}</Badge>
            <span className={cellCls.replace(/!/g, '')}>{timeAgo(r.finished_at)}</span>
            <span className="text-[var(--color-muted)]">via {r.trigger}</span>
            <span className="text-[var(--color-muted)]">{r.duration_ms != null ? `${r.duration_ms}ms` : ''}</span>
            {r.error_count > 0 && (
              <span className="ml-auto font-medium text-[var(--color-critical)]">
                {r.error_count} issue{r.error_count === 1 ? '' : 's'} {open === i ? '▲' : '▼'}
              </span>
            )}
          </button>
          {open === i && r.errors.length > 0 && (
            <ul className="mt-2 space-y-1 pl-2 text-xs text-[var(--color-critical)]">
              {r.errors.map((e, j) => (
                <li key={j} className="font-mono">
                  {e}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function DashboardView({
  summary,
  ads,
  sources,
  from,
  to,
  syncRuns,
  prev,
  prevDays,
  campaigns,
  campaignId,
  initialView,
}: {
  summary: DailySummaryRow[];
  ads: AdRow[];
  sources: SourceRow[];
  from: string;
  to: string;
  syncRuns: SyncRunRow[];
  prev: PeriodTotals;
  prevDays: number;
  campaigns: CampaignOption[];
  campaignId: string | null;
  initialView?: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewId>(
    ANALYTICS_TABS.some((candidate) => candidate.id === initialView) ? (initialView as ViewId) : 'overview',
  );

  // The persistent sidebar navigates with ?view= links; follow them.
  useEffect(() => {
    if (initialView && initialView !== view && ANALYTICS_TABS.some((candidate) => candidate.id === initialView)) {
      setView(initialView as ViewId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialView]);
  const lastSync = syncRuns[0] ?? null;

  const t = summary.reduce(
    (acc, r) => {
      acc.spend += r.meta_spend;
      acc.impressions += r.meta_impressions;
      acc.clicks += r.meta_clicks;
      acc.schedules += r.meta_schedules;
      acc.sessions += r.ga_sessions;
      acc.engagedSessions += r.ga_engaged_sessions;
      acc.users += r.ga_users;
      acc.bookCallClicks += r.ga_book_call_clicks;
      acc.leads += r.ga_leads;
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, schedules: 0, sessions: 0, engagedSessions: 0, users: 0, bookCallClicks: 0, leads: 0 },
  );

  const bookings = t.schedules || t.leads;
  const costPerBooking = bookings > 0 ? t.spend / bookings : null;
  const ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
  const bookRate = t.sessions > 0 ? (t.bookCallClicks / t.sessions) * 100 : 0;
  const sessionToBooking = t.sessions > 0 ? (bookings / t.sessions) * 100 : 0;

  // Previous-period equivalents for deltas.
  const pBookings = prev.schedules || prev.leads;
  const pCostPerBooking = pBookings > 0 ? prev.spend / pBookings : 0;
  const pSessionToBooking = prev.sessions > 0 ? (pBookings / prev.sessions) * 100 : 0;
  const pBookRate = prev.sessions > 0 ? (prev.bookCallClicks / prev.sessions) * 100 : 0;
  const hasPrev = prev.sessions > 0 || prev.spend > 0;

  const insights = buildInsights({
    spend: t.spend,
    impressions: t.impressions,
    clicks: t.clicks,
    sessions: t.sessions,
    engagedSessions: t.engagedSessions,
    bookCallClicks: t.bookCallClicks,
    bookings,
    ads,
    summary,
    to,
  });

  const chartData = [...summary].reverse().map((r) => ({
    date: r.date.slice(5),
    'Cost / booking (₹)': r.cost_per_booking ?? 0,
    'Spend (₹)': r.meta_spend,
  }));

  function onRange(nextFrom: string, nextTo: string) {
    const params = new URLSearchParams({ from: nextFrom, to: nextTo });
    if (campaignId) params.set('campaign', campaignId);
    router.push(`/?${params}`);
  }

  function onCampaign(nextCampaignId: string) {
    const params = new URLSearchParams({ from, to });
    if (nextCampaignId) params.set('campaign', nextCampaignId);
    router.push(`/?${params}`);
  }

  const rangeLabel = `${from} → ${to} · ${prevDays} days selected · ${summary.length} with data`;

  const vsLabel = `vs prev ${prevDays}d`;
  const KpiCards = (
    <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4 lg:gap-4">
      <Card className={`${CARD} !p-3.5 sm:!p-5`}>
        <Flex alignItems="start">
          <Text className={`${labelCls} !text-[13px] !leading-[1.35] sm:!text-sm`}>Cost per booked call</Text>
          {hasPrev && <DeltaBadge curr={costPerBooking} prev={pCostPerBooking} mode="lower" />}
        </Flex>
        <Metric className={`${titleCls} !mt-1 !text-2xl !leading-tight sm:!text-[1.75rem]`}>{inr(costPerBooking)}</Metric>
        <Text className="!mt-1 !text-[13px] !leading-[1.4] !text-[var(--color-muted)] sm:!text-sm">{bookings > 0 ? `${num(bookings)} bookings · ${vsLabel}` : 'No bookings yet'}</Text>
      </Card>
      <Card className={`${CARD} !p-3.5 sm:!p-5`}>
        <Flex alignItems="start">
          <Text className={`${labelCls} !text-[13px] !leading-[1.35] sm:!text-sm`}>Session → booking rate</Text>
          {hasPrev && <DeltaBadge curr={sessionToBooking} prev={pSessionToBooking} mode="higher" />}
        </Flex>
        <Metric className={`${titleCls} !mt-1 !text-2xl !leading-tight sm:!text-[1.75rem]`}>{pct(sessionToBooking)}</Metric>
        <Text className="!mt-1 !text-[13px] !leading-[1.4] !text-[var(--color-muted)] sm:!text-sm">{num(t.sessions)} sessions · {num(bookings)} booked</Text>
      </Card>
      <Card className={`${CARD} !p-3.5 sm:!p-5`}>
        <Flex alignItems="start">
          <Text className={`${labelCls} !text-[13px] !leading-[1.35] sm:!text-sm`}>Ad spend</Text>
          {hasPrev && <DeltaBadge curr={t.spend} prev={prev.spend} mode="neutral" />}
        </Flex>
        <Metric className={`${titleCls} !mt-1 !text-2xl !leading-tight sm:!text-[1.75rem]`}>{inr(t.spend)}</Metric>
        <Text className="!mt-1 !text-[13px] !leading-[1.4] !text-[var(--color-muted)] sm:!text-sm">{ctr.toFixed(2)}% CTR · {num(t.clicks)} clicks</Text>
      </Card>
      <Card className={`${CARD} !p-3.5 sm:!p-5`}>
        <Flex alignItems="start">
          <Text className={`${labelCls} !text-[13px] !leading-[1.35] sm:!text-sm`}>Book-call intent</Text>
          {hasPrev && <DeltaBadge curr={bookRate} prev={pBookRate} mode="higher" />}
        </Flex>
        <Metric className={`${titleCls} !mt-1 !text-2xl !leading-tight sm:!text-[1.75rem]`}>{pct(bookRate)}</Metric>
        <Text className="!mt-1 !text-[13px] !leading-[1.4] !text-[var(--color-muted)] sm:!text-sm">{num(t.bookCallClicks)} of {num(t.sessions)} sessions</Text>
      </Card>
    </div>
  );

  const FunnelCard = (
    <Card className={`${CARD} !h-full !p-4 sm:!p-6`}>
      <Title className={`${titleCls} !text-lg sm:!text-xl`}>Conversion funnel</Title>
      <Text className="!text-[13px] !text-[var(--color-muted)] sm:!text-sm">Where the range leaks</Text>
      <div className="mt-3">
        <ConversionFunnel
          clicks={t.clicks}
          sessions={t.sessions}
          engagedSessions={t.engagedSessions}
          bookCallClicks={t.bookCallClicks}
          bookings={bookings}
          impressions={t.impressions}
          ctr={ctr}
        />
      </div>
    </Card>
  );

  const TrendCard = (
    <Card className={`${CARD} !p-4 sm:!p-6`}>
      <Title className={`${titleCls} !text-lg sm:!text-xl`}>Cost per booking & spend</Title>
      <Text className="!text-[13px] !leading-5 !text-[var(--color-muted)] sm:!text-sm">{rangeLabel}</Text>
      <AreaChart
        className="mt-4 h-72"
        data={chartData}
        index="date"
        categories={['Cost / booking (₹)', 'Spend (₹)']}
        colors={['rose', 'amber']}
        valueFormatter={(v) => inr(v)}
        yAxisWidth={64}
        showLegend
      />
    </Card>
  );

  function renderView() {
    if (summary.length === 0 && view !== 'sync') {
      return (
        <Card className={CARD}>
          <Title className={titleCls}>No data in this range</Title>
          <Text className="!text-[var(--color-muted)]">Pick a different range, or sync recent days.</Text>
        </Card>
      );
    }
    switch (view) {
      case 'overview':
        return (
          <div className="space-y-4 md:space-y-6">
            {KpiCards}
            <div className="grid gap-4 lg:grid-cols-2">
              <InsightsPanel insights={insights} />
              {FunnelCard}
            </div>
            {TrendCard}
          </div>
        );
      case 'funnel':
        return (
          <div className="space-y-6">
            {FunnelCard}
            {TrendCard}
          </div>
        );
      case 'ads':
        return (
          <Card className={`${CARD} !p-3 sm:!p-4`}>
            <Title className={`${titleCls} !text-lg sm:!text-xl`}>Meta ads · range total</Title>
            <AdsTable ads={ads} rangeTo={to} />
          </Card>
        );
      case 'traffic':
        return (
          <Card className={`${CARD} !p-4 sm:!p-6`}>
            <Title className={`${titleCls} !text-lg sm:!text-xl`}>Traffic sources · range total</Title>
            <SourcesTable sources={sources} />
          </Card>
        );
      case 'sync':
        return (
          <Card className={CARD}>
            <Title className={titleCls}>Sync log</Title>
            <Text className="!text-[var(--color-muted)]">Last {syncRuns.length} runs · tap a failed run to see errors</Text>
            <SyncLog runs={syncRuns} />
          </Card>
        );
    }
  }

  return (
    <ForgeShell
      activeArea="analytics"
      title="Marketing analytics"
      description="GA4 and Meta Ads joined around the cost of every booked call."
      tabs={ANALYTICS_TABS.map((tab) => ({
        ...tab,
        attention: tab.id === 'sync' && Boolean(lastSync && lastSync.status !== 'ok'),
      }))}
      activeTab={view}
      onTabChange={(next) => {
        setView(next);
        const url = new URL(window.location.href);
        url.searchParams.set('view', next);
        window.history.replaceState(null, '', url);
      }}
      actions={<RefreshButton from={from} to={to} />}
      status={
        <div>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            {format(parseISO(from), 'MMM d')} to {format(parseISO(to), 'MMM d')} · {summary.length} synced days
          </p>
          <SyncStatus run={lastSync} />
        </div>
      }
    >
      <div className="mb-5 flex w-full min-w-0 flex-col items-stretch gap-2.5 sm:flex-row sm:items-start">
        <RangeControls key={`${from}:${to}`} from={from} to={to} onRange={onRange} />
        <label className="min-w-0">
          <span className="sr-only">Campaign</span>
          <select
            value={campaignId ?? ''}
            onChange={(event) => onCampaign(event.target.value)}
            className="forge-control w-full px-3 py-2.5 text-[13px] font-medium sm:w-64"
          >
            <option value="">All campaigns</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
            ))}
          </select>
        </label>
      </div>

      {renderView()}
    </ForgeShell>
  );
}
