/**
 * Ipaliwanag Mo — AI summarizer / simplifier.
 * Paste a hard passage, pick a grade level, and get a plain-language version
 * in English or Filipino. The active language comes from the shared toggle.
 * Output can be read aloud via the shared TTS engine.
 *
 * Works in DEMO mode with no key. Add a Gemini key (or a proxy) in config.js
 * to get real AI output — no code change needed here.
 */
import '../shared/app.css';
import { mountShell, el, notice } from '../shared/shell.js';
import { getLang, onLangChange } from '../shared/a11y.js';
import { t } from '../shared/i18n.js';
import { speak, cancel } from '../shared/tts.js';
import { summarize } from '../shared/ai.js';
import { config, aiReady } from '../shared/config.js';
import { consumeHandoff } from '../shared/handoff.js';
import { mountUpload } from '../shared/upload.js';

const { root } = mountShell({
  title: 'Ipaliwanag Mo',
  subtitle: () => t('ipaliwanag_sub'),
  route: '/ipaliwanag',
});

const MAX = config.summarizerMaxChars;

// ── Input ─────────────────────────────────────────────────────────
const inputPanel = el('div', 'panel');
const ta = el('textarea', 'textbox reading');
ta.maxLength = MAX;
ta.style.minHeight = '180px';
ta.setAttribute('aria-label', 'Text to simplify');

const counter = el('span', 'char-counter');
const updateCount = () => {
  counter.textContent = `${ta.value.length.toLocaleString()} / ${MAX.toLocaleString()}`;
  counter.classList.toggle('is-over', ta.value.length >= MAX);
};

// Grade level segmented control
const gradeWrap = el('div', 'a11y-group');
const gradeLab = el('span', 'a11y-group__label');
const gradeSeg = el('div', 'segmented');
let grade = '7-9';
[['4-6', 'Grades 4–6'], ['7-9', 'Grades 7–9'], ['10-12', 'Grades 10–12']].forEach(([val, label]) => {
  const b = el('button', 'segmented__btn');
  b.type = 'button';
  b.textContent = label;
  b.setAttribute('aria-pressed', String(val === grade));
  b.addEventListener('click', () => {
    grade = val;
    gradeSeg.querySelectorAll('.segmented__btn').forEach((x) =>
      x.setAttribute('aria-pressed', String(x.textContent === label)),
    );
  });
  gradeSeg.appendChild(b);
});
gradeWrap.append(gradeLab, gradeSeg);

const controls = el('div', 'btn-row');
controls.style.marginTop = '14px';
controls.style.justifyContent = 'space-between';
const runBtn = el('button', 'btn btn--primary');

const uploadBtn = mountUpload(ta, {
  maxChars: MAX,
  onStatus: (msg, kind) => notice(status, msg, kind),
  dropZone: inputPanel,
});

const rightCluster = el('div', 'btn-row');
rightCluster.style.gap = '8px';
rightCluster.append(uploadBtn, runBtn);
controls.append(counter, rightCluster);

// Output language selector (upper-right of the panel) — independent of the
// global EN/FIL toggle. Regional languages fall back to the Filipino voice
// for read-aloud since browsers have no dedicated TTS voice for them.
const OUT_LANGS = [
  { code: 'en', label: 'English', speechLang: 'en-US' },
  { code: 'fil', label: 'Filipino', speechLang: 'fil-PH' },
  { code: 'ceb', label: 'Bisaya', speechLang: 'fil-PH' },
  { code: 'ilo', label: 'Ilocano', speechLang: 'fil-PH' },
  { code: 'hil', label: 'Hiligaynon', speechLang: 'fil-PH' },
];
let outputLang = OUT_LANGS.some((l) => l.code === getLang()) ? getLang() : 'fil';

// Compact dropdown keeps all five languages tidy and sits inline with the
// "Original text" label so it doesn't span the whole panel width.
const outLangLab = el('label', 'lang-select__label');
outLangLab.htmlFor = 'ipaliwanag-outlang';
const outLangSel = el('select', 'lang-select__input');
outLangSel.id = 'ipaliwanag-outlang';
OUT_LANGS.forEach(({ code, label }) => {
  const opt = el('option');
  opt.value = code;
  opt.textContent = label;
  if (code === outputLang) opt.selected = true;
  outLangSel.appendChild(opt);
});
outLangSel.addEventListener('change', () => { outputLang = outLangSel.value; });
const langGroup = el('div', 'lang-select');
langGroup.append(outLangLab, outLangSel);

// "Original text" label on the left, output-language dropdown on the right.
const originalField = el('div');
const origHead = el('div', 'field-head');
const origLabel = el('label', 'field-label');
origHead.append(origLabel, langGroup);
originalField.append(origHead, ta);
inputPanel.append(originalField, gradeWrap, controls);

const status = el('p', 'status');

// ── Output ────────────────────────────────────────────────────────
const outPanel = el('div', 'panel');
outPanel.hidden = true;
const outHead = el('div', 'btn-row');
outHead.style.justifyContent = 'space-between';
const outTitle = el('strong');
const readBtn = el('button', 'btn btn--ghost');
let reading = false;
outHead.append(outTitle, readBtn);
const out = el('div', 'summary-out reading');
outPanel.append(outHead, out);

root.append(inputPanel, status, outPanel);

// ── Logic ─────────────────────────────────────────────────────────
async function run() {
  const text = ta.value.trim();
  if (!text) { notice(status, t('ipaliwanag_paste'), 'warn'); return; }
  cancelRead();
  runBtn.disabled = true;
  runBtn.innerHTML = `<span class="spinner"></span> ${t('ipaliwanag_working')}`;
  notice(status, '', 'info');
  try {
    const res = await summarize(text, { lang: outputLang, grade });
    out.textContent = res.text;
    outPanel.hidden = false;
    notice(status, res.demo ? t('ipaliwanag_demo') : t('ipaliwanag_done'), res.demo ? 'warn' : 'success');
    outPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    notice(status, `Could not summarize: ${err.message}`, 'error');
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = t('ipaliwanag_runBtn');
  }
}

function toggleRead() {
  if (reading) { cancelRead(); return; }
  if (!out.textContent.trim()) return;
  reading = true;
  readBtn.textContent = t('ipaliwanag_stop');
  const speechLang = (OUT_LANGS.find((l) => l.code === outputLang) || {}).speechLang || 'fil-PH';
  speak(out.textContent, {
    lang: speechLang,
    rate: 0.95,
    onend: cancelRead,
    onerror: cancelRead,
  });
}
function cancelRead() {
  reading = false;
  cancel();
  readBtn.textContent = t('ipaliwanag_readAloud');
}

// Re-translate static labels on language change.
function applyStrings() {
  ta.placeholder = t('ipaliwanag_placeholder');
  gradeLab.textContent = t('ipaliwanag_grade');
  outLangLab.textContent = t('ipaliwanag_outputLang');
  if (!reading) readBtn.textContent = t('ipaliwanag_readAloud');
  if (runBtn.disabled === false) runBtn.textContent = t('ipaliwanag_runBtn');
  outTitle.textContent = t('ipaliwanag_outTitle');
  const fieldLab = originalField.querySelector('.field-label');
  if (fieldLab) fieldLab.textContent = t('ipaliwanag_originalText');
}
applyStrings();
onLangChange(applyStrings);

ta.addEventListener('input', updateCount);
runBtn.addEventListener('click', run);
readBtn.addEventListener('click', toggleRead);
updateCount();

// Prefill from the landing hero and summarize right away.
const handoff = consumeHandoff('ipaliwanag');
if (handoff && handoff.text) {
  ta.value = handoff.text.slice(0, MAX);
  updateCount();
  run();
}

function labelled(text, node) {
  const wrap = el('div');
  const lab = el('label', 'field-label');
  lab.textContent = text;
  wrap.append(lab, node);
  return wrap;
}
