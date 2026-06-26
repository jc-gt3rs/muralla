/**
 * GabAI-Basa — Gemini proxy server.
 *
 * Keeps the API key server-side so it never ships to the browser.
 * Run with:  GEMINI_KEY=your_key node api/server.js
 * Or:        cp api/.env.example api/.env  → fill in key → node api/server.js
 *
 * nginx forwards /api/* to http://localhost:3001 — see api/nginx.snippet.
 */

import express from 'express';
import { createServer } from 'node:http';

const PORT = process.env.PORT || 3001;
const GEMINI_KEY = process.env.GEMINI_KEY || '';
// The reliably-available model. (Add more here to fall back through them.)
const GEMINI_MODELS = ['gemini-2.5-flash'];
const geminiUrl = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const GOOGLE_TTS_KEY = process.env.GOOGLE_TTS_KEY || '';
const TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Transient statuses worth retrying (overload / rate limit / Google hiccup).
const RETRYABLE = new Set([429, 500, 502, 503]);
// How many full sweeps through every model before giving up, and the pause
// after each sweep. Total worst case ≈ sum(delays) + request time (~25s),
// which stays under the nginx proxy timeout while sparing the user from
// having to click again. Non-transient errors (e.g. 400) fail fast.
const MAX_ROUNDS = 6;
const ROUND_DELAY_MS = [800, 1500, 2500, 3500, 5000, 5000];

/**
 * Call Gemini, cycling through every model and retrying transient overloads
 * (429 / 503 UNAVAILABLE) with backoff. Only throws once all models have
 * failed across all rounds, or on a non-transient error.
 * @returns {Promise<string>} the generated text
 * @throws {Error & { status: number }} when retries are exhausted
 */
async function callGemini(prompt, generationConfig) {
  let last = { status: 502, msg: 'no response' };
  for (let round = 0; round < MAX_ROUNDS; round++) {
    for (const model of GEMINI_MODELS) {
      const r = await fetch(`${geminiUrl(model)}?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig }),
      });
      if (r.ok) {
        const data = await r.json();
        return data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').trim() ?? '';
      }
      last = { status: r.status, msg: await r.text() };
      console.error(`Gemini ${model} error (round ${round + 1}):`, r.status, last.msg);
      // A non-transient error won't fix itself — stop immediately.
      if (!RETRYABLE.has(r.status)) {
        const err = new Error(`Gemini failed: ${r.status} ${last.msg}`);
        err.status = r.status;
        throw err;
      }
    }
    if (round < MAX_ROUNDS - 1) await sleep(ROUND_DELAY_MS[round] ?? 5000); // pause before next sweep
  }
  const err = new Error(`Gemini unavailable after ${MAX_ROUNDS} rounds: ${last.status} ${last.msg}`);
  err.status = last.status;
  throw err;
}

// Allow requests only from our own domain (change if needed).
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://muralla.didthat.lol';

if (!GEMINI_KEY) {
  console.error('ERROR: GEMINI_KEY environment variable is not set.');
  console.error('Run:  GEMINI_KEY=your_key node api/server.js');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '64kb' }));

// Basic CORS — only our own front-end can call this.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.post('/api/summarize', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing prompt.' });
  }
  try {
    const text = await callGemini(prompt, { temperature: 0.3, maxOutputTokens: 4000 });
    res.json({ text });
  } catch (err) {
    console.error('Summarize failed:', err.message);
    const overloaded = err.status === 429 || err.status === 503;
    res.status(overloaded ? 503 : 502).json({
      error: overloaded
        ? 'The AI is busy right now. Please try again in a moment.'
        : 'Could not reach the AI. Please try again.',
    });
  }
});

app.post('/api/tts', async (req, res) => {
  if (!GOOGLE_TTS_KEY) {
    return res.status(500).json({ error: 'TTS key not configured on server.' });
  }
  try {
    const r = await fetch(`${TTS_URL}?key=${GOOGLE_TTS_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    if (!r.ok) {
      const msg = await r.text();
      console.error('TTS error:', r.status, msg);
      return res.status(502).json({ error: `TTS returned ${r.status}` });
    }
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error('TTS fetch failed:', err);
    res.status(500).json({ error: 'TTS proxy error. Check server logs.' });
  }
});

app.post('/api/simplify-sentence', async (req, res) => {
  const { sentence, lang } = req.body;
  if (!sentence || typeof sentence !== 'string') {
    return res.status(400).json({ error: 'Missing sentence.' });
  }
  const langLabel = lang === 'fil' ? 'Filipino (Tagalog)' : 'English';
  const prompt = `You are helping a young Filipino student practice reading.
Shorten this sentence to exactly 5 words or fewer in ${langLabel}.
Keep the core meaning. Return ONLY the shortened sentence with no explanation, quotes, or extra punctuation.

Sentence: ${sentence}`;
  try {
    const text = await callGemini(prompt, { temperature: 0.2, maxOutputTokens: 60 });
    res.json({ text: text || sentence });
  } catch (err) {
    console.error('Simplify failed:', err.message);
    res.status(502).json({ error: 'Proxy error.', fallback: sentence });
  }
});

// Health check — nginx can ping this to confirm the process is up.
app.get('/api/health', (_req, res) => res.json({ ok: true }));

createServer(app).listen(PORT, '127.0.0.1', () => {
  console.log(`GabAI proxy listening on 127.0.0.1:${PORT}`);
});
