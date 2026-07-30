import type { WhatsAppConsentStatus, WhatsAppWorkflowState } from './crm-types';

export type WhatsAppWorkflowAction =
  | 'start'
  | 'confirm'
  | 'reschedule'
  | 'handoff'
  | 'opt_out'
  | 'attended'
  | 'pause';

export type WhatsAppWorkflowTransition = {
  state: WhatsAppWorkflowState;
  enabled: boolean;
  nextMessageAt: string | null;
  subject: string;
  direction?: 'inbound' | 'outbound';
};

function beforeAppointment(appointmentAt: string, hours: number) {
  return new Date(new Date(appointmentAt).getTime() - hours * 60 * 60 * 1000);
}

function nextReminder(appointmentAt: string, now: Date) {
  const twentyFourHoursBefore = beforeAppointment(appointmentAt, 24);
  if (twentyFourHoursBefore.getTime() > now.getTime()) {
    return twentyFourHoursBefore.toISOString();
  }

  const twoHoursBefore = beforeAppointment(appointmentAt, 2);
  return twoHoursBefore.getTime() > now.getTime() ? twoHoursBefore.toISOString() : null;
}

export function resolveWhatsAppTransition(
  action: WhatsAppWorkflowAction,
  appointmentAt: string | null,
  now = new Date(),
): WhatsAppWorkflowTransition {
  switch (action) {
    case 'start':
      return {
        state: 'awaiting_confirmation',
        enabled: true,
        nextMessageAt: now.toISOString(),
        subject: 'WhatsApp confirmation queued',
        direction: 'outbound',
      };
    case 'confirm':
      return {
        state: 'confirmed',
        enabled: true,
        nextMessageAt: appointmentAt ? nextReminder(appointmentAt, now) : null,
        subject: 'Client confirmed the call',
        direction: 'inbound',
      };
    case 'reschedule':
      return {
        state: 'rescheduled',
        enabled: false,
        nextMessageAt: null,
        subject: 'Client requested a reschedule',
        direction: 'inbound',
      };
    case 'handoff':
      return {
        state: 'human_handoff',
        enabled: false,
        nextMessageAt: null,
        subject: 'WhatsApp conversation needs a founder',
      };
    case 'opt_out':
      return {
        state: 'opted_out',
        enabled: false,
        nextMessageAt: null,
        subject: 'Client opted out of WhatsApp messages',
        direction: 'inbound',
      };
    case 'attended':
      return {
        state: 'attended',
        enabled: false,
        nextMessageAt: null,
        subject: 'Call marked as attended',
      };
    case 'pause':
      return {
        state: 'paused',
        enabled: false,
        nextMessageAt: null,
        subject: 'WhatsApp automation paused',
      };
  }
}

// Safety gate for every transition. Returns an error code, or null when the
// action is allowed. Consent is checked for ANY transition that enables
// sending — not just `start` — and an opt-out locks the workflow for good.
export function whatsAppTransitionError(
  action: WhatsAppWorkflowAction,
  context: {
    consentStatus: WhatsAppConsentStatus | null;
    primaryPhone: string | null;
    appointmentAt: string | null;
  },
): string | null {
  if (context.consentStatus === null) return 'workflow_not_configured';
  if (context.consentStatus === 'opted_out' && action !== 'opt_out') return 'opted_out_locked';
  if (action === 'start') {
    if (!context.primaryPhone) return 'phone_required';
    if (context.consentStatus !== 'granted') return 'consent_required';
    if (!context.appointmentAt) return 'appointment_required';
  }
  const transition = resolveWhatsAppTransition(action, context.appointmentAt);
  if (transition.enabled && context.consentStatus !== 'granted') return 'consent_required';
  return null;
}

function firstNameOf(contactName: string) {
  return contactName.trim().split(/\s+/)[0] || 'there';
}

function istStamp(appointmentAt: string) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(appointmentAt));
}

export function confirmationMessage(contactName: string, appointmentAt: string) {
  return `Hi ${firstNameOf(contactName)}, this is Anurag from Pillexis Labs. Your call is booked for ${istStamp(appointmentAt)}. Please reply confirm to keep the slot, or reschedule if you need another time.`;
}

export type DueSend = {
  body: string;
  subject: string;
  nextState: WhatsAppWorkflowState;
  nextMessageAt: string | null;
};

// Decides what a due queue row should send, and what the queue looks like
// afterwards. Pure so the worker stays a thin shell around it.
// sendCount = automated messages already sent to this lead in this workflow.
export function resolveDueSend(input: {
  state: WhatsAppWorkflowState;
  contactName: string;
  appointmentAt: string | null;
  sendCount: number;
  now?: Date;
}): DueSend | null {
  const now = input.now ?? new Date();
  const firstName = firstNameOf(input.contactName);

  if (input.state === 'awaiting_confirmation') {
    if (!input.appointmentAt) return null;
    if (input.sendCount === 0) {
      // First touch: the confirmation ask. One nudge follows if they stay silent.
      const nudgeAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const beforeAppointment = beforeAppointment2h(input.appointmentAt);
      const next = nudgeAt < beforeAppointment ? nudgeAt : null;
      return {
        body: confirmationMessage(input.contactName, input.appointmentAt),
        subject: 'WhatsApp confirmation sent',
        nextState: 'awaiting_confirmation',
        nextMessageAt: next ? next.toISOString() : null,
      };
    }
    // Second touch: one gentle nudge, then the queue goes quiet.
    return {
      body: `Hi ${firstName}, just checking you saw the booking for your Pillexis Labs call on ${istStamp(input.appointmentAt)}. Reply confirm to keep the slot.`,
      subject: 'WhatsApp confirmation nudge sent',
      nextState: 'awaiting_confirmation',
      nextMessageAt: null,
    };
  }

  if (input.state === 'confirmed') {
    if (!input.appointmentAt) return null;
    const msToCall = new Date(input.appointmentAt).getTime() - now.getTime();
    if (msToCall > 3 * 60 * 60 * 1000) {
      // The 24-hour reminder; the 2-hour one follows.
      return {
        body: `Hi ${firstName}, reminder that your Pillexis Labs call is on ${istStamp(input.appointmentAt)}. Reply here if anything changes.`,
        subject: 'WhatsApp 24 hour reminder sent',
        nextState: 'confirmed',
        nextMessageAt: beforeAppointment2h(input.appointmentAt).toISOString(),
      };
    }
    // The 2-hour attendance check closes the automated sequence.
    return {
      body: `Hi ${firstName}, your Pillexis Labs call is at ${istStamp(input.appointmentAt)} today. Will you be able to join?`,
      subject: 'WhatsApp 2 hour reminder sent',
      nextState: 'attending',
      nextMessageAt: null,
    };
  }

  // Any other state has no automated message; the queue entry is stale.
  return null;
}

function beforeAppointment2h(appointmentAt: string) {
  return new Date(new Date(appointmentAt).getTime() - 2 * 60 * 60 * 1000);
}

export type InboundIntent = 'confirm' | 'reschedule' | 'opt_out' | 'handoff';

// Keyword-first intent detection, per the PRD: obvious keywords act, anything
// free-form escalates to a founder — the system never guesses.
export function classifyInboundIntent(text: string): InboundIntent {
  const normalized = text.trim().toLowerCase();
  if (/\b(stop|unsubscribe|opt out|optout)\b/.test(normalized)) return 'opt_out';
  if (/\b(reschedule|re-schedule|another time|change (the )?(time|slot|date)|postpone)\b/.test(normalized)) return 'reschedule';
  if (/^(confirm(ed)?|yes|yep|yeah|ok(ay)?|sure|done|👍)\b/.test(normalized) || /\bconfirm(ed)?\b/.test(normalized)) return 'confirm';
  return 'handoff';
}

export function inboundAck(intent: InboundIntent, contactName: string, rescheduleLink: string): string | null {
  const firstName = firstNameOf(contactName);
  switch (intent) {
    case 'confirm':
      return `Thanks ${firstName}, your slot is locked in. You'll get a reminder before the call.`;
    case 'reschedule':
      return `No problem ${firstName} — pick a time that works better here: ${rescheduleLink}`;
    case 'opt_out':
      return 'Understood — you will not receive any more messages from us.';
    case 'handoff':
      return `Thanks ${firstName} — Anurag will reply to you here shortly.`;
  }
}
