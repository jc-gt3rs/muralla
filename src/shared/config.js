/**
 * GabAI-Basa — central configuration.
 *
 * This is the ONLY place you need to touch to enable cloud features.
 * Everything works out of the box with free, key-less, browser-native
 * engines. Add keys here (or via a gitignored runtime override) only
 * when you want the higher-quality cloud paths.
 *
 * ──────────────────────────────────────────────────────────────────
 * HOW TO ADD KEYS (two options)
 * ──────────────────────────────────────────────────────────────────
 * Option A — quick/local demo (NOT for public production):
 *   1. Create `config.local.js` at the project root (already gitignored).
 *   2. Put:  window.GABAI_CONFIG = { aiProvider: 'gemini', geminiApiKey: 'XXXX' };
 *   3. Add  <script src="/config.local.js"></script>  BEFORE the module
 *      script in each tool's index.html.
 *   The values below get overridden by window.GABAI_CONFIG at runtime.
 *
 * Option B — production (recommended; keeps keys server-side):
 *   Set `aiProvider: 'proxy'` and point `aiProxyEndpoint` at your own
 *   serverless function (e.g. a Vercel/Express route) that holds the key
 *   and forwards the request to Gemini. The browser never sees the key.
 *   A ready-to-use reference proxy is described in
 *   private/implementation-plan.md.
 */

const defaults = {
  // ── Text-to-Speech (Basahin, Samahan) ───────────────────────────
  // 'browser' → Web Speech API. Works now, no key, zero bandwidth.
  // 'google'  → Google Cloud TTS. Higher-quality Filipino voice; needs a key.
  ttsProvider: 'google',
  googleTtsApiKey: 'proxy',                  // ← set to 'proxy' to satisfy ttsCloudReady, key is on server
  googleTtsEndpoint: '/api/tts',             // ← use proxy instead of calling Google directly

  // ── AI Summarizer (Ipaliwanag) ──────────────────────────────────
  // 'mock'   → canned demo output. Works now, no key. UI fully testable.
  // 'gemini' → call Gemini directly from the browser (demo only — exposes key).
  // 'proxy'  → call YOUR backend, which holds the key (recommended).
  aiProvider: 'proxy',
  geminiApiKey: '',                          // unused in proxy mode — key lives in api/.env on the server
  geminiModel: 'gemini-2.5-flash',
  geminiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
  aiProxyEndpoint: '/api/summarize',         // ← your serverless route (proxy mode)

  // ── Languages ───────────────────────────────────────────────────
  languages: {
    en:  { label: 'English',  speechLang: 'en-US',  asrLang: 'en-US'  },
    fil: { label: 'Filipino', speechLang: 'fil-PH', asrLang: 'fil-PH' },
  },

  // Demo input cap (Gemini Flash rate-limit safety). Raise freely in prod.
  summarizerMaxChars: 3000,
};

// Runtime overrides (config.local.js / inline <script>) win over defaults.
const overrides = (typeof window !== 'undefined' && window.GABAI_CONFIG) || {};

export const config = { ...defaults, ...overrides };

/** True when a usable cloud path is configured for a feature. */
export const ttsCloudReady = () =>
  config.ttsProvider === 'google' && !!config.googleTtsApiKey;

export const aiReady = () =>
  (config.aiProvider === 'gemini' && !!config.geminiApiKey) ||
  config.aiProvider === 'proxy';
