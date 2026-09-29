/// <reference types="vitest/config" />
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/tracker/").
const base = process.env.BASE_PATH ?? '/';
const ICON_VERSION = 2;
const SW_VERSION = 3;

/**
 * Self-hosted OCR files for "Scan label" (no CDN): served in dev, emitted on build.
 * Not precached — the service worker caches them the first time a scan runs.
 */
const TESSERACT_FILES: Record<string, string> = {
  'tesseract/worker.min.js': 'node_modules/tesseract.js/dist/worker.min.js',
  'tesseract/tesseract-core-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
  'tesseract/tesseract-core-simd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'tesseract/tesseract-core-relaxedsimd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
  'tesseract/lang/eng.traineddata.gz': 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
};

function tesseractAssets(): Plugin {
  return {
    name: 'tesseract-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0].replace(/^\//, '').replace(base.replace(/^\//, ''), '');
        const src = TESSERACT_FILES[path];
        if (!src) return next();
        res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        res.setHeader('Content-Length', statSync(src).size);
        createReadStream(src).pipe(res);
      });
    },
    generateBundle() {
      for (const [fileName, src] of Object.entries(TESSERACT_FILES)) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(src) });
      }
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    react(),
    tesseractAssets(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Plate Tracker',
        short_name: 'Plate',
        description: 'Calorie & training tracker for dining-hall portions. All data stays on your phone.',
        theme_color: '#0f766e',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          // ?v=N busts cached icons when the artwork changes (bump with ICON_VERSION in index.html too).
          { src: `icons/icon-192.png?v=${ICON_VERSION}`, sizes: '192x192', type: 'image/png' },
          { src: `icons/icon-512.png?v=${ICON_VERSION}`, sizes: '512x512', type: 'image/png' },
          { src: `icons/icon-maskable-512.png?v=${ICON_VERSION}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Bump to force a fresh service-worker cache (e.g. after changing icons).
        cacheId: `plate-tracker-v${SW_VERSION}`,
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // The OCR engine (~7 MB) is only downloaded if you use Scan label.
        globIgnores: ['tesseract/**'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Worker script, WASM core and English data: cache on first scan → offline afterwards.
            urlPattern: ({ url }) => url.pathname.includes('/tesseract/'),
            handler: 'CacheFirst',
            options: {
              cacheName: `tesseract-v${SW_VERSION}`,
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
