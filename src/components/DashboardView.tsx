'use client';

import { useState, type ReactNode } from 'react';
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
import type { DailySummaryRow, AdRow, SourceRow, SyncRunRow, PeriodTotals } from '@/lib/types';
import { buildInsights, type Severity } from '@/lib/insights';
import ThemeToggle from './ThemeToggle';

function DeltaBadge({ curr, prev, mode }: { curr: number | null; prev: number; mode: 'higher' | 'lower' | 'neutral' }) {
  if (curr == null || prev === 0) return null;
  const change = ((curr - prev) / prev) * 100;
  if (!isFinite(change) || Math.abs(change) < 0.5) {
    return <span className="text-xs font-medium text-gray-400 dark:text-gray-600">~0%</span>;
  }
  const up = change > 0;
  let color = 'text-gray-500';
  if (mode !== 'neutral') {
    const good = mode === 'higher' ? up : !up;
    color = good ? 'text-emerald-500' : 'text-rose-500';
  }
  return (
    <span className={`text-xs font-medium ${color}`}>
      {up ? '▲' : '▼'} {up ? '+' : ''}
      {change.toFixed(0)}%
    </span>
  );
}

const CARD = '!bg-white dark:!bg-[#141417] !border-gray-200 dark:!border-white/10';
const titleCls = '!text-gray-900 dark:!text-white';
const labelCls = '!text-gray-500 dark:!text-gray-400';
const cellCls = '!text-gray-700 dark:!text-gray-200';

const inr = (v: number | null | undefined) =>
  v == null
    ? '—'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
const num = (v: number | null | undefined) =>
  v == null ? '—' : new Intl.NumberFormat('en-IN').format(Math.round(v));
const pct = (v: number) => `${v.toFixed(1)}%`;
const SEV_DOT: Record<Severity, string> = {
  critical: 'bg-rose-500',
  warning: 'bg-amber-500',
  good: 'bg-emerald-500',
  info: 'bg-sky-500',
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

// ── Navigation ────────────────────────────────────────────────
type ViewId = 'overview' | 'funnel' | 'ads' | 'traffic' | 'sync';

function NavIcon({ id }: { id: ViewId }) {
  const p: Record<ViewId, ReactNode> = {
    overview: <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />,
    funnel: <path d="M3 4h18l-7 8v7l-4 2v-9z" />,
    ads: <path d="M3 11l18-5v12L3 13v-2zM7 13v4a2 2 0 0 0 4 0" />,
    traffic: <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z" />,
    sync: <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />,
  };
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {p[id]}
    </svg>
  );
}

const NAV_SECTIONS: { section: string; items: { id: ViewId; label: string }[] }[] = [
  {
    section: 'Analyze',
    items: [
      { id: 'overview', label: 'Overview' },
      { id: 'funnel', label: 'Funnel' },
      { id: 'ads', label: 'Ads' },
      { id: 'traffic', label: 'Traffic' },
    ],
  },
  {
    section: 'System',
    items: [{ id: 'sync', label: 'Sync' }],
  },
];

function Sidebar({ view, onSelect, lastStatus }: { view: ViewId; onSelect: (v: ViewId) => void; lastStatus?: string }) {
  return (
    <aside className="hidden min-h-screen w-56 shrink-0 border-r border-gray-200 px-3 py-6 dark:border-white/10 md:block">
      <div className="mb-5 flex items-center gap-2 px-2">
        <span className="h-2.5 w-2.5 rounded-sm bg-[#FF6363] shadow-[0_0_12px_rgba(255,99,99,0.5)]" />
        <span className="text-sm font-semibold text-gray-900 dark:text-white">Pillexis Analytics</span>
      </div>
      <nav className="space-y-4">
        {NAV_SECTIONS.map((sec) => (
          <div key={sec.section}>
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-600">
              {sec.section}
            </p>
            {sec.items.map((item) => {
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                    active
                      ? 'bg-gray-100 font-medium text-gray-900 dark:bg-white/10 dark:text-white'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white'
                  }`}
                >
                  <NavIcon id={item.id} />
                  {item.label}
                  {item.id === 'sync' && lastStatus && lastStatus !== 'ok' && (
                    <span className={`ml-auto h-1.5 w-1.5 rounded-full ${lastStatus === 'partial' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function MobileNav({ view, onSelect, lastStatus }: { view: ViewId; onSelect: (v: ViewId) => void; lastStatus?: string }) {
  const items = NAV_SECTIONS.flatMap((section) => section.items);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-gray-200 bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur dark:border-white/10 dark:bg-[#0a0a0a]/95 md:hidden">
      {items.map((item) => {
        const active = view === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`relative flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-medium transition ${
              active
                ? 'bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-white'
                : 'text-gray-400 dark:text-gray-500'
            }`}
          >
            <NavIcon id={item.id} />
            <span>{item.label}</span>
            {item.id === 'sync' && lastStatus && lastStatus !== 'ok' && (
              <span className={`absolute right-3 top-1.5 h-1.5 w-1.5 rounded-full ${lastStatus === 'partial' ? 'bg-amber-500' : 'bg-rose-500'}`} />
            )}
          </button>
        );
      })}
    </nav>
  );
}

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
      {msg && <span className="hidden text-xs text-gray-500 sm:inline">{msg}</span>}
      <button
        onClick={refresh}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-[#FF6363] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#FF4D4D] disabled:opacity-60"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 11a8 8 0 1 0 2 5M20 4v7h-7" />
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
      <div className="flex w-full rounded-lg border border-gray-200 bg-white p-1 dark:border-white/10 dark:bg-[#141417] md:w-auto">
        {[7, 30, 90].map((days) => (
          <button
            key={days}
            type="button"
            onClick={() => selectPreset(days)}
            className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition md:flex-none ${
              selectedDays === days
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10'
            }`}
          >
            {days} days
          </button>
        ))}
        <button
          type="button"
          aria-expanded={customOpen}
          onClick={() => setCustomOpen((open) => !open)}
          className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition md:flex-none ${
            customOpen || ![7, 30, 90].includes(selectedDays)
              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
              : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10'
          }`}
        >
          Custom
        </button>
      </div>
      {customOpen && (
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-[#141417] md:flex md:items-end">
          <label className="grid min-w-0 gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            From
            <input
              type="date"
              value={draftFrom}
              max={draftTo}
              onChange={(event) => setDraftFrom(event.target.value)}
              className="min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-sm font-normal normal-case tracking-normal text-gray-700 dark:border-white/10 dark:bg-[#0a0a0a] dark:text-gray-200"
            />
          </label>
          <label className="grid min-w-0 gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            To
            <input
              type="date"
              value={draftTo}
              min={draftFrom}
              max={maxDate}
              onChange={(event) => setDraftTo(event.target.value)}
              className="min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-sm font-normal normal-case tracking-normal text-gray-700 dark:border-white/10 dark:bg-[#0a0a0a] dark:text-gray-200"
            />
          </label>
          <button
            type="button"
            disabled={!valid || (draftFrom === from && draftTo === to)}
            onClick={() => {
              onRange(draftFrom, draftTo);
              setCustomOpen(false);
            }}
            className="col-span-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-gray-900 md:col-span-1"
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
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <span className={`h-2 w-2 rounded-full ${run.status === 'ok' ? 'bg-emerald-500' : run.status === 'partial' ? 'bg-amber-500' : 'bg-rose-500'}`} />
      <span>Updated {timeAgo(run.finished_at)}</span>
      <span className="text-gray-300 dark:text-gray-700">·</span>
      <span>{run.status === 'ok' ? 'All sources synced' : `${run.error_count} issue${run.error_count === 1 ? '' : 's'}`}</span>
    </div>
  );
}

function InsightsPanel({ insights }: { insights: ReturnType<typeof buildInsights> }) {
  return (
    <Card className={CARD}>
      <Flex>
        <Title className={titleCls}>What&apos;s happening</Title>
        <Text className="!text-gray-500">read of this range</Text>
      </Flex>
      <div className="mt-4 space-y-3.5">
        {insights.map((ins, i) => (
          <div key={i} className={`${i >= 3 ? 'hidden md:flex' : 'flex'} gap-3`}>
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEV_DOT[ins.severity]}`} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{ins.title}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{ins.detail}</p>
              {ins.action && (
                <p className="mt-0.5 text-xs text-gray-500">
                  <span className="font-semibold text-gray-600 dark:text-gray-400">→ Do: </span>
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
  bookCallClicks,
  bookings,
  impressions,
  ctr,
}: {
  clicks: number;
  sessions: number;
  bookCallClicks: number;
  bookings: number;
  impressions: number;
  ctr: number;
}) {
  const stages = [
    { label: 'Ad clicks', value: clicks },
    { label: 'Sessions', value: sessions },
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
      <Text className="!text-gray-500">
        {num(impressions)} impressions · {ctr.toFixed(2)}% CTR → {num(clicks)} clicks
      </Text>
      <div className="mt-3">
        {stages.map((s, idx) => {
          const isLeak = idx === leakIdx;
          const width = Math.max(3, conv[idx]);
          return (
            <div key={idx} className="py-1.5">
              <Flex>
                <Text className={isLeak ? '!text-rose-500 !font-medium' : '!text-gray-700 dark:!text-gray-300'}>
                  {s.label}
                  {isLeak ? ' · leak' : ''}
                </Text>
                <Text className="!text-gray-500 dark:!text-gray-400">
                  {num(s.value)}
                  {idx > 0 ? ` · ${conv[idx].toFixed(0)}%` : ''}
                </Text>
              </Flex>
              <div className="mt-1 h-2 w-full rounded-full bg-gray-200 dark:bg-white/5">
                <div
                  className={`h-2 rounded-full ${isLeak ? 'bg-rose-500' : 'bg-gradient-to-r from-[#FFA48A] to-[#FF6363]'}`}
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
  if (ads.length === 0) return <Text className="!text-gray-500 mt-2">No ad data in this range.</Text>;
  // An ad counts as "ended" if its last delivery was 2+ days before the range
  // end — enough buffer for today's partial day + Meta reporting lag, so a
  // still-running ad that just hasn't spent yet today is not mislabelled. Ended
  // ads stay in the table (their historical spend is real) but are dimmed and
  // dated so a removed ad reads differently from a live one.
  const endedBefore = (last: string | null) =>
    last != null && differenceInCalendarDays(parseISO(rangeTo), parseISO(last)) >= 2 ? last : null;
  return (
    <>
      <div className="mt-4 space-y-2 md:hidden">
        {ads.map((ad, index) => {
          const ended = endedBefore(ad.last_active);
          return (
            <div key={index} className={`rounded-lg bg-gray-50 p-3 dark:bg-white/5 ${ended ? 'opacity-55' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{ad.ad_name ?? 'Unnamed ad'}</p>
                  <p className="truncate text-xs text-gray-500">{ad.campaign_name ?? 'No campaign'}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-gray-900 dark:text-white">{inr(ad.spend)}</p>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div><span className="block text-gray-400">CTR</span><span className="font-medium text-gray-700 dark:text-gray-200">{pct(ad.ctr)}</span></div>
                <div><span className="block text-gray-400">Bookings</span><span className="font-medium text-gray-700 dark:text-gray-200">{ad.schedules}</span></div>
                <div><span className="block text-gray-400">Cost / booking</span><span className="font-medium text-gray-700 dark:text-gray-200">{inr(ad.cost_per_schedule)}</span></div>
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
                <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500 whitespace-nowrap">
                  · ended {format(parseISO(ended), 'MMM d')}
                </span>
              )}
            </TableCell>
            <TableCell className="!text-gray-500 max-w-[180px] truncate">{a.campaign_name ?? '—'}</TableCell>
            <TableCell className={`${cellCls} text-right`}>{inr(a.spend)}</TableCell>
            <TableCell className={`${labelCls} text-right`}>{pct(a.ctr)}</TableCell>
            <TableCell className="text-right">
              {a.schedules > 0 ? <Badge color="emerald">{a.schedules}</Badge> : <span className="text-gray-400 dark:text-gray-600">0</span>}
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
  if (sources.length === 0) return <Text className="!text-gray-500 mt-2">No source data in this range.</Text>;
  return (
    <>
      <div className="mt-4 space-y-2 md:hidden">
        {sources.map((source, index) => {
          const rate = source.sessions > 0 ? (source.leads / source.sessions) * 100 : 0;
          return (
            <div key={index} className="rounded-lg bg-gray-50 p-3 dark:bg-white/5">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                {source.source} <span className="font-normal text-gray-400">/ {source.medium}</span>
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div><span className="block text-gray-400">Sessions</span><span className="font-medium text-gray-700 dark:text-gray-200">{num(source.sessions)}</span></div>
                <div><span className="block text-gray-400">Bookings</span><span className="font-medium text-gray-700 dark:text-gray-200">{num(source.leads)}</span></div>
                <div><span className="block text-gray-400">Conversion</span><span className="font-medium text-gray-700 dark:text-gray-200">{rate > 0 ? pct(rate) : '—'}</span></div>
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
                {s.source} <span className="text-gray-400 dark:text-gray-600">/ {s.medium}</span>
              </TableCell>
              <TableCell className={`${cellCls} text-right`}>{num(s.sessions)}</TableCell>
              <TableCell className={`${labelCls} text-right`}>{num(s.book_call_clicks)}</TableCell>
              <TableCell className="text-right">
                {s.leads > 0 ? <Badge color="emerald">{s.leads}</Badge> : <span className="text-gray-400 dark:text-gray-600">0</span>}
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
  if (runs.length === 0) return <Text className="!text-gray-500 mt-2">No sync runs recorded yet.</Text>;
  return (
    <div className="mt-4 divide-y divide-gray-100 dark:divide-white/5">
      {runs.map((r, i) => (
        <div key={i} className="py-2.5">
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left text-sm"
            disabled={r.error_count === 0}
          >
            <Badge color={statusColor(r.status)}>{r.status}</Badge>
            <span className={cellCls.replace(/!/g, '')}>{timeAgo(r.finished_at)}</span>
            <span className="text-gray-500">via {r.trigger}</span>
            <span className="text-gray-500">{r.duration_ms != null ? `${r.duration_ms}ms` : ''}</span>
            {r.error_count > 0 && (
              <span className="ml-auto font-medium text-rose-500">
                {r.error_count} issue{r.error_count === 1 ? '' : 's'} {open === i ? '▲' : '▼'}
              </span>
            )}
          </button>
          {open === i && r.errors.length > 0 && (
            <ul className="mt-2 space-y-1 pl-2 text-xs text-rose-500/90">
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
}: {
  summary: DailySummaryRow[];
  ads: AdRow[];
  sources: SourceRow[];
  from: string;
  to: string;
  syncRuns: SyncRunRow[];
  prev: PeriodTotals;
  prevDays: number;
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewId>('overview');
  const lastSync = syncRuns[0] ?? null;

  const t = summary.reduce(
    (acc, r) => {
      acc.spend += r.meta_spend;
      acc.impressions += r.meta_impressions;
      acc.clicks += r.meta_clicks;
      acc.schedules += r.meta_schedules;
      acc.sessions += r.ga_sessions;
      acc.users += r.ga_users;
      acc.bookCallClicks += r.ga_book_call_clicks;
      acc.leads += r.ga_leads;
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, schedules: 0, sessions: 0, users: 0, bookCallClicks: 0, leads: 0 },
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
    router.push(`/?from=${nextFrom}&to=${nextTo}`);
  }

  const rangeLabel = `${from} → ${to} · ${prevDays} days selected · ${summary.length} with data`;

  const vsLabel = `vs prev ${prevDays}d`;
  const KpiCards = (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <Card className={`${CARD} !p-4 sm:!p-6`}>
        <Flex alignItems="start">
          <Text className={labelCls}>Cost per booked call</Text>
          {hasPrev && <DeltaBadge curr={costPerBooking} prev={pCostPerBooking} mode="lower" />}
        </Flex>
        <Metric className={`${titleCls} !text-2xl sm:!text-3xl`}>{inr(costPerBooking)}</Metric>
        <Text className="!text-gray-500">{bookings > 0 ? `${num(bookings)} bookings · ${vsLabel}` : 'no bookings yet'}</Text>
      </Card>
      <Card className={`${CARD} !p-4 sm:!p-6`}>
        <Flex alignItems="start">
          <Text className={labelCls}>Session → booking rate</Text>
          {hasPrev && <DeltaBadge curr={sessionToBooking} prev={pSessionToBooking} mode="higher" />}
        </Flex>
        <Metric className={`${titleCls} !text-2xl sm:!text-3xl`}>{pct(sessionToBooking)}</Metric>
        <Text className="!text-gray-500">{num(t.sessions)} sessions · {num(bookings)} booked</Text>
      </Card>
      <Card className={`${CARD} !p-4 sm:!p-6`}>
        <Flex alignItems="start">
          <Text className={labelCls}>Ad spend</Text>
          {hasPrev && <DeltaBadge curr={t.spend} prev={prev.spend} mode="neutral" />}
        </Flex>
        <Metric className={`${titleCls} !text-2xl sm:!text-3xl`}>{inr(t.spend)}</Metric>
        <Text className="!text-gray-500">{ctr.toFixed(2)}% CTR · {num(t.clicks)} clicks</Text>
      </Card>
      <Card className={`${CARD} !p-4 sm:!p-6`}>
        <Flex alignItems="start">
          <Text className={labelCls}>Book-call intent</Text>
          {hasPrev && <DeltaBadge curr={bookRate} prev={pBookRate} mode="higher" />}
        </Flex>
        <Metric className={`${titleCls} !text-2xl sm:!text-3xl`}>{pct(bookRate)}</Metric>
        <Text className="!text-gray-500">{num(t.bookCallClicks)} of {num(t.sessions)} sessions</Text>
      </Card>
    </div>
  );

  const FunnelCard = (
    <Card className={CARD}>
      <Title className={titleCls}>Conversion funnel</Title>
      <Text className="!text-gray-500">Where the range leaks</Text>
      <div className="mt-3">
        <ConversionFunnel
          clicks={t.clicks}
          sessions={t.sessions}
          bookCallClicks={t.bookCallClicks}
          bookings={bookings}
          impressions={t.impressions}
          ctr={ctr}
        />
      </div>
    </Card>
  );

  const TrendCard = (
    <Card className={CARD}>
      <Title className={titleCls}>Cost per booking & spend</Title>
      <Text className="!text-gray-500">{rangeLabel}</Text>
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

  const VIEW_TITLE: Record<ViewId, string> = {
    overview: 'Overview',
    funnel: 'Conversion funnel',
    ads: 'Meta ads',
    traffic: 'Traffic sources',
    sync: 'Sync log',
  };

  function renderView() {
    if (summary.length === 0 && view !== 'sync') {
      return (
        <Card className={CARD}>
          <Title className={titleCls}>No data in this range</Title>
          <Text className="!text-gray-500">Pick a different range, or hit Refresh to pull recent days.</Text>
        </Card>
      );
    }
    switch (view) {
      case 'overview':
        return (
          <div className="space-y-4 md:space-y-6">
            {KpiCards}
            <InsightsPanel insights={insights} />
            <Grid numItemsLg={3} className="gap-4">
              <div className="lg:col-span-1">{FunnelCard}</div>
              <div className="lg:col-span-2">{TrendCard}</div>
            </Grid>
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
          <Card className={CARD}>
            <Title className={titleCls}>Meta ads · range total</Title>
            <AdsTable ads={ads} rangeTo={to} />
          </Card>
        );
      case 'traffic':
        return (
          <Card className={CARD}>
            <Title className={titleCls}>Traffic sources · range total</Title>
            <SourcesTable sources={sources} />
          </Card>
        );
      case 'sync':
        return (
          <Card className={CARD}>
            <Title className={titleCls}>Sync log</Title>
            <Text className="!text-gray-500">Last {syncRuns.length} runs · tap a failed run to see errors</Text>
            <SyncLog runs={syncRuns} />
          </Card>
        );
    }
  }

  return (
    <div className="md:flex">
      <Sidebar view={view} onSelect={setView} lastStatus={lastSync?.status} />
      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 py-4 pb-24 sm:px-6 md:py-8 md:pb-12">
          {/* Top bar */}
          <div className="mb-5 md:mb-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#FF6363] md:hidden">Pillexis Analytics</p>
                <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white md:text-lg">{VIEW_TITLE[view]}</h1>
                <Text className="mt-0.5 !text-gray-500">
                  {format(parseISO(from), 'MMM d')} – {format(parseISO(to), 'MMM d')} · {summary.length} synced days
                </Text>
                <SyncStatus run={lastSync} />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ThemeToggle />
                <RefreshButton from={from} to={to} />
              </div>
            </div>
            <div className="mt-4 flex w-full min-w-0 items-center gap-3 md:mt-5 md:w-auto">
              <RangeControls key={`${from}:${to}`} from={from} to={to} onRange={onRange} />
            </div>
          </div>

          <div>{renderView()}</div>
        </div>
      </div>
      <MobileNav view={view} onSelect={setView} lastStatus={lastSync?.status} />
    </div>
  );
}
