import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { PricedQuote } from './quote-rules';
import type { QuoteSubject } from './quote-job';

// The quote PDF Forge attaches on WhatsApp and email. Made on the server with
// no browser. The standard PDF fonts cannot print ₹, so amounts read "Rs.".

function rs(paise: number): string {
  const rupees = paise / 100;
  return `Rs. ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2, maximumFractionDigits: 2 }).format(rupees)}`;
}

function date(value: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(value));
}

export async function renderQuotePdf(input: {
  ref: string;
  quote: PricedQuote;
  subject: QuoteSubject;
  business: { name: string; address: string; gstin: string };
  approved: boolean;
}): Promise<Uint8Array> {
  const { quote, subject, business } = input;
  const doc = await PDFDocument.create();
  doc.setTitle(`Quotation ${input.ref}`);
  doc.setAuthor(business.name);
  const page = doc.addPage([595.28, 841.89]); // A4
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.12, 0.15);
  const muted = rgb(0.42, 0.45, 0.5);
  const rule = rgb(0.85, 0.87, 0.9);
  const left = 48;
  const right = 547;
  let y = 790;

  const text = (value: string, x: number, yy: number, opts: { size?: number; font?: typeof regular; color?: typeof ink; align?: 'left' | 'right' } = {}) => {
    const size = opts.size ?? 9.5;
    const font = opts.font ?? regular;
    const width = font.widthOfTextAtSize(value, size);
    page.drawText(value, { x: opts.align === 'right' ? x - width : x, y: yy, size, font, color: opts.color ?? ink });
  };

  text(business.name, left, y, { size: 16, font: bold });
  text('Quotation', right, y, { size: 14, font: bold, align: 'right' });
  y -= 16;
  if (business.address) text(business.address, left, y, { color: muted });
  text(`${input.ref} · v${quote.version}`, right, y, { color: muted, align: 'right' });
  y -= 13;
  if (business.gstin) text(`GSTIN ${business.gstin}`, left, y, { color: muted });
  text(date(quote.preparedAt), right, y, { color: muted, align: 'right' });
  y -= 18;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1.4, color: ink });

  y -= 24;
  text('To', left, y, { size: 8, color: muted });
  y -= 14;
  text(subject.buyerName, left, y, { font: bold });
  if (subject.company) { y -= 13; text(subject.company, left, y); }
  y -= 13;
  text(`Delivery pincode ${quote.pincode}`, left, y);

  y -= 30;
  const cols = { n: left, item: left + 18, qty: 360, rate: 420, amount: 485, gst: right };
  text('#', cols.n, y, { size: 8, color: muted });
  text('Item', cols.item, y, { size: 8, color: muted });
  text('Quantity', cols.qty, y, { size: 8, color: muted, align: 'right' });
  text('Rate', cols.rate, y, { size: 8, color: muted, align: 'right' });
  text('Amount', cols.amount, y, { size: 8, color: muted, align: 'right' });
  text('GST', cols.gst, y, { size: 8, color: muted, align: 'right' });
  y -= 8;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.6, color: rule });

  quote.lines.forEach((line, index) => {
    y -= 16;
    text(String(index + 1), cols.n, y);
    text(line.name.slice(0, 52), cols.item, y);
    text(`${line.quantity.toLocaleString('en-IN')} ${line.unit}`, cols.qty, y, { align: 'right' });
    text(rs(line.ratePaise), cols.rate, y, { align: 'right' });
    text(rs(line.amountPaise), cols.amount, y, { align: 'right' });
    text(`${rs(line.gstPaise)} (${line.gstRateBp / 100}%)`, cols.gst, y, { align: 'right' });
    y -= 11;
    text(`${line.sku}${line.hsn ? ` · HSN ${line.hsn}` : ''}`, cols.item, y, { size: 7.5, color: muted });
    y -= 7;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.4, color: rule });
  });

  const totals: [string, number][] = [['Items', quote.subtotalPaise], ['GST', quote.gstPaise], ['Freight', quote.freightPaise]];
  y -= 20;
  for (const [label, value] of totals) {
    text(label, 380, y, { color: muted });
    text(rs(value), right, y, { align: 'right' });
    y -= 15;
  }
  page.drawLine({ start: { x: 380, y: y + 8 }, end: { x: right, y: y + 8 }, thickness: 1.2, color: ink });
  y -= 6;
  text('Total', 380, y, { size: 11, font: bold });
  text(rs(quote.totalPaise), right, y, { size: 11, font: bold, align: 'right' });

  y -= 40;
  const validUntil = new Date(new Date(quote.preparedAt).getTime() + quote.validDays * 86400000);
  text(`Valid until ${date(validUntil)}. Reply "confirm" to place the order.`, left, y, { color: muted });
  if (!input.approved) text('Draft, not approved', right, 800, { size: 8, font: bold, color: rgb(0.76, 0.31, 0.31), align: 'right' });

  return doc.save();
}
