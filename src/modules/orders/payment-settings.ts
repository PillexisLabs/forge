import { getSettings, saveSettings } from '@/core/settings';

// Payment terms and reminders, set in Settings → Orders & payments.
//
// Terms turn into instalments when an order is confirmed:
//   after_dispatch   one payment, due N days after dispatch
//   advance_balance  an advance (X%) due on confirmation, the balance N days after dispatch
//   full_advance     the whole amount due on confirmation, before dispatch
// A customer can have its own terms; the order keeps the terms it started with.

export type TermsMode = 'after_dispatch' | 'advance_balance' | 'full_advance';

export type Terms = {
  mode: TermsMode;
  /** Advance share for advance_balance, 1 to 99. */
  advancePercent: number;
  /** Days after confirmation the advance (or full advance) is due. 0 = on confirmation. */
  advanceDays: number;
  /** Days after dispatch the balance (or the single payment) is due. */
  balanceDays: number;
};

export type CustomerTerms = Terms & {
  id: string;
  /** Shown in Settings. */
  name: string;
  /** Matched against the buyer: a phone number, an email, or part of the company name. */
  match: string;
};

export type PaymentRules = Terms & {
  customerTerms: CustomerTerms[];
  remindersOn: boolean;
  /** First reminder this many days before a due date. 0 = none before. */
  remindBeforeDays: number;
  /** After a due date, remind again every this many days. */
  remindEveryDays: number;
  /** Stop after this many reminders past a due date. */
  maxOverdueReminders: number;
};

export const DEFAULT_PAYMENT_RULES: PaymentRules = {
  mode: 'after_dispatch',
  advancePercent: 30,
  advanceDays: 0,
  balanceDays: 30,
  customerTerms: [],
  remindersOn: true,
  remindBeforeDays: 3,
  remindEveryDays: 7,
  maxOverdueReminders: 6,
};

export async function getPaymentRules(): Promise<PaymentRules> {
  const stored = await getSettings<PaymentRules & { termsDays?: number }>('payments', DEFAULT_PAYMENT_RULES);
  // Rules saved before instalments had one number, termsDays.
  if (stored.termsDays !== undefined && stored.balanceDays === DEFAULT_PAYMENT_RULES.balanceDays) stored.balanceDays = stored.termsDays;
  return stored;
}

function whole(value: unknown, label: string, min: number, max: number): number {
  const n = typeof value === 'string' ? Number(value.trim()) : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  return n;
}

function parseTerms(input: Record<string, unknown>, label = ''): Terms {
  const mode: TermsMode = input.mode === 'advance_balance' || input.mode === 'full_advance' ? input.mode : 'after_dispatch';
  return {
    mode,
    advancePercent: mode === 'advance_balance' ? whole(input.advancePercent, `${label}Advance percent`, 1, 99) : Number(input.advancePercent ?? 30) || 30,
    advanceDays: whole(input.advanceDays ?? 0, `${label}Days to pay the advance`, 0, 60),
    balanceDays: whole(input.balanceDays ?? input.termsDays ?? 30, `${label}Days after dispatch`, 0, 180),
  };
}

export function parsePaymentRules(input: Record<string, unknown>): PaymentRules {
  const customers = Array.isArray(input.customerTerms) ? input.customerTerms as Record<string, unknown>[] : [];
  return {
    ...parseTerms(input),
    customerTerms: customers.map((c, i) => {
      const name = String(c.name ?? '').trim();
      const match = String(c.match ?? '').trim();
      if (!name || !match) throw new Error(`Customer terms ${i + 1}: enter the customer name and the phone, email or company to match.`);
      return { ...parseTerms(c, `${name}: `), id: String(c.id ?? `ct-${i}-${Date.now()}`), name, match };
    }),
    remindersOn: input.remindersOn === true || input.remindersOn === 'on',
    remindBeforeDays: whole(input.remindBeforeDays, 'Days before the due date', 0, 30),
    remindEveryDays: whole(input.remindEveryDays, 'Days between overdue reminders', 1, 60),
    maxOverdueReminders: whole(input.maxOverdueReminders ?? 6, 'Overdue reminders', 0, 20),
  };
}

export async function savePaymentRules(rules: PaymentRules, actorName: string) {
  await saveSettings('payments', rules as unknown as Record<string, unknown>, actorName);
}

/** The terms for one buyer: a matching customer entry, else the default. Pure, for tests. */
export function termsFor(
  rules: PaymentRules,
  buyer: { phone?: string | null; email?: string | null; company?: string | null; buyerName?: string | null },
): Terms & { source: string } {
  const digits = (v: string) => v.replace(/\D/g, '').slice(-10);
  const hit = rules.customerTerms.find((c) => {
    const m = c.match.trim().toLowerCase();
    if (!m) return false;
    if (/\d{10}/.test(m.replace(/\D/g, '')) && buyer.phone) return digits(buyer.phone) === digits(m);
    if (m.includes('@')) return (buyer.email ?? '').toLowerCase() === m;
    return `${buyer.company ?? ''} ${buyer.buyerName ?? ''}`.toLowerCase().includes(m);
  });
  const t = hit ?? rules;
  return { mode: t.mode, advancePercent: t.advancePercent, advanceDays: t.advanceDays, balanceDays: t.balanceDays, source: hit ? hit.name : 'default' };
}

export type Instalment = {
  key: 'advance' | 'balance' | 'full';
  label: string;
  amountPaise: number;
  /** When the due date starts counting. */
  trigger: 'confirm' | 'dispatch';
  days: number;
  /** Set when the trigger happens. */
  dueAt: string | null;
  paidPaise: number;
};

/** Split an order total into instalments for these terms. Pure, for tests. */
export function instalmentsFor(totalPaise: number, terms: Terms, confirmedAt: Date): Instalment[] {
  const due = (days: number) => new Date(confirmedAt.getTime() + days * 86400000).toISOString();
  if (terms.mode === 'full_advance') {
    return [{ key: 'full', label: 'Full payment', amountPaise: totalPaise, trigger: 'confirm', days: terms.advanceDays, dueAt: due(terms.advanceDays), paidPaise: 0 }];
  }
  if (terms.mode === 'advance_balance') {
    const advance = Math.round((totalPaise * terms.advancePercent) / 100);
    return [
      { key: 'advance', label: `Advance ${terms.advancePercent}%`, amountPaise: advance, trigger: 'confirm', days: terms.advanceDays, dueAt: due(terms.advanceDays), paidPaise: 0 },
      { key: 'balance', label: 'Balance', amountPaise: totalPaise - advance, trigger: 'dispatch', days: terms.balanceDays, dueAt: null, paidPaise: 0 },
    ];
  }
  return [{ key: 'balance', label: 'Payment', amountPaise: totalPaise, trigger: 'dispatch', days: terms.balanceDays, dueAt: null, paidPaise: 0 }];
}

/** Apply a total paid amount to instalments in order. Pure, for tests. */
export function allocate(instalments: Instalment[], paidPaise: number): Instalment[] {
  let left = paidPaise;
  return instalments.map((i) => {
    const take = Math.min(i.amountPaise, Math.max(0, left));
    left -= take;
    return { ...i, paidPaise: take };
  });
}

/** Start the due dates of instalments that begin at this trigger. Pure, for tests. */
export function startDueDates(instalments: Instalment[], trigger: 'confirm' | 'dispatch', at: Date): Instalment[] {
  return instalments.map((i) => (i.trigger === trigger && !i.dueAt ? { ...i, dueAt: new Date(at.getTime() + i.days * 86400000).toISOString() } : i));
}

/** The reminder that is due now for one due date, if any. Pure, for tests. */
export function dueReminder(
  dueAt: Date,
  now: Date,
  rules: Pick<PaymentRules, 'remindersOn' | 'remindBeforeDays' | 'remindEveryDays' | 'maxOverdueReminders'>,
  sent: string[],
  prefix = '',
): { key: string; kind: 'before' | 'due' | 'overdue'; at: Date } | null {
  if (!rules.remindersOn) return null;
  const day = 86400000;
  const k = (key: string) => (prefix ? `${prefix}:${key}` : key);
  const schedule: { key: string; kind: 'before' | 'due' | 'overdue'; at: Date }[] = [];
  if (rules.remindBeforeDays > 0) schedule.push({ key: k('before'), kind: 'before', at: new Date(dueAt.getTime() - rules.remindBeforeDays * day) });
  schedule.push({ key: k('due'), kind: 'due', at: dueAt });
  for (let n = 1; n <= rules.maxOverdueReminders; n += 1) {
    schedule.push({ key: k(`overdue-${n}`), kind: 'overdue', at: new Date(dueAt.getTime() + n * rules.remindEveryDays * day) });
  }
  // Only the latest reminder that has fallen due, so a backlog never sends a burst.
  const latest = schedule.filter((s) => s.at.getTime() <= now.getTime()).at(-1);
  if (!latest || sent.includes(latest.key)) return null;
  return latest;
}

/** The terms in words, e.g. "30% advance on confirmation, balance 15 days after dispatch". */
export function termsLabel(t: Terms): string {
  const adv = t.advanceDays ? `within ${t.advanceDays} days of confirmation` : 'on confirmation';
  if (t.mode === 'full_advance') return `Full payment ${adv}`;
  if (t.mode === 'advance_balance') return `${t.advancePercent}% advance ${adv}, balance ${t.balanceDays} days after dispatch`;
  return t.balanceDays ? `Pay ${t.balanceDays} days after dispatch` : 'Pay on dispatch';
}
