import { differenceInCalendarDays, format, isValid, parseISO, subDays } from 'date-fns';
import { getSql } from '@/core/db';
import { emitEvent } from '@/core/events';
import { getGaSummary, getGaSources } from './ga';
import { getMetaAccount, getMetaAds } from './meta';
import { log } from '@/core/logger';

/**
 * Fetch GA + Meta for one day and upsert all three tables.
 * A source that throws returns null and is SKIPPED on update — a transient API
 * failure must never overwrite previously-good data with zeros. Per-source
 * errors are collected and returned so the run log can surface them.
 */
export async function syncDay(date: string) {
  const sql = getSql();
  const errors: string[] = [];

  const fail = (source: string) => (e: any) => {
    const message = `${source} ${date}: ${e?.message ?? e}`;
    errors.push(message);
    log.error(`sync source failed`, e, { source, date });
    return null;
  };

  const [ga, gaSources, meta, ads] = await Promise.all([
    getGaSummary(date).catch(fail('GA summary')),
    getGaSources(date).catch(fail('GA sources')),
    getMetaAccount(date).catch(fail('Meta account')),
    getMetaAds(date).catch(fail('Meta ads')),
  ]);

  // Meta's recent-day conversion counts are volatile: the same day can report
  // fewer bookings on one pull than the next (even 0), and our write path
  // replaces the whole day. Never let a re-sync REDUCE a day's attributed
  // conversions — keep the max seen. Settled days (>7d) are stable so max ==
  // current; recent days are protected from a transient-low reading clobbering
  // good data. (This is what caused the dashboard to flip between 10 and 6.)
  const [existingSummary]: any = await sql`
    select meta_schedules, meta_initiate_checkout from daily_summary where date = ${date}
  `;
  const mergedSchedules = meta
    ? Math.max(meta.schedules ?? 0, Number(existingSummary?.meta_schedules ?? 0))
    : 0;
  const mergedInitiateCheckout = meta
    ? Math.max(meta.initiateCheckout ?? 0, Number(existingSummary?.meta_initiate_checkout ?? 0))
    : 0;

  // Bookings: prefer ad-attributed Schedules, fall back to GA generate_lead.
  const bookings = mergedSchedules || (ga?.leads ?? 0);
  const costPerBooking = meta && bookings > 0 ? meta.spend / bookings : null;

  // Full row for the INSERT path (new date). Failed sources default to 0.
  const row = {
    date,
    meta_spend: meta?.spend ?? 0,
    meta_impressions: meta?.impressions ?? 0,
    meta_reach: meta?.reach ?? 0,
    meta_clicks: meta?.clicks ?? 0,
    meta_ctr: meta?.ctr ?? 0,
    meta_cpc: meta?.cpc ?? 0,
    meta_schedules: mergedSchedules,
    meta_initiate_checkout: mergedInitiateCheckout,
    ga_sessions: ga?.sessions ?? 0,
    ga_users: ga?.users ?? 0,
    ga_new_users: ga?.newUsers ?? 0,
    ga_engaged_sessions: ga?.engagedSessions ?? 0,
    ga_book_call_clicks: ga?.bookCallClicks ?? 0,
    ga_leads: ga?.leads ?? 0,
    cost_per_booking: costPerBooking,
    updated_at: new Date(),
  };

  // On conflict, only overwrite columns for sources that actually succeeded.
  const updateCols: (keyof typeof row)[] = ['updated_at'];
  if (meta) {
    updateCols.push(
      'meta_spend', 'meta_impressions', 'meta_reach', 'meta_clicks', 'meta_ctr',
      'meta_cpc', 'meta_schedules', 'meta_initiate_checkout', 'cost_per_booking',
    );
  }
  if (ga) {
    updateCols.push('ga_sessions', 'ga_users', 'ga_new_users', 'ga_engaged_sessions', 'ga_book_call_clicks', 'ga_leads');
  }

  await sql`
    insert into daily_summary ${sql(row)}
    on conflict (date) do update set ${sql(row, ...updateCols) as any}
  `;

  // Replace per-ad rows only if the Meta ads fetch succeeded (null = failed → preserve).
  if (ads) {
    // Same no-downward-clobber guard per ad (keyed by ad_id): a transient-low
    // re-pull must not wipe a booking already attributed to this ad on this day.
    const existingAds: any[] = await sql`
      select ad_id, schedules from meta_ads_daily where date = ${date}
    `;
    const prevSchedules = new Map<string, number>(
      existingAds.map((r) => [r.ad_id, Number(r.schedules ?? 0)]),
    );
    await sql`delete from meta_ads_daily where date = ${date}`;
    if (ads.length) {
      const adRows = ads.map((a) => {
        const schedules = Math.max(a.schedules ?? 0, prevSchedules.get(a.adId) ?? 0);
        return {
          date,
          campaign_id: a.campaignId,
          campaign_name: a.campaignName,
          ad_id: a.adId,
          ad_name: a.adName,
          spend: a.spend,
          impressions: a.impressions,
          clicks: a.clicks,
          ctr: a.ctr,
          cpc: a.cpc,
          schedules,
          cost_per_schedule: schedules > 0 ? a.spend / schedules : null,
          updated_at: new Date(),
        };
      });
      await sql`insert into meta_ads_daily ${sql(adRows)}`;
    }
  }

  // Replace per-source rows only if the GA sources fetch succeeded.
  if (gaSources) {
    const sourceTotals = new Map<string, typeof gaSources[number]>();
    const campaignTotals = new Map<string, { sessions: number; users: number; engagedSessions: number; bookCallClicks: number; leads: number }>();
    for (const source of gaSources) {
      const sourceKey = `${source.source}|${source.medium}`;
      const sourceTotal = sourceTotals.get(sourceKey) ?? {
        ...source,
        campaignKey: '(all)',
        sessions: 0,
        users: 0,
        engagedSessions: 0,
        bookCallClicks: 0,
        leads: 0,
      };
      sourceTotal.sessions += source.sessions;
      sourceTotal.users += source.users;
      sourceTotal.engagedSessions += source.engagedSessions;
      sourceTotal.bookCallClicks += source.bookCallClicks;
      sourceTotal.leads += source.leads;
      sourceTotals.set(sourceKey, sourceTotal);

      const campaignTotal = campaignTotals.get(source.campaignKey) ?? {
        sessions: 0, users: 0, engagedSessions: 0, bookCallClicks: 0, leads: 0,
      };
      campaignTotal.sessions += source.sessions;
      campaignTotal.users += source.users;
      campaignTotal.engagedSessions += source.engagedSessions;
      campaignTotal.bookCallClicks += source.bookCallClicks;
      campaignTotal.leads += source.leads;
      campaignTotals.set(source.campaignKey, campaignTotal);
    }

    await sql`delete from ga_sources_daily where date = ${date}`;
    if (sourceTotals.size) {
      const sourceRows = Array.from(sourceTotals.values()).map((s) => ({
        date,
        source: s.source,
        medium: s.medium,
        sessions: s.sessions,
        users: s.users,
        book_call_clicks: s.bookCallClicks,
        leads: s.leads,
        updated_at: new Date(),
      }));
      await sql`insert into ga_sources_daily ${sql(sourceRows)}`;
    }

    await sql`delete from ga_campaigns_daily where date = ${date}`;
    if (campaignTotals.size) {
      const campaignRows = Array.from(campaignTotals.entries()).map(([campaignKey, total]) => ({
        date,
        campaign_key: campaignKey,
        sessions: total.sessions,
        users: total.users,
        engaged_sessions: total.engagedSessions,
        book_call_clicks: total.bookCallClicks,
        leads: total.leads,
        updated_at: new Date(),
      }));
      await sql`insert into ga_campaigns_daily ${sql(campaignRows)}`;
    }

    await sql`delete from ga_campaign_sources_daily where date = ${date}`;
    if (gaSources.length) {
      const campaignSourceRows = gaSources.map((s) => ({
        date,
        campaign_key: s.campaignKey,
        source: s.source,
        medium: s.medium,
        sessions: s.sessions,
        users: s.users,
        engaged_sessions: s.engagedSessions,
        book_call_clicks: s.bookCallClicks,
        leads: s.leads,
        updated_at: new Date(),
      }));
      await sql`insert into ga_campaign_sources_daily ${sql(campaignSourceRows)}`;
    }
  }

  return {
    date,
    spend: row.meta_spend,
    bookings,
    costPerBooking,
    sessions: row.ga_sessions,
    adCount: ads?.length ?? 0,
    metaOk: meta !== null,
    gaOk: ga !== null,
    errors,
  };
}

/** Persist one row per sync run so the dashboard can show last-run health. */
async function recordSyncRun(o: {
  startedAt: Date;
  trigger: string;
  days: number;
  status: string;
  results: { date: string }[];
  errors: string[];
  durationMs: number;
}) {
  const sql = getSql();
  await sql`
    insert into sync_runs (started_at, finished_at, trigger, days, status, error_count, errors, details, duration_ms)
    values (
      ${o.startedAt}, ${new Date()}, ${o.trigger}, ${o.days}, ${o.status},
      ${o.errors.length}, ${sql.json(o.errors)}, ${sql.json(o.results)}, ${o.durationMs}
    )
  `;
}

/**
 * Sync the most recent `days` days (default 8), including today. Re-syncing
 * recent days lets late ad attribution settle: Meta attributes conversions over
 * a 7-day click window and its recent-day counts are volatile (the same day can
 * report fewer bookings on one pull than the next), so we re-pull the whole
 * window on every run. A shorter window froze transient-low readings in place.
 * Runs sequentially to stay polite to the APIs.
 */
export async function runSync({
  days = 8,
  from,
  to,
  trigger = 'unknown',
}: {
  days?: number;
  from?: string;
  to?: string;
  trigger?: string;
} = {}) {
  const startedAt = new Date();
  const results: Awaited<ReturnType<typeof syncDay>>[] = [];
  const allErrors: string[] = [];
  let status = 'ok';

  const rangeFrom = from ? parseISO(from) : null;
  const rangeTo = to ? parseISO(to) : null;
  if ((rangeFrom && !isValid(rangeFrom)) || (rangeTo && !isValid(rangeTo))) {
    throw new Error('Invalid sync date range');
  }
  if ((rangeFrom && !rangeTo) || (!rangeFrom && rangeTo)) {
    throw new Error('Both from and to are required for a custom sync range');
  }

  const syncDays = rangeFrom && rangeTo
    ? differenceInCalendarDays(rangeTo, rangeFrom) + 1
    : Math.floor(days);
  if (!Number.isFinite(syncDays) || syncDays < 1 || syncDays > 366) {
    throw new Error('Sync range must be between 1 and 366 days');
  }
  const syncTo = rangeTo ?? new Date();

  log.info('sync started', { trigger, days: syncDays, from, to });
  try {
    for (let i = 0; i < syncDays; i++) {
      const date = format(subDays(syncTo, i), 'yyyy-MM-dd');
      const r = await syncDay(date);
      results.push(r);
      allErrors.push(...r.errors);
    }
    status = allErrors.length === 0 ? 'ok' : 'partial';
    return { synced: results.map((r) => r.date), results, status, errors: allErrors };
  } catch (e) {
    status = 'error';
    allErrors.push(e instanceof Error ? e.message : String(e));
    log.error('sync run threw', e, { trigger });
    throw e;
  } finally {
    const durationMs = Date.now() - startedAt.getTime();
    const meta = { trigger, days: syncDays, durationMs, errorCount: allErrors.length };
    if (status === 'ok') log.info('sync finished: ok', meta);
    else log.error(`sync finished: ${status}`, undefined, meta);
    // Best-effort: never let logging failure mask the real result.
    await recordSyncRun({ startedAt, trigger, days: syncDays, status, results, errors: allErrors, durationMs }).catch((err) =>
      log.error('failed to record sync run', err),
    );
    await emitEvent('sync.completed', {
      status,
      trigger,
      days: syncDays,
      error_count: allErrors.length,
      duration_ms: durationMs,
    }, { emittedBy: 'analytics' }).catch((err) =>
      log.error('failed to emit sync.completed', err),
    );
  }
}
