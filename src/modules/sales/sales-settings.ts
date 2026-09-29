import { env } from '@/core/env';
import { getSettings, saveSettings } from '@/core/settings';

// The sales rules a user sets in Settings → Sales rules. Server env values
// are only the first defaults for a new instance.

export type SalesRules = {
  /** 'always' = every quote needs an approver; 'above' = only above the limit. */
  approvalMode: 'always' | 'above';
  approvalLimitRupees: number;
  freightLocalRupees: number;
  freightOutstationRupees: number;
  localPinPrefixes: string[];
  quoteValidDays: number;
  /** Forge sends an approved quote on the buyer's channel without a click. */
  autoSend: boolean;
  /** Forge drafts a quote when it can match the items in a message. */
  autoDraft: boolean;
  businessName: string;
  businessAddress: string;
  businessGstin: string;
};

export function defaultSalesRules(): SalesRules {
  return {
    approvalMode: 'above',
    approvalLimitRupees: env.salesApprovalLimitRupees(),
    freightLocalRupees: env.salesFreightLocalRupees(),
    freightOutstationRupees: env.salesFreightOutstationRupees(),
    localPinPrefixes: env.salesLocalPinPrefixes(),
    quoteValidDays: env.salesQuoteValidDays(),
    autoSend: true,
    autoDraft: true,
    businessName: env.businessName(),
    businessAddress: env.businessAddress(),
    businessGstin: env.businessGstin(),
  };
}

export async function getSalesRules(): Promise<SalesRules> {
  return getSettings('sales', defaultSalesRules());
}

function num(value: unknown, label: string, min = 0): number {
  const n = typeof value === 'string' ? Number(value.replace(/,/g, '')) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min) throw new Error(`${label} must be a number of ${min} or more.`);
  return Math.round(n);
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Validate a form submission into SalesRules. Throws with a message for the user. */
export function parseSalesRules(input: Record<string, unknown>): SalesRules {
  const prefixes = (Array.isArray(input.localPinPrefixes) ? input.localPinPrefixes.join(',') : String(input.localPinPrefixes ?? ''))
    .split(/[,\s]+/).map((p) => p.trim()).filter(Boolean);
  if (prefixes.some((p) => !/^\d{1,3}$/.test(p))) throw new Error('Local pincode prefixes must be 1 to 3 digits each, for example 56, 57.');
  const name = text(input.businessName, 160);
  if (!name) throw new Error('The business name is required. It prints on every quote.');
  return {
    approvalMode: input.approvalMode === 'always' ? 'always' : 'above',
    approvalLimitRupees: num(input.approvalLimitRupees, 'The approval limit'),
    freightLocalRupees: num(input.freightLocalRupees, 'Local freight'),
    freightOutstationRupees: num(input.freightOutstationRupees, 'Outstation freight'),
    localPinPrefixes: prefixes,
    quoteValidDays: num(input.quoteValidDays, 'Quote validity', 1),
    autoSend: input.autoSend === true || input.autoSend === 'on',
    autoDraft: input.autoDraft === true || input.autoDraft === 'on',
    businessName: name,
    businessAddress: text(input.businessAddress, 300),
    businessGstin: text(input.businessGstin, 20).toUpperCase(),
  };
}

export async function saveSalesRules(rules: SalesRules, actorName: string) {
  await saveSettings('sales', rules as unknown as Record<string, unknown>, actorName);
}
