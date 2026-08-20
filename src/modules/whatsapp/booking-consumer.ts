import { consumeEvents } from '@/core/events';
import { configureCrmWhatsApp, transitionCrmWhatsApp } from './crm-whatsapp-data';

// Consumes booking.created from the event bus and starts the WhatsApp
// confirmation workflow. This used to be a direct call from the Cal.com
// intake (a cross-module import); the bus removed that edge.
//
// phone_provided is the consent signal: the booking form collects the
// WhatsApp number for call reminders, so a provided number is consent.
// Without one the workflow stays unconfigured and the lead surfaces in
// Today for manual setup.
export async function consumeBookingCreated(): Promise<number> {
  return consumeEvents('whatsapp.booking-created', ['booking.created'], async (event) => {
    const dealId = Number(event.payload.lead_id);
    if (!Number.isFinite(dealId)) return;
    if (!event.payload.phone_provided) return;

    const startAt = typeof event.payload.start_at === 'string' ? event.payload.start_at : null;
    try {
      await configureCrmWhatsApp({
        dealId,
        consentStatus: 'granted',
        appointmentAt: startAt,
        actor: 'system',
      });
      await transitionCrmWhatsApp({
        dealId,
        action: 'start',
        actor: 'system',
      });
      console.log(`whatsapp booking consumer: deal ${dealId} confirmation queued`);
    } catch (error) {
      // A workflow guard (e.g. an earlier opt-out) is a final answer, not a
      // transient failure — swallow it so the cursor advances and the event
      // is not retried forever.
      console.warn(`whatsapp booking consumer: deal ${dealId} workflow not started —`, error);
    }
  });
}
