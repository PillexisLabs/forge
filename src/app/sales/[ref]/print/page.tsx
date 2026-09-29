import { notFound } from 'next/navigation';
import AccessNotice from '@/components/AccessNotice';
import PrintButton from '@/components/sales/PrintButton';
import { env } from '@/core/env';
import { getCaseByRef } from '@/core/jobs';
import { formatPaise } from '@/core/money';
import { guardModulePage } from '@/core/page-guard';
import type { QuoteCase } from '@/modules/sales/quote-job';

export const dynamic = 'force-dynamic';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(value));
}

// The quote document. Staff save it as a PDF from the browser and attach it
// to the WhatsApp message. The workspace chrome hides itself on /print.
export default async function QuotePrintPage({ params }: { params: { ref: string } }) {
  const user = await guardModulePage('sales', 'sales:read');
  if (!user) return <AccessNotice area="Sales" />;
  const found = await getCaseByRef(params.ref);
  if (!found || found.job !== 'quote') notFound();
  const current = found as QuoteCase;
  const quote = current.data.quote;
  if (!quote) notFound();
  const validUntil = new Date(new Date(quote.preparedAt).getTime() + quote.validDays * 86400000).toISOString();
  const draft = !current.data.approval || current.data.approval.version !== quote.version;

  return (
    <main className="quote-doc">
      <div className="quote-doc-tools"><PrintButton /></div>
      <article className="quote-sheet">
        {draft && <p className="quote-draft-mark">Draft, not approved</p>}
        <header className="quote-sheet-head">
          <div>
            <h1>{env.businessName()}</h1>
            <p>{env.businessAddress()}</p>
            {env.businessGstin() && <p>GSTIN {env.businessGstin()}</p>}
          </div>
          <div className="quote-sheet-ref">
            <h2>Quotation</h2>
            <p>{current.ref} · v{quote.version}</p>
            <p>{formatDate(quote.preparedAt)}</p>
          </div>
        </header>
        <section className="quote-sheet-to">
          <p className="quote-label">To</p>
          <p><strong>{current.subject.buyerName}</strong></p>
          {current.subject.company && <p>{current.subject.company}</p>}
          <p>Delivery pincode {quote.pincode}</p>
        </section>
        <table className="quote-sheet-table">
          <thead>
            <tr><th>#</th><th>Item</th><th>HSN</th><th className="n">Quantity</th><th className="n">Rate</th><th className="n">Amount</th><th className="n">GST</th></tr>
          </thead>
          <tbody>
            {quote.lines.map((line, index) => (
              <tr key={line.sku}>
                <td>{index + 1}</td>
                <td>{line.name}<br /><span className="quote-sku">{line.sku}</span></td>
                <td>{line.hsn ?? ''}</td>
                <td className="n">{line.quantity.toLocaleString('en-IN')} {line.unit}</td>
                <td className="n">{formatPaise(line.ratePaise)}</td>
                <td className="n">{formatPaise(line.amountPaise)}</td>
                <td className="n">{formatPaise(line.gstPaise)} ({line.gstRateBp / 100}%)</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="quote-sheet-totals">
          <div><dt>Items</dt><dd>{formatPaise(quote.subtotalPaise)}</dd></div>
          <div><dt>GST</dt><dd>{formatPaise(quote.gstPaise)}</dd></div>
          <div><dt>Freight</dt><dd>{formatPaise(quote.freightPaise)}</dd></div>
          <div className="quote-grand"><dt>Total</dt><dd>{formatPaise(quote.totalPaise)}</dd></div>
        </dl>
        <footer className="quote-sheet-foot">
          <p>Valid until {formatDate(validUntil)}. Prices are per unit and exclude any change the buyer makes to the items or quantities.</p>
          <p>Reply to this message to confirm the order.</p>
        </footer>
      </article>
    </main>
  );
}
