/**
 * Text-to-Speech abstraction.
 *
 * Default provider is the browser's Web Speech API — free, on-device,
 * zero bandwidth. A Google Cloud TTS path is wired up behind a config
 * flag for higher-quality Filipino voices (add a key in config.js).
 *
 * All callers use the same `speak()` signature regardless of provider.
 */
import { config, ttsCloudReady } from './config.js';

export const ttsSupported =
  typeof window !== 'undefined' && 'speechSynthesis' in window;

let voices = [];
function refreshVoices() {
  if (ttsSupported) voices = window.speechSynthesis.getVoices() || [];
}
if (ttsSupported) {
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}

/** Best available voice for a BCP-47 lang tag, or null. */
function pickVoice(lang) {
  if (!voices.length) refreshVoices();
  const want = lang.toLowerCase();
  const base = want.split('-')[0];
  return (
    voices.find((v) => v.lang.toLowerCase() === want) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ||
    null
  );
}

/** True if the OS actually has a voice for this language. */
export function hasVoiceFor(lang) {
  return !!pickVoice(lang);
}

let activeBrowserUtterance = null;
let activeAudio = null;

/**
 * Speak `text`. Returns a handle: { cancel() }.
 * opts: { lang, rate, pitch, onstart, onend, onerror }
 */
export function speak(text, opts = {}) {
  cancel();
  if (ttsCloudReady()) return googleSpeak(text, opts);
  return browserSpeak(text, opts);
}

function browserSpeak(text, { lang = 'en-US', rate = 1, pitch = 1, onstart, onend, onerror } = {}) {
  if (!ttsSupported) {
    onerror && onerror(new Error('Speech synthesis not supported'));
    return { cancel() {} };
  }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = Math.max(0.1, Math.min(rate, 2));
  u.pitch = Math.max(0, Math.min(pitch, 2));
  const v = pickVoice(lang);
  if (v) u.voice = v;
  u.onstart = () => onstart && onstart();
  u.onend = () => {
    activeBrowserUtterance = null;
    onend && onend();
  };
  u.onerror = (e) => {
    activeBrowserUtterance = null;
    // 'interrupted'/'canceled' are expected when the user navigates words.
    if (e.error && e.error !== 'interrupted' && e.error !== 'canceled') {
      onerror && onerror(e);
    }
  };
  activeBrowserUtterance = u;
  window.speechSynthesis.speak(u);
  return { cancel };
}

  try {
    const body = {
      input: { text },
      voice: { languageCode: lang, ssmlGender: 'NEUTRAL' },
      audioConfig: {
        audioEncoding: 'OGG_OPUS',
        speakingRate: Math.max(0.25, Math.min(rate, 4)),
        pitch: (pitch - 1) * 4, // map 0..2 → -4..+4 semitones
      },
    };
    const res = await fetch(`${config.googleTtsEndpoint}?key=${config.googleTtsApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Google TTS ${res.status}`);
    const data = await res.json();
    const audio = new Audio('data:audio/ogg;base64,' + data.audioContent);
    activeAudio = audio;
    audio.onplay = () => onstart && onstart();
    audio.onended = () => {
      activeAudio = null;
      onend && onend();
    };
    audio.onerror = () => {
      console.warn('Google Cloud TTS audio playback failed, falling back to browser speech synthesis.');
      browserSpeak(text, opts);
    };
    await audio.play();
  } catch (err) {
    onerror && onerror(err);
  }
  return { cancel };
}

/** Stop any in-flight speech immediately. */
export function cancel() {
  if (ttsSupported) window.speechSynthesis.cancel();
  activeBrowserUtterance = null;
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
}
