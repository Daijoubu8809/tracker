// Renders public/icons/icon.svg to the PNG sizes the manifest needs.
// Usage: node scripts/make-icons.mjs   (needs Playwright + Chromium available)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icons/icon.svg', 'utf8');
const targets = [
  ['public/icons/icon-192.png', 192, 0],
  ['public/icons/icon-512.png', 512, 0],
  ['public/icons/icon-maskable-512.png', 512, 0.1],
  ['public/icons/apple-touch-icon.png', 180, 0],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [out, size, pad] of targets) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(
    `<html><body style="margin:0;background:#0f766e;display:grid;place-items:center;width:${size}px;height:${size}px">` +
      `<div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`,
  );
  await page.screenshot({ path: out, omitBackground: false });
}
await browser.close();
console.log('icons written');
