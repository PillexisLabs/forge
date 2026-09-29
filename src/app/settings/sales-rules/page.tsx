import AccessNotice from '@/components/AccessNotice';
import SalesRulesForm from '@/components/settings/SalesRulesForm';
import { getSql } from '@/core/db';
import { guardModulePage } from '@/core/page-guard';
import { hasPermission } from '@/core/permissions';
import { getSalesRules } from '@/modules/sales/sales-settings';
import { timeAgo } from '@/components/lf/format';

export const dynamic = 'force-dynamic';

export default async function SalesRulesPage() {
  const user = await guardModulePage('sales', 'sales:read');
  if (!user || !hasPermission(user, 'core:config')) return <AccessNotice area="Settings" />;
  const rules = await getSalesRules();
  const sql = getSql();
  const [meta] = await sql<{ updated_by: string | null; updated_at: string }[]>`select updated_by, updated_at from settings where key = 'sales'`;
  return (
    <main className="lf-page">
      <div className="lf-settings">
        <h1>Sales rules</h1>
        <p>How Forge prices, approves and sends quotes. {meta ? `Last changed by ${meta.updated_by} ${timeAgo(meta.updated_at)}.` : 'These are the first defaults.'}</p>
        <SalesRulesForm rules={rules} />
      </div>
    </main>
  );
}
