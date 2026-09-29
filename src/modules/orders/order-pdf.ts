import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { splitGst, STATES, stateFromGstin, stateFromPincode } from './gst';
import type { Instalment } from './payment-settings';
import type { OrderData, OrderDocument, OrderSubject } from './order-job';

// The order documents Forge sends: an order confirmation, a payment request
// (proforma) for one instalment, and a GST tax invoice. The standard PDF
// fonts cannot print ₹, so amounts read "Rs.".

function rs(paise: number): string {
  const r = paise / 100;
  return `Rs. ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: Number.isInteger(r) ? 0 : 2, maximumFractionDigits: 2 }).format(r)}`;
}

function date(value: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(value));
}

const TITLES: Record<OrderDocument['kind'], string> = {
  order_confirmation: 'Order confirmation',
  payment_request: 'Payment request',
  tax_invoice: 'Tax invoice',
};

export async function renderOrderPdf(input: {
  kind: OrderDocument['kind'];
  number: string;
  issuedAt: string;
  orderRef: string;
  data: OrderData;
  subject: OrderSubject;
  business: { name: string; address: string; gstin: string };
  instalments: Instalment[];
  /** For a payment request: the instalment being requested. */
  instalment?: Instalment | null;
}): Promise<Uint8Array> {
  const { data, subject, business, kind } = input;
  const doc = await PDFDocument.create();
  doc.setTitle(`${TITLES[kind]} ${input.number}`);
  doc.setAuthor(business.name);
  const page = doc.addPage([595.28, 841.89]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.11, 0.11);
  const muted = rgb(0.42, 0.42, 0.4);
  const rule = rgb(0.88, 0.87, 0.85);
  const left = 48;
  const right = 547;
  let y = 790;
  const text = (value: string, x: number, yy: number, o: { size?: number; font?: typeof regular; color?: typeof ink; align?: 'left' | 'right' } = {}) => {
    const size = o.size ?? 9.5;
    const font = o.font ?? regular;
    const w = font.widthOfTextAtSize(value, size);
    page.drawText(value, { x: o.align === 'right' ? x - w : x, y: yy, size, font, color: o.color ?? ink });
  };

  text(business.name, left, y, { size: 16, font: bold });
  text(TITLES[kind], right, y, { size: 14, font: bold, align: 'right' });
  y -= 16;
  if (business.address) text(business.address.slice(0, 70), left, y, { color: muted });
  text(input.number, right, y, { color: muted, align: 'right' });
  y -= 13;
  if (business.gstin) text(`GSTIN ${business.gstin}`, left, y, { color: muted });
  text(date(input.issuedAt), right, y, { color: muted, align: 'right' });
  y -= 18;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1.4, color: ink });

  y -= 22;
  text(kind === 'tax_invoice' ? 'Bill to' : 'To', left, y, { size: 8, color: muted });
  text('Order', 360, y, { size: 8, color: muted });
  y -= 14;
  text(subject.buyerName, left, y, { font: bold });
  text(`${input.orderRef} · from quote ${data.quoteRef}${data.buyerPo ? ` · PO ${data.buyerPo}` : ''}`, 360, y);
  if (subject.company) { y -= 13; text(subject.company, left, y); }
  y -= 13;
  text(`Delivery pincode ${data.pincode}`, left, y);

  const sellerState = stateFromGstin(business.gstin);
  const buyerState = stateFromGstin(data.buyerGstin) ?? stateFromPincode(data.pincode);
  if (kind === 'tax_invoice') {
    if (data.buyerGstin) { y -= 13; text(`GSTIN ${data.buyerGstin}`, left, y); }
    y -= 13;
    text(`Place of supply: ${buyerState ? `${STATES[buyerState]} (${buyerState})` : 'not known'}${data.buyerGstin ? '' : ', from the delivery pincode'}`, left, y, { color: muted });
  }

  y -= 28;
  const cols = { n: left, item: left + 18, qty: 360, rate: 425, amount: right };
  text('#', cols.n, y, { size: 8, color: muted });
  text('Item', cols.item, y, { size: 8, color: muted });
  text('Quantity', cols.qty, y, { size: 8, color: muted, align: 'right' });
  text('Rate', cols.rate, y, { size: 8, color: muted, align: 'right' });
  text('Amount', cols.amount, y, { size: 8, color: muted, align: 'right' });
  y -= 8;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.6, color: rule });
  data.lines.forEach((line, i) => {
    y -= 16;
    text(String(i + 1), cols.n, y);
    text(line.name.slice(0, 52), cols.item, y);
    text(`${line.quantity.toLocaleString('en-IN')} ${line.unit}`, cols.qty, y, { align: 'right' });
    text(rs(line.ratePaise), cols.rate, y, { align: 'right' });
    text(rs(line.amountPaise), cols.amount, y, { align: 'right' });
    y -= 11;
    text(line.sku, cols.item, y, { size: 7.5, color: muted });
    y -= 7;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.4, color: rule });
  });

  const rows: [string, number][] = [['Items', data.subtotalPaise]];
  if (kind === 'tax_invoice') {
    const g = splitGst(data.gstPaise, sellerState, buyerState);
    if (g.igst) rows.push(['IGST', g.igst]);
    else { rows.push(['CGST', g.cgst]); rows.push(['SGST', g.sgst]); }
  } else {
    rows.push(['GST', data.gstPaise]);
  }
  rows.push(['Freight', data.freightPaise]);
  y -= 20;
  for (const [label, value] of rows) {
    text(label, 380, y, { color: muted });
    text(rs(value), right, y, { align: 'right' });
    y -= 15;
  }
  page.drawLine({ start: { x: 380, y: y + 8 }, end: { x: right, y: y + 8 }, thickness: 1.2, color: ink });
  y -= 6;
  text('Total', 380, y, { size: 11, font: bold });
  text(rs(data.totalPaise), right, y, { size: 11, font: bold, align: 'right' });

  // Payment schedule, and what is due now.
  y -= 34;
  text('Payment', left, y, { size: 8, color: muted });
  for (const inst of input.instalments) {
    y -= 14;
    const due = inst.dueAt ? `due ${date(inst.dueAt)}` : inst.trigger === 'dispatch' ? `due ${inst.days} days after dispatch` : 'due on confirmation';
    const paid = inst.paidPaise >= inst.amountPaise ? ' · paid' : inst.paidPaise > 0 ? ` · ${rs(inst.paidPaise)} paid` : '';
    text(`${inst.label}: ${rs(inst.amountPaise)}, ${due}${paid}`, left, y, { font: input.instalment?.key === inst.key ? bold : regular });
  }
  if (kind === 'payment_request' && input.instalment) {
    y -= 24;
    text(`Amount due now: ${rs(input.instalment.amountPaise - input.instalment.paidPaise)}`, left, y, { size: 12, font: bold });
  }

  y -= 36;
  const foot = kind === 'tax_invoice'
    ? 'This is a computer-generated invoice.'
    : kind === 'payment_request'
      ? 'This is a payment request, not a tax invoice. Reply with the payment reference once paid.'
      : 'Thank you for your order. We will share the dispatch details soon.';
  text(foot, left, y, { color: muted });

  return doc.save();
}
