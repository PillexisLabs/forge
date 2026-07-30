import DashboardView from '@/components/DashboardView';
import SetupNotice from '@/components/SetupNotice';
import { getAnalyticsData, resolveAnalyticsRange } from '@/lib/analytics-data';

export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; campaign?: string; view?: string };
}) {
  try {
    const range = resolveAnalyticsRange(searchParams?.from, searchParams?.to);
    const data = await getAnalyticsData(range, searchParams?.campaign);
    return (
      <DashboardView
        initialView={searchParams?.view}
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
