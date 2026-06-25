import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const r = (p) => fileURLToPath(new URL(p, import.meta.url));

// Multi-page app: the landing page plus one page per tool.
// Each tool lives at its own folder URL (e.g. /basahin/) and loads
// its ES module from src/<tool>/main.js.
export default defineConfig({
  root: '.',
  appType: 'mpa',
  build: {
    target: 'es2019',
    rollupOptions: {
      input: {
        main:       r('./index.html'),
        basahin:    r('./basahin/index.html'),
        samahan:    r('./samahan/index.html'),
        salita:     r('./salita/index.html'),
        ipaliwanag: r('./ipaliwanag/index.html'),
      },
    },
  },
  server: {
    open: '/',
  },
});
