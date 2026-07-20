import { differenceInCalendarDays, format, isValid, parseISO, subDays } from 'date-fns';
import { getSql } from './db';
import type { AdRow, CampaignOption, DailySummaryRow, PeriodTotals, SourceRow, SyncRunRow } from './types';

const emptyTotals: PeriodTotals = {
  spend: 0, impressions: 0, clicks: 0, schedules: 0, sessions: 0, bookCallClicks: 0, leads: 0,
};

const iso = (value: unknown) => value instanceof Date ? value.toISOString() : value == null ? null : String(value);
const numberOrNull = (value: unknown) => value == null ? null : Number(value);
const numberOrZero = (value: unknown) => Number(value ?? 0);

export function resolveCampaignScope(campaigns: CampaignOption[], campaignId?: string) {
  const selectedCampaign = campaignId
    ? campaigns.find((campaign) => campaign.id === campaignId)
    : undefined;
  if (campaignId && !selectedCampaign) throw new Error('campaign is not available');
  const scopeCampaigns = selectedCampaign ? [selectedCampaign] : campaigns;
  return {
    selectedCampaign,
    scopeCampaigns,
    metaCampaignIds: scopeCampaigns.map((campaign) => campaign.id),
    gaCampaignKeys: Array.from(new Set(
      scopeCampaigns.flatMap((campaign) => [campaign.id, campaign.name]),
    )),
  };
}

function parseDate(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${field} must use YYYY-MM-DD`);
  const parsed = parseISO(value);
  if (!isValid(parsed) || format(parsed, 'yyyy-MM-dd') !== value) throw new Error(`${field} is not a valid date`);
  return parsed;
}

export function resolveAnalyticsRange(fromValue?: string, toValue?: string, maxDays = 366) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const to = toValue ?? today;
  const from = fromValue ?? format(subDays(parseISO(to), 29), 'yyyy-MM-dd');
  const fromDate = parseDate(from, 'from');
  const toDate = parseDate(to, 'to');
  const days = differenceInCalendarDays(toDate, fromDate) + 1;

  if (days < 1) throw new Error('from must be on or before to');
  if (days > maxDays) throw new Error(`date range cannot exceed ${maxDays} days`);
  if (to > today) throw new Error('to cannot be in the future');

  return { from, to, days };
}

export async function getAnalyticsData(
  { from, to, days }: ReturnType<typeof resolveAnalyticsRange>,
  campaignId?: string,
) {
  const sql = getSql();
  const prevTo = format(subDays(parseISO(from), 1), 'yyyy-MM-dd');
  const prevFrom = format(subDays(parseISO(from), days), 'yyyy-MM-dd');
  let syncRuns: SyncRunRow[] = [];

  const rawCampaigns = await sql`
    select campaign_id as id, max(campaign_name) as name
    from meta_ads_daily
    where campaign_id is not null
    group by campaign_id
    order by max(date) desc, max(campaign_name) asc
  `;
  const campaigns: CampaignOption[] = rawCampaigns.map((row: any) => ({
    id: String(row.id),
    name: row.name ? String(row.name) : String(row.id),
  }));
  const { selectedCampaign, scopeCampaigns, metaCampaignIds, gaCampaignKeys } =
    resolveCampaignScope(campaigns, campaignId);

  try {
    const runs = await sql`
      select started_at, finished_at, trigger, status, error_count, errors, duration_ms
      from sync_runs order by started_at desc limit 25
    `;
    syncRuns = runs.map((row: any) => ({
      started_at: iso(row.started_at)!,
      finished_at: iso(row.finished_at),
      trigger: row.trigger,
      status: row.status,
      error_count: Number(row.error_count ?? 0),
      errors: Array.isArray(row.errors) ? row.errors : [],
      duration_ms: row.duration_ms == null ? null : Number(row.duration_ms),
    }));
  } catch {
    // Older databases may not have the optional sync history table yet.
  }

  const rawSummary = scopeCampaigns.length ? await sql`
    with dates as (
      select date from meta_ads_daily
      where date between ${from} and ${to} and campaign_id in ${sql(metaCampaignIds)}
      union
      select date from ga_campaigns_daily
      where date between ${from} and ${to} and campaign_key in ${sql(gaCampaignKeys)}
    ), meta as (
      select date,
        sum(spend) as meta_spend,
        sum(impressions) as meta_impressions,
        sum(clicks) as meta_clicks,
        sum(schedules) as meta_schedules
      from meta_ads_daily
      where date between ${from} and ${to} and campaign_id in ${sql(metaCampaignIds)}
      group by date
    ), ga as (
      select date,
        sum(sessions) as ga_sessions,
        sum(users) as ga_users,
        sum(engaged_sessions) as ga_engaged_sessions,
        sum(book_call_clicks) as ga_book_call_clicks,
        sum(leads) as ga_leads
      from ga_campaigns_daily
      where date between ${from} and ${to} and campaign_key in ${sql(gaCampaignKeys)}
      group by date
    )
    select dates.date,
      coalesce(meta.meta_spend, 0) as meta_spend,
      coalesce(meta.meta_impressions, 0) as meta_impressions,
      0 as meta_reach,
      coalesce(meta.meta_clicks, 0) as meta_clicks,
      case when coalesce(meta.meta_impressions, 0) > 0
        then meta.meta_clicks * 100.0 / meta.meta_impressions else 0 end as meta_ctr,
      case when coalesce(meta.meta_clicks, 0) > 0
        then meta.meta_spend / meta.meta_clicks else 0 end as meta_cpc,
      coalesce(meta.meta_schedules, 0) as meta_schedules,
      0 as meta_initiate_checkout,
      coalesce(ga.ga_sessions, 0) as ga_sessions,
      coalesce(ga.ga_users, 0) as ga_users,
      0 as ga_new_users,
      coalesce(ga.ga_engaged_sessions, 0) as ga_engaged_sessions,
      coalesce(ga.ga_book_call_clicks, 0) as ga_book_call_clicks,
      coalesce(ga.ga_leads, 0) as ga_leads,
      case when coalesce(meta.meta_schedules, 0) > 0
        then meta.meta_spend / meta.meta_schedules else null end as cost_per_booking
    from dates
    left join meta using (date)
    left join ga using (date)
    order by dates.date desc limit 366
  ` : await sql`
    select * from daily_summary
    where date between ${from} and ${to}
    order by date desc limit 366
  `;
  const summary: DailySummaryRow[] = rawSummary.map((row: any) => ({
    date: typeof row.date === 'string' ? row.date : new Date(row.date).toISOString().slice(0, 10),
    meta_spend: numberOrZero(row.meta_spend),
    meta_impressions: numberOrZero(row.meta_impressions),
    meta_reach: numberOrZero(row.meta_reach),
    meta_clicks: numberOrZero(row.meta_clicks),
    meta_ctr: numberOrZero(row.meta_ctr),
    meta_cpc: numberOrZero(row.meta_cpc),
    meta_schedules: numberOrZero(row.meta_schedules),
    meta_initiate_checkout: numberOrZero(row.meta_initiate_checkout),
    ga_sessions: numberOrZero(row.ga_sessions),
    ga_users: numberOrZero(row.ga_users),
    ga_new_users: numberOrZero(row.ga_new_users),
    ga_engaged_sessions: numberOrZero(row.ga_engaged_sessions),
    ga_book_call_clicks: numberOrZero(row.ga_book_call_clicks),
    ga_leads: numberOrZero(row.ga_leads),
    cost_per_booking: numberOrNull(row.cost_per_booking),
  }));

  const rawAds = selectedCampaign ? await sql`
    select ad_name, campaign_name,
      sum(spend)::float8 as spend,
      sum(impressions)::bigint as impressions,
      sum(clicks)::bigint as clicks,
      sum(schedules)::int as schedules,
      max(date) filter (where impressions > 0)::text as last_active
    from meta_ads_daily
    where date between ${from} and ${to} and campaign_id = ${selectedCampaign.id}
    group by ad_name, campaign_name
    order by spend desc nulls last limit 15
  ` : await sql`
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
  const ads: AdRow[] = rawAds.map((row: any) => {
    const spend = numberOrZero(row.spend);
    const impressions = numberOrZero(row.impressions);
    const clicks = numberOrZero(row.clicks);
    const schedules = numberOrZero(row.schedules);
    return {
      date: to,
      campaign_name: row.campaign_name ?? null,
      ad_name: row.ad_name ?? null,
      spend,
      impressions,
      clicks,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      schedules,
      cost_per_schedule: schedules > 0 ? spend / schedules : null,
      last_active: row.last_active ?? null,
    };
  });

  const rawSources = scopeCampaigns.length ? await sql`
    select source, medium,
      sum(sessions)::int as sessions,
      sum(users)::int as users,
      sum(book_call_clicks)::int as book_call_clicks,
      sum(leads)::int as leads
    from ga_campaign_sources_daily
    where date between ${from} and ${to} and campaign_key in ${sql(gaCampaignKeys)}
    group by source, medium
    order by sessions desc limit 15
  ` : await sql`
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
  const sources: SourceRow[] = rawSources.map((row: any) => ({
    source: row.source,
    medium: row.medium,
    sessions: numberOrZero(row.sessions),
    users: numberOrZero(row.users),
    book_call_clicks: numberOrZero(row.book_call_clicks),
    leads: numberOrZero(row.leads),
  }));

  const [previous]: any = scopeCampaigns.length ? await sql`
    with meta as (
      select coalesce(sum(spend),0) as spend,
        coalesce(sum(impressions),0) as impressions,
        coalesce(sum(clicks),0) as clicks,
        coalesce(sum(schedules),0) as schedules
      from meta_ads_daily
      where date between ${prevFrom} and ${prevTo} and campaign_id in ${sql(metaCampaignIds)}
    ), ga as (
      select coalesce(sum(sessions),0) as sessions,
        coalesce(sum(book_call_clicks),0) as book_call_clicks,
        coalesce(sum(leads),0) as leads
      from ga_campaigns_daily
      where date between ${prevFrom} and ${prevTo} and campaign_key in ${sql(gaCampaignKeys)}
    )
    select * from meta cross join ga
  ` : await sql`
    select
      coalesce(sum(meta_spend),0) as spend,
      coalesce(sum(meta_impressions),0) as impressions,
      coalesce(sum(meta_clicks),0) as clicks,
      coalesce(sum(meta_schedules),0) as schedules,
      coalesce(sum(ga_sessions),0) as sessions,
      coalesce(sum(ga_book_call_clicks),0) as book_call_clicks,
      coalesce(sum(ga_leads),0) as leads
    from daily_summary where date between ${prevFrom} and ${prevTo}
  `;
  const prev = previous ? {
    spend: numberOrZero(previous.spend),
    impressions: numberOrZero(previous.impressions),
    clicks: numberOrZero(previous.clicks),
    schedules: numberOrZero(previous.schedules),
    sessions: numberOrZero(previous.sessions),
    bookCallClicks: numberOrZero(previous.book_call_clicks),
    leads: numberOrZero(previous.leads),
  } : emptyTotals;

  return { from, to, days, campaignId: selectedCampaign?.id ?? null, campaigns, summary, ads, sources, syncRuns, prev };
}
