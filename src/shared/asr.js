/**
 * Speech recognition (pronunciation capture) for Samahan Mo Ako.
 *
 * Uses the browser-native Web Speech API `SpeechRecognition`. Runs 100%
 * on-device — no audio ever leaves the phone, zero bandwidth. Only Chrome
 * and Edge implement it reliably; callers should check `asrSupported`
 * and fall back to manual advance when false.
 */

const SR =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export const asrSupported = !!SR;

/**
 * Listen for a single spoken word/phrase.
 * Returns a handle: { stop() }.
 * opts: { lang, onresult(transcript), onerror(err), onend() }
 */
export function listenOnce(opts = {}) {
  const { lang = 'en-US', onresult, onerror, onend } = opts;
  if (!SR) {
    onerror && onerror(new Error('SpeechRecognition not supported'));
    return { stop() {} };
  }
  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = false;
  rec.maxAlternatives = 3;
  rec.continuous = false;

  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    onend && onend();
  };

  rec.onresult = (e) => {
    const alts = e.results[0];
    // Take the best alternative transcript.
    const transcript = (alts[0] && alts[0].transcript) || '';
    onresult && onresult(transcript.trim(), alts);
  };
  rec.onerror = (e) => {
    if (e.error !== 'aborted' && e.error !== 'no-speech') {
      onerror && onerror(e);
    }
  };
  rec.onend = done;

  try {
    rec.start();
  } catch (err) {
    onerror && onerror(err);
  }

  return {
    stop() {
      try {
        rec.abort();
      } catch (_) {}
    },
  };
}
