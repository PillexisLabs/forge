import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { PoLine } from './purchase-job';

export async function renderPoPdf(input: {
  ref: string;
  supplier: { name: string; email: string | null; phone: string | null };
  lines: PoLine[];
  expectedAt: string;
  business: { name: string; address: string; gstin: string };
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Purchase order ${input.ref}`);
  const page = doc.addPage([595.28, 841.89]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.11, 0.11);
  const muted = rgb(0.42, 0.42, 0.4);
  const rule = rgb(0.88, 0.87, 0.85);
  const left = 48;
  const right = 547;
  let y = 790;
  const text = (v: string, x: number, yy: number, o: { size?: number; font?: typeof regular; color?: typeof ink; align?: 'right' } = {}) => {
    const size = o.size ?? 9.5;
    const font = o.font ?? regular;
    page.drawText(v, { x: o.align === 'right' ? x - font.widthOfTextAtSize(v, size) : x, y: yy, size, font, color: o.color ?? ink });
  };
  text(input.business.name, left, y, { size: 16, font: bold });
  text('Purchase order', right, y, { size: 14, font: bold, align: 'right' });
  y -= 16;
  if (input.business.address) text(input.business.address.slice(0, 70), left, y, { color: muted });
  text(input.ref, right, y, { color: muted, align: 'right' });
  y -= 13;
  if (input.business.gstin) text(`GSTIN ${input.business.gstin}`, left, y, { color: muted });
  y -= 18;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1.4, color: ink });
  y -= 22;
  text('Supplier', left, y, { size: 8, color: muted });
  y -= 14;
  text(input.supplier.name, left, y, { font: bold });
  if (input.supplier.email) { y -= 13; text(input.supplier.email, left, y); }
  y -= 13;
  text(`Deliver by ${input.expectedAt}`, left, y);
  y -= 28;
  text('#', left, y, { size: 8, color: muted });
  text('Item', left + 18, y, { size: 8, color: muted });
  text('Quantity', right, y, { size: 8, color: muted, align: 'right' });
  y -= 8;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.6, color: rule });
  input.lines.forEach((l, i) => {
    y -= 16;
    text(String(i + 1), left, y);
    text(`${l.name} (${l.sku})`.slice(0, 70), left + 18, y);
    text(`${l.quantity.toLocaleString('en-IN')} ${l.unit}`, right, y, { align: 'right' });
    y -= 8;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.4, color: rule });
  });
  y -= 30;
  text('Please confirm the delivery date and send your invoice with the goods.', left, y, { color: muted });
  return doc.save();
}
