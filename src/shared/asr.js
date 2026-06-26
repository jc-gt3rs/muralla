/**
 * Speech recognition (pronunciation capture) for Samahan Mo Ako.
 *
 * Uses the browser-native Web Speech API `SpeechRecognition`. Runs on-device —
 * no audio leaves the phone. Filipino recognition support varies by browser, so
 * we try a chain of language codes (fil-PH → tl-PH → en-PH) and fall through to
 * the next when the engine reports the language is unavailable. Every session
 * returns ALL alternative transcripts so the caller can grade against the best
 * match rather than just the engine's top guess.
 */

const SR =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export const asrSupported = !!SR;

/**
 * Ordered language codes to try for a requested BCP-47 tag.
 * Filipino has spotty support, so we degrade gracefully.
 */
function langCandidates(lang) {
  const l = (lang || 'en-US').toLowerCase();
  if (l.startsWith('fil') || l.startsWith('tl')) return ['fil-PH', 'tl-PH', 'en-PH'];
  if (l.startsWith('en')) return [lang || 'en-US'];
  return [lang];
}

/**
 * Listen for a single spoken word/phrase.
 * Returns a handle: { stop() }.
 * opts: { lang, onresult(bestTranscript, allTranscripts[]), onerror(err), onend(), timeoutMs }
 */
export function listenOnce(opts = {}) {
  const { lang = 'en-US', onresult, onerror, onend, timeoutMs = 8000 } = opts;
  if (!SR) {
    onerror && onerror(new Error('SpeechRecognition not supported'));
    return { stop() {} };
  }

  const candidates = langCandidates(lang);
  let candidateIdx = 0;
  let finished = false;
  let timer = null;
  let rec = null;

  const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimer();
    onend && onend();
  };

  function startWith(langCode) {
    const myRec = new SR();
    myRec._dead = false;
    rec = myRec;
    myRec.lang = langCode;
    myRec.interimResults = false;
    myRec.maxAlternatives = 6;
    myRec.continuous = false;

    myRec.onresult = (e) => {
      const result = e.results[0];
      const alts = [];
      for (let i = 0; i < result.length; i++) {
        const t = ((result[i] && result[i].transcript) || '').trim();
        if (t) alts.push(t);
      }
      onresult && onresult(alts[0] || '', alts);
    };

    myRec.onerror = (e) => {
      // The requested language isn't available — fall through to the next.
      if (e.error === 'language-not-supported' && candidateIdx < candidates.length - 1) {
        candidateIdx++;
        myRec._dead = true;
        try { myRec.abort(); } catch (_) {}
        startWith(candidates[candidateIdx]);
        return;
      }
      // 'no-speech' / 'aborted' are expected; let onend close the session.
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        onerror && onerror(e);
      }
    };

    myRec.onend = () => {
      if (myRec._dead) return; // superseded by a language retry
      finish();
    };

    try {
      myRec.start();
    } catch (err) {
      onerror && onerror(err);
    }
  }

  startWith(candidates[candidateIdx]);
  // Safety net: stop a session that never returns so it doesn't hang the mic.
  timer = setTimeout(() => { try { rec && rec.stop(); } catch (_) {} }, timeoutMs);

  return {
    stop() {
      clearTimer();
      try { rec && rec.abort(); } catch (_) {}
    },
  };
}
