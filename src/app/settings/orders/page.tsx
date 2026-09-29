import AccessNotice from '@/components/AccessNotice';
import OrdersPaymentsForm from '@/components/settings/OrdersPaymentsForm';
import { timeAgo } from '@/components/lf/format';
import { getSql } from '@/core/db';
import { guardModulePage } from '@/core/page-guard';
import { hasPermission } from '@/core/permissions';
import { getOrderRules } from '@/modules/orders/order-settings';
import { getPaymentRules } from '@/modules/orders/payment-settings';
import { getSalesRules } from '@/modules/sales/sales-settings';

export const dynamic = 'force-dynamic';

export default async function OrdersSettingsPage() {
  const user = await guardModulePage('orders', 'orders:read');
  if (!user || !hasPermission(user, 'core:config')) return <AccessNotice area="Settings" />;
  const [orders, payments, sales] = await Promise.all([getOrderRules(), getPaymentRules(), getSalesRules()]);
  const sql = getSql();
  const [meta] = await sql<{ updated_by: string | null; updated_at: string }[]>`select updated_by, updated_at from settings where key in ('orders', 'payments') order by updated_at desc limit 1`;
  return (
    <main className="lf-page">
      <div className="lf-settings">
        <h1>Orders & payments</h1>
        <p>What Forge does when a buyer confirms, which documents it sends, and how buyers pay. {meta ? `Last changed by ${meta.updated_by} ${timeAgo(meta.updated_at)}.` : 'These are the first defaults.'}</p>
        <OrdersPaymentsForm orders={orders} payments={payments} sellerGstin={sales.businessGstin} />
      </div>
    </main>
  );
}
