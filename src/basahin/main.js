/**
 * Basahin Mo — TTS reader.
 * Paste text → it's split into sentences → each sentence is read aloud and
 * highlighted in turn. Adjustable speed; jump to any sentence; prev/next.
 */
import '../shared/app.css';
import { mountShell, el, notice } from '../shared/shell.js';
import { getLangMeta, onLangChange } from '../shared/a11y.js';
import { speak, cancel, ttsSupported, hasVoiceFor } from '../shared/tts.js';
import { splitSentences } from '../shared/text.js';
import { consumeHandoff } from '../shared/handoff.js';
import { mountUpload } from '../shared/upload.js';

const SAMPLE =
  'Ang pagbasa ay parang paglalakbay. Sa bawat pahina, may bagong natutuhan. Hindi mahalaga kung mabagal ka. Ang mahalaga, hindi ka huminto.';

const { root } = mountShell({
  title: 'Basahin Mo',
  subtitle: 'Paste any text, then listen to it read sentence by sentence. Tap a sentence to jump there.',
  route: '/basahin',
});

let sentences = [];
let index = 0;
let playing = false;

// ── UI ────────────────────────────────────────────────────────────
const inputPanel = el('div', 'panel');
const ta = el('textarea', 'textbox reading');
ta.placeholder = 'Paste your text here…';
ta.value = SAMPLE;
ta.setAttribute('aria-label', 'Text to read');
const loadBtn = el('button', 'btn btn--ghost');
loadBtn.textContent = 'Load text';
const inputRow = el('div', 'btn-row');
inputRow.style.marginTop = '12px';
inputRow.appendChild(loadBtn);
inputPanel.append(labelled('Your text', ta), inputRow);

const uploadBtn = mountUpload(ta, {
  maxChars: 100000,
  onStatus: (msg, kind) => notice(status, msg, kind),
  onLoad: () => loadText(),
  dropZone: inputPanel,
});
inputRow.appendChild(uploadBtn);

const readerPanel = el('div', 'panel');
readerPanel.hidden = true;
const sentencesEl = el('div', 'sentences reading');
readerPanel.appendChild(sentencesEl);

// Transport controls
const controls = el('div', 'panel');
controls.hidden = true;
const speedRow = el('div', 'slider-row');
const speed = el('input');
speed.type = 'range';
speed.min = '0.5';
speed.max = '1.5';
speed.step = '0.1';
speed.value = '1';
speed.id = 'speed';
const speedVal = el('span', 'slider-value');
speedVal.textContent = '1.0×';
const speedLabel = el('label');
speedLabel.htmlFor = 'speed';
speedLabel.textContent = 'Speed';
speedRow.append(speedLabel, speed, speedVal);

const transport = el('div', 'btn-row');
transport.style.marginTop = '14px';
transport.style.justifyContent = 'center';
const prevBtn = iconBtn('‹', 'Previous sentence');
const playBtn = el('button', 'btn btn--primary btn--icon');
playBtn.innerHTML = '▶';
playBtn.setAttribute('aria-label', 'Play');
const nextBtn = iconBtn('›', 'Next sentence');
transport.append(prevBtn, playBtn, nextBtn);

const status = el('p', 'status');
controls.append(speedRow, transport, status);

const browserBanner = el('div', 'banner');
if (!ttsSupported) {
  browserBanner.textContent = 'Your browser does not support speech synthesis. Try Chrome or Edge.';
} else {
  browserBanner.hidden = true;
}

root.append(browserBanner, inputPanel, controls, readerPanel);

// ── Logic ─────────────────────────────────────────────────────────
function loadText() {
  cancelPlayback();
  sentences = splitSentences(ta.value);
  index = 0;
  renderSentences();
  readerPanel.hidden = sentences.length === 0;
  controls.hidden = sentences.length === 0;
  if (!sentences.length) notice(status, 'Add some text first.', 'warn');
  else updateStatus();
}

function renderSentences() {
  sentencesEl.innerHTML = '';
  sentences.forEach((s, i) => {
    const span = el('span', 'sentence');
    span.textContent = s + ' ';
    span.dataset.i = String(i);
    if (i === index) span.classList.add('is-active');
    else if (i < index) span.classList.add('is-done');
    span.addEventListener('click', () => {
      index = i;
      if (playing) playCurrent();
      else { renderSentences(); updateStatus(); }
    });
    sentencesEl.appendChild(span);
  });
  const active = sentencesEl.querySelector('.is-active');
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function playCurrent() {
  if (!sentences.length) return;
  cancel();
  playing = true;
  playBtn.innerHTML = '❚❚';
  playBtn.setAttribute('aria-label', 'Pause');
  renderSentences();
  updateStatus();
  const meta = getLangMeta();
  speak(sentences[index], {
    lang: meta.speechLang,
    rate: parseFloat(speed.value),
    onend: () => {
      if (!playing) return;
      if (index < sentences.length - 1) {
        index += 1;
        playCurrent();
      } else {
        cancelPlayback();
        notice(status, 'Finished reading.', 'success');
      }
    },
    onerror: () => notice(status, 'Could not play audio for this language on your device.', 'error'),
  });
}

function togglePlay() {
  if (!sentences.length) loadText();
  if (playing) {
    cancelPlayback();
  } else {
    playCurrent();
  }
}

function cancelPlayback() {
  playing = false;
  cancel();
  playBtn.innerHTML = '▶';
  playBtn.setAttribute('aria-label', 'Play');
  renderSentences();
  updateStatus();
}

function step(delta) {
  if (!sentences.length) return;
  index = Math.max(0, Math.min(sentences.length - 1, index + delta));
  if (playing) playCurrent();
  else { renderSentences(); updateStatus(); }
}

function updateStatus() {
  if (!sentences.length) return;
  const meta = getLangMeta();
  const voiceNote = hasVoiceFor(meta.speechLang) ? '' : ` · no ${meta.label} voice on this device, using closest match`;
  notice(status, `Sentence ${index + 1} of ${sentences.length}${voiceNote}`, 'info');
}

// ── Wire up ───────────────────────────────────────────────────────
loadBtn.addEventListener('click', loadText);
playBtn.addEventListener('click', togglePlay);
prevBtn.addEventListener('click', () => step(-1));
nextBtn.addEventListener('click', () => step(1));
speed.addEventListener('input', () => {
  speedVal.textContent = parseFloat(speed.value).toFixed(1) + '×';
});
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
});
onLangChange(() => { if (playing) playCurrent(); else updateStatus(); });

// If the user arrived from the landing hero, prefill their text + prepare it.
// (We don't auto-play: browsers block audio without a user gesture.)
const handoff = consumeHandoff('basahin');
if (handoff && handoff.text) {
  ta.value = handoff.text.slice(0, 100000);
  loadText();
  notice(status, 'Your text is ready — press play to listen.', 'info');
} else {
  loadText();
}

// ── helpers ───────────────────────────────────────────────────────
function labelled(text, node) {
  const wrap = el('div');
  const lab = el('label', 'field-label');
  lab.textContent = text;
  if (node.id) lab.htmlFor = node.id;
  wrap.append(lab, node);
  return wrap;
}
function iconBtn(glyph, label) {
  const b = el('button', 'btn btn--ghost btn--icon');
  b.innerHTML = glyph;
  b.setAttribute('aria-label', label);
  return b;
}
