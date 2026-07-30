# Forge CRM product requirements

Status: Implemented locally, provider connection pending

Last updated: July 30, 2026

## Summary

Extend Forge from a marketing analytics dashboard into the internal revenue workspace for Pillexis Labs.

The CRM should help two founders answer three questions every day:

1. Which leads need attention now?
2. Who owns the next action?
3. What happened across the booking, call, proposal, and follow-up?

This is not a generic CRM. The first release is a focused sales workspace built around Cal.com bookings, Fireflies meetings, proposals, WhatsApp follow-ups, and deal progression.

## Problem

Pillexis has lead information spread across Cal.com exports, Fireflies, WhatsApp conversations, email, client folders, proposals, and founder memory.

The current Forge dashboard explains how leads arrive, but it stops at the booking. It does not show whether a lead was qualified, whether a proposal was sent, who should follow up, or whether the opportunity was won or lost.

The operational failure is not a lack of lead data. It is the absence of one owner, one stage, and one dated next action for every active opportunity.

## Evidence

- The workspace contains a Cal.com booking export at `../clients/intro-call-bookings.csv`.
- Fireflies returned 24 meetings through July 29, 2026. The normalized export is at `../clients/client-database.csv`.
- Recent manual follow-ups for Raj Kori, Sachit at SuperReply, and Shubham Gupta required checking separate meeting and WhatsApp context.
- Forge already tracks the acquisition funnel through booked calls but has no post-booking sales state.
- User-provided requirement: Pillexis has two cofounders and currently lacks a clear view of where leads are.

## Product decision

Build the CRM inside Forge.

Forge already provides:

- Password-gated access.
- Railway Postgres.
- Staging and production environments.
- Responsive desktop and mobile navigation.
- Scheduled jobs and manual synchronization.
- Marketing attribution and booking conversion data.

The CRM will use the same application and Postgres service while keeping its tables, query layer, routes, and UI modules separate from analytics.

## Goals

### User goals

- See all active leads in one place.
- Know who owns each lead.
- Know the next action and due date.
- Review the complete interaction history before following up.
- Generate a grounded follow-up draft from Fireflies and recorded activity.
- Configure and track WhatsApp confirmation and reminder workflows per lead.
- Move a deal through a small, fixed sales pipeline.

### Business goals

- Stop losing leads because follow-ups depend on memory.
- Connect marketing acquisition with qualified opportunities and won work.
- Establish a reliable operating workflow before adding messaging automation.

## Success criteria

The first release is successful when:

1. Every active deal has a stage.
2. Every active deal has an owner or is visibly marked unassigned.
3. Every active deal has a dated next action or appears in the missing-action queue.
4. Both founders can see overdue and due-today follow-ups from the default screen.
5. A lead detail view contains its booking, Fireflies meeting, proposal status, notes, and follow-up history.
6. Fireflies data is retrieved through its API without browser automation.
7. Real client data exists only in production. Staging uses synthetic fixtures.

No numeric conversion target is set until a reliable baseline exists.

## Users

### Founder

Anurag or Priyanka.

Both founders can:

- View every lead and deal.
- Assign ownership.
- Change stages.
- Create and complete next actions.
- Add notes and activities.
- Review and copy follow-up drafts.

Individual user accounts and role restrictions are not required for the first release. Actor selection and activity attribution must still identify which founder performed a change.

## Information architecture

### Sales

- Today
- Pipeline
- Follow-ups
- Leads
- Calls
- WhatsApp automation

### Analyze

- Overview
- Funnel
- Ads
- Traffic

### System

- Sync

The default authenticated route should open Today after the CRM is adopted. Analytics remains available without changing its current calculations.

## Pipeline

The pipeline is fixed in the first release:

1. New lead
2. Contacted
3. Intro call booked
4. Qualified
5. Discovery proposed
6. Discovery won
7. Implementation proposed
8. Won
9. Nurture
10. Lost

AI may suggest a stage but must not silently change commercial stages.

## Core workflows

### Start the day

1. A founder opens Forge.
2. Today shows overdue tasks first, then tasks due today.
3. Unassigned leads and leads without next actions are shown separately.
4. The founder opens a lead, reviews context, completes the follow-up, and records the outcome.
5. Completing a follow-up requires setting another dated action, moving the deal, or closing it.

### Process a Cal.com booking

1. Receive the Cal.com booking webhook.
2. Match the contact by normalized email.
3. Create the contact when no match exists.
4. Create or update the deal.
5. Store the booking UID and qualification answers.
6. Set the stage to Intro call booked.
7. Create a pre-call task.

### Process a Fireflies meeting

1. Retrieve meetings through the Fireflies GraphQL API.
2. Match attendees to contacts by normalized email.
3. Store the transcript ID, URL, date, duration, summary, and action items.
4. Attach the meeting activity to the deal timeline.
5. Suggest pain points, buying signals, objections, and commitments.
6. Draft the next follow-up.
7. Require founder approval before any message is sent.

### Run WhatsApp automation

1. Open the lead from Leads or WhatsApp.
2. Add the WhatsApp phone, consent state, and call date.
3. Queue the approved confirmation message.
4. Move the workflow through confirmed, attended, rescheduled, handoff, paused, or opted out.
5. Keep the next scheduled message and every transition visible in the activity timeline.
6. Never mark a queued message as delivered until a messaging provider confirms delivery.

### Complete a follow-up

1. Review the proposed message.
2. Copy it into WhatsApp or email.
3. Mark the activity as sent.
4. Record the channel and time.
5. Set the next action, change stage, move to nurture, or close the deal.

## Functional requirements

### P0

#### CRM-001: Contacts

The system shall create, edit, search, and deduplicate contacts.

Acceptance criteria:

- Email matching is case-insensitive.
- Phone numbers are stored in normalized international format when available.
- Contacts may have multiple email addresses and phone numbers.
- A contact can be linked to one company and multiple deals.

#### CRM-002: Companies

The system shall store company identity separately from individual contacts.

Required fields:

- Display name
- Legal name
- Domain
- Website
- GST number
- Registered address
- Notes

#### CRM-003: Deals

The system shall store one commercial opportunity independently from its contact.

Required fields:

- Contact and company
- Problem statement
- Lead source
- Pipeline stage
- Assigned founder
- Estimated value, optional
- Last interaction
- Next action
- Next-action due date
- Lost reason
- Created and updated timestamps

#### CRM-004: Activities

The system shall maintain an immutable chronological activity timeline.

Activity types:

- Booking
- Meeting
- WhatsApp inbound
- WhatsApp outbound
- Email inbound
- Email outbound
- Proposal sent
- Note
- Task completed
- Owner change
- Stage change

Corrections should append an audit activity instead of silently rewriting historical activity.

#### CRM-005: Tasks and next actions

The system shall support tasks assigned to Anurag, Priyanka, or Unassigned.

Tasks require:

- Title
- Deal
- Owner
- Due date
- Status
- Priority

Overdue tasks must remain visible until completed or cancelled.

#### CRM-006: Today view

The default Sales screen shall show:

- Overdue follow-ups
- Due today
- Waiting for client
- Unassigned leads
- Leads without a next action
- Recently received replies

#### CRM-007: Pipeline

The system shall show deals grouped by stage.

Desktop uses a board. Mobile uses grouped lists rather than horizontally compressed columns.

#### CRM-008: Lead detail

The lead detail view shall contain:

- Contact and company information
- Deal stage and owner
- Problem statement
- Next action
- Fireflies meetings
- Booking information
- Proposal status
- Activity timeline
- Follow-up draft

#### CRM-009: Fireflies synchronization

The system shall retrieve Fireflies data through `https://api.fireflies.ai/graphql`.

Acceptance criteria:

- No browser automation is used.
- Transcript IDs provide idempotency.
- A failed Fireflies request does not remove previous meeting data.
- Missing Fireflies summaries are stored as unavailable, not generated or invented.
- Credentials are never logged.

#### CRM-010: Import

The system shall import:

- `../clients/intro-call-bookings.csv`
- `../clients/client-database.csv`
- Existing account notes where structured data is available

Imports must be repeatable without creating duplicate contacts, meetings, or activities.

#### CRM-011: Follow-up drafts

The system shall generate a draft using:

- Meeting summary
- Action items
- Last recorded interaction
- Proposal status
- Current stage
- Next requested decision

Drafts require founder review. The local workflow may queue approved messages, but delivery requires a configured messaging provider and a delivery receipt.

#### CRM-012: Auditability

Owner changes, stage changes, task completion, and message logging shall record the actor and time.

#### CRM-013: WhatsApp workflow

The system shall store one WhatsApp workflow per deal.

Required setup:

- WhatsApp phone
- Consent status
- Call date and time

Supported transitions:

- Booked
- Awaiting confirmation
- Confirmed
- Attending
- Attended
- Rescheduled
- Cancelled
- No response
- Nurture
- No show
- Human handoff
- Opted out
- Paused

Acceptance criteria:

- A lead without a phone is visibly marked Needs phone.
- Confirmation cannot be queued without phone, consent, and call time.
- Opt out stops all future messages.
- Confirmation schedules a 24 hour reminder when possible, otherwise a 2 hour reminder.
- Every workflow transition appends an activity.
- A queued item is not presented as delivered without provider confirmation.

### P1

- Cal.com webhook ingestion.
- Scheduled Fireflies synchronization.
- Lead-source attribution to existing Forge campaign and traffic dimensions.
- Cost per qualified opportunity.
- Proposal and won-deal conversion reporting.
- Stale-lead rules with configurable age thresholds.
- Duplicate review and merge workflow.

### P2

- Shared WhatsApp inbox.
- WhatsApp Business API sending.
- Email synchronization.
- Individual authentication and permissions.
- Configurable pipelines.
- Messaging provider delivery and inbound webhook handling.

## Data model

### `crm_companies`

- `id`
- `display_name`
- `legal_name`
- `domain`
- `website_url`
- `gst_number`
- `registered_address`
- `notes`
- `created_at`
- `updated_at`

### `crm_contacts`

- `id`
- `company_id`
- `name`
- `primary_email`
- `primary_phone`
- `job_title`
- `notes`
- `created_at`
- `updated_at`

Unique index on normalized primary email where present.

### `crm_contact_methods`

- `id`
- `contact_id`
- `type`
- `value`
- `normalized_value`
- `is_primary`

Unique index on type and normalized value.

### `crm_deals`

- `id`
- `contact_id`
- `company_id`
- `title`
- `problem_statement`
- `lead_source`
- `source_detail`
- `stage`
- `owner`
- `estimated_value`
- `last_interaction_at`
- `next_action`
- `next_action_due_at`
- `lost_reason`
- `created_at`
- `updated_at`

### `crm_activities`

- `id`
- `deal_id`
- `contact_id`
- `actor`
- `type`
- `direction`
- `occurred_at`
- `subject`
- `body`
- `source`
- `source_id`
- `metadata`
- `created_at`

Unique index on source and source ID where a source ID exists.

### `crm_tasks`

- `id`
- `deal_id`
- `owner`
- `title`
- `due_at`
- `priority`
- `status`
- `completed_at`
- `created_at`
- `updated_at`

### `crm_meetings`

- `id`
- `deal_id`
- `fireflies_transcript_id`
- `title`
- `meeting_at`
- `duration_minutes`
- `transcript_url`
- `summary_status`
- `short_summary`
- `overview`
- `action_items`
- `analysis`
- `synced_at`

Unique index on `fireflies_transcript_id`.

### `crm_bookings`

- `id`
- `deal_id`
- `cal_booking_uid`
- `starts_at`
- `status`
- `qualification`
- `created_at`
- `updated_at`

Unique index on `cal_booking_uid`.

### `crm_whatsapp_workflows`

- `id`
- `deal_id`
- `state`
- `consent_status`
- `enabled`
- `appointment_at`
- `next_message_at`
- `last_intent`
- `handoff_reason`
- `created_at`
- `updated_at`

Unique index on `deal_id`. Indexed queue lookup on enabled workflows with a scheduled next message.

## Integration architecture

CRM provider code should remain separate from the analytics synchronization path:

```text
Cal.com webhook      Fireflies scheduled sync       Manual activity
       │                       │                           │
       └────────────── CRM ingestion layer ──────────────┘
                               │
          Contacts · Deals · Activities · WhatsApp state
                               │
            Today · Leads · Calls · WhatsApp · Lead detail
                               │
                  Marketing attribution, read only
```

The CRM should not write to `daily_summary`, Meta, or GA tables.

## Security and privacy

- Staging must contain synthetic CRM fixtures only.
- Production CRM data must stay in the production Railway Postgres service.
- Fireflies credentials belong only to production services that need them.
- API keys, transcripts, and private contact data must not appear in logs.
- Client records must not be exposed through the existing analytics machine API.
- A future CRM API requires separate scopes and clients.

## Non-functional requirements

- All CRM mutations must be server-side and authenticated.
- Import and synchronization jobs must be idempotent.
- Provider failures must preserve previous good data.
- Desktop and mobile layouts must avoid horizontal overflow.
- The Today view must remain usable at 320, 375, 390, 414, and 768 pixel widths.
- Interactive controls need visible keyboard focus states.
- Activity timestamps must be stored with time zones and displayed in IST.

## Out of scope

- Marketing email builder
- Customer-support ticketing
- Invoicing
- Project delivery management
- Social scheduling
- Automatic commercial messages
- Arbitrary custom fields
- Multiple customer workspaces

## Rollout

### Phase 0: Data isolation

- Complete the existing Forge staging-isolation roadmap.
- Add deterministic synthetic CRM fixtures.
- Confirm production credentials are absent from staging.

### Phase 1: Foundation

- Add migrations for CRM tables and indexes.
- Add query and mutation services.
- Add owner, stage, task, and activity audit logic.

### Phase 2: Import

- Import Cal.com bookings and normalized Fireflies records.
- Produce a duplicate review report.
- Validate a sample of existing accounts manually.

### Phase 3: Core interface

- Add CRM navigation.
- Build Today, Pipeline, Follow ups, Leads, Calls, WhatsApp, and Lead detail.
- Preserve the existing Analytics and System views.

### Phase 4: Integrations

- Add Cal.com webhook ingestion.
- Add scheduled and manual Fireflies synchronization.
- Add draft generation with approval-only handling.
- Connect an approved WhatsApp provider for delivery receipts and inbound replies.

### Phase 5: Attribution

- Link deals to lead source and campaign when evidence exists.
- Add qualified, proposed, and won funnel reporting.
- Establish baselines before setting conversion targets.

## Verification

- Run database migrations twice to prove idempotency.
- Import the same source files twice and verify stable record counts.
- Verify a Fireflies failure preserves previous meeting records.
- Verify staging cannot connect to live Cal.com or Fireflies sources.
- Verify real client data does not appear in fixture output.
- Verify authenticated desktop and mobile flows.
- Verify every active deal appears in Today when overdue, unassigned, or missing a next action.

## Open decisions

1. Whether Today replaces the analytics Overview as the default authenticated screen.
2. Whether owner selection is required on deal creation or may temporarily remain Unassigned.
3. Whether proposal files are uploaded into Forge or linked to existing client folders.
4. Whether WhatsApp interactions are stored as full text or concise founder-authored notes in the first release.
5. Which WhatsApp Business provider will own message delivery and inbound webhooks.
