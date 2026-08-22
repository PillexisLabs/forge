// Protocol probe for Sarvam's realtime STT WebSocket — no phone involved.
// Synthesizes one Hindi sentence with bulbul (REST), converts it to the same
// mulaw/8k frames Twilio Media Streams delivers, streams them in real time,
// and prints every server event with timestamps. Key number: the gap between
// vad.speech_end and transcript.final — that is the STT leg of turn latency.
//
// Run:  set -a; source ../../../keys/.env; set +a; npx tsx stt-ws-probe.ts

import WebSocket from 'ws';

const SARVAM_KEY = process.env.SARVAM_API_KEY ?? '';
if (!SARVAM_KEY) { console.error('Missing SARVAM_API_KEY'); process.exit(1); }

const SENTENCE = 'नमस्ते, मुझे कल बारह बजे WhatsApp पर message कर दीजिए।';

// ---- mulaw encode (same as spike.ts) ----
const BIAS = 0x84;
function mulawEncode(pcm: Int16Array): Uint8Array {
  const out = new Uint8Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    let s = pcm[i];
    const sign = s < 0 ? 0x80 : 0;
    if (s < 0) s = -s;
    if (s > 32635) s = 32635;
    s += BIAS;
    let exp = 7;
    for (let mask = 0x4000; (s & mask) === 0 && exp > 0; exp--, mask >>= 1);
    const mant = (s >> (exp + 3)) & 0x0f;
    out[i] = ~(sign | (exp << 4) | mant) & 0xff;
  }
  return out;
}
function wavToPcm8k(wav: Buffer): Int16Array {
  const rate = wav.readUInt32LE(24);
  let off = 12;
  while (off < wav.length - 8) {
    const id = wav.toString('ascii', off, off + 4);
    const size = wav.readUInt32LE(off + 4);
    if (id === 'data') {
      const pcm = new Int16Array(wav.buffer, wav.byteOffset + off + 8, Math.floor(size / 2));
      if (rate === 8000) return pcm.slice();
      const ratio = rate / 8000;
      const out = new Int16Array(Math.floor(pcm.length / ratio));
      for (let i = 0; i < out.length; i++) out[i] = pcm[Math.floor(i * ratio)];
      return out;
    }
    off += 8 + size + (size % 2);
  }
  throw new Error('WAV data chunk not found');
}

async function main() {
  // 1. Make test audio.
  const res = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: { 'api-subscription-key': SARVAM_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: SENTENCE, model: 'bulbul:v3', speaker: 'priya',
      target_language_code: 'hi-IN', speech_sample_rate: 8000,
    }),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
  const { audios } = (await res.json()) as { audios: string[] };
  const mulaw = mulawEncode(wavToPcm8k(Buffer.from(audios[0], 'base64')));
  console.log(`test audio: ${(mulaw.length / 8000).toFixed(1)}s of speech`);

  // 2. Stream it like Twilio would: 160-byte frames every 20 ms, then silence.
  const url = 'wss://api.sarvam.ai/speech-to-text-realtime/ws'
    + '?language_code=hi-IN&model=saaras:v3-realtime&encoding=mulaw&sample_rate=8000'
    + '&stream_type=fast&silence_duration_ms=400';
  const ws = new WebSocket(url, { headers: { 'API-SUBSCRIPTION-KEY': SARVAM_KEY } });
  const t0 = Date.now();
  const stamp = () => `+${String(Date.now() - t0).padStart(5)}ms`;
  let speechEndAt = 0;

  ws.on('open', () => {
    console.log(`${stamp()} ws open, streaming frames…`);
    const silence = new Uint8Array(160).fill(0xff); // mulaw zero
    let i = 0;
    const frames = Math.ceil(mulaw.length / 160);
    const timer = setInterval(() => {
      if (i < frames) {
        const chunk = mulaw.slice(i * 160, (i + 1) * 160);
        ws.send(JSON.stringify({ event: 'audio_input', audio: Buffer.from(chunk).toString('base64') }));
      } else if (i < frames + 60) {
        ws.send(JSON.stringify({ event: 'audio_input', audio: Buffer.from(silence).toString('base64') }));
      } else {
        clearInterval(timer);
      }
      i += 1;
    }, 20);
  });

  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw)) as { event: string; text?: string; [k: string]: unknown };
    if (msg.event === 'vad.speech_end') speechEndAt = Date.now();
    if (msg.event === 'transcript.final' && speechEndAt) {
      console.log(`${stamp()} ${msg.event}: "${msg.text}"  (speech_end → final: ${Date.now() - speechEndAt} ms)`);
      ws.close();
      process.exit(0);
    } else {
      console.log(`${stamp()} ${msg.event}${msg.text ? `: "${msg.text}"` : ''}`);
    }
  });

  ws.on('error', (e) => { console.error('ws error:', e.message); process.exit(1); });
  setTimeout(() => { console.error('timeout — no final transcript in 30s'); process.exit(1); }, 30_000);
}

main();
