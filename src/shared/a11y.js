/**
 * Accessibility + language state, shared by every tool.
 *
 * Controls font size, letter spacing, line height, the OpenDyslexic font
 * toggle, and the active language. State persists in localStorage and is
 * applied as classes/attributes on <html> so CSS can react. Tools subscribe
 * to language changes via `onLangChange`.
 */
import { config } from './config.js';

const STORE_KEY = 'gabai.prefs.v1';

const defaults = {
  fontSize: 'base', // base | large | xl
  spacing: 'normal', // normal | medium | high
  lineHeight: 'normal', // normal | relaxed
  dyslexic: false,
  lang: 'en', // en | fil
};

let prefs = load();
const langSubs = new Set();

function load() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') };
  } catch (_) {
    return { ...defaults };
  }
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(prefs));
  } catch (_) {}
}

/** Apply all preferences to the document root. */
export function applyPrefs() {
  const el = document.documentElement;
  el.dataset.fontSize = prefs.fontSize;
  el.dataset.spacing = prefs.spacing;
  el.dataset.lineHeight = prefs.lineHeight;
  el.classList.toggle('font-dyslexic', prefs.dyslexic);
  el.lang = prefs.lang === 'fil' ? 'fil' : 'en';
}

/** Initialize on page load. */
export function initA11y() {
  applyPrefs();
}

// ── Getters / setters ──────────────────────────────────────────────
export function getPrefs() {
  return { ...prefs };
}
export function setPref(key, value) {
  prefs[key] = value;
  save();
  applyPrefs();
}

// ── Language ───────────────────────────────────────────────────────
export function getLang() {
  return prefs.lang;
}
export function getLangMeta() {
  return config.languages[prefs.lang];
}
export function setLang(lang) {
  if (!config.languages[lang] || lang === prefs.lang) return;
  prefs.lang = lang;
  save();
  applyPrefs();
  langSubs.forEach((fn) => fn(lang));
}
export function onLangChange(fn) {
  langSubs.add(fn);
  return () => langSubs.delete(fn);
}

// ── Control panel UI ───────────────────────────────────────────────
/**
 * Render the accessibility controls into `container`.
 * Pure DOM, no framework. Buttons reflect + mutate the shared state.
 */
export function renderA11yControls(container) {
  const group = (label, options, current, onPick) => {
    const wrap = document.createElement('div');
    wrap.className = 'a11y-group';
    const lab = document.createElement('span');
    lab.className = 'a11y-group__label';
    lab.textContent = label;
    wrap.appendChild(lab);
    const seg = document.createElement('div');
    seg.className = 'segmented';
    options.forEach((opt) => {
      const b = document.createElement('button');
      b.className = 'segmented__btn';
      b.type = 'button';
      b.textContent = opt.label;
      b.setAttribute('aria-pressed', String(opt.value === current()));
      b.addEventListener('click', () => {
        onPick(opt.value);
        seg.querySelectorAll('.segmented__btn').forEach((x, i) =>
          x.setAttribute('aria-pressed', String(options[i].value === current())),
        );
      });
      seg.appendChild(b);
    });
    wrap.appendChild(seg);
    return wrap;
  };

  container.appendChild(
    group(
      'Text size',
      [
        { label: 'A', value: 'base' },
        { label: 'A+', value: 'large' },
        { label: 'A++', value: 'xl' },
      ],
      () => prefs.fontSize,
      (v) => setPref('fontSize', v),
    ),
  );

  container.appendChild(
    group(
      'Letter spacing',
      [
        { label: 'Normal', value: 'normal' },
        { label: 'Medium', value: 'medium' },
        { label: 'Wide', value: 'high' },
      ],
      () => prefs.spacing,
      (v) => setPref('spacing', v),
    ),
  );

  container.appendChild(
    group(
      'Line height',
      [
        { label: 'Normal', value: 'normal' },
        { label: 'Relaxed', value: 'relaxed' },
      ],
      () => prefs.lineHeight,
      (v) => setPref('lineHeight', v),
    ),
  );

  // OpenDyslexic toggle (switch-style)
  const dys = document.createElement('div');
  dys.className = 'a11y-group a11y-group--row';
  const dysLab = document.createElement('span');
  dysLab.className = 'a11y-group__label';
  dysLab.textContent = 'OpenDyslexic font';
  const sw = makeSwitch(prefs.dyslexic, (on) => setPref('dyslexic', on), 'Toggle OpenDyslexic font');
  dys.append(dysLab, sw);
  container.appendChild(dys);
}

/** A reusable switch-style toggle button. Returns the button element. */
export function makeSwitch(initial, onChange, ariaLabel) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'switch';
  btn.setAttribute('role', 'switch');
  btn.setAttribute('aria-checked', String(!!initial));
  if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
  const knob = document.createElement('span');
  knob.className = 'switch__knob';
  btn.appendChild(knob);
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', String(next));
    onChange(next);
  });
  return btn;
}
