import { format, subDays, parseISO, differenceInCalendarDays } from 'date-fns';
import { getSql } from '@/lib/db';
import DashboardView from '@/components/DashboardView';
import SetupNotice from '@/components/SetupNotice';
import type { DailySummaryRow, AdRow, SourceRow, SyncRunRow, PeriodTotals } from '@/lib/types';

const emptyTotals: PeriodTotals = {
  spend: 0, impressions: 0, clicks: 0, schedules: 0, sessions: 0, bookCallClicks: 0, leads: 0,
};

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

export const dynamic = 'force-dynamic';

const n = (v: unknown) => (v == null ? null : Number(v));
const nz = (v: unknown) => Number(v ?? 0);
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function Page({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  // Default range: last 30 days through today.
  const to = isDate(searchParams?.to) ? searchParams.to : format(new Date(), 'yyyy-MM-dd');
  const from = isDate(searchParams?.from) ? searchParams.from : format(subDays(new Date(), 29), 'yyyy-MM-dd');

  // Previous equal-length period, for period-over-period deltas.
  const rangeLen = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
  const prevTo = format(subDays(parseISO(from), 1), 'yyyy-MM-dd');
  const prevFrom = format(subDays(parseISO(from), rangeLen), 'yyyy-MM-dd');

  let summary: DailySummaryRow[] = [];
  let ads: AdRow[] = [];
  let sources: SourceRow[] = [];
  let syncRuns: SyncRunRow[] = [];
  let prev: PeriodTotals = emptyTotals;

  try {
    const sql = getSql();

    // Recent sync runs (own try so a missing table never blanks the dashboard).
    try {
      const runs = await sql`
        select started_at, finished_at, trigger, status, error_count, errors, duration_ms
        from sync_runs order by started_at desc limit 25
      `;
      syncRuns = runs.map((r: any) => ({
        started_at: iso(r.started_at)!,
        finished_at: iso(r.finished_at),
        trigger: r.trigger,
        status: r.status,
        error_count: Number(r.error_count ?? 0),
        errors: Array.isArray(r.errors) ? r.errors : [],
        duration_ms: r.duration_ms == null ? null : Number(r.duration_ms),
      }));
    } catch {
      /* sync_runs not created yet — ignore */
    }

    const rawSummary = await sql`
      select * from daily_summary
      where date between ${from} and ${to}
      order by date desc limit 366
    `;
    summary = rawSummary.map((r: any) => ({
      date: typeof r.date === 'string' ? r.date : new Date(r.date).toISOString().slice(0, 10),
      meta_spend: nz(r.meta_spend),
      meta_impressions: nz(r.meta_impressions),
      meta_reach: nz(r.meta_reach),
      meta_clicks: nz(r.meta_clicks),
      meta_ctr: nz(r.meta_ctr),
      meta_cpc: nz(r.meta_cpc),
      meta_schedules: nz(r.meta_schedules),
      meta_initiate_checkout: nz(r.meta_initiate_checkout),
      ga_sessions: nz(r.ga_sessions),
      ga_users: nz(r.ga_users),
      ga_new_users: nz(r.ga_new_users),
      ga_engaged_sessions: nz(r.ga_engaged_sessions),
      ga_book_call_clicks: nz(r.ga_book_call_clicks),
      ga_leads: nz(r.ga_leads),
      cost_per_booking: n(r.cost_per_booking),
    }));

    // Per-ad rollup over the whole range (CTR/CPC recomputed from sums, not summed).
    const rawAds = await sql`
      select ad_name, campaign_name,
        sum(spend)::float8 as spend,
        sum(impressions)::bigint as impressions,
        sum(clicks)::bigint as clicks,
        sum(schedules)::int as schedules,
        max(date) filter (where impressions > 0)::text as last_active
      from meta_ads_daily
      where date between ${from} and ${to}
      group by ad_name, campaign_name
      order by spend desc nulls last limit 15
    `;
    ads = rawAds.map((r: any) => {
      const spend = nz(r.spend);
      const impressions = nz(r.impressions);
      const clicks = nz(r.clicks);
      const schedules = nz(r.schedules);
      return {
        date: to,
        campaign_name: r.campaign_name ?? null,
        ad_name: r.ad_name ?? null,
        spend,
        impressions,
        clicks,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        schedules,
        cost_per_schedule: schedules > 0 ? spend / schedules : null,
        last_active: r.last_active ?? null,
      };
    });

    const rawSources = await sql`
      select source, medium,
        sum(sessions)::int as sessions,
        sum(users)::int as users,
        sum(book_call_clicks)::int as book_call_clicks,
        sum(leads)::int as leads
      from ga_sources_daily
      where date between ${from} and ${to}
      group by source, medium
      order by sessions desc limit 15
    `;
    sources = rawSources.map((r: any) => ({
      source: r.source,
      medium: r.medium,
      sessions: nz(r.sessions),
      users: nz(r.users),
      book_call_clicks: nz(r.book_call_clicks),
      leads: nz(r.leads),
    }));
    const [pr]: any = await sql`
      select
        coalesce(sum(meta_spend),0)            as spend,
        coalesce(sum(meta_impressions),0)      as impressions,
        coalesce(sum(meta_clicks),0)           as clicks,
        coalesce(sum(meta_schedules),0)        as schedules,
        coalesce(sum(ga_sessions),0)           as sessions,
        coalesce(sum(ga_book_call_clicks),0)   as book_call_clicks,
        coalesce(sum(ga_leads),0)              as leads
      from daily_summary where date between ${prevFrom} and ${prevTo}
    `;
    if (pr) {
      prev = {
        spend: nz(pr.spend),
        impressions: nz(pr.impressions),
        clicks: nz(pr.clicks),
        schedules: nz(pr.schedules),
        sessions: nz(pr.sessions),
        bookCallClicks: nz(pr.book_call_clicks),
        leads: nz(pr.leads),
      };
    }
  } catch (e: any) {
    return <SetupNotice message={e?.message ?? String(e)} />;
  }

  return (
    <DashboardView
      summary={summary}
      ads={ads}
      sources={sources}
      from={from}
      to={to}
      syncRuns={syncRuns}
      prev={prev}
      prevDays={rangeLen}
    />
  );
}
