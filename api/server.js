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
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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
    const r = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
      }),
    });
    if (!r.ok) {
      const msg = await r.text();
      console.error('Gemini error:', r.status, msg);
      return res.status(502).json({ error: `Gemini returned ${r.status}` });
    }
    const data = await r.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').trim() ?? '';
    res.json({ text });
  } catch (err) {
    console.error('Proxy fetch failed:', err);
    res.status(500).json({ error: 'Proxy error. Check server logs.' });
  }
});

// Health check — nginx can ping this to confirm the process is up.
app.get('/api/health', (_req, res) => res.json({ ok: true }));

createServer(app).listen(PORT, '127.0.0.1', () => {
  console.log(`GabAI proxy listening on 127.0.0.1:${PORT}`);
});
