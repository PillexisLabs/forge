# Voice call spike (throwaway)

One outbound AI call on the decided stack (plans/PLATFORM.md section 8):
Twilio carries the call, Sarvam listens (Saarika), thinks (sarvam-m), and
speaks (Bulbul) in Hinglish.

**Pass**: turn latency under 1.2 seconds (the script prints PASS or FAIL
per turn) and demo-grade voice quality on the phone.
**Fail**: latency over budget or robotic/garbled Hinglish.

This folder is a spike. It has hardcoded prompts, no data spine, and no
events. Delete it after the real `src/modules/voice/` lands. It is excluded
from the app build (`tsconfig.json` excludes `spikes/`).

## What Anurag must set up once

1. **Twilio** (console.twilio.com): create an account, buy one voice-capable
   number (~USD 2/month), add ~USD 10 credit. Note the Account SID and Auth
   Token from the console home page.
   - Trial accounts can only call verified numbers: verify your own phone
     under Phone Numbers → Verified Caller IDs, or upgrade the account.
   - India destination: enable India under Voice → Geo permissions.
2. **Sarvam** (dashboard.sarvam.ai): create an account, generate an API
   subscription key, add credit (INR 2,000 is plenty for the spike).
3. Put the values in `keys/.env` (workspace root, never committed):

```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...
SARVAM_API_KEY=...
SPIKE_TO_NUMBER=+91...   # your own phone
```

## Run

```bash
cd forge/spikes/voice-call
npm install

# Terminal 1 — public tunnel to this machine:
cloudflared tunnel --url http://localhost:8090
# copy the https URL it prints

# Terminal 2:
set -a; source ../../../keys/.env; set +a
PUBLIC_URL=https://<tunnel-url> npx tsx spike.ts
```

Your phone rings. Answer, talk in Hindi or English, watch the terminal for
per-turn latency lines and the transcript on hangup.

## Knobs

- `SARVAM_STT_MODEL` (default `saarika:v2`), `SARVAM_LLM_MODEL`
  (`sarvam-m`), `SARVAM_TTS_MODEL` (`bulbul:v2`), `SARVAM_TTS_SPEAKER`
  (`anushka`). Check dashboard.sarvam.ai for current model names — bump
  these if the API rejects a model string.
- `SPIKE_PORT` (default 8090).

## Known simplifications

- No barge-in: the bot ignores the caller while it speaks.
- Energy-threshold VAD with a 500 ms end-of-speech wait — that wait is part
  of the measured turn latency. If latency fails, the first lever is
  switching STT to Sarvam's streaming endpoint, not tuning the VAD.
- REST (non-streaming) LLM and TTS calls. Streaming both is the second
  latency lever for the real module.
