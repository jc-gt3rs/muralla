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
import { getLang, getLangMeta } from '../shared/a11y.js';
import { speak, cancel } from '../shared/tts.js';
import { summarize } from '../shared/ai.js';
import { config, aiReady } from '../shared/config.js';
import { consumeHandoff } from '../shared/handoff.js';
import { mountUpload } from '../shared/upload.js';

const { root } = mountShell({
  title: 'Ipaliwanag Mo',
  subtitle: 'Paste a textbook passage or article. Get a simpler version at the right grade level, in English or Filipino.',
  route: '/ipaliwanag',
});

const MAX = config.summarizerMaxChars;

// Demo-mode banner
if (!aiReady()) {
  const banner = el('div', 'banner');
  banner.innerHTML =
    '<span aria-hidden="true">⚙️</span> Demo mode — no AI key set. Output is a placeholder. ' +
    'Add a Gemini key or proxy in <code>config.js</code> to enable real summaries.';
  root.appendChild(banner);
}

// ── Input ─────────────────────────────────────────────────────────
const inputPanel = el('div', 'panel');
const ta = el('textarea', 'textbox reading');
ta.placeholder = 'Paste the text you want explained…';
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
gradeLab.textContent = 'Grade level';
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
runBtn.textContent = 'Explain it simply';

const uploadBtn = mountUpload(ta, {
  maxChars: MAX,
  onStatus: (msg, kind) => notice(status, msg, kind),
  dropZone: inputPanel,
});

controls.append(counter, uploadBtn, runBtn);

inputPanel.append(labelled('Original text', ta), gradeWrap, controls);

const status = el('p', 'status');

// ── Output ────────────────────────────────────────────────────────
const outPanel = el('div', 'panel');
outPanel.hidden = true;
const outHead = el('div', 'btn-row');
outHead.style.justifyContent = 'space-between';
const outTitle = el('strong');
outTitle.textContent = 'Simplified version';
const readBtn = el('button', 'btn btn--ghost');
readBtn.textContent = '🔊 Read aloud';
let reading = false;
outHead.append(outTitle, readBtn);
const out = el('div', 'summary-out reading');
outPanel.append(outHead, out);

root.append(inputPanel, status, outPanel);

// ── Logic ─────────────────────────────────────────────────────────
async function run() {
  const text = ta.value.trim();
  if (!text) { notice(status, 'Paste some text first.', 'warn'); return; }
  cancelRead();
  runBtn.disabled = true;
  runBtn.innerHTML = '<span class="spinner"></span> Working…';
  notice(status, '', 'info');
  try {
    const res = await summarize(text, { lang: getLang(), grade });
    out.textContent = res.text;
    outPanel.hidden = false;
    notice(status, res.demo ? 'Demo output (no AI key set).' : 'Done.', res.demo ? 'warn' : 'success');
    outPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    notice(status, `Could not summarize: ${err.message}`, 'error');
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = 'Explain it simply';
  }
}

function toggleRead() {
  if (reading) { cancelRead(); return; }
  if (!out.textContent.trim()) return;
  reading = true;
  readBtn.textContent = '■ Stop';
  const meta = getLangMeta();
  speak(out.textContent, {
    lang: meta.speechLang,
    rate: 0.95,
    onend: cancelRead,
    onerror: cancelRead,
  });
}
function cancelRead() {
  reading = false;
  cancel();
  readBtn.textContent = '🔊 Read aloud';
}

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
