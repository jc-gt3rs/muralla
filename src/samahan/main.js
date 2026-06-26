/**
 * Samahan Mo Ako — co-reader + pronunciation rater.
 * The full text is shown inline; the app reads it word by word and highlights
 * the current word (like Basahin, but per-word). Tap a word to jump, or use the
 * subtle ‹ back / next › indicators. An optional mic evaluator listens to the
 * student read the word back and colors it correct / close / wrong —
 * all on-device, no audio uploaded.
 */
import '../shared/app.css';
import { mountShell, el, notice } from '../shared/shell.js';
import { getLangMeta, onLangChange, makeSwitch } from '../shared/a11y.js';
import { speak, cancel, ttsSupported } from '../shared/tts.js';
import { listenOnce, asrSupported } from '../shared/asr.js';
import { splitWords, gradePronunciation } from '../shared/text.js';
import { consumeHandoff } from '../shared/handoff.js';
import { mountUpload } from '../shared/upload.js';

const SAMPLE = 'Ang bata ay masayang nagbabasa ng aklat sa silid-aklatan.';

const { root } = mountShell({
  title: 'Samahan Mo Ako',
  subtitle: 'Read along word by word. Tap any word to hear it, or use back / next to move through the text. Turn on the mic to check your pronunciation.',
  route: '/samahan',
});

let words = [];
let index = -1;
let micOn = false;
let listening = null;
const grades = {}; // index → 'correct' | 'close' | 'wrong'

// ── Input ─────────────────────────────────────────────────────────
const inputPanel = el('div', 'panel');
const ta = el('textarea', 'textbox reading');
ta.placeholder = 'Paste the text to practice…';
ta.value = SAMPLE;
ta.setAttribute('aria-label', 'Text to practice');
const startBtn = el('button', 'btn btn--primary');
startBtn.textContent = 'Start reading';
const startRow = el('div', 'btn-row');
startRow.style.marginTop = '12px';
startRow.appendChild(startBtn);
inputPanel.append(labelled('Your text', ta), startRow);

const uploadBtn = mountUpload(ta, {
  maxChars: 100000,
  onStatus: (msg, kind) => notice(status, msg, kind),
  onLoad: () => start(),
  dropZone: inputPanel,
});
startRow.appendChild(uploadBtn);

// ── Mic toggle (switch-style button) ──────────────────────────────
const micPanel = el('div', 'panel');
const micRow = el('div', 'a11y-group a11y-group--row');
const micLabel = el('span', 'a11y-group__label');
micLabel.textContent = asrSupported ? 'Pronunciation check (mic)' : 'Pronunciation check — needs Chrome/Edge';
const micSwitch = makeSwitch(false, toggleMic, 'Toggle microphone pronunciation check');
if (!asrSupported) micSwitch.setAttribute('aria-disabled', 'true');
micRow.append(micLabel, micSwitch);
micPanel.appendChild(micRow);

// ── Stage ─────────────────────────────────────────────────────────
// The full text is shown inline (like Basahin) and the current word is
// highlighted. Tap a word to jump there; subtle ‹ back / next › indicators
// step word by word. Graded words keep their pronunciation colour.
const stagePanel = el('div', 'panel');
stagePanel.hidden = true;
let listeningNow = false;

const wordsEl = el('div', 'words reading');
wordsEl.setAttribute('aria-label', 'Reading text — current word highlighted');

// Subtle left / right navigation, with a quiet replay in the middle.
const nav = el('div', 'word-nav');
const prevBtn = el('button', 'word-nav__btn word-nav__btn--prev');
prevBtn.innerHTML = '‹ back';
prevBtn.setAttribute('aria-label', 'Previous word');
const replayBtn = el('button', 'word-nav__btn word-nav__btn--replay');
replayBtn.innerHTML = '🔊 replay';
replayBtn.setAttribute('aria-label', 'Hear the current word again');
const nextBtn = el('button', 'word-nav__btn word-nav__btn--next');
nextBtn.innerHTML = 'next ›';
nextBtn.setAttribute('aria-label', 'Next word');
nav.append(prevBtn, replayBtn, nextBtn);

const progress = el('div', 'coreader-progress');
const progressLabel = el('span');
progressLabel.textContent = '0 / 0';
const track = el('div', 'coreader-track');
const fill = el('div', 'coreader-fill');
track.appendChild(fill);
progress.append(progressLabel, track);

const legend = el('div', 'legend');
legend.innerHTML = `
  <span><i style="background:var(--success)"></i> Correct</span>
  <span><i style="background:var(--close)"></i> Close</span>
  <span><i style="background:var(--danger)"></i> Try again</span>`;
const status = el('p', 'status');
stagePanel.append(wordsEl, nav, progress, legend, status);

const ttsBanner = el('div', 'banner');
if (!ttsSupported) ttsBanner.textContent = 'Speech synthesis is unavailable in this browser. Try Chrome or Edge.';
else ttsBanner.hidden = true;

root.append(ttsBanner, inputPanel, micPanel, stagePanel);

// ── Logic ─────────────────────────────────────────────────────────
function start() {
  stopListening();
  words = splitWords(ta.value);
  Object.keys(grades).forEach((k) => delete grades[k]);
  if (!words.length) { notice(status, 'Add some text first.', 'warn'); return; }
  startTime = Date.now();
  completionPanel.hidden = true;
  stagePanel.hidden = false;
  inputPanel.hidden = false;
  micPanel.hidden = false;
  index = 0;
  showWord();
}

function showWord() {
  if (index < 0 || index >= words.length) return;
  renderWords();
  progressLabel.textContent = `${index + 1} / ${words.length}`;
  fill.style.width = `${((index + 1) / words.length) * 100}%`;
  speakWord(words[index]);
}

// Render the full text inline, marking the active word and any grades.
function renderWords() {
  wordsEl.innerHTML = '';
  words.forEach((w, i) => {
    const span = el('span', 'word');
    span.textContent = w;
    span.dataset.i = String(i);
    const g = grades[i];
    if (g) span.classList.add(`state-${g}`);
    if (i === index) {
      span.classList.add('is-active');
      if (!g) span.classList.add('is-current');
      if (listeningNow) span.classList.add('is-listening');
    }
    span.addEventListener('click', () => {
      if (i === index) { speakWord(words[i]); return; }
      index = i;
      showWord();
    });
    wordsEl.appendChild(span);
  });
  const active = wordsEl.querySelector('.is-active');
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function currentSpan() {
  return wordsEl.querySelector('.word.is-active');
}

function speakWord(word) {
  stopListening();
  const meta = getLangMeta();
  speak(word.replace(/[^\p{L}\p{N}'-]/gu, ''), {
    lang: meta.speechLang,
    rate: 0.85,
    onend: () => { if (micOn) startListening(word); },
    onerror: () => { if (micOn) startListening(word); },
  });
  notice(status, micOn ? 'Listen, then read the word aloud…' : 'Tap a word, or use ‹ › to move. Tap 🔊 to hear it again.', 'info');
}

function startListening(word) {
  if (!asrSupported) return;
  listeningNow = true;
  const span = currentSpan();
  if (span) span.classList.add('is-listening');
  notice(status, '🎤 Listening… read the word now.', 'info');
  const meta = getLangMeta();
  listening = listenOnce({
    lang: meta.asrLang,
    onresult: (transcript) => {
      const heard = transcript.split(/\s+/).pop() || transcript;
      const grade = gradePronunciation(word, heard);
      grades[index] = grade;
      listeningNow = false;
      renderWords(); // re-paint so the word takes its grade colour
      const msg = {
        correct: '✓ Great pronunciation!',
        close: '≈ Close — try once more or move on.',
        wrong: '✗ Let’s try that again. Tap 🔊 to hear it.',
      }[grade];
      notice(status, `${msg} (heard: “${heard}”)`, grade === 'wrong' ? 'error' : grade === 'correct' ? 'success' : 'warn');
    },
    onerror: () => {
      listeningNow = false;
      const s = currentSpan();
      if (s) s.classList.remove('is-listening');
      notice(status, 'Did not catch that — tap 🔊 to try again.', 'warn');
    },
    onend: () => {
      listeningNow = false;
      const s = currentSpan();
      if (s) s.classList.remove('is-listening');
    },
  });
}

function stopListening() {
  if (listening) { listening.stop(); listening = null; }
  listeningNow = false;
  const s = currentSpan();
  if (s) s.classList.remove('is-listening');
}

function step(delta) {
  if (!words.length) return;
  const next = index + delta;
  if (next < 0 || next >= words.length) {
    if (next >= words.length) finishSession();
    return;
  }
  index = next;
  showWord();
}

function finishSession() {
  stopListening();
  cancel();
  if (!micOn) { notice(status, 'You reached the end. 🎉', 'success'); return; }
  const vals = Object.values(grades);
  const correct = vals.filter((g) => g === 'correct').length;
  const close = vals.filter((g) => g === 'close').length;
  const wrong = vals.filter((g) => g === 'wrong').length;
  notice(status, `Done! ✓ ${correct} correct · ≈ ${close} close · ✗ ${wrong} to practice.`, 'success');
}

function toggleMic(on) {
  if (on && !asrSupported) {
    micSwitch.setAttribute('aria-checked', 'false');
    notice(status, 'Pronunciation check needs Chrome or Edge.', 'warn');
    return;
  }
  micOn = on;
  if (!on) stopListening();
  if (on && index >= 0) startListening(words[index]);
}

// ── Wire up ───────────────────────────────────────────────────────
startBtn.addEventListener('click', start);
prevBtn.addEventListener('click', () => step(-1));
nextBtn.addEventListener('click', () => step(1));
replayBtn.addEventListener('click', () => { if (index >= 0) speakWord(words[index]); });
onLangChange(() => { if (index >= 0) speakWord(words[index]); });

// Prefill from the landing hero and show the first word ready to read.
const handoff = consumeHandoff('samahan');
if (handoff && handoff.text) {
  ta.value = handoff.text.slice(0, 100000);
  start();
  notice(status, 'Ready — tap a word, or use ‹ › to read along.', 'info');
}

// ── helpers ───────────────────────────────────────────────────────
function labelled(text, node) {
  const wrap = el('div');
  const lab = el('label', 'field-label');
  lab.textContent = text;
  wrap.append(lab, node);
  return wrap;
}
