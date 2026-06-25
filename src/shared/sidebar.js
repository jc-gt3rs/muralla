/**
 * Shared left sidebar — tool navigation across the four tools.
 * Desktop (≥768px): a fixed vertical rail, always visible.
 * Mobile (<768px): an off-canvas drawer toggled by the hamburger in the app bar.
 *
 * Mirrors the GPTZero sidebar pattern: a logo on top, the primary actions
 * grouped in a rounded pill (here, the four tools), and quiet items below.
 */

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

const ICONS = {
  // Basahin — listen (speaker waves)
  basahin:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M11 5 6 9H2v6h4l5 4V5z"/>' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/></svg>',
  // Samahan — read along (open book)
  samahan:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M12 7c-2-1.3-4.5-2-7-2v13c2.5 0 5 .7 7 2 2-1.3 4.5-2 7-2V5c-2.5 0-5 .7-7 2z"/>' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M12 7v13"/></svg>',
  // Salita — look up (magnifier)
  salita:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<circle cx="11" cy="11" r="7"/><path stroke-linecap="round" d="m20 20-3.2-3.2"/></svg>',
  // Ipaliwanag — explain (sparkle)
  ipaliwanag:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z"/></svg>',
  // Home
  home:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M3 11l9-8 9 8"/>' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M5 10v10h5v-6h4v6h5V10"/></svg>',
};

const TOOLS = [
  { key: 'basahin',    route: '/basahin',    href: '/basahin/',    label: 'Basahin' },
  { key: 'samahan',    route: '/samahan',    href: '/samahan/',    label: 'Samahan' },
  { key: 'salita',     route: '/salita',     href: '/salita/',     label: 'Salita' },
  { key: 'ipaliwanag', route: '/ipaliwanag', href: '/ipaliwanag/', label: 'Ipaliwanag' },
];

/**
 * @param {string} activeRoute the route of the current tool (e.g. '/basahin')
 * @returns {{ sidebar: HTMLElement, backdrop: HTMLElement, open: Function, close: Function }}
 */
export function buildSidebar(activeRoute) {
  const sidebar = el('nav', 'sidebar');
  sidebar.setAttribute('aria-label', 'Tools');

  const group = el('div', 'sidebar__group');
  TOOLS.forEach((t) => {
    const item = el('a', 'sidebar__item');
    item.href = t.href;
    if (t.route === activeRoute) {
      item.classList.add('is-active');
      item.setAttribute('aria-current', 'page');
    }
    item.innerHTML =
      `<span class="sidebar__icon">${ICONS[t.key]}</span><span class="sidebar__label">${t.label}</span>`;
    group.appendChild(item);
  });
  sidebar.appendChild(group);

  sidebar.appendChild(el('div', 'sidebar__spacer'));

  const homeItem = el('a', 'sidebar__item sidebar__item--plain');
  homeItem.href = '/';
  homeItem.innerHTML =
    `<span class="sidebar__icon">${ICONS.home}</span><span class="sidebar__label">Home</span>`;
  sidebar.appendChild(homeItem);

  // Mobile drawer plumbing
  const backdrop = el('div', 'sidebar-backdrop');
  const open = () => {
    sidebar.classList.add('is-open');
    backdrop.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  };
  const close = () => {
    sidebar.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    document.body.style.overflow = '';
  };
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  return { sidebar, backdrop, open, close };
}
