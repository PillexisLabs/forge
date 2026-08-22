// Throwaway voice spike (plans/PLATFORM.md section 10, item 4).
// One outbound AI call on the decided stack: Twilio Programmable Voice with
// Media Streams carries the call; Sarvam listens, thinks, and speaks.
//
// Pass/fail: turn latency (caller stops speaking → first reply audio frame)
// under 1.2 seconds, and demo-grade voice quality. Latency prints per turn.
//
// v2 — the streaming pipeline (2026-08-22). The REST-sequential version
// measured 2.0–3.9 s per turn; the stages now overlap:
//   1. Twilio's mulaw/8k frames forward RAW into Sarvam's realtime STT
//      websocket while the caller is still speaking (no decode, no local VAD —
//      the server's VAD emits speech_end and transcript events).
//   2. At vad.speech_end the LLM starts SPECULATIVELY on the latest partial
//      transcript; when transcript.final lands (~350 ms later) it is kept if
//      the text matches, restarted if not (rare).
//   3. The LLM streams; at the first clause boundary the fragment goes to
//      TTS immediately, so first audio never waits for the full reply.
//
// Run: see README.md in this folder.

import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';

const TRANSCRIPT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'transcripts');

// ---------- config ----------

const need = (key: string): string => {
  const v = process.env[key];
  if (!v) {
    console.error(`Missing env: ${key} (see README.md)`);
    process.exit(1);
  }
  return v;
};

// Telephony carrier: 'twilio' (US number, international rates) or 'plivo'.
const TELEPHONY = (process.env.SPIKE_TELEPHONY ?? 'twilio') as 'twilio' | 'plivo';

const SARVAM_KEY = need('SARVAM_API_KEY');
const TO_NUMBER = need('SPIKE_TO_NUMBER');
const PUBLIC_URL = need('PUBLIC_URL').replace(/\/$/, ''); // https tunnel to this machine
const TWILIO_SID = TELEPHONY === 'twilio' ? need('TWILIO_ACCOUNT_SID') : '';
const TWILIO_TOKEN = TELEPHONY === 'twilio' ? need('TWILIO_AUTH_TOKEN') : '';
const TWILIO_FROM = TELEPHONY === 'twilio' ? need('TWILIO_FROM_NUMBER') : '';
const PLIVO_AUTH_ID = TELEPHONY === 'plivo' ? need('PLIVO_AUTH_ID') : '';
const PLIVO_AUTH_TOKEN = TELEPHONY === 'plivo' ? need('PLIVO_AUTH_TOKEN') : '';
const PLIVO_FROM = TELEPHONY === 'plivo' ? need('PLIVO_FROM_NUMBER') : '';

const PORT = Number(process.env.SPIKE_PORT ?? 8090);
const STT_MODEL = process.env.SARVAM_STT_MODEL ?? 'saaras:v3-realtime';
const LLM_MODEL = process.env.SARVAM_LLM_MODEL ?? 'sarvam-105b-conversations';
const TTS_MODEL = process.env.SARVAM_TTS_MODEL ?? 'bulbul:v3';
// ritu chosen by Anurag from a six-voice audition on 2026-08-22.
const TTS_SPEAKER = process.env.SARVAM_TTS_SPEAKER ?? 'ritu';
const MAX_CALL_MS = 3 * 60_000;
const LATENCY_BUDGET_MS = 1200;

// Replies must be written in Devanagari: the hi-IN TTS voice reads romanized
// Hindi with mangled pronunciation (first call verified this the hard way).
const SYSTEM_PROMPT = `You are Asha (आशा), calling from Pillexis Labs after the lead booked an intro call.
Always write the company name exactly as "Pillexis Labs" in Latin script — the voice pronounces it best that way (picked by ear from an audition).
Write every reply as natural Hinglish in Devanagari script — Hindi in Devanagari, everyday English words (intro call, operations, website) kept in Latin script.
Write other brand, product, and person names phonetically in Devanagari so the voice pronounces them right: अनुराग (never "Anurag" in Latin), व्हाट्सऐप (WhatsApp), शॉपिफ़ाई (Shopify), इंस्टाग्राम (Instagram).
Never use the word बढ़िया — the voice mangles it. Say बहुत अच्छा or ठीक है instead.
If the caller mishears or mangles the company name, keep saying Pillexis Labs correctly — never repeat their version.
If the caller asks who you are or wants an introduction, give it properly once: you are Asha from Pillexis Labs, a software studio that builds custom software and AI automation for businesses; they booked an intro call on the website. Then continue.
The intro call is booked for ${process.env.SPIKE_MEETING_TIME ?? 'कल दोपहर 12 बजे'} — state this time plainly whenever the caller asks when the call is. (The real module reads this from the CRM.)
Never repeat a sentence you already said in this call — rephrase or move the conversation forward instead.
Warm and brief. One question at a time. Keep every reply under 25 words.
Goal: confirm the meeting time works, ask what their biggest operations headache is, and say अनुराग will cover it on the call.
Never discuss prices. End politely when done.`;

// ---------- mulaw encode + wav decode (needed for the TTS leg only) ----------

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

// ---------- Sarvam: LLM (streaming) + TTS (REST) ----------

type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * Stream the chat completion, emitting every text delta as it arrives.
 * Resolves with the full reply text.
 */
async function chatSarvamStream(
  messages: ChatMsg[],
  onDelta: (delta: string) => void,
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch('https://api.sarvam.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SARVAM_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: LLM_MODEL, messages, max_tokens: 60, temperature: 0.6, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`LLM ${res.status}: ${await res.text()}`);

  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';

  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
      const delta = (JSON.parse(line.slice(6)) as { choices?: { delta?: { content?: string } }[] })
        .choices?.[0]?.delta?.content ?? '';
      if (!delta) continue;
      text += delta;
      onDelta(delta);
    }
  }
  return text.trim();
}

// ---------- Sarvam streaming TTS session (bulbul over websocket) ----------
//
// LLM deltas go straight in as text messages; mulaw/8k audio chunks come
// straight back out and forward to Twilio untouched. First audio arrives
// ~200 ms after enough text buffers (min_buffer_size), instead of the
// 0.9-1.8 s a whole-utterance REST render costs.

type TtsSession = {
  sendText: (text: string) => void;
  flush: () => void;
  close: () => void;
  setHandlers: (h: { onAudio: (mulawB64: string) => void; onFinal: () => void }) => void;
  isOpen: () => boolean;
};

function openTtsSession(): Promise<TtsSession> {
  const url = `wss://api.sarvam.ai/text-to-speech/ws?model=${TTS_MODEL}&send_completion_event=true`;
  const ws = new WebSocket(url, { headers: { 'Api-Subscription-Key': SARVAM_KEY } });
  let handlers: { onAudio: (mulawB64: string) => void; onFinal: () => void } = {
    onAudio: () => {},
    onFinal: () => {},
  };

  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw)) as { type: string; data?: { audio?: string; event_type?: string; message?: string } };
    if (msg.type === 'audio' && msg.data?.audio) handlers.onAudio(msg.data.audio);
    else if (msg.type === 'event' || msg.data?.event_type === 'final') handlers.onFinal();
    else if (msg.type === 'error') console.error('tts ws error:', msg.data?.message ?? JSON.stringify(msg));
  });
  ws.on('error', (e) => console.error('tts ws error:', e.message));
  // The TTS socket idles out during long caller pauses without a keepalive
  // (verified live: "Websocket was left open without any messages for too long").
  const keepalive = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
  }, 10_000);
  ws.on('close', () => clearInterval(keepalive));

  return new Promise((resolve, reject) => {
    ws.once('error', reject);
    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'config',
        data: {
          model: TTS_MODEL,
          language_code: 'hi-IN',
          speaker: TTS_SPEAKER,
          speech_sample_rate: 8000,
          output_audio_codec: 'mulaw',
          // 30 is the floor — smaller values fail the config validation.
          min_buffer_size: 30,
          max_chunk_length: 120,
          // Normalizes numbers, times, and mixed English before synthesis.
          enable_preprocessing: true,
        },
      }));
      resolve({
        sendText: (text) => ws.send(JSON.stringify({ type: 'text', data: { text } })),
        flush: () => ws.send(JSON.stringify({ type: 'flush' })),
        close: () => ws.close(),
        setHandlers: (h) => { handlers = h; },
        isOpen: () => ws.readyState === WebSocket.OPEN,
      });
    });
  });
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
      enable_preprocessing: true,
    }),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { audios?: string[] };
  if (!data.audios?.[0]) throw new Error('TTS returned no audio');
  return wavToPcm8k(Buffer.from(data.audios[0], 'base64'));
}

// ---------- Sarvam realtime STT session ----------

type SttEvents = {
  onPartial: (text: string) => void;
  onSpeechEnd: () => void;
  onFinal: (text: string) => void;
};

function openSttSession(events: SttEvents): WebSocket {
  const url = 'wss://api.sarvam.ai/speech-to-text-realtime/ws'
    + `?language_code=hi-IN&model=${STT_MODEL}&encoding=mulaw&sample_rate=8000`
    + '&stream_type=fast&silence_duration_ms=400';
  const ws = new WebSocket(url, { headers: { 'API-SUBSCRIPTION-KEY': SARVAM_KEY } });
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw)) as { event: string; text?: string; message?: string };
    if (msg.event === 'transcript.partial' && msg.text) events.onPartial(msg.text);
    else if (msg.event === 'vad.speech_end') events.onSpeechEnd();
    else if (msg.event === 'transcript.final') events.onFinal(msg.text ?? '');
    else if (msg.event === 'error') {
      console.error('stt error:', msg.message);
      // Sarvam reports fatal backend errors as messages while leaving the
      // socket half-open — terminate so the close handler reconnects.
      ws.terminate();
    }
  });
  ws.on('error', (e) => console.error('stt ws error:', e.message));
  const keepalive = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event: 'ping' }));
  }, 10_000);
  ws.on('close', () => clearInterval(keepalive));
  return ws;
}

// Speculative-start reconciliation: the partial at speech_end and the final
// differ only in punctuation almost every time.
const normalize = (s: string) => s.replace(/[\s।,.?!'"''""-]+/g, '').toLowerCase();

// ---------- call session ----------

const GREETING = 'नमस्ते! मैं आशा बोल रही हूँ, Pillexis Labs से। आपने intro call book किया था — क्या अभी दो minute बात कर सकते हैं?';
// Kick off greeting synthesis at boot, in parallel with the dial + ring.
const greetingAudio = ttsSarvam(GREETING);

// Acknowledgment fillers, pre-synthesized at boot. One plays the moment the
// caller's transcript lands — the way a human says "जी," while thinking — so
// the perceived response gap is ~300 ms even when the LLM takes 1.5 s.
const FILLER_TEXTS = ['जी,', 'अच्छा,', 'ठीक है,', 'हाँ जी,'];
const fillerAudio = Promise.all(FILLER_TEXTS.map((text) => ttsSarvam(text)));

// Twilio and Plivo speak nearly the same media-stream dialect: base64
// mulaw/8k frames as JSON. Differences the shim below absorbs:
//   - start message: Twilio carries streamSid, Plivo carries streamId.
//   - sending audio: Twilio wants {event:'media'}, Plivo {event:'playAudio'}.
//   - playback completion: Twilio echoes a 'mark'; Plivo has none, so the
//     unmute is scheduled from the byte count (mulaw/8k = 8 bytes per ms).
type MediaMsg = {
  event: 'connected' | 'start' | 'media' | 'stop' | 'mark';
  start?: { streamSid?: string; streamId?: string };
  media?: { payload: string };
  streamSid?: string;
};

function handleStream(ws: WebSocket) {
  let streamSid = '';
  const history: ChatMsg[] = [{ role: 'system', content: SYSTEM_PROMPT }];
  const turnLatencies: number[] = [];
  let speaking = false;   // bot audio is playing; mic input is dropped (no barge-in)
  let processing = false; // a turn is mid-pipeline; ignore new speech events
  let turn = 1;
  let lastPartial = '';
  let speechEndAt = 0;
  let replyBytes = 0;     // plivo: audio bytes sent since the reply started
  let replyStartedAt = 0; // plivo: when the first chunk of the reply went out
  let plivoUnmute: ReturnType<typeof setTimeout> | null = null;

  const sendPayload = (payloadB64: string) => {
    if (TELEPHONY === 'plivo') {
      const bytes = Buffer.from(payloadB64, 'base64').length;
      if (!replyStartedAt) replyStartedAt = Date.now();
      replyBytes += bytes;
      ws.send(JSON.stringify({
        event: 'playAudio',
        media: { contentType: 'audio/x-mulaw', sampleRate: 8000, payload: payloadB64 },
      }));
    } else {
      ws.send(JSON.stringify({ event: 'media', streamSid, media: { payload: payloadB64 } }));
    }
  };

  // Called after the LAST chunk of a reply. Twilio: a mark that echoes back
  // when playback reaches it. Plivo: schedule the unmute from audio length.
  const finishReply = () => {
    if (TELEPHONY === 'plivo') {
      const playbackMs = replyBytes / 8; // 8000 samples/s, 1 byte each
      const elapsed = replyStartedAt ? Date.now() - replyStartedAt : 0;
      const waitMs = Math.max(0, playbackMs - elapsed) + 300;
      if (plivoUnmute) clearTimeout(plivoUnmute);
      plivoUnmute = setTimeout(() => onPlaybackDone(), waitMs);
      replyBytes = 0;
      replyStartedAt = 0;
    } else {
      ws.send(JSON.stringify({ event: 'mark', streamSid, mark: { name: `turn-${turn}` } }));
    }
  };

  const onPlaybackDone = () => {
    speaking = false;
    speechEndAt = 0;
    lastPartial = '';
    console.log('listening…');
  };

  const sendAudio = (pcm: Int16Array, last: boolean) => {
    sendPayload(Buffer.from(mulawEncode(pcm)).toString('base64'));
    if (last) finishReply();
  };

  // One in-flight speculative LLM run per turn.
  // Deltas buffer in memory until the final transcript confirms the
  // speculative prompt; only then do they flow to TTS. A wrong speculation
  // is aborted before any audio exists.
  type LlmRun = {
    promptText: string;
    controller: AbortController;
    deltas: string[];
    pending: string;
    committed: boolean;
    full: Promise<string>;
  };
  let speculative: LlmRun | null = null;
  let ttsSession: TtsSession | null = null;

  // Sarvam's TTS socket 400s on text without at least one letter (the LLM's
  // first delta is often a bare newline, and punctuation can split into its
  // own delta), so deltas accumulate until a real letter is present; leading
  // whitespace and punctuation ride along with the next words.
  const drainToTts = (run: LlmRun) => {
    while (run.deltas.length) run.pending += run.deltas.shift();
    if (/\p{L}/u.test(run.pending)) {
      ttsSession?.sendText(run.pending);
      run.pending = '';
    }
  };

  const startLlm = (promptText: string): LlmRun => {
    const controller = new AbortController();
    const messages = [...history, { role: 'user' as const, content: promptText }];
    const run: LlmRun = {
      promptText,
      controller,
      deltas: [],
      pending: '',
      committed: false,
      full: Promise.resolve(''),
    };
    run.full = chatSarvamStream(messages, (delta) => {
      run.deltas.push(delta);
      if (run.committed) drainToTts(run);
    }, controller.signal).catch((e) => {
      if (!controller.signal.aborted) console.error('llm failed:', e);
      return '';
    });
    return run;
  };

  const runTurn = async (finalText: string) => {
    processing = true;
    try {
      // Instant acknowledgment: the caller hears "जी," within ~300 ms of
      // finishing, while the real reply is still generating.
      speaking = true;
      const filler = (await fillerAudio)[turn % FILLER_TEXTS.length];
      sendAudio(filler, false);
      console.log(`filler played at ${Date.now() - speechEndAt} ms`);

      // Keep the speculative run if its prompt matches the final transcript.
      let run = speculative;
      speculative = null;
      let speculationHit = false;
      if (run && normalize(run.promptText) === normalize(finalText)) {
        speculationHit = true;
      } else {
        run?.controller.abort();
        run = startLlm(finalText);
      }

      // The TTS socket opens lazily (~160 ms) and reopens if the previous one
      // idled out or errored between turns.
      if (!ttsSession || !ttsSession.isOpen()) ttsSession = await openTtsSession();

      let firstAudioAt = 0;
      let ttsDone!: () => void;
      const ttsFinal = new Promise<void>((resolve) => { ttsDone = resolve; });
      ttsSession.setHandlers({
        onAudio: (mulawB64) => {
          if (!firstAudioAt) {
            firstAudioAt = Date.now();
            speaking = true;
            const totalMs = firstAudioAt - speechEndAt;
            turnLatencies.push(totalMs);
            console.log(
              `TURN ${turn} latency: ${totalMs} ms ${totalMs <= LATENCY_BUDGET_MS ? 'PASS' : 'FAIL'} `
              + `(speculation ${speculationHit ? 'hit' : 'miss'}; budget ${LATENCY_BUDGET_MS})`,
            );
          }
          // Sarvam's mulaw/8k chunks forward to the carrier byte-for-byte.
          sendPayload(mulawB64);
        },
        onFinal: () => ttsDone(),
      });

      // Release the buffered speculative deltas, then pipe live ones.
      run.committed = true;
      drainToTts(run);

      const fullReply = await run.full;
      if (!fullReply) { finishReply(); processing = false; return; } // unmute past the filler
      ttsSession.flush();

      history.push({ role: 'user', content: finalText });
      history.push({ role: 'assistant', content: fullReply });
      console.log(`heard: "${finalText}"`);
      console.log(`reply: "${fullReply}"`);

      await ttsFinal; // all audio chunks forwarded
      finishReply();
      turn += 1;
    } catch (e) {
      console.error('turn failed:', e);
      speaking = false;
    } finally {
      processing = false;
    }
  };

  const sttEvents = {
    onPartial: (text: string) => { lastPartial = text; },
    onSpeechEnd: () => {
      if (speaking || processing) return;
      speechEndAt = Date.now();
      // Partials keep landing for ~100 ms after speech_end and the final is
      // almost always identical to the LAST of them — so wait 80 ms, then
      // speculate exactly once on the settled partial. Restarting on every
      // partial churn pays the LLM's startup cost repeatedly and loses the
      // whole head start (measured, not theory).
      setTimeout(() => {
        if (speaking || processing || !speechEndAt) return;
        if (lastPartial.trim()) {
          speculative?.controller.abort();
          speculative = startLlm(lastPartial.trim());
        }
      }, 80);
    },
    onFinal: (text: string) => {
      if (speaking || processing) return;
      if (!text.trim()) { speculative?.controller.abort(); speculative = null; return; }
      if (!speechEndAt) speechEndAt = Date.now();
      void runTurn(text.trim());
      lastPartial = '';
    },
  };

  // The STT backend occasionally drops the socket mid-call (seen live:
  // "Backend: INTERNAL"). Utterances are independent, so a fresh session
  // resumes the call transparently.
  let callOver = false;
  let stt = openSttSession(sttEvents);
  const attachSttReconnect = () => {
    stt.on('close', () => {
      if (callOver) return;
      console.log('stt session dropped — reconnecting…');
      stt = openSttSession(sttEvents);
      attachSttReconnect();
    });
  };
  attachSttReconnect();

  ws.on('message', async (raw) => {
    const msg = JSON.parse(String(raw)) as MediaMsg;

    if (msg.event === 'start' && msg.start) {
      streamSid = msg.start.streamSid ?? msg.start.streamId ?? '';
      console.log(`stream started (${TELEPHONY}): ${streamSid}`);
      history.push({ role: 'assistant', content: GREETING });
      try {
        // Synthesized while the phone was still ringing — plays immediately.
        speaking = true;
        // A breath before speaking: wait for the caller to bring the phone
        // to their ear, and lead with a beat of silence so the carrier's
        // audio ramp cannot clip the first syllable.
        const greetingPcm = await greetingAudio;
        await new Promise((resolve) => setTimeout(resolve, 500));
        const lead = new Int16Array(1920); // 240 ms of silence at 8 kHz
        const padded = new Int16Array(lead.length + greetingPcm.length);
        padded.set(greetingPcm, lead.length);
        sendAudio(padded, true);
      } catch (e) {
        console.error('greeting failed:', e);
        speaking = false;
      }
      setTimeout(() => ws.close(), MAX_CALL_MS);
      return;
    }

    if (msg.event === 'mark') {
      onPlaybackDone(); // twilio echoes the mark when playback finishes
      return;
    }

    if (msg.event === 'media' && msg.media && !speaking && !processing) {
      // Twilio's payload is already base64 mulaw/8k — Sarvam takes it raw.
      if (stt.readyState === WebSocket.OPEN) {
        stt.send(JSON.stringify({ event: 'audio_input', audio: msg.media.payload }));
      }
      return;
    }

    if (msg.event === 'stop') {
      console.log('stream stopped — call over. Transcript:');
      const lines = history.slice(1).map((m) => `${m.role}: ${m.content}`);
      for (const line of lines) console.log(`  ${line}`);
      mkdirSync(TRANSCRIPT_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = join(TRANSCRIPT_DIR, `${stamp}.txt`);
      writeFileSync(file, [
        `call to ${TO_NUMBER} — ${new Date().toISOString()}`,
        `models: stt=${STT_MODEL} llm=${LLM_MODEL} tts=${TTS_MODEL}/${TTS_SPEAKER}`,
        `turn latencies (ms): ${turnLatencies.join(', ') || 'none measured'}`,
        '',
        ...lines,
        '',
      ].join('\n'));
      console.log(`transcript saved: ${file}`);
      try {
        callOver = true;
        stt.send(JSON.stringify({ event: 'end' }));
        stt.close();
        ttsSession?.close();
      } catch { /* closing anyway */ }
      process.exit(0);
    }
  });
}

// ---------- server + outbound call ----------

const wsMediaUrl = `${PUBLIC_URL.replace(/^http/, 'ws')}/media`;

const server = createServer((req, res) => {
  if (req.url === '/twiml') {
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${wsMediaUrl}" /></Connect></Response>`);
    return;
  }
  if (req.url?.startsWith('/plivo-answer')) {
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="UTF-8"?><Response><Stream keepCallAlive="true" bidirectional="true" contentType="audio/x-mulaw;rate=8000">${wsMediaUrl}</Stream></Response>`);
    return;
  }
  res.writeHead(200).end('voice spike up');
});

const wss = new WebSocketServer({ server, path: '/media' });
wss.on('connection', handleStream);

async function dialTwilio(): Promise<string> {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Calls.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: TO_NUMBER, From: TWILIO_FROM, Url: `${PUBLIC_URL}/twiml` }),
  });
  if (!res.ok) throw new Error(`Twilio call failed ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { sid: string }).sid;
}

async function dialPlivo(): Promise<string> {
  const res = await fetch(`https://api.plivo.com/v1/Account/${PLIVO_AUTH_ID}/Call/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${PLIVO_AUTH_ID}:${PLIVO_AUTH_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: TO_NUMBER.replace(/^\+/, ''),
      from: PLIVO_FROM.replace(/^\+/, ''),
      answer_url: `${PUBLIC_URL}/plivo-answer`,
      answer_method: 'GET',
    }),
  });
  if (!res.ok) throw new Error(`Plivo call failed ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { request_uuid?: string; message?: string };
  return data.request_uuid ?? data.message ?? 'queued';
}

server.listen(PORT, async () => {
  console.log(`spike server on :${PORT}, public: ${PUBLIC_URL}, telephony: ${TELEPHONY}`);
  try {
    const id = TELEPHONY === 'plivo' ? await dialPlivo() : await dialTwilio();
    console.log(`dialing ${TO_NUMBER} via ${TELEPHONY} — ${id}. Answer your phone.`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
});
