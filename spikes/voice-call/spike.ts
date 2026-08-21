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
const STT_MODEL = process.env.SARVAM_STT_MODEL ?? 'saarika:v2.5'; // v2 deprecated by Sarvam (verified 2026-08-21)
const LLM_MODEL = process.env.SARVAM_LLM_MODEL ?? 'sarvam-105b-conversations'; // sarvam-m deprecated (verified 2026-08-21)
// bulbul:v3 has its own speaker roster (anushka is v2-only); priya verified 2026-08-21.
const TTS_MODEL = process.env.SARVAM_TTS_MODEL ?? 'bulbul:v3';
const TTS_SPEAKER = process.env.SARVAM_TTS_SPEAKER ?? 'priya';
const MAX_CALL_MS = 3 * 60_000;

// Replies must be written in Devanagari: the hi-IN TTS voice reads romanized
// Hindi with mangled pronunciation (first call verified this the hard way).
// The company name gets a phonetic Devanagari spelling for the same reason.
const SYSTEM_PROMPT = `You are Asha (आशा), calling from Pillexis Labs after the lead booked an intro call.
Write every reply as natural Hinglish in Devanagari script — Hindi in Devanagari, everyday English words (intro call, operations, website) kept in Latin script.
Write brand and product names phonetically in Devanagari so the voice pronounces them right: पिलेक्सिस लैब्स, व्हाट्सऐप (WhatsApp), शॉपिफ़ाई (Shopify), इंस्टाग्राम (Instagram). Never write these in Latin script.
If the caller mishears or mangles the company name, keep saying पिलेक्सिस लैब्स correctly — never repeat their version.
Warm and brief. One question at a time. Keep every reply under 25 words.
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
    body: JSON.stringify({ model: LLM_MODEL, messages, max_tokens: 60, temperature: 0.6 }),
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

const GREETING = 'नमस्ते! मैं आशा बोल रही हूँ, पिलेक्सिस लैब्स से। आपने intro call book किया था — क्या अभी दो minute बात कर सकते हैं?';
// Kick off greeting synthesis at boot, in parallel with the dial + ring.
const greetingAudio = ttsSarvam(GREETING);

type TwilioMediaMsg = {
  event: 'connected' | 'start' | 'media' | 'stop' | 'mark';
  start?: { streamSid: string };
  media?: { payload: string };
  streamSid?: string;
};

// Simple energy VAD over 20 ms mulaw frames (160 samples at 8 kHz).
// 700 missed real speech on the first live call; 350 is the new default and
// SPIKE_VAD_RMS tunes it without an edit. The mic-level log line every 2 s
// shows what to set it to: comfortably below your speech peaks, above the
// idle noise floor.
const SPEECH_RMS = Number(process.env.SPIKE_VAD_RMS ?? 350);
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
  let peakRms = 0;
  let lastMicLog = Date.now();
  let capturing = false;

  const sendAudio = (pcm: Int16Array, withMark = true) => {
    // 20 ms frames, paced by Twilio's jitter buffer — send in one go is fine.
    // The mark comes back when playback reaches it; only the LAST chunk of a
    // reply carries one, so the mic stays muted until the whole reply played.
    const payload = Buffer.from(mulawEncode(pcm)).toString('base64');
    ws.send(JSON.stringify({ event: 'media', streamSid, media: { payload } }));
    if (withMark) ws.send(JSON.stringify({ event: 'mark', streamSid, mark: { name: `turn-${turn}` } }));
  };

  ws.on('message', async (raw) => {
    const msg = JSON.parse(String(raw)) as TwilioMediaMsg;

    if (msg.event === 'start' && msg.start) {
      streamSid = msg.start.streamSid;
      console.log(`stream started: ${streamSid}`);
      turn += 1;
      history.push({ role: 'assistant', content: GREETING });
      try {
        // Synthesized while the phone was still ringing — plays immediately.
        speaking = true;
        sendAudio(await greetingAudio);
      } catch (e) {
        console.error('greeting failed:', e);
        speaking = false;
      }
      setTimeout(() => ws.close(), MAX_CALL_MS);
      return;
    }

    if (msg.event === 'mark') {
      speaking = false; // bot finished talking; listen again
      console.log('listening…');
      return;
    }

    if (msg.event === 'media' && msg.media && !speaking) {
      const pcm = mulawDecode(Buffer.from(msg.media.payload, 'base64'));
      const frameMs = (pcm.length / 8000) * 1000;
      const level = rms(pcm);
      const loud = level > SPEECH_RMS;
      // Live tuning aid: the caller's actual levels vs the threshold.
      peakRms = Math.max(peakRms, level);
      if (Date.now() - lastMicLog > 2000) {
        console.log(`mic level: peak rms ${Math.round(peakRms)} (threshold ${SPEECH_RMS})`);
        peakRms = 0;
        lastMicLog = Date.now();
      }
      if (loud && !capturing) {
        capturing = true;
        console.log('speech detected, capturing…');
      }
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
        utterance = []; speechMs = 0; silenceMs = 0; capturing = false;
        speaking = true; // hold the mic while we think
        turn += 1;
        try {
          const t0 = Date.now();
          const heard = await sttSarvam(full);
          const sttMs = Date.now() - t0;
          console.log(`heard: "${heard}"`);
          if (!heard) { speaking = false; return; }
          history.push({ role: 'user', content: heard });
          const t1 = Date.now();
          const reply = await chatSarvam(history);
          const llmMs = Date.now() - t1;
          history.push({ role: 'assistant', content: reply });
          console.log(`reply: "${reply}"`);

          // Sentence-split TTS: synthesize all sentences in parallel, play the
          // first the moment it is ready. Latency to first audio becomes
          // TTS(first sentence) instead of TTS(whole reply).
          const t2 = Date.now();
          const sentences = reply.split(/(?<=[।!?.])\s+/).filter(Boolean);
          const audioJobs = sentences.map((sentence) => ttsSarvam(sentence));
          const firstAudio = await audioJobs[0];
          const ttsMs = Date.now() - t2;
          const totalMs = Date.now() - endOfSpeech;
          console.log(
            `TURN ${turn} latency: ${totalMs} ms ${totalMs <= 1200 ? 'PASS' : 'FAIL'} `
            + `(stt ${sttMs} + llm ${llmMs} + tts-first ${ttsMs}; budget 1200)`,
          );
          speaking = true;
          sendAudio(firstAudio, audioJobs.length === 1);
          for (let i = 1; i < audioJobs.length; i++) {
            sendAudio(await audioJobs[i], i === audioJobs.length - 1);
          }
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
