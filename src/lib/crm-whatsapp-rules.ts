import type { WhatsAppWorkflowState } from './crm-types';

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

export function confirmationMessage(contactName: string, appointmentAt: string) {
  const firstName = contactName.trim().split(/\s+/)[0] || 'there';
  const appointment = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(appointmentAt));

  return `Hi ${firstName}, this is Anurag from Pillexis Labs. Your call is booked for ${appointment}. Please reply confirm to keep the slot, or reschedule if you need another time.`;
}
