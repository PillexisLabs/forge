// Throwaway voice spike (plans/PLATFORM.md section 10, item 4).
// One outbound AI call on the decided stack: Twilio Programmable Voice with
// Media Streams carries the call; Sarvam listens (Saarika STT), thinks
// (sarvam-m), and speaks (Bulbul TTS) in Hinglish.
//
// Pass/fail: turn latency (caller stops speaking → first reply audio frame)
// under 1.2 seconds, and demo-grade voice quality. Latency prints per turn.
//
// This file is a spike: hardcoded script, no data spine, no events. The real
// module builds its prompt from the knowledge pack.
//
// Run: see README.md in this folder.

import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';

// ---------- config ----------

const need = (key: string): string => {
  const v = process.env[key];
  if (!v) {
    console.error(`Missing env: ${key} (see README.md)`);
    process.exit(1);
  }
  return v;
};

const TWILIO_SID = need('TWILIO_ACCOUNT_SID');
const TWILIO_TOKEN = need('TWILIO_AUTH_TOKEN');
const TWILIO_FROM = need('TWILIO_FROM_NUMBER');
const SARVAM_KEY = need('SARVAM_API_KEY');
const TO_NUMBER = need('SPIKE_TO_NUMBER');
const PUBLIC_URL = need('PUBLIC_URL').replace(/\/$/, ''); // https tunnel to this machine

const PORT = Number(process.env.SPIKE_PORT ?? 8090);
const STT_MODEL = process.env.SARVAM_STT_MODEL ?? 'saarika:v2';
const LLM_MODEL = process.env.SARVAM_LLM_MODEL ?? 'sarvam-m';
const TTS_MODEL = process.env.SARVAM_TTS_MODEL ?? 'bulbul:v2';
const TTS_SPEAKER = process.env.SARVAM_TTS_SPEAKER ?? 'anushka';
const MAX_CALL_MS = 3 * 60_000;

const SYSTEM_PROMPT = `You are Asha, calling from Pillexis Labs after the lead booked an intro call.
Speak natural Hinglish (Hindi in Latin script mixed with English), warm and brief.
One question at a time. Keep every reply under 25 words.
Goal: confirm the meeting time works, ask what their biggest operations headache is, and say Anurag will cover it on the call.
Never discuss prices. End politely when done.`;

// ---------- mulaw <-> pcm (G.711, 8 kHz) ----------

const BIAS = 0x84;
function mulawDecode(u8: Uint8Array): Int16Array {
  const out = new Int16Array(u8.length);
  for (let i = 0; i < u8.length; i++) {
    let u = ~u8[i] & 0xff;
    const sign = u & 0x80;
    const exp = (u >> 4) & 0x07;
    const mant = u & 0x0f;
    let sample = ((mant << 3) + BIAS) << exp;
    sample -= BIAS;
    out[i] = sign ? -sample : sample;
  }
  return out;
}
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

// 8 kHz -> 16 kHz linear upsample, then wrap as WAV for STT.
function pcm8kToWav16k(pcm: Int16Array): Buffer {
  const up = new Int16Array(pcm.length * 2);
  for (let i = 0; i < pcm.length; i++) {
    up[i * 2] = pcm[i];
    up[i * 2 + 1] = i + 1 < pcm.length ? Math.round((pcm[i] + pcm[i + 1]) / 2) : pcm[i];
  }
  const dataLen = up.length * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataLen, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(16000, 24); buf.writeUInt32LE(32000, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataLen, 40);
  Buffer.from(up.buffer, up.byteOffset, dataLen).copy(buf, 44);
  return buf;
}

// WAV (from Bulbul, any pcm16 mono rate) -> 8 kHz pcm16.
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

// ---------- Sarvam ----------

async function sttSarvam(pcm: Int16Array): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(pcm8kToWav16k(pcm))], { type: 'audio/wav' }), 'utterance.wav');
  form.append('model', STT_MODEL);
  form.append('language_code', 'unknown');
  const res = await fetch('https://api.sarvam.ai/speech-to-text', {
    method: 'POST',
    headers: { 'api-subscription-key': SARVAM_KEY },
    body: form,
  });
  if (!res.ok) throw new Error(`STT ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { transcript?: string };
  return (data.transcript ?? '').trim();
}

type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };
async function chatSarvam(messages: ChatMsg[]): Promise<string> {
  const res = await fetch('https://api.sarvam.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SARVAM_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: LLM_MODEL, messages, max_tokens: 120, temperature: 0.6 }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return (data.choices?.[0]?.message?.content ?? '').trim();
}

async function ttsSarvam(text: string): Promise<Int16Array> {
  const res = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: { 'api-subscription-key': SARVAM_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model: TTS_MODEL,
      speaker: TTS_SPEAKER,
      target_language_code: 'hi-IN',
      speech_sample_rate: 8000,
    }),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { audios?: string[] };
  if (!data.audios?.[0]) throw new Error('TTS returned no audio');
  return wavToPcm8k(Buffer.from(data.audios[0], 'base64'));
}

// ---------- call session ----------

type TwilioMediaMsg = {
  event: 'connected' | 'start' | 'media' | 'stop' | 'mark';
  start?: { streamSid: string };
  media?: { payload: string };
  streamSid?: string;
};

// Simple energy VAD over 20 ms mulaw frames (160 samples at 8 kHz).
const SPEECH_RMS = 700;
const END_SILENCE_MS = 500;
const MIN_UTTERANCE_MS = 300;

function rms(pcm: Int16Array): number {
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / pcm.length);
}

function handleStream(ws: WebSocket) {
  let streamSid = '';
  const history: ChatMsg[] = [{ role: 'system', content: SYSTEM_PROMPT }];
  let utterance: Int16Array[] = [];
  let speechMs = 0;
  let silenceMs = 0;
  let speaking = false; // the bot is talking; ignore input (no barge-in in the spike)
  let turn = 0;

  const sendAudio = (pcm: Int16Array) => {
    // 20 ms frames, paced by Twilio's jitter buffer — send in one go is fine.
    const payload = Buffer.from(mulawEncode(pcm)).toString('base64');
    ws.send(JSON.stringify({ event: 'media', streamSid, media: { payload } }));
    ws.send(JSON.stringify({ event: 'mark', streamSid, mark: { name: `turn-${turn}` } }));
  };

  const speak = async (text: string, latencyFrom?: number) => {
    speaking = true;
    const pcm = await ttsSarvam(text);
    if (latencyFrom) {
      const ms = Date.now() - latencyFrom;
      console.log(`TURN ${turn} latency: ${ms} ms ${ms <= 1200 ? 'PASS' : 'FAIL'} (budget 1200)`);
    }
    sendAudio(pcm);
    // 'mark' comes back when playback finishes; until then stay muted.
  };

  ws.on('message', async (raw) => {
    const msg = JSON.parse(String(raw)) as TwilioMediaMsg;

    if (msg.event === 'start' && msg.start) {
      streamSid = msg.start.streamSid;
      console.log(`stream started: ${streamSid}`);
      turn += 1;
      const greeting = 'Namaste! Main Asha bol rahi hoon, Pillexis Labs se. Aapne intro call book kiya tha — kya abhi do minute baat kar sakte hain?';
      history.push({ role: 'assistant', content: greeting });
      await speak(greeting).catch((e) => console.error('greeting failed:', e));
      setTimeout(() => ws.close(), MAX_CALL_MS);
      return;
    }

    if (msg.event === 'mark') {
      speaking = false; // bot finished talking; listen again
      return;
    }

    if (msg.event === 'media' && msg.media && !speaking) {
      const pcm = mulawDecode(Buffer.from(msg.media.payload, 'base64'));
      const frameMs = (pcm.length / 8000) * 1000;
      const loud = rms(pcm) > SPEECH_RMS;
      if (loud) {
        utterance.push(pcm);
        speechMs += frameMs;
        silenceMs = 0;
      } else if (speechMs > 0) {
        utterance.push(pcm);
        silenceMs += frameMs;
      }

      if (speechMs >= MIN_UTTERANCE_MS && silenceMs >= END_SILENCE_MS) {
        const endOfSpeech = Date.now();
        const full = new Int16Array(utterance.reduce((n, c) => n + c.length, 0));
        let off = 0;
        for (const c of utterance) { full.set(c, off); off += c.length; }
        utterance = []; speechMs = 0; silenceMs = 0;
        speaking = true; // hold the mic while we think
        turn += 1;
        try {
          const heard = await sttSarvam(full);
          console.log(`heard: "${heard}"`);
          if (!heard) { speaking = false; return; }
          history.push({ role: 'user', content: heard });
          const reply = await chatSarvam(history);
          history.push({ role: 'assistant', content: reply });
          console.log(`reply: "${reply}"`);
          await speak(reply, endOfSpeech);
        } catch (e) {
          console.error('turn failed:', e);
          speaking = false;
        }
      }
      return;
    }

    if (msg.event === 'stop') {
      console.log('stream stopped — call over. Transcript:');
      for (const m of history.slice(1)) console.log(`  ${m.role}: ${m.content}`);
      process.exit(0);
    }
  });
}

// ---------- server + outbound call ----------

const server = createServer((req, res) => {
  if (req.url === '/twiml') {
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    const wsUrl = `${PUBLIC_URL.replace(/^http/, 'ws')}/media`;
    res.end(`<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${wsUrl}" /></Connect></Response>`);
    return;
  }
  res.writeHead(200).end('voice spike up');
});

const wss = new WebSocketServer({ server, path: '/media' });
wss.on('connection', handleStream);

server.listen(PORT, async () => {
  console.log(`spike server on :${PORT}, public: ${PUBLIC_URL}`);
  const body = new URLSearchParams({
    To: TO_NUMBER,
    From: TWILIO_FROM,
    Url: `${PUBLIC_URL}/twiml`,
  });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Calls.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) {
    console.error(`Twilio call failed ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const call = (await res.json()) as { sid: string };
  console.log(`dialing ${TO_NUMBER} — call sid ${call.sid}. Answer your phone.`);
});
