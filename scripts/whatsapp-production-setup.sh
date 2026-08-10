#!/usr/bin/env bash
# One-time production WhatsApp number setup, run step by step.
# Usage:
#   scripts/whatsapp-production-setup.sh status
#   scripts/whatsapp-production-setup.sh create-templates
#   scripts/whatsapp-production-setup.sh check-templates
#   scripts/whatsapp-production-setup.sh request-code
#   scripts/whatsapp-production-setup.sh verify <sms-code>
#   scripts/whatsapp-production-setup.sh register <6-digit-pin>
#   scripts/whatsapp-production-setup.sh subscribe-app
#   scripts/whatsapp-production-setup.sh send-test <e164-number> (after templates approve)
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
TOK="$(grep '^WHATSAPP_ACCESS_TOKEN=' "$DIR/.env" | cut -d= -f2- | tr -d '"')"
GV="v23.0"
WABA="4407182709496656"
PHONE_ID="1242052502320950"
API="https://graph.facebook.com/$GV"

auth=(-H "Authorization: Bearer $TOK")
json=(-H "Content-Type: application/json")

pretty() { python3 -m json.tool; }

create_template() {
  curl -s -X POST "$API/$WABA/message_templates" "${auth[@]}" "${json[@]}" -d "$1" | pretty
}

case "${1:-}" in
  status)
    curl -s "$API/$PHONE_ID?fields=display_phone_number,verified_name,status,platform_type,code_verification_status,quality_rating,throughput" "${auth[@]}" | pretty
    ;;

  create-templates)
    create_template '{
      "name": "pillexis_booking_confirmation",
      "language": "en",
      "category": "UTILITY",
      "components": [{
        "type": "BODY",
        "text": "Hi {{1}}, this is Anurag from Pillexis Labs. Your call is booked for {{2}}. Please reply confirm to keep the slot, or reschedule if you need another time.",
        "example": {"body_text": [["Achal", "Mon 11 Aug, 1:00 pm IST"]]}
      }]
    }'
    create_template '{
      "name": "pillexis_silence_nudge",
      "language": "en",
      "category": "UTILITY",
      "components": [{
        "type": "BODY",
        "text": "Hi {{1}}, just checking you saw the booking for your Pillexis Labs call on {{2}}. Reply confirm to keep the slot.",
        "example": {"body_text": [["Achal", "Mon 11 Aug, 1:00 pm IST"]]}
      }]
    }'
    create_template '{
      "name": "pillexis_call_reminder_24h",
      "language": "en",
      "category": "UTILITY",
      "components": [{
        "type": "BODY",
        "text": "Hi {{1}}, reminder that your Pillexis Labs call is on {{2}}. Reply here if anything changes.",
        "example": {"body_text": [["Achal", "Mon 11 Aug, 1:00 pm IST"]]}
      }]
    }'
    create_template '{
      "name": "pillexis_attendance_check",
      "language": "en",
      "category": "UTILITY",
      "components": [{
        "type": "BODY",
        "text": "Hi {{1}}, your Pillexis Labs call is at {{2}} today. Will you be able to join?",
        "example": {"body_text": [["Achal", "1:00 pm IST"]]}
      }]
    }'
    create_template '{
      "name": "pillexis_no_show_reschedule",
      "language": "en",
      "category": "UTILITY",
      "components": [{
        "type": "BODY",
        "text": "Hi {{1}}, we missed you on the call today. No stress at all. Grab another slot that works better: https://cal.com/pillexislabs/pillexis-labs-intro-call",
        "example": {"body_text": [["Achal"]]}
      }]
    }'
    ;;

  check-templates)
    curl -s "$API/$WABA/message_templates?fields=name,status,category,language,rejected_reason&limit=50" "${auth[@]}" | pretty
    ;;

  request-code)
    curl -s -X POST "$API/$PHONE_ID/request_code" "${auth[@]}" "${json[@]}" \
      -d '{"code_method":"SMS","language":"en_US"}' | pretty
    ;;

  verify)
    [ -n "${2:-}" ] || { echo "usage: $0 verify <sms-code>"; exit 1; }
    curl -s -X POST "$API/$PHONE_ID/verify_code" "${auth[@]}" "${json[@]}" \
      -d "{\"code\":\"$2\"}" | pretty
    ;;

  register)
    [ -n "${2:-}" ] || { echo "usage: $0 register <6-digit-pin>"; exit 1; }
    curl -s -X POST "$API/$PHONE_ID/register" "${auth[@]}" "${json[@]}" \
      -d "{\"messaging_product\":\"whatsapp\",\"pin\":\"$2\"}" | pretty
    echo "Save this PIN in keys/. It is required if the number ever re-registers."
    ;;

  subscribe-app)
    curl -s -X POST "$API/$WABA/subscribed_apps" "${auth[@]}" | pretty
    echo "--- current subscriptions ---"
    curl -s "$API/$WABA/subscribed_apps" "${auth[@]}" | pretty
    ;;

  send-test)
    [ -n "${2:-}" ] || { echo "usage: $0 send-test <e164-number, e.g. 918967265150>"; exit 1; }
    curl -s -X POST "$API/$PHONE_ID/messages" "${auth[@]}" "${json[@]}" -d "{
      \"messaging_product\": \"whatsapp\",
      \"to\": \"$2\",
      \"type\": \"template\",
      \"template\": {
        \"name\": \"pillexis_call_reminder_24h\",
        \"language\": {\"code\": \"en\"},
        \"components\": [{
          \"type\": \"body\",
          \"parameters\": [
            {\"type\": \"text\", \"text\": \"Anurag\"},
            {\"type\": \"text\", \"text\": \"Mon 11 Aug, 1:00 pm IST\"}
          ]
        }]
      }
    }" | pretty
    ;;

  *)
    echo "usage: $0 {status|create-templates|check-templates|request-code|verify <code>|register <pin>|subscribe-app|send-test <number>}"
    exit 1
    ;;
esac
