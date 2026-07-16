import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { env } from './env';
import type { GaSummary, GaSource } from './types';

function getClient() {
  const json = env.gaCredentialsJson();
  if (json) {
    const creds = JSON.parse(json);
    return new BetaAnalyticsDataClient({
      credentials: { client_email: creds.client_email, private_key: creds.private_key },
      projectId: creds.project_id,
    });
  }
  // Falls back to GOOGLE_APPLICATION_CREDENTIALS (file path) / ADC.
  return new BetaAnalyticsDataClient();
}

const property = () => `properties/${env.ga4PropertyId()}`;

/** Top-line GA metrics for a single day (date as YYYY-MM-DD). */
export async function getGaSummary(date: string): Promise<GaSummary> {
  const client = getClient();

  const [core] = await client.runReport({
    property: property(),
    dateRanges: [{ startDate: date, endDate: date }],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'newUsers' },
      { name: 'engagedSessions' },
    ],
  });

  const mv = core.rows?.[0]?.metricValues ?? [];
  const num = (i: number) => Number(mv[i]?.value ?? 0);

  const [events] = await client.runReport({
    property: property(),
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        inListFilter: { values: ['book_call_clicked', 'generate_lead'] },
      },
    },
  });

  let bookCallClicks = 0;
  let leads = 0;
  for (const r of events.rows ?? []) {
    const name = r.dimensionValues?.[0]?.value;
    const count = Number(r.metricValues?.[0]?.value ?? 0);
    if (name === 'book_call_clicked') bookCallClicks = count;
    if (name === 'generate_lead') leads = count;
  }

  return {
    sessions: num(0),
    users: num(1),
    newUsers: num(2),
    engagedSessions: num(3),
    bookCallClicks,
    leads,
  };
}

/** Sessions/users + conversions by source + medium for a single day. */
export async function getGaSources(date: string): Promise<GaSource[]> {
  const client = getClient();

  // Traffic by source/medium.
  const [rep] = await client.runReport({
    property: property(),
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 50,
  });

  const map = new Map<string, GaSource>();
  for (const r of rep.rows ?? []) {
    const source = r.dimensionValues?.[0]?.value ?? '(not set)';
    const medium = r.dimensionValues?.[1]?.value ?? '(not set)';
    map.set(`${source}|${medium}`, {
      source,
      medium,
      sessions: Number(r.metricValues?.[0]?.value ?? 0),
      users: Number(r.metricValues?.[1]?.value ?? 0),
      bookCallClicks: 0,
      leads: 0,
    });
  }

  // Conversion events broken out by the same source/medium.
  const [evt] = await client.runReport({
    property: property(),
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }, { name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', inListFilter: { values: ['book_call_clicked', 'generate_lead'] } },
    },
    limit: 200,
  });
  for (const r of evt.rows ?? []) {
    const source = r.dimensionValues?.[0]?.value ?? '(not set)';
    const medium = r.dimensionValues?.[1]?.value ?? '(not set)';
    const name = r.dimensionValues?.[2]?.value;
    const count = Number(r.metricValues?.[0]?.value ?? 0);
    const key = `${source}|${medium}`;
    let row = map.get(key);
    if (!row) {
      row = { source, medium, sessions: 0, users: 0, bookCallClicks: 0, leads: 0 };
      map.set(key, row);
    }
    if (name === 'book_call_clicked') row.bookCallClicks += count;
    if (name === 'generate_lead') row.leads += count;
  }

  return Array.from(map.values())
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 25);
}
