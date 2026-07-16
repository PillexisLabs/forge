import type { AdRow, DailySummaryRow } from './types';

// Rule-based analysis layer. Turns the numbers into prioritized, plain-English
// findings — "what's converting, where it's leaking, what to do" — instead of
// leaving the user to read charts. Each insight ties a metric to a next action.

export type Severity = 'critical' | 'warning' | 'good' | 'info';

export type Insight = {
  severity: Severity;
  title: string;
  detail: string;
  action?: string;
};

export type InsightInput = {
  spend: number;
  impressions: number;
  clicks: number;
  sessions: number;
  bookCallClicks: number;
  bookings: number;
  ads: AdRow[];
  summary: DailySummaryRow[]; // newest first
  to: string; // range end — used to tell live ads from already-removed ones
};

const CTR_BENCHMARK = 1.0; // Meta cold-traffic ~1%

const r0 = (n: number) => Math.round(n);

// An ad that hasn't delivered in the last 3 days of the range is treated as
// removed/paused — recommending budget moves on it would be stale advice.
const isLive = (a: AdRow, to: string) => {
  if (!a.last_active) return false;
  const cutoff = new Date(to + 'T00:00:00Z');
  cutoff.setUTCDate(cutoff.getUTCDate() - 3);
  return new Date(a.last_active + 'T00:00:00Z') >= cutoff;
};

export function buildInsights(i: InsightInput): Insight[] {
  const out: Insight[] = [];

  const ctr = i.impressions > 0 ? (i.clicks / i.impressions) * 100 : 0;
  const sessionToBook = i.sessions > 0 ? (i.bookCallClicks / i.sessions) * 100 : 0;
  const bookToBooking = i.bookCallClicks > 0 ? (i.bookings / i.bookCallClicks) * 100 : 0;

  // 1) Spend with no conversions — the loudest signal.
  if (i.spend > 0 && i.bookings === 0) {
    out.push({
      severity: 'critical',
      title: `₹${r0(i.spend)} spent, 0 bookings`,
      detail:
        i.bookCallClicks > 0
          ? `${i.bookCallClicks} people clicked "book a call" but none finished booking — money is reaching the door and turning back.`
          : `Nobody has reached the booking step yet in this range.`,
      action:
        i.bookCallClicks > 0
          ? `Check the Cal.com booking page: is the Schedule pixel firing, and is the form too long? Every book-call click that doesn't convert is paid traffic wasted.`
          : `Likely too early, or the landing page isn't driving book-call clicks. Watch the next few days.`,
    });
  }

  // 2) Biggest on-site leak (sessions → book-clicks → bookings).
  const transitions = [
    { from: 'Sessions', to: 'book-call clicks', rate: sessionToBook, a: i.sessions, b: i.bookCallClicks },
    { from: 'Book-call clicks', to: 'bookings', rate: bookToBooking, a: i.bookCallClicks, b: i.bookings },
  ].filter((t) => t.a > 0);
  if (transitions.length) {
    const worst = transitions.reduce((m, t) => (t.rate < m.rate ? t : m));
    out.push({
      severity: worst.rate === 0 ? 'critical' : worst.rate < 20 ? 'warning' : 'info',
      title: `Biggest leak: ${worst.from} → ${worst.to} (${worst.rate.toFixed(0)}%)`,
      detail: `${worst.a} ${worst.from.toLowerCase()} produced ${worst.b} ${worst.to}. That's the stage costing you the most.`,
    });
  }

  // 3) What's converting (or, if nothing books yet, what earns the most interest).
  // Only live ads get "put budget here" advice — a removed ad can't receive budget.
  if (i.ads.length) {
    const live = i.ads.filter((a) => isLive(a, i.to));
    const converters = live.filter((a) => a.schedules > 0);
    if (converters.length) {
      const best = converters.reduce((m, a) =>
        (a.cost_per_schedule ?? Infinity) < (m.cost_per_schedule ?? Infinity) ? a : m,
      );
      out.push({
        severity: 'good',
        title: `Best converter: ${best.ad_name ?? 'an ad'}`,
        detail: `₹${r0(best.cost_per_schedule ?? 0)} per booking from ${best.schedules} booking(s). Put more budget here.`,
      });
    } else if (live.length) {
      const best = live.reduce((m, a) => (a.ctr > m.ctr ? a : m));
      if (best.ctr > 0) {
        out.push({
          severity: 'good',
          title: `Most interest: ${best.ad_name ?? 'an ad'}`,
          detail: `${best.ctr.toFixed(1)}% CTR on ₹${r0(best.spend)} spend — best at earning the click, even though none have booked yet.`,
        });
      }
    }

    // 4) Money pit — highest spend with nothing to show. Live ads get the
    // "shift budget" nudge; already-removed ads get a past-tense confirmation
    // instead of advice that can no longer be acted on.
    const wasters = i.ads
      .filter((a) => a.schedules === 0 && a.spend >= 20)
      .sort((x, y) => y.spend - x.spend);
    if (wasters.length && i.ads.length > 1) {
      const liveWaster = wasters.find((a) => isLive(a, i.to));
      if (liveWaster) {
        out.push({
          severity: 'warning',
          title: `Watch: ${liveWaster.ad_name ?? 'an ad'}`,
          detail: `₹${r0(liveWaster.spend)} spent, 0 bookings, ${liveWaster.ctr.toFixed(1)}% CTR. Consider shifting its budget to a better performer.`,
        });
      }
      const cutWaster = wasters.find((a) => !isLive(a, i.to));
      if (cutWaster) {
        out.push({
          severity: 'info',
          title: `Already cut: ${cutWaster.ad_name ?? 'an ad'}`,
          detail: `₹${r0(cutWaster.spend)} spent, 0 bookings before it stopped delivering${cutWaster.last_active ? ` on ${cutWaster.last_active}` : ''}. Removing it was the right call — no action needed.`,
        });
      }
    }
  }

  // 5) Creative vs targeting read from CTR.
  if (i.impressions > 200) {
    if (ctr < CTR_BENCHMARK * 0.7) {
      out.push({
        severity: 'warning',
        title: `Low CTR (${ctr.toFixed(2)}%)`,
        detail: `Below the ~1% benchmark — the creative or targeting isn't grabbing attention. Test new hooks before scaling spend.`,
      });
    } else if (ctr > CTR_BENCHMARK * 1.2) {
      out.push({
        severity: 'good',
        title: `Strong CTR (${ctr.toFixed(2)}%)`,
        detail: `Above the ~1% benchmark — the ads resonate. Your problem is downstream (the booking step), not the creative.`,
      });
    }
  }

  // 6) Clicks that never become sessions (tracking / landing-page red flag).
  if (i.clicks > 20 && i.sessions < i.clicks * 0.55) {
    out.push({
      severity: 'warning',
      title: `Clicks aren't landing`,
      detail: `${i.clicks} ad clicks but only ${i.sessions} sessions. People bounce before the page loads, or click tracking and GA disagree. Check landing-page speed.`,
    });
  }

  // 7) Trend over the range (first half vs second half).
  if (i.summary.length >= 4) {
    const chrono = [...i.summary].reverse();
    const mid = Math.floor(chrono.length / 2);
    const sum = (rows: DailySummaryRow[], key: keyof DailySummaryRow) =>
      rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
    const firstSpend = sum(chrono.slice(0, mid), 'meta_spend');
    const lastSpend = sum(chrono.slice(mid), 'meta_spend');
    const firstSess = sum(chrono.slice(0, mid), 'ga_sessions');
    const lastSess = sum(chrono.slice(mid), 'ga_sessions');
    if (firstSpend > 0 && lastSpend > 0) {
      const spendDelta = ((lastSpend - firstSpend) / firstSpend) * 100;
      const sessDelta = firstSess > 0 ? ((lastSess - firstSess) / firstSess) * 100 : 0;
      if (Math.abs(spendDelta) > 25 || Math.abs(sessDelta) > 25) {
        out.push({
          severity: 'info',
          title: `Trend: spend ${spendDelta >= 0 ? 'up' : 'down'} ${Math.abs(spendDelta).toFixed(0)}%, sessions ${sessDelta >= 0 ? 'up' : 'down'} ${Math.abs(sessDelta).toFixed(0)}%`,
          detail: `Comparing the back half of the range to the front. ${
            spendDelta > 25 && sessDelta < 10 ? 'Spend is climbing faster than traffic — efficiency is slipping.' : 'Watch that spend and results move together.'
          }`,
        });
      }
    }
  }

  if (out.length === 0) {
    out.push({
      severity: 'info',
      title: 'Not enough data yet',
      detail: 'Once a bit of spend and traffic accumulate in this range, findings will appear here.',
    });
  }

  const order: Record<Severity, number> = { critical: 0, warning: 1, good: 2, info: 3 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
