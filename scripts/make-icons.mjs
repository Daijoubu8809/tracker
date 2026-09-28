// Renders the home-screen icons from a source image.
// Usage: node scripts/make-icons.mjs photo.jpg [cropX cropY cropSize]
//   e.g. node scripts/make-icons.mjs ~/me.jpg 40 470 1760
// After regenerating, bump ICON_VERSION in vite.config.ts and the ?v= in index.html.
//   The crop is a square in source-image pixels. Output PNGs contain no EXIF/GPS metadata
//   (they are fresh renders), so the original photo never needs to be committed.
// Needs Playwright + Chromium (preinstalled in this environment).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const [photo, cx, cy, cs] = process.argv.slice(2);
if (!photo) {
  console.error('Usage: node scripts/make-icons.mjs photo.jpg [cropX cropY cropSize]');
  process.exit(1);
}
const src = `data:image/${extname(photo).slice(1).toLowerCase().replace('jpg', 'jpeg')};base64,${readFileSync(photo).toString('base64')}`;

const targets = [
  // [file, size, artwork scale]
  ['public/icons/apple-touch-icon.png', 180, 1], // full bleed; iOS rounds the corners itself
  ['public/icons/icon-192.png', 192, 1],
  ['public/icons/icon-512.png', 512, 1],
  ['public/icons/icon-maskable-512.png', 512, 0.8], // artwork inside the central 80% safe zone
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [out, size, scale] of targets) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * scale);
  // Crop: position the full image so the chosen square fills `box` pixels.
  const crop = (box) => {
    if (!cs) return `width:${box}px;height:${box}px;object-fit:cover;`;
    const k = box / Number(cs);
    return `position:absolute;left:${-Number(cx) * k}px;top:${-Number(cy) * k}px;width:auto;height:auto;transform-origin:0 0;transform:scale(${k});`;
  };
  await page.setContent(`<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;overflow:hidden;position:relative;background:#1f1a17">
    ${scale < 1 ? `<div style="position:absolute;inset:0;overflow:hidden;filter:blur(${size / 16}px) brightness(0.8);transform:scale(1.15)"><div style="position:relative;width:${size}px;height:${size}px;overflow:hidden"><img src="${src}" style="${crop(size)}"></div></div>` : ''}
    <div style="position:absolute;left:${(size - inner) / 2}px;top:${(size - inner) / 2}px;width:${inner}px;height:${inner}px;overflow:hidden;${scale < 1 ? 'border-radius:50%;' : ''}">
      <img src="${src}" style="${crop(inner)}">
    </div></body></html>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.screenshot({ path: out, omitBackground: false });
}
await browser.close();
console.log('icons written');
