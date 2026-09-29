import { notFound } from 'next/navigation';
import AccessNotice from '@/components/AccessNotice';
import CrmDashboard from '@/components/crm/CrmDashboard';
import SetupNotice from '@/components/SetupNotice';
import { isModuleOn } from '@/core/modules';
import { hasPermission } from '@/core/permissions';
import { getSessionUserFromCookies } from '@/core/session';
import { getCrmWorkspace } from '@/modules/crm/crm-data';

export const dynamic = 'force-dynamic';

export default async function CrmPage() {
  if (!(await isModuleOn('crm'))) notFound();
  const user = await getSessionUserFromCookies();
  if (!user || !hasPermission(user, 'crm:read')) {
    return <AccessNotice area="CRM" />;
  }

  try {
    return (
      <CrmDashboard
        key="today"
        initialView="today"
        initialWorkspace={await getCrmWorkspace()}
        canWrite={hasPermission(user, 'crm:write')}
      />
    );
  } catch (error) {
    return <SetupNotice message={error instanceof Error ? error.message : String(error)} />;
  }
}
