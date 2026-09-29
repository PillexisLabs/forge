import { getSettings, saveSettings } from '@/core/settings';

// Payment terms and reminders, set in Settings → Sales rules → Payments.

export type PaymentRules = {
  /** Days after dispatch that payment is due. 0 = due on dispatch. */
  termsDays: number;
  remindersOn: boolean;
  /** First reminder this many days before the due date. 0 = none before. */
  remindBeforeDays: number;
  /** After the due date, remind again every this many days. */
  remindEveryDays: number;
  /** Stop after this many reminders past the due date. */
  maxOverdueReminders: number;
};

export const DEFAULT_PAYMENT_RULES: PaymentRules = {
  termsDays: 30,
  remindersOn: true,
  remindBeforeDays: 3,
  remindEveryDays: 7,
  maxOverdueReminders: 6,
};

export async function getPaymentRules(): Promise<PaymentRules> {
  return getSettings('payments', DEFAULT_PAYMENT_RULES);
}

function whole(value: unknown, label: string, min: number, max: number): number {
  const n = typeof value === 'string' ? Number(value.trim()) : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  return n;
}

export function parsePaymentRules(input: Record<string, unknown>): PaymentRules {
  return {
    termsDays: whole(input.termsDays, 'Payment terms', 0, 180),
    remindersOn: input.remindersOn === true || input.remindersOn === 'on',
    remindBeforeDays: whole(input.remindBeforeDays, 'Days before the due date', 0, 30),
    remindEveryDays: whole(input.remindEveryDays, 'Days between overdue reminders', 1, 60),
    maxOverdueReminders: whole(input.maxOverdueReminders ?? 6, 'Overdue reminders', 0, 20),
  };
}

export async function savePaymentRules(rules: PaymentRules, actorName: string) {
  await saveSettings('payments', rules as unknown as Record<string, unknown>, actorName);
}

/** The reminder that is due now, if any: its key and when it fell due. Pure, for tests. */
export function dueReminder(
  dueAt: Date,
  now: Date,
  rules: PaymentRules,
  sent: string[],
): { key: string; kind: 'before' | 'due' | 'overdue'; at: Date } | null {
  if (!rules.remindersOn) return null;
  const day = 86400000;
  const schedule: { key: string; kind: 'before' | 'due' | 'overdue'; at: Date }[] = [];
  if (rules.remindBeforeDays > 0) schedule.push({ key: 'before', kind: 'before', at: new Date(dueAt.getTime() - rules.remindBeforeDays * day) });
  schedule.push({ key: 'due', kind: 'due', at: dueAt });
  for (let k = 1; k <= rules.maxOverdueReminders; k += 1) {
    schedule.push({ key: `overdue-${k}`, kind: 'overdue', at: new Date(dueAt.getTime() + k * rules.remindEveryDays * day) });
  }
  // Only the latest reminder that has fallen due, so a backlog never sends a burst.
  const latest = schedule.filter((s) => s.at.getTime() <= now.getTime()).at(-1);
  if (!latest || sent.includes(latest.key)) return null;
  return latest;
}
