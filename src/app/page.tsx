import AccessNotice from '@/components/AccessNotice';
import DashboardView from '@/components/DashboardView';
import SetupNotice from '@/components/SetupNotice';
import { hasPermission } from '@/core/permissions';
import { getSessionUserFromCookies } from '@/core/session';
import { getAnalyticsData, resolveAnalyticsRange } from '@/modules/analytics/analytics-data';

export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; campaign?: string; view?: string };
}) {
  const user = await getSessionUserFromCookies();
  if (!user || !hasPermission(user, 'analytics:read')) {
    return <AccessNotice area="Analytics" />;
  }

  try {
    const range = resolveAnalyticsRange(searchParams?.from, searchParams?.to);
    const data = await getAnalyticsData(range, searchParams?.campaign);
    return (
      <DashboardView
        initialView={searchParams?.view}
        canSync={hasPermission(user, 'analytics:sync')}
        summary={data.summary}
        ads={data.ads}
        sources={data.sources}
        from={data.from}
        to={data.to}
        syncRuns={data.syncRuns}
        prev={data.prev}
        prevDays={data.days}
        campaigns={data.campaigns}
        campaignId={data.campaignId}
      />
    );
  } catch (error) {
    return <SetupNotice message={error instanceof Error ? error.message : String(error)} />;
  }
}
