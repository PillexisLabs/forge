// Protocol probe for Sarvam's streaming TTS WebSocket — no phone involved.
// Sends one Hinglish sentence and times: connect → config → first audio chunk.
// That first-chunk number replaces the 0.9–1.8 s REST TTS leg in the budget.
//
// Run:  set -a; source ../../../keys/.env; set +a; npx tsx tts-ws-probe.ts

import WebSocket from 'ws';

const SARVAM_KEY = process.env.SARVAM_API_KEY ?? '';
if (!SARVAM_KEY) { console.error('Missing SARVAM_API_KEY'); process.exit(1); }

const TEXT = 'बहुत बढ़िया! अभी आपका सबसे बड़ा operations headache क्या चल रहा है?';

const url = 'wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v3&send_completion_event=true';
const ws = new WebSocket(url, { headers: { 'Api-Subscription-Key': SARVAM_KEY } });
const t0 = Date.now();
const stamp = () => `+${String(Date.now() - t0).padStart(5)}ms`;
let textSentAt = 0;
let chunks = 0;
let bytes = 0;

ws.on('open', () => {
  console.log(`${stamp()} ws open`);
  ws.send(JSON.stringify({
    type: 'config',
    data: {
      model: 'bulbul:v3',
      language_code: 'hi-IN',
      speaker: 'priya',
      speech_sample_rate: 8000,
      output_audio_codec: 'mulaw',
      // Small buffer so the first chunk flushes early.
      min_buffer_size: 30,
      max_chunk_length: 120,
    },
  }));
  textSentAt = Date.now();
  ws.send(JSON.stringify({ type: 'text', data: { text: TEXT } }));
  ws.send(JSON.stringify({ type: 'flush' }));
});

ws.on('message', (raw) => {
  const msg = JSON.parse(String(raw)) as { type: string; data?: { audio?: string; event_type?: string; message?: string } };
  if (msg.type === 'audio' && msg.data?.audio) {
    const size = Buffer.from(msg.data.audio, 'base64').length;
    chunks += 1;
    bytes += size;
    if (chunks === 1) {
      console.log(`${stamp()} FIRST audio chunk: ${size} bytes (${(size / 8000).toFixed(2)}s of audio) — text→first-audio ${Date.now() - textSentAt} ms`);
    } else {
      console.log(`${stamp()} audio chunk ${chunks}: ${size} bytes`);
    }
  } else if (msg.type === 'event' || msg.data?.event_type) {
    console.log(`${stamp()} event: ${msg.data?.event_type ?? JSON.stringify(msg)}`);
    console.log(`total: ${chunks} chunks, ${(bytes / 8000).toFixed(2)}s of audio`);
    ws.close();
    process.exit(0);
  } else {
    console.log(`${stamp()} ${msg.type}: ${JSON.stringify(msg).slice(0, 200)}`);
  }
});

ws.on('error', (e) => { console.error('ws error:', e.message); process.exit(1); });
setTimeout(() => { console.error(`timeout — got ${chunks} chunks`); process.exit(chunks ? 0 : 1); }, 20_000);
