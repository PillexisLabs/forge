import { channelReady, sendOnChannel } from '@/core/channels';
import { inputObject, optionalText, positiveInteger, requiredText, StepError, type CaseRecord, type JobDefinition } from '@/core/jobs';
import { renderPoPdf } from './po-pdf';
import { getSupplier } from './supplier-data';
import { getSettings } from '@/core/settings';

// The purchase order job.
//
//   (short stock on a confirmed order) ──draft──▶ draft ──approve and send──▶ sent ──received──▶ received
//                                                   └──────── cancel ─────────┴──▶ cancelled
//
// A rule drafts the PO; a person always approves it, because it commits
// money. Sending emails the PO to the supplier. On "received", inventory
// moves the quantity from incoming to on hand.

export type PoLine = { sku: string; name: string; unit: string; quantity: number };

export type PoData = {
  supplier: { id: number; name: string; email: string | null; phone: string | null; leadDays: number } | null;
  forOrder: string | null;
  lines: PoLine[];
  expectedAt?: string | null;
  sent?: { at: string; via: 'email' | 'manual' };
  received?: { at: string; note: string | null };
  cancellation?: { reason: string; at: string };
  fixture?: boolean;
};

export type PoCase = CaseRecord<PoData, { supplierName: string }>;

async function business() {
  return getSettings<{ businessName: string; businessAddress: string; businessGstin: string }>('sales', { businessName: 'Our team', businessAddress: '', businessGstin: '' });
}

function linesOf(current: CaseRecord | null) {
  return ((current?.data as PoData | undefined)?.lines ?? []).map((l) => ({ sku: l.sku, quantity: l.quantity }));
}

export const purchaseJob: JobDefinition = {
  job: 'purchase',
  module: 'purchasing',
  label: 'Purchase order',
  refPrefix: 'PO',
  states: {
    draft: { label: 'Draft, check and send', assignee: 'operations' },
    sent: { label: 'Sent, waiting for stock', assignee: null },
    received: { label: 'Received', assignee: null, terminal: true },
    cancelled: { label: 'Cancelled', assignee: null, terminal: true },
  },
  steps: {
    draftForShortage: {
      label: 'Draft for short stock',
      from: [],
      to: ['draft'],
      permission: 'purchasing:write',
      actors: ['rule', 'user'],
      parse(raw) {
        const input = inputObject(raw);
        const lines = (Array.isArray(input.lines) ? input.lines : []).map((l): PoLine => {
          const o = inputObject(l);
          return { sku: requiredText(o, 'sku', 'SKU', 40), name: requiredText(o, 'name', 'Item', 200), unit: requiredText(o, 'unit', 'Unit', 20), quantity: positiveInteger(o.quantity, 'Quantity') };
        });
        if (!lines.length) throw new StepError('A purchase order needs at least one item.');
        const supplier = input.supplier && typeof input.supplier === 'object' ? input.supplier as PoData['supplier'] : null;
        return { lines, supplier, forOrder: optionalText(input, 'forOrder', 20), fixture: input.fixture === true };
      },
      async run({ actor }, input) {
        return {
          title: input.supplier?.name ?? 'Supplier to choose',
          subject: { supplierName: input.supplier?.name ?? '' },
          data: { lines: input.lines, supplier: input.supplier, forOrder: input.forOrder, fixture: input.fixture },
          summary: [
            `${actor.kind === 'rule' ? 'Drafted' : 'Created'} a purchase order for ${input.lines.map((l: PoLine) => `${l.quantity.toLocaleString('en-IN')} ${l.unit} ${l.name}`).join(', ')}${input.forOrder ? ` to cover order ${input.forOrder}` : ''}.`,
            input.supplier ? `Supplier: ${input.supplier.name}.` : 'No supplier supplies these items yet, so choose one.',
            'A person must approve it.',
          ].join(' '),
        };
      },
    },

    approveAndSend: {
      label: 'Approve and send',
      from: ['draft'],
      to: ['sent'],
      permission: 'purchasing:write',
      parse(raw) {
        const input = inputObject(raw);
        const id = Number(input.supplierId);
        return { supplierId: Number.isInteger(id) && id > 0 ? id : null };
      },
      async run({ current }, input) {
        const data = current!.data as PoData;
        const chosen = input.supplierId ? await getSupplier(input.supplierId) : null;
        const supplier = chosen
          ? { id: chosen.id, name: chosen.name, email: chosen.email, phone: chosen.phone, leadDays: chosen.lead_days }
          : data.supplier;
        if (!supplier) throw new StepError('Choose the supplier first.');
        const at = new Date();
        const expectedAt = new Date(at.getTime() + supplier.leadDays * 86400000).toISOString().slice(0, 10);
        let via: 'email' | 'manual' = 'manual';
        if (supplier.email && await channelReady('email')) {
          const biz = await business();
          const pdf = await renderPoPdf({ ref: current!.ref, supplier, lines: data.lines, expectedAt, business: { name: biz.businessName, address: biz.businessAddress, gstin: biz.businessGstin } });
          const result = await sendOnChannel('email', {
            to: supplier.email,
            subject: `Purchase order ${current!.ref} from ${biz.businessName}`,
            text: `Hello ${supplier.name},\n\nPlease supply the items in purchase order ${current!.ref} (attached), by ${expectedAt}. Please confirm the delivery date.\n\n${biz.businessName}`,
            attachment: { filename: `${current!.ref}.pdf`, mime: 'application/pdf', bytes: pdf },
            caseId: current!.id,
          });
          if (result.ok) via = 'email';
        }
        return {
          title: supplier.name,
          subject: { supplierName: supplier.name },
          data: { supplier, expectedAt, sent: { at: at.toISOString(), via } },
          summary: via === 'email'
            ? `Approved and emailed to ${supplier.name}. Expected by ${expectedAt}; the quantity now shows as incoming stock.`
            : `Approved for ${supplier.name}. Forge could not email it, so send the PDF yourself. Expected by ${expectedAt}.`,
          events: (saved) => [{ name: 'po.sent', dedupeKey: `case:${saved.id}`, payload: { v: 1, po_ref: saved.ref, expected_at: expectedAt, lines: linesOf(current) } }],
        };
      },
    },

    markReceived: {
      label: 'Mark as received',
      from: ['sent'],
      to: ['received'],
      permission: 'purchasing:write',
      parse(raw) {
        return { note: optionalText(inputObject(raw), 'note', 500) };
      },
      async run({ current }, input) {
        return {
          data: { received: { at: new Date().toISOString(), note: input.note } },
          summary: `Received${input.note ? `: ${input.note}` : ''}. The stock moves from incoming to on hand.`,
          events: (saved) => [{ name: 'po.received', dedupeKey: `case:${saved.id}`, payload: { v: 1, po_ref: saved.ref, lines: linesOf(current) } }],
        };
      },
    },

    cancelPo: {
      label: 'Cancel',
      from: ['draft'],
      to: ['cancelled'],
      permission: 'purchasing:write',
      parse(raw) {
        return { reason: requiredText(inputObject(raw), 'reason', 'The reason', 500) };
      },
      async run(_ctx, input) {
        return { data: { cancellation: { reason: input.reason, at: new Date().toISOString() } }, summary: `Cancelled: ${input.reason}` };
      },
    },
  },
};
