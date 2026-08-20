import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getAnalyticsData, resolveAnalyticsRange } from '@/modules/analytics/analytics-data';
import { recordApiRequest } from '@/core/api-audit';
import { authorizeApiClient } from '@/core/api-auth';
import { env } from '@/core/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const route = '/api/v1/analytics';
const scope = 'analytics:read';
const responseHeaders = { 'Cache-Control': 'private, no-store' };

export async function GET(req: NextRequest) {
  const requestId = randomUUID();
  const auth = authorizeApiClient(req, scope);
  const userAgent = req.headers.get('user-agent');

  if (!auth.ok) {
    await recordApiRequest({ requestId, clientId: auth.clientId, route, scope, statusCode: auth.status, userAgent });
    return NextResponse.json({ error: auth.error, requestId }, { status: auth.status, headers: responseHeaders });
  }

  const params = req.nextUrl.searchParams;
  const unsupported = [...params.keys()].filter((key) => !['from', 'to', 'campaign'].includes(key));
  if (unsupported.length > 0) {
    await recordApiRequest({ requestId, clientId: auth.client.id, route, scope, statusCode: 400, userAgent });
    return NextResponse.json(
      { error: 'unsupported_query_parameter', parameters: unsupported, requestId },
      { status: 400, headers: responseHeaders },
    );
  }

  try {
    const range = resolveAnalyticsRange(params.get('from') ?? undefined, params.get('to') ?? undefined);
    const data = await getAnalyticsData(range, params.get('campaign') ?? undefined);
    await recordApiRequest({
      requestId, clientId: auth.client.id, route, scope, statusCode: 200,
      from: range.from, to: range.to, userAgent,
    });
    return NextResponse.json({
      apiVersion: 'v1',
      requestId,
      client: { id: auth.client.id },
      account: { provider: 'meta', id: env.metaAccountId() },
      filter: { campaign: data.campaignId },
      range: { from: range.from, to: range.to, days: range.days, daysWithData: data.summary.length },
      data: {
        daily: data.summary,
        ads: data.ads,
        sources: data.sources,
        syncRuns: data.syncRuns,
        previousPeriod: data.prev,
        campaigns: data.campaigns,
      },
    }, { headers: responseHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /^(from|to|date range|campaign)/.test(message) ? 400 : 500;
    if (status === 500) console.error('Analytics API query failed', { requestId, error });
    await recordApiRequest({ requestId, clientId: auth.client.id, route, scope, statusCode: status, userAgent });
    return NextResponse.json(
      {
        error: status === 400 ? 'invalid_date_range' : 'analytics_query_failed',
        ...(status === 400 ? { message } : {}),
        requestId,
      },
      { status, headers: responseHeaders },
    );
  }
}
