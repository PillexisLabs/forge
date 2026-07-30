import { notFound } from 'next/navigation';
import CrmDashboard from '@/components/crm/CrmDashboard';
import SetupNotice from '@/components/SetupNotice';
import { getCrmWorkspace } from '@/lib/crm-data';
import { crmViewFromRoute } from '@/lib/crm-routes';

export const dynamic = 'force-dynamic';

export default async function CrmChildPage({ params }: { params: { view: string } }) {
  const initialView = crmViewFromRoute(params.view);
  if (!initialView) notFound();

  try {
    return (
      <CrmDashboard
        key={initialView}
        initialView={initialView}
        initialWorkspace={await getCrmWorkspace()}
      />
    );
  } catch (error) {
    return <SetupNotice message={error instanceof Error ? error.message : String(error)} />;
  }
}
