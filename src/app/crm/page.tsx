import CrmDashboard from '@/components/crm/CrmDashboard';
import SetupNotice from '@/components/SetupNotice';
import { getCrmWorkspace } from '@/modules/crm/crm-data';

export const dynamic = 'force-dynamic';

export default async function CrmPage() {
  try {
    return (
      <CrmDashboard
        key="today"
        initialView="today"
        initialWorkspace={await getCrmWorkspace()}
      />
    );
  } catch (error) {
    return <SetupNotice message={error instanceof Error ? error.message : String(error)} />;
  }
}
