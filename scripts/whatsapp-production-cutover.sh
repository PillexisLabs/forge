#!/usr/bin/env bash
# Production cutover for WhatsApp automation. Run each step in order.
# Usage:
#   scripts/whatsapp-production-cutover.sh railway-vars     # set production env vars
#   scripts/whatsapp-production-cutover.sh staging-cal      # set staging Cal secret for rehearsal
#   scripts/whatsapp-production-cutover.sh cal-webhook <target-url>
#       e.g. cal-webhook https://forge-production-fc70.up.railway.app/api/cal/webhook
#   scripts/whatsapp-production-cutover.sh test-booking <base-url> <secret> <phone-e164>
#       sends a signed fake BOOKING_CREATED to <base-url>/api/cal/webhook
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
KEYS="$DIR/../keys/.env"

case "${1:-}" in
  railway-vars)
    TOK="$(grep '^WHATSAPP_ACCESS_TOKEN=' "$DIR/.env" | cut -d= -f2- | tr -d '"')"
    APPSEC="$(grep '^WHATSAPP_APP_SECRET=' "$KEYS" | cut -d= -f2- | tr -d '"')"
    VTOK="$(railway variables -e staging -s forge --kv | grep '^WHATSAPP_WEBHOOK_VERIFY_TOKEN=' | cut -d= -f2-)"
    [ -n "$TOK" ] && [ -n "$APPSEC" ] && [ -n "$VTOK" ] || { echo "missing a source value (token/app secret/verify token)"; exit 1; }
    CALSEC="$(openssl rand -hex 24)"
    railway variables -e production -s forge \
      --set "WHATSAPP_ACCESS_TOKEN=$TOK" \
      --set "WHATSAPP_PHONE_NUMBER_ID=1242052502320950" \
      --set "WHATSAPP_GRAPH_VERSION=v23.0" \
      --set "WHATSAPP_WEBHOOK_VERIFY_TOKEN=$VTOK" \
      --set "WHATSAPP_APP_SECRET=$APPSEC" \
      --set "WHATSAPP_USE_TEMPLATES=1" \
      --set "WHATSAPP_WORKER_INLINE=1" \
      --set "CAL_WEBHOOK_SECRET=$CALSEC" \
      --skip-deploys > /dev/null
    printf '%s' "$CALSEC" > "$DIR/../keys/cal-webhook-secret-forge.txt"
    echo "production vars set; Cal webhook secret saved to keys/cal-webhook-secret-forge.txt"
    ;;

  staging-cal)
    CALSEC="$(openssl rand -hex 24)"
    railway variables -e staging -s forge --set "CAL_WEBHOOK_SECRET=$CALSEC" > /dev/null
    printf '%s' "$CALSEC" > "$DIR/../keys/cal-webhook-secret-forge-staging.txt"
    echo "staging CAL_WEBHOOK_SECRET set; saved to keys/cal-webhook-secret-forge-staging.txt"
    echo "staging redeploy needed for the var to load"
    ;;

  cal-webhook)
    [ -n "${2:-}" ] || { echo "usage: $0 cal-webhook <target-url>"; exit 1; }
    CAL_KEY="$(grep '^CAL_API_KEY=' "$KEYS" | cut -d= -f2- | tr -d '"')"
    SECRET="$(cat "$DIR/../keys/cal-webhook-secret-forge.txt")"
    [ -n "$CAL_KEY" ] && [ -n "$SECRET" ] || { echo "missing CAL_API_KEY or saved secret (run railway-vars first)"; exit 1; }
    curl -s -X POST "https://api.cal.com/v1/webhooks?apiKey=$CAL_KEY" \
      -H "Content-Type: application/json" \
      -d "{
        \"subscriberUrl\": \"$2\",
        \"eventTriggers\": [\"BOOKING_CREATED\"],
        \"active\": true,
        \"secret\": \"$SECRET\"
      }" | python3 -m json.tool
    ;;

  test-booking)
    [ -n "${2:-}" ] && [ -n "${3:-}" ] && [ -n "${4:-}" ] || { echo "usage: $0 test-booking <base-url> <secret> <phone-e164>"; exit 1; }
    STARTS="$(python3 -c 'from datetime import datetime,timedelta,timezone; print((datetime.now(timezone.utc)+timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S.000Z"))')"
    BODY="{\"triggerEvent\":\"BOOKING_CREATED\",\"payload\":{\"uid\":\"test-$(date +%s)\",\"startTime\":\"$STARTS\",\"attendees\":[{\"name\":\"Test Founder\",\"email\":\"test-intake@pillexislabs.com\",\"phoneNumber\":\"$4\"}],\"responses\":{\"phone\":{\"label\":\"WhatsApp number\",\"value\":\"$4\"}}}}"
    SIG="$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$3" | awk '{print $NF}')"
    curl -s -X POST "$2/api/cal/webhook" \
      -H "Content-Type: application/json" \
      -H "x-cal-signature-256: $SIG" \
      -d "$BODY" | python3 -m json.tool
    ;;

  *)
    echo "usage: $0 {railway-vars|staging-cal|cal-webhook <url>|test-booking <base-url> <secret> <phone>}"
    exit 1
    ;;
esac
