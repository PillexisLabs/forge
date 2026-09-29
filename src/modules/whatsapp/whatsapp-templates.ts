import { env } from '@/core/env';
import { getIntegration } from '@/core/integrations';

// WhatsApp message templates, managed through the Cloud API on the business
// account (WABA). A template is needed for any message outside the buyer's
// 24-hour window. Meta reviews each new template; its status moves from
// PENDING to APPROVED or REJECTED.

export type TemplateCategory = 'UTILITY' | 'MARKETING';

export type WhatsAppTemplate = {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  body: string;
  footer: string | null;
  rejectedReason: string | null;
};

export type NewTemplate = {
  name: string;
  category: TemplateCategory;
  language: string;
  body: string;
  /** One sample value per {{n}} variable, in order. Meta requires them. */
  examples: string[];
  footer: string | null;
};

/** Starting points for the jobs Forge runs. People can change the text before they create one. */
export const SUGGESTED_TEMPLATES: (Omit<NewTemplate, 'language'> & { purpose: string })[] = [
  {
    name: 'quote_ready',
    purpose: 'Send a quote after the 24-hour window.',
    category: 'UTILITY',
    body: 'Hello {{1}}, your quote {{2}} is ready. The total is {{3}}. Reply to this message to confirm or ask a question.',
    examples: ['Rahul', 'Q-1001', 'Rs. 17,248'],
    footer: null,
  },
  {
    name: 'payment_reminder',
    purpose: 'Payment reminders when the buyer has not written for a day.',
    category: 'UTILITY',
    body: 'Hello {{1}}, this is a reminder that {{2}} for order {{3}} is due on {{4}}. Reply with the payment reference once paid.',
    examples: ['Kavya', 'Rs. 49,344', 'SO-1001', '2 October'],
    footer: null,
  },
  {
    name: 'order_dispatched',
    purpose: 'Tell the buyer an order left the warehouse.',
    category: 'UTILITY',
    body: 'Hello {{1}}, your order {{2}} is dispatched on vehicle {{3}}. Reply to this message if you have a question about the delivery.',
    examples: ['Pooja', 'SO-1003', 'KA 01 MX 2207'],
    footer: null,
  },
  {
    name: 'enquiry_reply',
    purpose: 'Answer a buyer’s question after the 24-hour window.',
    category: 'UTILITY',
    body: 'Hello {{1}}, we have an answer to your question about {{2}}. Reply to this message to see it and continue.',
    examples: ['Arjun', 'quote Q-1005'],
    footer: null,
  },
];

export const TEMPLATE_LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'en_US', label: 'English (US)' },
  { code: 'hi', label: 'Hindi' },
];

/** The business account id: from Settings (set by Embedded Signup later), else the environment. */
export async function businessAccountId(): Promise<string | null> {
  const row = await getIntegration('whatsapp');
  const fromSettings = typeof row.config.wabaId === 'string' && row.config.wabaId ? row.config.wabaId : null;
  return fromSettings ?? process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? null;
}

async function graph(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://graph.facebook.com/${env.whatsappGraphVersion()}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.whatsappToken()}`, ...(init.headers ?? {}) },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const e = body?.error;
    throw new Error(e?.error_user_msg ?? e?.message ?? `WhatsApp API HTTP ${response.status}`);
  }
  return body;
}

type GraphComponent = { type: string; text?: string };

export async function listTemplates(): Promise<WhatsAppTemplate[]> {
  const waba = await businessAccountId();
  if (!waba) throw new Error('Set the WhatsApp business account ID first.');
  const body = await graph(`${waba}/message_templates?fields=id,name,language,category,status,components,rejected_reason&limit=100`);
  return ((body.data ?? []) as { id: string; name: string; language: string; category: string; status: string; components?: GraphComponent[]; rejected_reason?: string }[])
    .map((t) => ({
      id: t.id,
      name: t.name,
      language: t.language,
      category: t.category,
      status: t.status,
      body: t.components?.find((c) => c.type === 'BODY')?.text ?? '',
      footer: t.components?.find((c) => c.type === 'FOOTER')?.text ?? null,
      rejectedReason: t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The {{n}} variables in a body, in order. Pure, for tests. */
export function templateVariables(body: string): number[] {
  return Array.from(new Set(Array.from(body.matchAll(/\{\{(\d+)\}\}/g), (m) => Number(m[1])))).sort((a, b) => a - b);
}

/** Check a template the way Meta does, so a person sees the problem before the API call. Pure, for tests. */
export function validateTemplate(t: NewTemplate): string | null {
  if (!/^[a-z0-9_]{1,512}$/.test(t.name)) return 'The name can use only lowercase letters, numbers and underscores.';
  if (!t.body.trim()) return 'Write the message text.';
  if (t.body.length > 1024) return 'The message text must be 1,024 characters or fewer.';
  const vars = templateVariables(t.body);
  if (vars.some((n, i) => n !== i + 1)) return 'Number the variables in order: {{1}}, {{2}}, {{3}}.';
  if (/^\s*\{\{\d+\}\}|\{\{\d+\}\}\s*$/.test(t.body)) return 'The text cannot start or end with a variable. Add words before and after it.';
  if (t.examples.length < vars.length || t.examples.slice(0, vars.length).some((e) => !e.trim())) return 'Give a sample value for each variable. Meta uses them to review the template.';
  if (t.footer && t.footer.length > 60) return 'The footer must be 60 characters or fewer.';
  return null;
}

export async function createTemplate(t: NewTemplate): Promise<{ id: string; status: string }> {
  const problem = validateTemplate(t);
  if (problem) throw new Error(problem);
  const waba = await businessAccountId();
  if (!waba) throw new Error('Set the WhatsApp business account ID first.');
  const vars = templateVariables(t.body);
  const components: Record<string, unknown>[] = [{
    type: 'BODY',
    text: t.body,
    ...(vars.length ? { example: { body_text: [t.examples.slice(0, vars.length)] } } : {}),
  }];
  if (t.footer) components.push({ type: 'FOOTER', text: t.footer });
  const body = await graph(`${waba}/message_templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: t.name, category: t.category, language: t.language, components }),
  });
  return { id: String(body.id), status: String(body.status ?? 'PENDING') };
}

export async function deleteTemplate(name: string): Promise<void> {
  const waba = await businessAccountId();
  if (!waba) throw new Error('Set the WhatsApp business account ID first.');
  await graph(`${waba}/message_templates?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
}
