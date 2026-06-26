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
import { getLang, getLangMeta, onLangChange, makeSwitch } from '../shared/a11y.js';
import { t } from '../shared/i18n.js';
import { speak, cancel, ttsSupported } from '../shared/tts.js';
import { listenOnce, asrSupported } from '../shared/asr.js';
import { splitWords, splitSentences, gradePronunciation } from '../shared/text.js';
import { consumeHandoff } from '../shared/handoff.js';
import { mountUpload } from '../shared/upload.js';

const SAMPLE = 'Ang bata ay masayang nagbabasa ng aklat sa silid-aklatan.';

const { root } = mountShell({
  title: 'Samahan Mo Ako',
  subtitle: () => t('samahan_sub'),
  route: '/samahan',
});

let words = [];
let index = -1;
let micOn = false;
let micStream = null;      // held-open getUserMedia stream while the mic is on
let listening = null;
let restartTimer = null;   // keep-alive: pending re-listen
let suppressRestart = false; // true when we stop on purpose (speaking / toggle off)
let errorStreak = 0;       // consecutive recogniser errors → bail out
let lastGotResult = false; // pace the restart so feedback is readable
const grades = {}; // index → 'correct' | 'close' | 'wrong'
let startTime = null;

// ── Input ─────────────────────────────────────────────────────────
const inputPanel = el('div', 'panel');
const ta = el('textarea', 'textbox reading');
ta.value = SAMPLE;
ta.setAttribute('aria-label', 'Text to practice');
const startBtn = el('button', 'btn btn--primary');
const startRow = el('div', 'btn-row');
startRow.style.marginTop = '12px';
startRow.appendChild(startBtn);
const textField = labelled('Your text', ta);
inputPanel.append(textField, startRow);

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

const completionPanel = el('div', 'panel duo-completion');
completionPanel.hidden = true;

const challengePanel = el('div', 'panel comp-challenge');
challengePanel.hidden = true;

// Confetti canvas setup
const confettiCanvas = el('canvas');
confettiCanvas.id = 'confetti-canvas';
document.body.appendChild(confettiCanvas);

root.append(inputPanel, micPanel, stagePanel, challengePanel, completionPanel);

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
  if (!asrSupported || !micOn) return;
  if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
  suppressRestart = false;
  lastGotResult = false;
  listeningNow = true;
  const span = currentSpan();
  if (span) span.classList.add('is-listening');
  notice(status, '🎤 Listening… read the word now.', 'info');
  const meta = getLangMeta();
  listening = listenOnce({
    lang: meta.asrLang,
    continuous: true, // keep the mic open across pauses instead of one-shot
    onresult: (best, alts) => {
      errorStreak = 0;
      lastGotResult = true;
      const grade = gradePronunciation(word, alts);
      const heard = best || (alts && alts[0]) || '';
      grades[index] = grade;
      renderWords(); // re-paint so the word takes its grade colour
      const msg = {
        correct: '✓ Great pronunciation!',
        close: '≈ Close — try once more or move on.',
        wrong: '✗ Let’s try that again. Tap 🔊 to hear it.',
      }[grade];
      notice(status, `${msg} (heard: “${heard}”)`, grade === 'wrong' ? 'error' : grade === 'correct' ? 'success' : 'warn');
    },
    onerror: () => {
      errorStreak++;
    },
    onend: () => {
      listeningNow = false;
      const s = currentSpan();
      if (s) s.classList.remove('is-listening');
      // Keep the mic alive: while the toggle is on, restart listening for the
      // current word automatically so it stays on instead of stopping after
      // one attempt. Bail only if we were stopped on purpose or errors pile up.
      if (!micOn || suppressRestart) return;
      if (errorStreak >= 3) {
        errorStreak = 0;
        notice(status, 'Mic had trouble — tap 🔊 to hear the word and try again.', 'warn');
        return;
      }
      const delay = lastGotResult ? 1100 : 300; // let feedback be read after a result
      restartTimer = setTimeout(() => {
        if (micOn && !suppressRestart) startListening(word);
      }, delay);
    },
  });
}

function stopListening({ keepAlive = false } = {}) {
  suppressRestart = !keepAlive;
  if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
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

let practiceListening = null;
let activeMicBtn = null;

function playSuccessSound() {
  if (typeof window === 'undefined' || (!window.AudioContext && !window.webkitAudioContext)) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
    osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  } catch (_) {}
}

function playCelebrationSound() {
  if (typeof window === 'undefined' || (!window.AudioContext && !window.webkitAudioContext)) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    const playNote = (freq, start, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.08, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };
    playNote(523.25, now, 0.15); // C5
    playNote(659.25, now + 0.08, 0.15); // E5
    playNote(783.99, now + 0.16, 0.15); // G5
    playNote(1046.50, now + 0.24, 0.4); // C6
  } catch (_) {}
}

function triggerConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;

  const handleResize = () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  };
  window.addEventListener('resize', handleResize);

  const colors = ['#FFC800', '#FF9600', '#58CC02', '#2D6BE4', '#FF4B4B', '#FF80B5'];
  const particles = [];

  for (let i = 0; i < 150; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * -height - 20,
      r: Math.random() * 6 + 4,
      d: Math.random() * height,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 5,
      tiltAngleIncremental: Math.random() * 0.07 + 0.02,
      tiltAngle: 0
    });
  }

  let animationFrameId;
  let startTimeConfetti = Date.now();

  function draw() {
    ctx.clearRect(0, 0, width, height);
    let finished = true;
    particles.forEach((p) => {
      p.tiltAngle += p.tiltAngleIncremental;
      p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
      p.x += Math.sin(p.tiltAngle);
      p.tilt = Math.sin(p.tiltAngle - (p.r / 2)) * 15;

      if (p.y < height) {
        finished = false;
      }

      ctx.beginPath();
      ctx.lineWidth = p.r;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
      ctx.stroke();
    });

    if (finished || Date.now() - startTimeConfetti > 4500) {
      ctx.clearRect(0, 0, width, height);
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    } else {
      animationFrameId = requestAnimationFrame(draw);
    }
  }

  draw();
}

// ── Comprehension challenge state ─────────────────────────────
let compSentences = [];
let compSourceText = '';
let compIndex = 0;
let compCorrect = 0;
let compSkipped = 0;

/**
 * Pick 2–3 short sentences (≥3 words) from the original text.
 * Falls back to the first sentences if none qualify.
 */
function selectChallengeSentences(text) {
  const allSentences = splitSentences(text);
  // Filter to sentences with at least 3 words and at most 12 (to keep it manageable)
  let candidates = allSentences.filter(s => {
    const wc = s.trim().split(/\s+/).length;
    return wc >= 3 && wc <= 7;
  });
  if (candidates.length === 0) candidates = allSentences.filter(s => {
    const wc = s.trim().split(/\s+/).length;
    return wc >= 2 && wc <= 10;
  });
  if (candidates.length === 0) candidates = allSentences.filter(s => s.trim().split(/\s+/).length >= 2);
  if (candidates.length === 0) return [];
  // Sort by word count (shortest first — most accessible)
  candidates.sort((a, b) => a.trim().split(/\s+/).length - b.trim().split(/\s+/).length);
  // Take up to 3
  return candidates.slice(0, 3);
}

/** Fisher-Yates shuffle (in place). */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Short, common words to avoid blanking out (EN + FIL).
const COMP_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'is', 'are', 'was', 'were', 'it', 'he', 'she', 'they', 'we', 'as', 'by',
  'with', 'from', 'that', 'this', 'into', 'than', 'then', 'them', 'their',
  'ang', 'ng', 'sa', 'na', 'ay', 'mga', 'si', 'ni', 'kay', 'ako', 'ikaw',
  'siya', 'kami', 'tayo', 'kayo', 'sila', 'ito', 'iyan', 'iyon', 'din', 'rin',
]);

/** Strip surrounding punctuation, keep letters/numbers/apostrophes/hyphens. */
function cleanWord(w) {
  return w.replace(/[^\p{L}\p{N}'-]/gu, '');
}

/**
 * Build one fill-in-the-blank item from a sentence:
 * pick the longest content word, blank it, and offer it among decoys
 * drawn from the rest of the passage.
 */
function buildBlankItem(sentence, sourceText) {
  const words = sentence.trim().split(/\s+/);

  // Choose the word to blank: longest content word, else the middle word.
  const candidates = words
    .map((w, i) => ({ i, clean: cleanWord(w) }))
    .filter((o) => o.clean.length >= 4 && !COMP_STOPWORDS.has(o.clean.toLowerCase()));
  const chosen = candidates.length
    ? candidates.reduce((a, b) => (b.clean.length > a.clean.length ? b : a))
    : { i: Math.floor(words.length / 2), clean: cleanWord(words[Math.floor(words.length / 2)]) };

  const answer = chosen.clean.toLowerCase();

  // Blank out the chosen word, preserving its surrounding punctuation.
  const blanked = words.slice();
  blanked[chosen.i] = words[chosen.i].replace(chosen.clean, '_____');
  const stem = blanked.join(' ');

  // Decoys: other words from the passage of similar size.
  const pool = [...new Set((sourceText.match(/[\p{L}][\p{L}'-]{3,}/gu) || []).map((w) => w.toLowerCase()))]
    .filter((w) => w !== answer && !COMP_STOPWORDS.has(w));
  const decoys = shuffleArray(pool).slice(0, 3);

  const options = shuffleArray([answer, ...decoys]);
  return { stem, answer, options };
}

function startComprehensionChallenge() {
  stopListening();
  releaseMicStream();
  cancel();
  if (practiceListening) { practiceListening.stop(); practiceListening = null; }

  stagePanel.hidden = true;
  micPanel.hidden = true;
  inputPanel.hidden = true;

  compSourceText = ta.value;
  const raw = selectChallengeSentences(compSourceText);
  compIndex = 0;
  compCorrect = 0;
  compSkipped = 0;

  if (raw.length === 0) {
    showCompletion();
    return;
  }

  compSentences = raw;
  challengePanel.hidden = false;
  renderChallenge();
}

function renderChallenge() {
  challengePanel.innerHTML = '';

  const lang = getLang();
  const isFil = lang === 'fil';

  // Header
  const header = el('div', 'comp-header');
  const h2 = el('h2');
  h2.textContent = isFil ? '📝 Pagsubok sa Pag-unawa' : '📝 Comprehension Check';
  const pDesc = el('p');
  pDesc.textContent = isFil
    ? 'Piliin ang nawawalang salita.'
    : 'Choose the missing word.';
  header.append(h2, pDesc);
  challengePanel.appendChild(header);

  // Progress
  const progressDiv = el('div', 'comp-progress');
  const progLabel = el('span');
  progLabel.textContent = `${compIndex + 1} / ${compSentences.length}`;
  const progTrack = el('div', 'comp-progress-track');
  const progFill = el('div', 'comp-progress-fill');
  progFill.style.width = `${((compIndex) / compSentences.length) * 100}%`;
  progTrack.appendChild(progFill);
  progressDiv.append(progLabel, progTrack);
  challengePanel.appendChild(progressDiv);

  // Current sentence → fill-in-the-blank
  const sentence = compSentences[compIndex];
  const { stem, answer, options } = buildBlankItem(sentence, compSourceText);

  // Sentence with the blank
  const stemP = el('p', 'comp-blank-sentence reading');
  stemP.textContent = stem;
  challengePanel.appendChild(stemP);

  // Options
  const optionsWrap = el('div', 'comp-tile-bank reading');
  challengePanel.appendChild(optionsWrap);

  let answered = false;
  options.forEach((opt) => {
    const tile = el('button', 'comp-tile reading');
    tile.type = 'button';
    tile.textContent = opt;
    tile.setAttribute('aria-label', `Choose: ${opt}`);
    tile.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      const isCorrect = opt === answer;
      optionsWrap.querySelectorAll('.comp-tile').forEach((b) => { b.disabled = true; });

      if (isCorrect) {
        compCorrect++;
        playSuccessSound();
        tile.classList.add('comp-tile--correct');
      } else {
        compSkipped++;
        tile.classList.add('comp-tile--wrong');
        optionsWrap.querySelectorAll('.comp-tile').forEach((b) => {
          if (b.textContent === answer) b.classList.add('comp-tile--correct');
        });
      }
      // Reveal the full sentence (green if right, red if wrong), then advance.
      stemP.textContent = sentence;
      stemP.classList.add(isCorrect ? 'comp-blank-sentence--revealed' : 'comp-blank-sentence--wrong');
      setTimeout(() => advanceChallenge(isFil), isCorrect ? 1100 : 1500);
    });
    optionsWrap.appendChild(tile);
  });

  // Buttons
  const btnRow = el('div', 'comp-btn-row');

  const skipBtn = el('button', 'btn btn--duo-secondary');
  skipBtn.textContent = isFil ? 'Laktawan' : 'Skip';
  skipBtn.addEventListener('click', () => {
    if (answered) return;
    compSkipped++;
    advanceChallenge(isFil);
  });

  btnRow.append(skipBtn);
  challengePanel.appendChild(btnRow);
}

function advanceChallenge(isFil) {
  compIndex++;
  if (compIndex >= compSentences.length) {
    // All challenges done — show completion
    challengePanel.hidden = true;
    showCompletion();
  } else {
    renderChallenge();
  }
}

function finishSession() {
  startComprehensionChallenge();
}

function showCompletion() {
  stopListening();
  releaseMicStream();
  cancel();

  if (practiceListening) {
    practiceListening.stop();
    practiceListening = null;
  }
  
  // Hide active panels
  stagePanel.hidden = true;
  micPanel.hidden = true;
  inputPanel.hidden = true;
  challengePanel.hidden = true;
  
  // Show completion screen
  completionPanel.hidden = false;
  completionPanel.innerHTML = '';
  
  // Track statistics
  const vals = Object.values(grades);
  const correct = vals.filter((g) => g === 'correct').length;
  const close = vals.filter((g) => g === 'close').length;
  const wrong = vals.filter((g) => g === 'wrong').length;
  
  // Calculate Accuracy
  const totalAttempted = correct + close + wrong;
  const accuracy = totalAttempted > 0 ? Math.round((correct / totalAttempted) * 100) : 100;
  
  // Calculate Duration
  const elapsedSec = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;
  const minutes = Math.floor(elapsedSec / 60);
  const seconds = elapsedSec % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  
  // Localized Text
  const lang = getLang();
  const isFil = lang === 'fil';
  const t = {
    title: isFil ? 'Leksyon Kumpleto!' : 'Lesson Complete!',
    subtitle: isFil ? 'Magaling! Natapos mo ang talata.' : 'Outstanding! You read the passage.',
    accLabel: isFil ? 'Wastong Bigkas' : 'Accuracy',
    timeLabel: isFil ? 'Oras' : 'Time Taken',
    reviewTitle: isFil ? 'Sanayin ang mga Salita' : 'Practice Words',
    reviewSubtitle: isFil ? 'I-tap ang 🔊 upang pakinggan at 🎤 upang ulitin. Gawing tama upang maalis!' : 'Tap 🔊 to listen and 🎤 to repeat. Score correct to clear them!',
    noMistakes: isFil ? 'Perpektong Pagbasa! Walang pagkakamali na kailangang sanayin. 🎉' : 'Perfect Reading! No mistakes to practice. 🎉',
    micOffNotice: isFil ? 'Naka-off ang mic kanina. Subukan ang mga mahihirap na salitang ito gamit ang mic!' : 'Pronunciation check was off. Try practicing these key words with the mic!',
    practiceComplete: isFil ? 'Kumpleto na ang Pagsasanay! 🌟' : 'Practice Complete! 🌟',
    practiceCompleteSubtitle: isFil ? 'Galing! Naitama mo ang lahat ng mga salita!' : 'Awesome! You corrected all the words!',
    btnReadAgain: isFil ? 'Basahin Muli' : 'Read Again',
    btnContinue: isFil ? 'Magpatuloy' : 'Continue'
  };

  // Render Header
  const header = el('div', 'duo-header');
  const h2 = el('h2');
  h2.textContent = t.title;
  const pMsg = el('p');
  pMsg.textContent = t.subtitle;
  header.append(h2, pMsg);
  completionPanel.appendChild(header);

  // Render Stats Grid (accuracy + time only)
  const statsGrid = el('div', 'duo-stats-grid');

  // Accuracy Card
  const accCard = el('div', 'duo-stat-card');
  const accIcon = el('span', 'duo-stat-card__icon');
  accIcon.textContent = '🎯';
  const accVal = el('span', 'duo-stat-card__val duo-stat-card__val--acc');
  accVal.textContent = `${accuracy}%`;
  const accLabel = el('span', 'duo-stat-card__label');
  accLabel.textContent = t.accLabel;
  accCard.append(accIcon, accVal, accLabel);

  // Time Card
  const timeCard = el('div', 'duo-stat-card');
  const timeIcon = el('span', 'duo-stat-card__icon');
  timeIcon.textContent = '⏱';
  const timeVal = el('span', 'duo-stat-card__val duo-stat-card__val--time');
  timeVal.textContent = timeStr;
  const timeLabel = el('span', 'duo-stat-card__label');
  timeLabel.textContent = t.timeLabel;
  timeCard.append(timeIcon, timeVal, timeLabel);

  statsGrid.append(accCard, timeCard);
  completionPanel.appendChild(statsGrid);

  // Determine practice words
  let practiceItems = [];
  if (micOn) {
    practiceItems = words.map((w, i) => ({ word: w, index: i, grade: grades[i] }))
                         .filter(item => item.grade === 'wrong' || item.grade === 'close');
  } else {
    // Select top 3 longest unique words (excluding punctuation) for practice
    const uniqueWords = [...new Set(words.map(w => w.replace(/[^\p{L}\p{N}'-]/gu, '')))].filter(w => w.length > 3);
    uniqueWords.sort((a, b) => b.length - a.length);
    practiceItems = uniqueWords.slice(0, 3).map(w => ({ word: w, index: -1, grade: null }));
  }

  // Render word practice section
  const reviewDiv = el('div', 'duo-review');
  const rTitle = el('h3', 'duo-review__title');
  rTitle.textContent = t.reviewTitle;
  const rSubtitle = el('p', 'duo-review__subtitle');
  rSubtitle.textContent = micOn ? t.reviewSubtitle : t.micOffNotice;
  reviewDiv.append(rTitle, rSubtitle);

  if (micOn && practiceItems.length === 0) {
    // Perfect pronunciation run!
    const successP = el('p');
    successP.style.fontSize = '15px';
    successP.style.fontWeight = 'bold';
    successP.style.color = 'var(--success)';
    successP.textContent = t.noMistakes;
    reviewDiv.appendChild(successP);
  } else {
    const list = el('div', 'duo-word-list');
    practiceItems.forEach((itemData) => {
      const row = el('div', 'duo-word-item');
      const wSpan = el('span', 'duo-word-item__text reading');
      wSpan.textContent = itemData.word;
      
      const playBtn = el('button', 'duo-word-item__btn');
      playBtn.innerHTML = '🔊';
      playBtn.setAttribute('aria-label', `Hear ${itemData.word}`);
      playBtn.addEventListener('click', () => {
        speak(itemData.word.replace(/[^\p{L}\p{N}'-]/gu, ''), {
          lang: getLangMeta().speechLang,
          rate: 0.85
        });
      });

      const micBtn = el('button', 'duo-word-item__btn duo-word-item__btn--mic');
      micBtn.innerHTML = '🎤';
      micBtn.setAttribute('aria-label', `Speak ${itemData.word}`);
      if (!asrSupported) micBtn.disabled = true;

      const statusSpan = el('span', 'duo-word-item__status');
      const statusPill = el('span', 'duo-word-item__status-pill');
      if (itemData.grade) {
        statusPill.textContent = {
          wrong: isFil ? '✗ Subukan Ulit' : '✗ Try Again',
          close: isFil ? '≈ Malapit' : '≈ Close',
          correct: isFil ? '✓ Wasto!' : '✓ Correct!'
        }[itemData.grade];
        statusPill.classList.add(`duo-word-item__status-pill--${itemData.grade}`);
      } else {
        statusPill.textContent = isFil ? 'Magsanay' : 'Practice';
        statusPill.style.background = 'var(--primary-soft)';
        statusPill.style.color = 'var(--primary)';
      }
      statusSpan.appendChild(statusPill);

      micBtn.addEventListener('click', () => {
        startPracticeListening(itemData, statusPill, micBtn, row);
      });

      row.append(playBtn, micBtn, wSpan, statusSpan);
      list.appendChild(row);
    });
    reviewDiv.appendChild(list);
  }
  completionPanel.appendChild(reviewDiv);

  // Button CTAs
  const btnRow = el('div', 'duo-btn-row');
  const readAgainBtn = el('button', 'btn btn--duo-secondary');
  readAgainBtn.textContent = t.btnReadAgain;
  readAgainBtn.addEventListener('click', () => {
    completionPanel.hidden = true;
    start();
  });

  const continueBtn = el('button', 'btn btn--primary');
  continueBtn.textContent = t.btnContinue;
  continueBtn.addEventListener('click', () => {
    completionPanel.hidden = true;
    inputPanel.hidden = false;
    micPanel.hidden = false;
    // reset original textarea value
    ta.value = words.join(' ');
    // Notice to user
    notice(status, isFil ? 'Handa na — maglagay ng bagong teksto.' : 'Ready — load some new text to practice.', 'info');
  });

  btnRow.append(readAgainBtn, continueBtn);
  completionPanel.appendChild(btnRow);

  // Success Sounds & Confetti Burst!
  playCelebrationSound();
  triggerConfetti();

  function startPracticeListening(itemData, statusPill, micBtn, itemContainer) {
    cancel();
    if (practiceListening) {
      practiceListening.stop();
      practiceListening = null;
    }
    if (activeMicBtn) {
      activeMicBtn.classList.remove('duo-word-item__btn--active');
    }

    if (!asrSupported) return;

    activeMicBtn = micBtn;
    micBtn.classList.add('duo-word-item__btn--active');
    statusPill.textContent = isFil ? '🎤 Nakikinig...' : '🎤 Listening...';
    statusPill.className = 'duo-word-item__status-pill';
    statusPill.style.background = '#FFFBEB';
    statusPill.style.color = '#B45309';

    const meta = getLangMeta();
    practiceListening = listenOnce({
      lang: meta.asrLang,
      onresult: (best, alts) => {
        const grade = gradePronunciation(itemData.word, alts);

        itemData.grade = grade;
        if (itemData.index !== -1) {
          grades[itemData.index] = grade;
        }

        statusPill.textContent = {
          correct: isFil ? '✓ Wasto!' : '✓ Correct!',
          close: isFil ? '≈ Malapit!' : '≈ Close!',
          wrong: isFil ? '✗ Subukan Ulit' : '✗ Try Again'
        }[grade];
        statusPill.className = `duo-word-item__status-pill duo-word-item__status-pill--${grade}`;

        if (grade === 'correct') {
          playSuccessSound();
          micBtn.disabled = true;

          // Check if all are correct now
          const allCorrect = practiceItems.every(x => x.grade === 'correct');
          if (allCorrect) {
            playCelebrationSound();
            triggerConfetti();
            
            const banner = el('div', 'banner banner--info');
            banner.style.marginTop = '16px';
            banner.style.animation = 'duoFadeUp 0.3s ease-out';
            banner.innerHTML = `<strong>${t.practiceComplete}</strong><br>${t.practiceCompleteSubtitle}`;
            
            const reviewArea = completionPanel.querySelector('.duo-review');
            if (reviewArea) {
              reviewArea.insertBefore(banner, reviewArea.firstChild);
            }
          }
        }
      },
      onerror: () => {
        statusPill.textContent = isFil ? 'Subukan Ulit' : 'Try Again';
        statusPill.className = 'duo-word-item__status-pill duo-word-item__status-pill--wrong';
        micBtn.classList.remove('duo-word-item__btn--active');
      },
      onend: () => {
        micBtn.classList.remove('duo-word-item__btn--active');
        if (activeMicBtn === micBtn) activeMicBtn = null;
      }
    });
  }
}

async function toggleMic(on) {
  if (!on) {
    micOn = false;
    stopListening();
    releaseMicStream();
    return;
  }
  if (!asrSupported) {
    micSwitch.setAttribute('aria-checked', 'false');
    notice(status, 'Pronunciation check needs Chrome or Edge.', 'warn');
    return;
  }
  // Hold the mic stream open for the whole time the toggle is on. This keeps the
  // hardware mic engaged and the permission warm, so the recogniser can restart
  // seamlessly across pauses instead of dropping the mic between words.
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    micStream = null;
    micSwitch.setAttribute('aria-checked', 'false');
    const denied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
    notice(status, denied
      ? 'Microphone access was denied. Allow it in your browser settings and try again.'
      : 'Could not access the microphone. Check your device settings.',
      'warn');
    return;
  }
  micOn = true;
  if (index >= 0) startListening(words[index]);
}

function releaseMicStream() {
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
}

// ── Wire up ───────────────────────────────────────────────────────
startBtn.addEventListener('click', start);
prevBtn.addEventListener('click', () => step(-1));
nextBtn.addEventListener('click', () => step(1));
replayBtn.addEventListener('click', () => { if (index >= 0) speakWord(words[index]); });
// Re-translate static labels on language change.
function applyStrings() {
  ta.placeholder = t('samahan_placeholder');
  startBtn.textContent = t('samahan_startBtn');
  micLabel.textContent = asrSupported ? t('samahan_micLabel') : t('samahan_micUnsupported');
  const fieldLab = textField.querySelector('.field-label');
  if (fieldLab) fieldLab.textContent = t('samahan_yourText');
}
applyStrings();
onLangChange(() => { applyStrings(); if (index >= 0) speakWord(words[index]); });

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