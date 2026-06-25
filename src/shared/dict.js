/**
 * Dictionary + spelling-suggestion service for "Ano ang Salita".
 *
 * Built for dyslexic spellers: given a rough/phonetic attempt, return the
 * nearest real words with brief definitions. Uses two free, key-less APIs:
 *   • Datamuse  (api.datamuse.com) — "spelled like" + "sounds like" + inline defs
 *   • dictionaryapi.dev            — fallback definition + IPA phonetics
 * Results are cached in localStorage so repeat lookups are instant + offline.
 */
import { levenshtein, normalize } from './text.js';

const DATAMUSE = 'https://api.datamuse.com/words';
const DICT = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const CACHE_KEY = 'gabai.salita.cache.v1';

let cache = loadCache();
function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); }
  catch (_) { return {}; }
}
function saveCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (_) {}
}

/**
 * Return up to `max` nearest-word suggestions for a (possibly misspelled) query.
 * Each: { word, pos, phonetic, definition }
 */
export async function suggestWords(query, max = 3) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  if (cache[q]) return cache[q].slice(0, max);

  const [spelled, sounds] = await Promise.all([
    fetchJSON(`${DATAMUSE}?sp=${encodeURIComponent(q)}&md=dp&max=12`),
    fetchJSON(`${DATAMUSE}?sl=${encodeURIComponent(q)}&md=dp&max=12`),
  ]);

  // Merge + dedupe, preferring entries we saw in the "spelled like" set.
  const seen = new Map();
  for (const w of [...(spelled || []), ...(sounds || [])]) {
    if (!w.word || seen.has(w.word)) continue;
    seen.set(w.word, w);
  }

  // Rank by spelling closeness to the query (dyslexia: keep it forgiving).
  const ranked = [...seen.values()].sort(
    (a, b) => levenshtein(normalize(q), normalize(a.word)) - levenshtein(normalize(q), normalize(b.word)),
  );

  const top = ranked.slice(0, max);
  const results = await Promise.all(top.map(toResult));
  cache[q] = results;
  saveCache();
  return results;
}

async function toResult(entry) {
  const word = entry.word;
  let pos = '';
  let definition = '';
  let phonetic = '';

  // Datamuse `md=dp` gives part-of-speech tags + definitions inline.
  if (Array.isArray(entry.defs) && entry.defs.length) {
    const [tag, ...rest] = entry.defs[0].split('\t');
    pos = expandPos(tag);
    definition = rest.join(' ').trim();
  }

  // Fill gaps (definition/IPA) from dictionaryapi.dev.
  if (!definition || !phonetic) {
    const dict = await fetchDictionary(word);
    if (dict) {
      phonetic = dict.phonetic || phonetic;
      if (!definition && dict.definition) {
        definition = dict.definition;
        pos = pos || dict.pos;
      }
    }
  }

  return { word, pos, phonetic, definition: definition || 'No definition found.' };
}

async function fetchDictionary(word) {
  try {
    const data = await fetchJSON(`${DICT}${encodeURIComponent(word)}`);
    if (!Array.isArray(data) || !data.length) return null;
    const entry = data[0];
    const phonetic =
      entry.phonetic || (entry.phonetics || []).map((p) => p.text).find(Boolean) || '';
    const meaning = (entry.meanings || [])[0];
    return {
      phonetic,
      pos: meaning ? meaning.partOfSpeech : '',
      definition: meaning && meaning.definitions[0] ? meaning.definitions[0].definition : '',
    };
  } catch (_) {
    return null;
  }
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function expandPos(tag) {
  return { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb', u: '' }[tag] || '';
}
