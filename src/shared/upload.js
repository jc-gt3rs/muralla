/**
 * Shared file upload + extraction for tool pages.
 * Supports .txt, .md, .pdf (via pdfjs-dist CDN), .docx (via mammoth CDN).
 * Both parsers are lazy-loaded only when the matching file type is used.
 */

const PDFJS_VER = '3.11.174';
const scriptCache = {};

function loadScript(src) {
  if (scriptCache[src]) return scriptCache[src];
  scriptCache[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load parser. Check your connection.'));
    document.head.appendChild(s);
  });
  return scriptCache[src];
}

export async function extractPdf(file) {
  await loadScript(`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}/build/pdf.min.js`);
  const pdfjs = window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}/build/pdf.worker.min.js`;
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => it.str).join(' '));
  }
  return pages.join('\n\n');
}

export async function extractDocx(file) {
  await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js');
  const arrayBuffer = await file.arrayBuffer();
  const res = await window.mammoth.extractRawText({ arrayBuffer });
  return res.value || '';
}

async function extractFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return extractPdf(file);
  if (name.endsWith('.docx')) return extractDocx(file);
  if (name.endsWith('.txt') || name.endsWith('.md') || file.type.startsWith('text/')) return file.text();
  throw new Error('Unsupported file. Use .txt, .md, .pdf, or .docx.');
}

/**
 * Mount an upload button + drag-and-drop on a textarea.
 * Returns the <button> element — insert it wherever you like in the UI.
 *
 * @param {HTMLTextAreaElement} textarea
 * @param {object} opts
 * @param {number}   [opts.maxChars]   Trim extracted text to this length.
 * @param {Function} [opts.onStatus]   Called with (message, kind) — kind is 'info'|'ok'|'error'.
 * @param {Function} [opts.onLoad]     Called after a successful load (textarea already updated).
 * @param {Element}  [opts.dropZone]   Element to attach drag events to (default: textarea).
 */
export function mountUpload(textarea, opts = {}) {
  const { maxChars, onStatus = () => {}, onLoad = () => {}, dropZone } = opts;

  // Hidden file input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.txt,.md,.pdf,.docx';
  fileInput.setAttribute('aria-label', 'Upload file');
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  // Upload button
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn--ghost';
  btn.style.fontSize = '14px';
  btn.style.padding = '10px 18px';
  btn.style.minHeight = '42px';
  btn.innerHTML =
    '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" style="flex-shrink:0">' +
    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>' +
    '</svg>Upload';
  btn.setAttribute('aria-label', 'Upload a file (.txt, .md, .pdf, .docx)');

  btn.addEventListener('click', () => fileInput.click());

  async function processFile(file) {
    onStatus(`Reading ${file.name}…`, 'info');
    btn.disabled = true;
    try {
      let text = await extractFile(file);
      text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (!text) throw new Error('No readable text found in this file.');
      const trimmed = maxChars && text.length > maxChars;
      textarea.value = trimmed ? text.slice(0, maxChars) : text;
      textarea.dispatchEvent(new Event('input'));
      if (trimmed) {
        onStatus(`${file.name} loaded — trimmed to ${maxChars.toLocaleString()} chars`, 'ok');
      } else {
        onStatus(`${file.name} loaded ✓`, 'ok');
      }
      textarea.focus();
      onLoad();
    } catch (err) {
      onStatus(err.message || 'Could not read this file.', 'error');
    } finally {
      btn.disabled = false;
      fileInput.value = '';
    }
  }

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) processFile(fileInput.files[0]);
  });

  // Drag-and-drop
  const zone = dropZone || textarea;
  let dragDepth = 0;

  zone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth++;
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); });
  zone.addEventListener('dragleave', () => {
    dragDepth--;
    if (dragDepth === 0) zone.classList.remove('drag-over');
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    zone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
  });

  return btn;
}
