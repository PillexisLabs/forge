import { notFound } from 'next/navigation';
import AccessNotice from '@/components/AccessNotice';
import CrmDashboard from '@/components/crm/CrmDashboard';
import SetupNotice from '@/components/SetupNotice';
import { hasPermission } from '@/core/permissions';
import { getSessionUserFromCookies } from '@/core/session';
import { getCrmWorkspace } from '@/modules/crm/crm-data';
import { crmViewFromRoute } from '@/modules/crm/crm-routes';

export const dynamic = 'force-dynamic';

export default async function CrmChildPage({ params }: { params: { view: string } }) {
  const initialView = crmViewFromRoute(params.view);
  if (!initialView) notFound();

  const user = await getSessionUserFromCookies();
  if (!user || !hasPermission(user, 'crm:read')) {
    return <AccessNotice area="CRM" />;
  }

  try {
    return (
      <CrmDashboard
        key={initialView}
        initialView={initialView}
        initialWorkspace={await getCrmWorkspace()}
        canWrite={hasPermission(user, 'crm:write')}
      />
    );
  } catch (error) {
    return <SetupNotice message={error instanceof Error ? error.message : String(error)} />;
  }
}
