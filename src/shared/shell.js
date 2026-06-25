/**
 * Shared application shell.
 *
 * Every tool calls `mountShell()` to get the identical chrome — top bar,
 * language toggle, accessibility panel — and a content root to render its
 * own body into. This is what makes the four tools "the same UI that only
 * differs in function".
 */
import { initA11y, renderA11yControls, getLang, setLang, onLangChange } from './a11y.js';
import { config } from './config.js';
import { buildSidebar } from './sidebar.js';

/**
 * @param {{ title: string, subtitle?: string, route: string }} opts
 * @returns {{ root: HTMLElement }} the element to render the tool into
 */
export function mountShell({ title, subtitle = '', route }) {
  initA11y();
  document.title = `${title} — GabAI-Basa`;

  const app = document.getElementById('app');
  app.innerHTML = '';
  app.removeAttribute('aria-busy');

  // ── Sidebar (tool navigation) ────────────────────────────────────
  const { sidebar, backdrop, open: openSidebar } = buildSidebar(route);

  // ── Top bar ──────────────────────────────────────────────────────
  const bar = el('header', 'appbar');
  const burger = el('button', 'appbar__burger');
  burger.type = 'button';
  burger.innerHTML = '<span aria-hidden="true">☰</span>';
  burger.setAttribute('aria-label', 'Open tools menu');
  burger.addEventListener('click', openSidebar);

  const home = el('a', 'appbar__home');
  home.href = '/';
  home.innerHTML = '<span aria-hidden="true">←</span> GabAI-Basa';
  home.setAttribute('aria-label', 'Back to home');

  const titleWrap = el('div', 'appbar__title');
  titleWrap.innerHTML = `<span class="appbar__name">${title}</span>`;

  const actions = el('div', 'appbar__actions');
  const lang = buildLangToggle();
  const a11yBtn = el('button', 'iconbtn');
  a11yBtn.type = 'button';
  a11yBtn.innerHTML = '<span aria-hidden="true">Aa</span>';
  a11yBtn.setAttribute('aria-label', 'Reading & accessibility settings');
  a11yBtn.setAttribute('aria-expanded', 'false');
  actions.append(lang, a11yBtn);
  bar.append(burger, home, titleWrap, actions);

  // ── Accessibility panel ──────────────────────────────────────────
  const panel = el('div', 'a11y-panel');
  panel.hidden = true;
  const panelInner = el('div', 'a11y-panel__inner');
  renderA11yControls(panelInner);
  panel.appendChild(panelInner);

  a11yBtn.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    a11yBtn.setAttribute('aria-expanded', String(open));
    a11yBtn.classList.toggle('iconbtn--active', open);
  });

  // ── Main content area ────────────────────────────────────────────
  const main = el('main', 'app-main');
  const container = el('div', 'container');
  if (subtitle) {
    const sub = el('p', 'tool-subtitle');
    sub.textContent = subtitle;
    container.appendChild(sub);
  }
  const root = el('div', 'tool-root');
  container.appendChild(root);
  main.appendChild(container);

  // Sidebar sits outside the offset body; the body holds the rest of the chrome
  // and is pushed right to clear the fixed rail on desktop.
  const body = el('div', 'shell-body');
  body.append(bar, panel, main);
  app.append(sidebar, backdrop, body);
  return { root };
}

function buildLangToggle() {
  const wrap = el('div', 'langtoggle');
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', 'Language');
  const codes = Object.keys(config.languages);
  const buttons = {};
  codes.forEach((code) => {
    const b = el('button', 'langtoggle__btn');
    b.type = 'button';
    b.textContent = code === 'fil' ? 'FIL' : code.toUpperCase();
    b.setAttribute('aria-pressed', String(getLang() === code));
    b.addEventListener('click', () => setLang(code));
    buttons[code] = b;
    wrap.appendChild(b);
  });
  onLangChange((lang) => {
    codes.forEach((c) => buttons[c].setAttribute('aria-pressed', String(c === lang)));
  });
  return wrap;
}

/** Small DOM helper. */
export function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** Toast / inline status helper bound to a target element. */
export function notice(target, message, kind = 'info') {
  target.textContent = message;
  target.dataset.kind = kind;
  target.hidden = !message;
}
