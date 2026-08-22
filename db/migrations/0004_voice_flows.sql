-- Voice flows: one call, selectable stack (decided 2026-08-22 for the client
-- demo and kept as a core capability). A flow names the full provider chain:
--   'stub'          dry-run, no real call
--   'sarvam-twilio' own pipeline: Twilio carries, Sarvam listens/thinks/speaks
--   'sarvam-plivo'  own pipeline on Plivo (Indian telephony rates)
--   'bolna'         Bolna's hosted platform end to end
-- Kept as free text plus code-side validation so a client copy can add flows
-- without a schema change.

alter table vc_calls
  add column flow text not null default 'stub';

-- Demo and test calls are placed against a bare number with no CRM deal
-- behind them; production calls still carry the deal.
alter table vc_calls
  alter column deal_id drop not null;
