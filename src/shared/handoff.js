/**
 * Cross-page handoff.
 *
 * The landing-page hero stores the user's text under `gabai.handoff` in
 * sessionStorage, then redirects to /<tool>/. The destination tool calls
 * `consumeHandoff(tool)` on load to retrieve and clear it, so a refresh
 * doesn't re-trigger. Keep the shape in sync with the inline script in
 * index.html.
 */
const KEY = 'gabai.handoff';

/**
 * Retrieve + clear the handoff payload if it targets `tool`.
 * @returns {{ tool, text, fileName, ts } | null}
 */
export function consumeHandoff(tool) {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.tool !== tool) return null;
    sessionStorage.removeItem(KEY); // consume once
    return data;
  } catch (_) {
    return null;
  }
}

/** Store a handoff for `tool` (used by the landing hero / programmatic links). */
export function setHandoff(tool, payload = {}) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ tool, ts: Date.now(), ...payload }));
  } catch (_) {}
}
