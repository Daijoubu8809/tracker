/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/tracker/").
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/icon.svg'],
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
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        runtimeCaching: [],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
