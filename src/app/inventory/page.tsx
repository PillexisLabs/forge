import AccessNotice from '@/components/AccessNotice';
import ForgeShell from '@/components/ForgeShell';
import SetupNotice from '@/components/SetupNotice';
import { formatPaise } from '@/core/money';
import { guardModulePage } from '@/core/page-guard';
import { productSource, type Product } from '@/core/products';
import '@/modules/jobs';

export const dynamic = 'force-dynamic';

// One view of stock: what is here, what is on the way, and what is already
// promised to confirmed orders.
export default async function InventoryPage() {
  const user = await guardModulePage('inventory', 'inventory:read');
  if (!user) return <AccessNotice area="Stock" />;

  let products: Product[];
  try {
    products = await productSource().list();
  } catch (error) {
    return <SetupNotice message={error instanceof Error ? error.message : String(error)} />;
  }
  const short = products.filter((product) => product.available < 0).length;

  return (
    <ForgeShell
      activeArea="inventory"
      title="Stock"
      description={`${products.length} items from ${productSource().label}. Free stock is on hand minus stock committed to confirmed orders.`}
    >
      <section className="job-panel">
        <header className="job-panel-head">
          <h2>All items</h2>
          {short > 0 && <span className="job-short">{short} {short === 1 ? 'item is' : 'items are'} short</span>}
        </header>
        {products.length === 0 ? (
          <p className="job-empty">No items in the catalogue yet.</p>
        ) : (
          <div className="job-table-wrap">
            <table className="job-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="job-num">Rate</th>
                  <th className="job-num">On hand</th>
                  <th className="job-num">Committed</th>
                  <th className="job-num">Free</th>
                  <th className="job-num">Incoming, local</th>
                  <th className="job-num">Incoming, import</th>
                  <th className="job-num">Free after incoming</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const afterIncoming = product.available + product.incomingLocal + product.incomingImport;
                  return (
                    <tr key={product.sku}>
                      <td>{product.name}<span className="job-sku">{product.sku}</span></td>
                      <td className="job-num">{formatPaise(product.ratePaise)}/{product.unit}</td>
                      <td className="job-num">{product.onHand.toLocaleString('en-IN')}</td>
                      <td className="job-num">{product.committed ? product.committed.toLocaleString('en-IN') : <span className="job-dim">0</span>}</td>
                      <td className="job-num"><span className={product.available < 0 ? 'job-short' : undefined}>{product.available.toLocaleString('en-IN')}</span></td>
                      <td className="job-num">{product.incomingLocal ? product.incomingLocal.toLocaleString('en-IN') : <span className="job-dim">0</span>}</td>
                      <td className="job-num">{product.incomingImport ? product.incomingImport.toLocaleString('en-IN') : <span className="job-dim">0</span>}</td>
                      <td className="job-num"><span className={afterIncoming < 0 ? 'job-short' : undefined}>{afterIncoming.toLocaleString('en-IN')}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </ForgeShell>
  );
}
