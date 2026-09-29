import { getSettings, saveSettings } from '@/core/settings';

// What happens when a buyer confirms, and which documents Forge issues.
// Set in Settings → Orders & payments.

export type InvoiceMode = 'none' | 'payment_request' | 'tax_invoice';

export type OrderRules = {
  /** Send the buyer an order confirmation with the PDF. */
  sendConfirmation: boolean;
  /** Draft a purchase order to the supplier for each short item. */
  supplierPos: boolean;
  /**
   * none            invoices come from Tally or another system; Forge sends plain payment reminders
   * payment_request Forge sends a payment request (proforma) when each payment falls due
   * tax_invoice     Forge issues a numbered GST tax invoice at dispatch
   */
  invoiceMode: InvoiceMode;
  /** Tax invoice number prefix; the financial year is added, e.g. INV/2026-27/0001. */
  invoicePrefix: string;
};

export const DEFAULT_ORDER_RULES: OrderRules = {
  sendConfirmation: true,
  supplierPos: false,
  invoiceMode: 'payment_request',
  invoicePrefix: 'INV/',
};

export async function getOrderRules(): Promise<OrderRules> {
  return getSettings('orders', DEFAULT_ORDER_RULES);
}

export function parseOrderRules(input: Record<string, unknown>): OrderRules {
  const on = (v: unknown) => v === true || v === 'on';
  const mode = input.invoiceMode === 'none' || input.invoiceMode === 'tax_invoice' ? input.invoiceMode : 'payment_request';
  const prefix = String(input.invoicePrefix ?? 'INV/').trim().toUpperCase();
  if (!/^[A-Z0-9/-]{1,10}$/.test(prefix)) throw new Error('The invoice prefix can use letters, digits, / and -, up to 10 characters.');
  return { sendConfirmation: on(input.sendConfirmation), supplierPos: on(input.supplierPos), invoiceMode: mode, invoicePrefix: prefix };
}

export async function saveOrderRules(rules: OrderRules, actorName: string) {
  await saveSettings('orders', rules as unknown as Record<string, unknown>, actorName);
}
