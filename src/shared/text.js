/** Text utilities shared across tools: tokenizing, normalizing, fuzzy match. */

/** Split a block of text into trimmed sentences (keeps terminal punctuation). */
export function splitSentences(text) {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const parts = cleaned.match(/[^.!?…]+[.!?…]+|\S[^.!?…]*$/g);
  return parts ? parts.map((s) => s.trim()).filter(Boolean) : [cleaned];
}

/** Split text into words (whitespace-delimited, punctuation kept on the token). */
export function splitWords(text) {
  return (text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
}

/** Lowercase + strip accents/punctuation for comparison. */
export function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Classic Levenshtein edit distance. */
export function levenshtein(a, b) {
  a = a || '';
  b = b || '';
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    let curr = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      curr[j + 1] = Math.min(curr[j] + 1, prev[j + 1] + 1, prev[j] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Similarity in [0,1] between two already-normalized keys. 1 = identical. */
function simKeys(na, nb) {
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  const d = levenshtein(na, nb);
  return 1 - d / Math.max(na.length, nb.length);
}

/** Similarity in [0,1] using normalized edit distance. 1 = identical. */
export function similarity(a, b) {
  return simKeys(normalize(a), normalize(b));
}

/**
 * Collapse a word to a rough phonetic key so accent/spelling variants that
 * SOUND alike score as matches. Tuned for the sound systems shared by English
 * and Filipino learners (b/v, p/f, c/k/s, doubled letters, etc.). The same
 * transform is applied to both target and heard text, so it only ever widens
 * tolerance — it never invents a match between genuinely different sounds.
 */
function phoneticKey(s) {
  let x = normalize(s);
  if (!x) return '';
  x = x
    .replace(/ph/g, 'f')
    .replace(/qu/g, 'kw')
    .replace(/q/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/ch/g, 'ts')           // Filipino 'ch' ≈ 'ts'
    .replace(/c([eiy])/g, 's$1')    // soft c
    .replace(/c/g, 'k')             // hard c
    .replace(/z/g, 's')
    .replace(/v/g, 'b')             // Filipino b/v interchange
    .replace(/f/g, 'p')             // Filipino p/f interchange
    .replace(/(.)\1+/g, '$1');      // collapse doubled letters
  return x;
}

/**
 * Best similarity in [0,1] of a target word against one or more heard
 * transcripts. Considers each transcript, its trailing word, and a phonetic
 * key — taking the most favourable match so accents and ASR noise are forgiven.
 * @param {string} target
 * @param {string|string[]} heard  single transcript or list of alternatives
 */
export function pronunciationScore(target, heard) {
  const candidates = Array.isArray(heard) ? heard : [heard];
  const tNorm = normalize(target);
  const tPhon = phoneticKey(target);
  let best = 0;
  for (const c of candidates) {
    if (!c) continue;
    const variants = new Set([c, c.split(/\s+/).pop()]);
    for (const v of variants) {
      if (!v) continue;
      const direct = simKeys(tNorm, normalize(v));
      const phon = simKeys(tPhon, phoneticKey(v));
      best = Math.max(best, direct, phon);
      if (best >= 1) return 1;
    }
  }
  return best;
}

/**
 * Grade a spoken word against a target.
 * `heard` may be a single transcript or an array of ASR alternatives.
 * → 'correct' | 'close' | 'wrong'
 */
export function gradePronunciation(target, heard) {
  const sim = pronunciationScore(target, heard);
  if (sim >= 0.85) return 'correct';
  if (sim >= 0.5) return 'close';
  return 'wrong';
}
