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
let startTime = null;

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

const completionPanel = el('div', 'panel duo-completion');
completionPanel.hidden = true;

// Confetti canvas setup
const confettiCanvas = el('canvas');
confettiCanvas.id = 'confetti-canvas';
document.body.appendChild(confettiCanvas);

root.append(ttsBanner, inputPanel, micPanel, stagePanel, completionPanel);

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

function finishSession() {
  stopListening();
  cancel();
  
  if (practiceListening) {
    practiceListening.stop();
    practiceListening = null;
  }
  
  // Hide active panels
  stagePanel.hidden = true;
  micPanel.hidden = true;
  inputPanel.hidden = true;
  
  // Show completion screen
  completionPanel.hidden = false;
  completionPanel.innerHTML = '';
  
  // Track statistics
  const vals = Object.values(grades);
  const correct = vals.filter((g) => g === 'correct').length;
  const close = vals.filter((g) => g === 'close').length;
  const wrong = vals.filter((g) => g === 'wrong').length;
  
  // Calculate XP
  let xp = micOn ? (10 + correct * 5 + close * 2) : 15;
  
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
    xpLabel: isFil ? 'Nakuhang XP' : 'XP Gained',
    accLabel: isFil ? 'Wastong Bigkas' : 'Accuracy',
    timeLabel: isFil ? 'Oras' : 'Time Taken',
    reviewTitle: isFil ? 'Sanayin ang mga Salita' : 'Practice Words',
    reviewSubtitle: isFil ? 'I-tap ang 🔊 upang pakinggan at 🎤 upang ulitin. Gawing tama upang maalis!' : 'Tap 🔊 to listen and 🎤 to repeat. Score correct to clear them!',
    noMistakes: isFil ? 'Perpektong Pagbasa! Walang pagkakamali na kailangang sanayin. 🎉' : 'Perfect Reading! No mistakes to practice. 🎉',
    micOffNotice: isFil ? 'Naka-off ang mic kanina. Subukan ang mga mahihirap na salitang ito gamit ang mic!' : 'Pronunciation check was off. Try practicing these key words with the mic!',
    practiceComplete: isFil ? 'Kumpleto na ang Pagsasanay! 🌟' : 'Practice Complete! 🌟',
    practiceCompleteSubtitle: isFil ? 'Galing! Naitama mo ang lahat ng mga salita! +5 XP' : 'Awesome! You corrected all the words! +5 XP',
    btnReadAgain: isFil ? 'Basahin Muli' : 'Read Again',
    btnContinue: isFil ? 'Magpatuloy' : 'Continue'
  };

  // Render Header & Animated Mascot
  const header = el('div', 'duo-header');
  const mascotDiv = el('div');
  mascotDiv.innerHTML = `
    <svg viewBox="0 0 100 100" width="120" height="120" style="margin: 0 auto 16px; display: block; animation: duoBounce 2s infinite ease-in-out;">
      <style>
        @keyframes duoBounce {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-8px) scale(1.02); }
        }
      </style>
      <circle cx="50" cy="50" r="45" fill="#f0fdf4" opacity="0.6"/>
      <circle cx="38" cy="84" r="6" fill="#FF9600" />
      <circle cx="62" cy="84" r="6" fill="#FF9600" />
      <path d="M 22 36 L 12 18 L 34 26 Z" fill="#58CC02" stroke="#46a302" stroke-width="2" stroke-linejoin="round"/>
      <path d="M 78 36 L 88 18 L 66 26 Z" fill="#58CC02" stroke="#46a302" stroke-width="2" stroke-linejoin="round"/>
      <rect x="18" y="24" width="64" height="60" rx="32" fill="#58CC02" stroke="#46a302" stroke-width="3" />
      <path d="M 28 60 Q 50 42 72 60 Q 50 82 28 60" fill="#FFFFFF" opacity="0.9" />
      <path d="M 40 56 Q 44 60 48 56" fill="none" stroke="#A7F3D0" stroke-width="2" stroke-linecap="round"/>
      <path d="M 52 56 Q 56 60 60 56" fill="none" stroke="#A7F3D0" stroke-width="2" stroke-linecap="round"/>
      <path d="M 46 66 Q 50 70 54 66" fill="none" stroke="#A7F3D0" stroke-width="2" stroke-linecap="round"/>
      <path d="M 18 42 C 6 44 10 64 19 58 Z" fill="#46a302" />
      <path d="M 82 42 C 94 44 90 64 81 58 Z" fill="#46a302" />
      <circle cx="36" cy="42" r="15" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5"/>
      <circle cx="64" cy="42" r="15" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5"/>
      <circle cx="36" cy="42" r="7" fill="#1E293B"/>
      <circle cx="64" cy="42" r="7" fill="#1E293B"/>
      <circle cx="34" cy="40" r="2.5" fill="#FFFFFF"/>
      <circle cx="62" cy="40" r="2.5" fill="#FFFFFF"/>
      <path d="M 50 48 L 44 56 Q 50 62 56 56 Z" fill="#FFC800" stroke="#E28A00" stroke-width="1" stroke-linejoin="round" />
      <circle cx="23" cy="50" r="3.5" fill="#FDA4AF" opacity="0.6"/>
      <circle cx="77" cy="50" r="3.5" fill="#FDA4AF" opacity="0.6"/>
    </svg>
  `;
  const h2 = el('h2');
  h2.textContent = t.title;
  const pMsg = el('p');
  pMsg.textContent = t.subtitle;
  header.append(mascotDiv, h2, pMsg);
  completionPanel.appendChild(header);

  // Render Stats Grid
  const statsGrid = el('div', 'duo-stats-grid');

  // XP Card
  const xpCard = el('div', 'duo-stat-card');
  const xpIcon = el('span', 'duo-stat-card__icon');
  xpIcon.textContent = '⚡';
  const xpVal = el('span', 'duo-stat-card__val duo-stat-card__val--xp');
  xpVal.textContent = `+${xp} XP`;
  const xpLabel = el('span', 'duo-stat-card__label');
  xpLabel.textContent = t.xpLabel;
  xpCard.append(xpIcon, xpVal, xpLabel);

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

  statsGrid.append(xpCard, accCard, timeCard);
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

  const continueBtn = el('button', 'btn btn--duo-primary');
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
      onresult: (transcript) => {
        const heard = transcript.split(/\s+/).pop() || transcript;
        const grade = gradePronunciation(itemData.word, heard);
        
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
            xp += 5;
            const xpValEl = completionPanel.querySelector('.duo-stat-card__val--xp');
            if (xpValEl) xpValEl.textContent = `+${xp} XP`;
            
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
