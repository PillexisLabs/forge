import { env } from './env';
import type { MetaAccount, MetaAd } from './types';

// Meta returns the SAME conversion under several alias action_types (e.g. a pixel
// InitiateCheckout shows up as `initiate_checkout`, `offsite_conversion.fb_pixel_initiate_checkout`,
// `onsite_web_initiate_checkout`, ...). Summing by substring double-counts, so we
// read the single canonical pixel action type for each event.
//
// The Cal.com booking ("Website Schedule") is tracked in Meta as a CUSTOM conversion,
// so it reports under `offsite_conversion.fb_pixel_custom`, NOT the standard
// `offsite_conversion.fb_pixel_schedule` (which stays 0). This is currently the only
// custom conversion on the account; if another is ever added, switch to matching the
// specific custom-conversion id instead of this aggregate bucket.
const SCHEDULE_ACTION = 'offsite_conversion.fb_pixel_custom';
const INITIATE_CHECKOUT_ACTION = 'offsite_conversion.fb_pixel_initiate_checkout';

type Action = { action_type?: string; value?: string };

function actionValue(actions: Action[] | undefined, type: string): number {
  if (!actions) return 0;
  const match = actions.find((a) => (a.action_type ?? '').toLowerCase() === type);
  return match ? Number(match.value ?? 0) : 0;
}

async function graph(path: string, params: Record<string, unknown>): Promise<any[]> {
  const base = new URL(`https://graph.facebook.com/${env.metaGraphVersion()}/${path}`);
  base.searchParams.set('access_token', env.metaToken());
  for (const [k, v] of Object.entries(params)) {
    base.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  }

  const out: any[] = [];
  let next: string | null = base.toString();
  while (next) {
    const res: Response = await fetch(next);
    const json: any = await res.json();
    if (json.error) throw new Error(`Meta API error: ${json.error.message}`);
    out.push(...(json.data ?? []));
    next = json.paging?.next ?? null;
  }
  return out;
}

/** Account-level spend + results for a single day. */
export async function getMetaAccount(date: string): Promise<MetaAccount> {
  const rows = await graph(`${env.metaAccountId()}/insights`, {
    level: 'account',
    time_range: { since: date, until: date },
    fields: 'spend,impressions,reach,clicks,ctr,cpc,actions',
  });
  const r = rows[0];
  if (!r) {
    return { spend: 0, impressions: 0, reach: 0, clicks: 0, ctr: 0, cpc: 0, schedules: 0, initiateCheckout: 0 };
  }
  return {
    spend: Number(r.spend ?? 0),
    impressions: Number(r.impressions ?? 0),
    reach: Number(r.reach ?? 0),
    clicks: Number(r.clicks ?? 0),
    ctr: Number(r.ctr ?? 0),
    cpc: Number(r.cpc ?? 0),
    schedules: actionValue(r.actions, SCHEDULE_ACTION),
    initiateCheckout: actionValue(r.actions, INITIATE_CHECKOUT_ACTION),
  };
}

/** Per-ad breakdown for a single day. */
export async function getMetaAds(date: string): Promise<MetaAd[]> {
  const rows = await graph(`${env.metaAccountId()}/insights`, {
    level: 'ad',
    time_range: { since: date, until: date },
    fields: 'ad_id,ad_name,campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,actions',
  });
  return rows.map((r) => {
    const schedules = actionValue(r.actions, SCHEDULE_ACTION);
    const spend = Number(r.spend ?? 0);
    return {
      adId: r.ad_id,
      adName: r.ad_name ?? null,
      campaignId: r.campaign_id ?? null,
      campaignName: r.campaign_name ?? null,
      spend,
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      ctr: Number(r.ctr ?? 0),
      cpc: Number(r.cpc ?? 0),
      schedules,
      costPerSchedule: schedules > 0 ? spend / schedules : null,
    };
  });
}
