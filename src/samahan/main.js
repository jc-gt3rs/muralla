/**
 * Samahan Mo Ako — co-reader + pronunciation rater.
 * Words appear one at a time, large and centered. Tap right (next) / left
 * (prev); each word is read aloud (audio + visual learning). An optional
 * mic evaluator listens to the student read the word back and colors it
 * correct / close / wrong — all on-device, no audio uploaded.
 */
import '../shared/app.css';
import { mountShell, el, notice } from '../shared/shell.js';
import { getLangMeta, onLangChange, makeSwitch } from '../shared/a11y.js';
import { speak, cancel, ttsSupported } from '../shared/tts.js';
import { listenOnce, asrSupported } from '../shared/asr.js';
import { splitWords, gradePronunciation } from '../shared/text.js';
import { consumeHandoff } from '../shared/handoff.js';

const SAMPLE = 'Ang bata ay masayang nagbabasa ng aklat sa silid-aklatan.';

const { root } = mountShell({
  title: 'Samahan Mo Ako',
  subtitle: 'Read one word at a time. Tap the right side for the next word, left to go back. Turn on the mic to check your pronunciation.',
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
const stagePanel = el('div', 'panel');
stagePanel.hidden = true;
const stage = el('div', 'coreader-stage');
const wordEl = el('div', 'coreader-word reading');
wordEl.textContent = '—';
const prevZone = el('button', 'tap-zone tap-zone--prev');
prevZone.setAttribute('aria-label', 'Previous word');
const nextZone = el('button', 'tap-zone tap-zone--next');
nextZone.setAttribute('aria-label', 'Next word');
const prevHint = el('span', 'tap-hint tap-hint--prev');
prevHint.textContent = '‹ back';
const nextHint = el('span', 'tap-hint tap-hint--next');
nextHint.textContent = 'next ›';
stage.append(prevZone, nextZone, wordEl, prevHint, nextHint);

const progress = el('div', 'coreader-progress');
const progressLabel = el('span');
progressLabel.textContent = '0 / 0';
const track = el('div', 'coreader-track');
const fill = el('div', 'coreader-fill');
track.appendChild(fill);
const replayBtn = el('button', 'btn btn--ghost');
replayBtn.textContent = '🔊 Replay';
replayBtn.setAttribute('aria-label', 'Replay current word');
progress.append(progressLabel, track, replayBtn);

const legend = el('div', 'legend');
legend.innerHTML = `
  <span><i style="background:var(--success)"></i> Correct</span>
  <span><i style="background:var(--close)"></i> Close</span>
  <span><i style="background:var(--danger)"></i> Try again</span>`;
const status = el('p', 'status');
stagePanel.append(stage, progress, legend, status);

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
  stagePanel.hidden = false;
  index = 0;
  showWord();
}

function showWord() {
  const word = words[index];
  wordEl.textContent = word;
  wordEl.className = 'coreader-word reading';
  const g = grades[index];
  if (g) wordEl.classList.add(`state-${g}`);
  progressLabel.textContent = `${index + 1} / ${words.length}`;
  fill.style.width = `${((index + 1) / words.length) * 100}%`;
  speakWord(word);
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
  notice(status, micOn ? 'Listen, then read the word aloud…' : 'Tap the right side for the next word.', 'info');
}

function startListening(word) {
  if (!asrSupported) return;
  wordEl.classList.add('state-listening');
  notice(status, '🎤 Listening… read the word now.', 'info');
  const meta = getLangMeta();
  listening = listenOnce({
    lang: meta.asrLang,
    onresult: (transcript) => {
      const heard = transcript.split(/\s+/).pop() || transcript;
      const grade = gradePronunciation(word, heard);
      grades[index] = grade;
      wordEl.classList.remove('state-listening');
      wordEl.classList.add(`state-${grade}`);
      const msg = {
        correct: '✓ Great pronunciation!',
        close: '≈ Close — try once more or move on.',
        wrong: '✗ Let’s try that again. Tap 🔊 Replay.',
      }[grade];
      notice(status, `${msg} (heard: “${heard}”)`, grade === 'wrong' ? 'error' : grade === 'correct' ? 'success' : 'warn');
    },
    onerror: () => {
      wordEl.classList.remove('state-listening');
      notice(status, 'Did not catch that — tap 🔊 Replay to try again.', 'warn');
    },
    onend: () => { wordEl.classList.remove('state-listening'); },
  });
}

function stopListening() {
  if (listening) { listening.stop(); listening = null; }
  wordEl.classList.remove('state-listening');
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
nextZone.addEventListener('click', () => step(1));
prevZone.addEventListener('click', () => step(-1));
replayBtn.addEventListener('click', () => { if (index >= 0) speakWord(words[index]); });
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowRight') step(1);
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === ' ') { e.preventDefault(); if (index >= 0) speakWord(words[index]); }
});
onLangChange(() => { if (index >= 0) speakWord(words[index]); });

// Prefill from the landing hero and show the first word ready to read.
const handoff = consumeHandoff('samahan');
if (handoff && handoff.text) {
  ta.value = handoff.text.slice(0, 100000);
  start();
  notice(status, 'Ready — tap the right side to begin reading.', 'info');
}

// ── helpers ───────────────────────────────────────────────────────
function labelled(text, node) {
  const wrap = el('div');
  const lab = el('label', 'field-label');
  lab.textContent = text;
  wrap.append(lab, node);
  return wrap;
}
