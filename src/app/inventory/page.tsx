import AccessNotice from '@/components/AccessNotice';
import { ImportModal, ItemModal } from '@/components/inventory/ItemModals';
import Icon from '@/components/lf/Icon';
import PageBar from '@/components/lf/PageBar';
import { Chip } from '@/components/lf/Chips';
import SetupNotice from '@/components/SetupNotice';
import { formatPaise } from '@/core/money';
import { guardModulePage } from '@/core/page-guard';
import { hasPermission } from '@/core/permissions';
import { productSource, type Product } from '@/core/products';
import '@/modules/jobs';

export const dynamic = 'force-dynamic';

// The catalogue and one view of stock: on hand, committed to confirmed
// orders, free, and what is on the way.
export default async function InventoryPage() {
  const user = await guardModulePage('inventory', 'inventory:read');
  if (!user) return <AccessNotice area="Stock" />;
  const canWrite = hasPermission(user, 'inventory:write');

  let products: Product[];
  try {
    products = await productSource().list();
  } catch (error) {
    return <SetupNotice message={error instanceof Error ? error.message : String(error)} />;
  }
  const n = (value: number) => (value ? value.toLocaleString('en-IN') : <span className="lf-dim">0</span>);

  return (
    <main className="lf-page">
      <PageBar icon="stock" title="Stock" actions={canWrite ? <><ImportModal /><ItemModal trigger="add" /></> : undefined} />
      {products.length === 0 ? (
        <div className="lf-empty"><strong>No items yet</strong>Add items one by one, or import them from a CSV. Quotes use these names and rates.</div>
      ) : (
        <div className="lf-table-wrap">
          <table className="lf-table">
            <thead>
              <tr>
                <th><span className="lf-th"><Icon name="stock" />Item</span></th>
                <th className="lf-num">Rate</th>
                <th className="lf-num">GST</th>
                <th className="lf-num">On hand</th>
                <th className="lf-num">Committed</th>
                <th className="lf-num">Free</th>
                <th className="lf-num">Incoming, local</th>
                <th className="lf-num">Incoming, import</th>
                <th className="lf-num">Free after incoming</th>
                {canWrite && <th aria-label="Edit" />}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const after = p.available + p.incomingLocal + p.incomingImport;
                return (
                  <tr key={p.sku} style={{ cursor: 'default' }}>
                    <td><span className="lf-ref">{p.sku}</span><span className="lf-row-link">{p.name}</span></td>
                    <td className="lf-num">{formatPaise(p.ratePaise)}/{p.unit}</td>
                    <td className="lf-num">{p.gstRateBp / 100}%</td>
                    <td className="lf-num">{n(p.onHand)}</td>
                    <td className="lf-num">{n(p.committed)}</td>
                    <td className="lf-num">{p.available < 0 ? <Chip tone="red">{p.available.toLocaleString('en-IN')} short</Chip> : p.available.toLocaleString('en-IN')}</td>
                    <td className="lf-num">{n(p.incomingLocal)}</td>
                    <td className="lf-num">{n(p.incomingImport)}</td>
                    <td className="lf-num">{after < 0 ? <Chip tone="red">{after.toLocaleString('en-IN')}</Chip> : after.toLocaleString('en-IN')}</td>
                    {canWrite && (
                      <td style={{ padding: '0 0.25rem', width: '2.5rem' }}>
                        <ItemModal trigger="edit" item={{ sku: p.sku, name: p.name, unit: p.unit, rateRupees: p.ratePaise / 100, gstPercent: p.gstRateBp / 100, hsn: p.hsn, onHand: p.onHand, incomingLocal: p.incomingLocal, incomingImport: p.incomingImport }} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="lf-count-foot">{products.length} count · rates from {productSource().label}</div>
        </div>
      )}
    </main>
  );
}
