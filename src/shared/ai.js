/**
 * AI summarizer / simplifier for "Ipaliwanag Mo".
 *
 * Three providers, selected in config.js:
 *   • 'mock'   → canned, offline demo output. No key. UI is fully usable.
 *   • 'gemini' → calls Gemini directly (demo only; exposes the key in-browser).
 *   • 'proxy'  → POSTs to YOUR backend, which holds the key (recommended).
 *
 * Swap providers by editing config.js or window.GABAI_CONFIG — no code change
 * needed here. See private/implementation-plan.md for a reference proxy.
 */
import { config } from './config.js';

const GRADE_LABEL = {
  '4-6': 'Grades 4 to 6 (around 10 years old)',
  '7-9': 'Grades 7 to 9 (around 13 years old)',
  '10-12': 'Grades 10 to 12 (around 16 years old)',
};

const LANG_LABEL = { en: 'simple English', fil: 'simple Filipino (Tagalog)' };

/** Build the instruction prompt shared by every cloud provider. */
export function buildPrompt(text, { lang = 'en', grade = '7-9' } = {}) {
  return [
    `You are a patient Filipino teacher helping a student who struggles with reading.`,
    `Rewrite and summarize the text below in ${LANG_LABEL[lang] || 'simple English'},`,
    `suitable for a student in ${GRADE_LABEL[grade] || GRADE_LABEL['7-9']}.`,
    `Rules: use short sentences and everyday words; keep the meaning faithful;`,
    `do not add new facts; if the text is in another language, translate it.`,
    `Return only the simplified explanation.`,
    ``,
    `TEXT:`,
    text,
  ].join('\n');
}

/**
 * Summarize/simplify text.
 * @returns {Promise<{ text: string, provider: string, demo: boolean }>}
 */
export async function summarize(text, opts = {}) {
  const provider = config.aiProvider;
  if (provider === 'gemini' && config.geminiApiKey) return geminiSummarize(text, opts);
  if (provider === 'proxy') return proxySummarize(text, opts);
  return mockSummarize(text, opts);
}

async function geminiSummarize(text, opts) {
  const url =
    `${config.geminiEndpoint}/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(text, opts) }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const out =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').trim() || '';
  return { text: out, provider: 'gemini', demo: false };
}

async function proxySummarize(text, opts) {
  // Your backend decides the model + holds the key. Expected response: { text }.
  const res = await fetch(config.aiProxyEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, ...opts, prompt: buildPrompt(text, opts) }),
  });
  if (!res.ok) throw new Error(`Summarizer proxy error ${res.status}`);
  const data = await res.json();
  return { text: (data.text || '').trim(), provider: 'proxy', demo: false };
}

function mockSummarize(text, opts) {
  const lang = opts.lang === 'fil' ? 'fil' : 'en';
  const first = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/).slice(0, 2).join(' ');
  const body =
    lang === 'fil'
      ? `[DEMO] Walang naka-set na AI key, kaya halimbawa lang ito.\n\nSa madaling salita: ${first}`
      : `[DEMO] No AI key is set, so this is a placeholder.\n\nIn short: ${first}`;
  // Tiny delay so the loading state is visible while testing.
  return new Promise((r) => setTimeout(() => r({ text: body, provider: 'mock', demo: true }), 450));
}
