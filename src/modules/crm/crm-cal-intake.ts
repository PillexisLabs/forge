import { getSql } from '@/core/db';
// Temporary cross-module import. PR 2 replaces this direct call with the
// booking.created event, which the whatsapp module consumes.
// eslint-disable-next-line no-restricted-imports
import { configureCrmWhatsApp, transitionCrmWhatsApp } from '@/modules/whatsapp/crm-whatsapp-data';

// Turns a Cal.com BOOKING_CREATED webhook into CRM state: contact, deal,
// booking row, and a queued WhatsApp confirmation. Idempotent on the Cal
// booking uid, because Cal retries webhooks on non-200 responses.

export type CalBookingIntake = {
  bookingUid: string;
  attendeeName: string;
  attendeeEmail: string;
  phone: string | null;
  startsAt: string;
  qualification: Record<string, unknown>;
};

export type CalIntakeResult = {
  dealId: number;
  createdDeal: boolean;
  duplicate: boolean;
  whatsappQueued: boolean;
};

export async function recordCalBooking(input: CalBookingIntake): Promise<CalIntakeResult> {
  const sql = getSql();

  const outcome = await sql.begin(async (tx) => {
    const existing = await tx<{ deal_id: number }[]>`
      select deal_id from crm_bookings where cal_booking_uid = ${input.bookingUid}
    `;
    if (existing[0]) {
      return { dealId: existing[0].deal_id, createdDeal: false, duplicate: true };
    }

    const contacts = await tx<{ id: number; primary_phone: string | null }[]>`
      select id, primary_phone from crm_contacts
      where lower(primary_email) = lower(${input.attendeeEmail})
      order by id asc
      limit 1
    `;

    let contactId: number;
    if (contacts[0]) {
      contactId = contacts[0].id;
      // A booking-form phone fills a gap but never overwrites a curated one.
      if (input.phone && !contacts[0].primary_phone) {
        await tx`
          update crm_contacts
          set primary_phone = ${input.phone}, updated_at = now()
          where id = ${contactId}
        `;
      }
    } else {
      const inserted = await tx<{ id: number }[]>`
        insert into crm_contacts (name, primary_email, primary_phone)
        values (${input.attendeeName}, ${input.attendeeEmail}, ${input.phone})
        returning id
      `;
      contactId = inserted[0].id;
    }

    // Reuse the contact's open deal so a rebooked lead doesn't fork into two
    // pipeline rows; closed deals stay closed and a fresh one is created.
    const deals = await tx<{ id: number }[]>`
      select id from crm_deals
      where contact_id = ${contactId}
        and stage not in ('won', 'lost')
      order by created_at desc
      limit 1
    `;

    let dealId: number;
    let createdDeal = false;
    if (deals[0]) {
      dealId = deals[0].id;
      await tx`
        update crm_deals
        set stage = 'intro_call_booked',
            next_action = 'Run the intro call',
            next_action_due_at = ${input.startsAt},
            last_interaction_at = now(),
            updated_at = now()
        where id = ${dealId}
      `;
    } else {
      createdDeal = true;
      const inserted = await tx<{ id: number }[]>`
        insert into crm_deals (
          contact_id, title, lead_source, source_detail, stage, owner,
          next_action, next_action_due_at, last_interaction_at
        )
        values (
          ${contactId},
          ${`${input.attendeeName} — intro call`},
          'cal_booking',
          ${input.bookingUid},
          'intro_call_booked',
          'anurag',
          'Run the intro call',
          ${input.startsAt},
          now()
        )
        returning id
      `;
      dealId = inserted[0].id;
    }

    await tx`
      insert into crm_bookings (deal_id, cal_booking_uid, starts_at, status, qualification)
      values (${dealId}, ${input.bookingUid}, ${input.startsAt}, 'ACCEPTED', ${JSON.stringify(input.qualification)})
    `;
    await tx`
      insert into crm_activities (deal_id, actor, type, subject, body, source, source_id)
      values (
        ${dealId}, 'system', 'booking', 'Cal.com booking received',
        ${`Intro call booked for ${input.startsAt}${input.phone ? '' : ' (no phone on the booking form)'}`},
        'automation', ${input.bookingUid}
      )
    `;

    return { dealId, createdDeal, duplicate: false };
  });

  if (outcome.duplicate) {
    return { ...outcome, whatsappQueued: false };
  }

  // The booking form collects the WhatsApp number for call reminders, so a
  // provided number is treated as consent. Without one the workflow stays
  // unconfigured and the lead surfaces in Today for manual setup.
  let whatsappQueued = false;
  if (input.phone) {
    try {
      await configureCrmWhatsApp({
        dealId: outcome.dealId,
        consentStatus: 'granted',
        appointmentAt: input.startsAt,
        actor: 'system',
      });
      await transitionCrmWhatsApp({
        dealId: outcome.dealId,
        action: 'start',
        actor: 'system',
      });
      whatsappQueued = true;
    } catch (error) {
      // The booking is already recorded; a workflow guard (e.g. an earlier
      // opt-out) must not make Cal retry the whole webhook.
      console.warn(`cal intake deal ${outcome.dealId}: workflow not started —`, error);
    }
  }

  return { ...outcome, whatsappQueued };
}
