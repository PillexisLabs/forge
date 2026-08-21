# CRM backfill: Cal.com + Fireflies → production only

Status: plan, v2 (2026-08-20)
Hard rule: **staging never receives real data values.** The backfill targets
production only. Staging keeps its synthetic fixtures; if staging needs more
realistic volume, extend the fixture seed, never copy production rows.
Depends on: `WHATSAPP_PRODUCTION_SETUP.md` (the Cal webhook goes live first)

## 1. What the data shows (verified 2026-08-20 via both APIs)

- Cal.com holds **78 intro-call bookings** (74 unique emails): 66 past accepted,
  8 upcoming, 4 cancelled. June: 4, July: 37, August: 37 — the pipeline is
  active, not dead.
- **No booking has a phone number.** The WhatsApp field is still missing from
  the booking form.
- Fireflies holds **50 email-matched calls** for those bookings (76% of past
  accepted). 13 past bookings have no matching recording — no-shows or
  unrecorded calls.
- Repeat bookers that must merge into one deal each: sukhaurshanti (2),
  propbotics (2), staffworqs (2), quotesmatic (2 — probably internal tests,
  flag for review).
- Known test rows to exclude: `anurag+test@rockethealth.app`. Flag
  `anurag3rdsep@gmail.com` (upcoming 2026-08-26) for a human decision.
- Production CRM is empty. Staging holds only the 15 fixture leads.

## 2. Order of operations

1. Add the WhatsApp number field to the Cal booking form (independent, do first).
2. Register the Cal → Forge production webhook. From that moment no new lead
   is lost. The backfill and the webhook are both idempotent on
   `cal_booking_uid`, so overlap is safe.
3. Run the backfill against **production**.
4. Verify the board, then hand-set the judgment stages (section 3, Phase B).

## 3. The backfill script (`scripts/crm-backfill.mjs`)

One script, three phases, run by Anurag with `!` (remote writes need his hands).
Idempotent: safe to re-run; keyed on `cal_booking_uid` and Fireflies
transcript id.

### Phase A — fetch

- Cal v2 API: all `pillexis-labs-intro-call` bookings, with
  `bookingFieldsResponses` (turnover, what-do-you-sell, start timeline,
  one-thing-to-fix).
- Fireflies GraphQL: all transcripts with participants, duration, and summary.

### Phase B — write contacts, deals, bookings

Reuse the intake logic (`recordCalBooking`) so backfilled rows are identical
in shape to webhook rows. No booking has a phone, so the WhatsApp leg is
inert by construction; the script also passes an explicit `skipWorkflow`
guard so a future re-run with phone data cannot message old leads.

Stage rules:

| Booking state | Stage | Next action |
|---|---|---|
| Upcoming accepted | `intro_call_booked` | "Run the intro call", due = call date |
| Past accepted + Fireflies match | `contacted` | "Review the call and qualify" |
| Past accepted, no recording | `intro_call_booked` | "No recording — confirm the call happened / rebook" |
| Cancelled | `lost` | reason = "booking cancelled" |

The booking form answers land in the deal qualification field so the paid
discovery answer and turnover band are filterable.

Stages beyond `contacted` (qualified, discovery_proposed, won) are sales
judgment. The script never sets them. Hand-set after the run — known cases:
Kristeel (active exploratory), sukhaurshanti (proposal sent), and the one
closed ₹30k deal → `won` with the amount.

### Phase C — attach Fireflies meetings

- Match transcript → contact by participant email; fallback: attendee name in
  the transcript title.
- Insert one `crm_meetings` row per matched transcript: title, date, duration,
  summary overview, Fireflies id and link. Add one activity per meeting.
- Print the unmatched-transcript report (Humpy Farms, BDBSI, product
  discussions) — attach those by a small manual mapping table in the script,
  or leave them out.

## 4. Staging

Nothing changes on staging. It keeps the 15 synthetic fixture leads. The
script refuses to run against a database whose URL is not the production
one (it checks the Railway environment name before it writes anything).

## 5. Verification

- Row counts: contacts ≈ 72 (74 unique emails minus test rows), deals ≈ same,
  bookings = 78 minus exclusions, meetings ≈ 50.
- Spot-check the repeat bookers: one contact, one deal, two bookings each.
- The pipeline board loads and every column renders.
- Re-run the script: zero new rows (idempotency proof).
