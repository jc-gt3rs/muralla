/**
 * Dictionary + spelling-suggestion service for "Ano ang Salita".
 *
 * Built for dyslexic spellers: given a rough/phonetic attempt, return the
 * nearest real words with brief definitions. Lookups run through the Gemini
 * proxy (/api/dictionary) so they work for BOTH English and Filipino — the
 * active language is passed in and definitions come back in that language.
 * Results are cached in localStorage (keyed by language) so repeat lookups are
 * instant and offline.
 */

const DICT_ENDPOINT = '/api/dictionary';
const CACHE_KEY = 'gabai.salita.cache.v2';

let cache = loadCache();
function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); }
  catch (_) { return {}; }
}
function saveCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (_) {}
}

/**
 * Return up to `max` nearest-word suggestions for a (possibly misspelled) query
 * in the given language ('en' | 'fil').
 * Each: { word, pos, phonetic, definition }
 */
export async function suggestWords(query, max = 3, lang = 'en') {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  const key = `${lang}:${q}`;
  if (cache[key]) return cache[key].slice(0, max);

  const res = await fetch(DICT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, lang }),
  });
  if (!res.ok) throw new Error(`Dictionary request failed: ${res.status}`);
  const data = await res.json();

  const matches = (Array.isArray(data.matches) ? data.matches : [])
    .map((m) => ({
      word: (m.word || '').trim(),
      pos: (m.pos || '').trim(),
      phonetic: (m.phonetic || '').trim(),
      definition: (m.definition || '').trim() || 'No definition found.',
    }))
    .filter((m) => m.word);

  cache[key] = matches;
  saveCache();
  return matches.slice(0, max);
}
