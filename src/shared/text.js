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

/** Similarity in [0,1] using normalized edit distance. 1 = identical. */
export function similarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  const d = levenshtein(na, nb);
  return 1 - d / Math.max(na.length, nb.length);
}

/**
 * Grade a spoken word against a target.
 * → 'correct' | 'close' | 'wrong'
 */
export function gradePronunciation(target, heard) {
  const sim = similarity(target, heard);
  if (sim >= 0.92) return 'correct';
  if (sim >= 0.6) return 'close';
  return 'wrong';
}
