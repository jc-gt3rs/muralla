import { config } from './config.js';

export const ttsSupported = true;
export function hasVoiceFor() { return true; }

let activeAudio = null;

export function speak(text, opts = {}) {
  cancel();
  return googleSpeak(text, opts);
}

async function googleSpeak(text, { lang = 'en-US', rate = 1, pitch = 1, onstart, onend, onerror } = {}) {
  try {
    const body = {
      input: { text },
      voice: { languageCode: lang, ssmlGender: 'NEUTRAL' },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: Math.max(0.25, Math.min(rate, 4)),
        pitch: (pitch - 1) * 4,
      },
    };
    const res = await fetch(`${config.googleTtsEndpoint}?key=${config.googleTtsApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Google TTS ${res.status}`);
    const data = await res.json();
    const audio = new Audio('data:audio/mp3;base64,' + data.audioContent);
    activeAudio = audio;
    audio.onplay = () => onstart && onstart();
    audio.onended = () => { activeAudio = null; onend && onend(); };
    audio.onerror = () => onerror && onerror(new Error('Audio playback failed'));
    await audio.play();
  } catch (err) {
    onerror && onerror(err);
  }
  return { cancel };
}

export function cancel() {
  if (activeAudio) { activeAudio.pause(); activeAudio = null; }
}
