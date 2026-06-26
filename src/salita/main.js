/**
 * Ano ang Salita — spelling helper + dictionary.
 * Dyslexic spellers often can't reach a word by exact spelling. Type a rough
 * attempt and get the 3 nearest real words, each with a brief definition and
 * a tap-to-hear button. Results cache offline.
 */
import '../shared/app.css';
import { mountShell, el, notice } from '../shared/shell.js';
import { getLangMeta, onLangChange } from '../shared/a11y.js';
import { t } from '../shared/i18n.js';
import { speak } from '../shared/tts.js';
import { suggestWords } from '../shared/dict.js';
import { consumeHandoff } from '../shared/handoff.js';

const { root } = mountShell({
  title: 'Ano ang Salita',
  subtitle: () => t('salita_sub'),
  route: '/salita',
});

// ── Search ────────────────────────────────────────────────────────
const searchPanel = el('div', 'panel');
const form = el('form');
form.setAttribute('role', 'search');
const input = el('input', 'input reading');
input.type = 'text';
input.autocomplete = 'off';
input.autocapitalize = 'off';
input.spellcheck = false;
input.setAttribute('aria-label', 'Word to look up');
const searchBtn = el('button', 'btn btn--primary');
searchBtn.type = 'submit';
const searchRow = el('div', 'btn-row');
searchRow.style.marginTop = '12px';
searchRow.appendChild(searchBtn);
const spellingField = labelled('Your spelling', input);
form.append(spellingField, searchRow);
searchPanel.appendChild(form);

// Re-translate static labels on language change.
function applyStrings() {
  input.placeholder = t('salita_placeholder');
  searchBtn.textContent = t('salita_findBtn');
  const fieldLab = spellingField.querySelector('.field-label');
  if (fieldLab) fieldLab.textContent = t('salita_yourSpelling');
}
applyStrings();
onLangChange(applyStrings);

const status = el('p', 'status');
const results = el('div', 'suggestions');

root.append(searchPanel, status, results);

// ── Logic ─────────────────────────────────────────────────────────
let lastQuery = '';

async function run(e) {
  if (e) e.preventDefault();
  const q = input.value.trim();
  if (!q) { notice(status, t('salita_typeWord'), 'warn'); return; }
  if (q === lastQuery) return;
  lastQuery = q;

  results.innerHTML = '';
  notice(status, t('salita_searching'), 'info');
  searchBtn.disabled = true;
  try {
    const matches = await suggestWords(q, 3);
    if (!matches.length) { notice(status, t('salita_noMatch', { q }), 'warn'); return; }
    notice(status, `Closest words to “${q}”:`, 'success');
    matches.forEach((m) => results.appendChild(renderCard(m)));
  } catch (err) {
    notice(status, 'Could not search right now. Check your connection and try again.', 'error');
  } finally {
    searchBtn.disabled = false;
  }
}

function renderCard(m) {
  const card = el('div', 'word-card');
  const head = el('div', 'word-card__head');
  const word = el('span', 'word-card__word reading');
  word.textContent = m.word;
  head.appendChild(word);
  if (m.phonetic) {
    const phon = el('span', 'word-card__phon');
    phon.textContent = m.phonetic;
    head.appendChild(phon);
  }
  if (m.pos) {
    const pos = el('span', 'word-card__pos');
    pos.textContent = m.pos;
    head.appendChild(pos);
  }
  const speakBtn = el('button', 'btn btn--ghost word-card__speak');
  speakBtn.innerHTML = '🔊';
  speakBtn.setAttribute('aria-label', `Hear “${m.word}”`);
  speakBtn.style.minHeight = '40px';
  speakBtn.style.padding = '8px 14px';
  speakBtn.addEventListener('click', () => {
    const meta = getLangMeta();
    speak(m.word, { lang: meta.speechLang, rate: 0.85 });
  });
  head.appendChild(speakBtn);

  const def = el('p', 'word-card__def reading');
  def.textContent = m.definition;

  card.append(head, def);
  return card;
}

function labelled(text, node) {
  const wrap = el('div');
  const lab = el('label', 'field-label');
  lab.textContent = text;
  wrap.append(lab, node);
  return wrap;
}

form.addEventListener('submit', run);
input.focus();

// Prefill from the landing hero. Salita looks up a single word, so take the
// first word of whatever came over, then search automatically.
const handoff = consumeHandoff('salita');
if (handoff && handoff.text) {
  const firstWord = handoff.text.trim().split(/\s+/)[0] || '';
  if (firstWord) {
    input.value = firstWord;
    run();
  }
}
