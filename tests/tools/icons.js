#!/usr/bin/env node
/*
 * Rendert de app-iconen uit één SVG (app/icons/icon.svg) met Playwright (fase 8).
 * Gebruik: node tests/tools/icons.js
 * Schrijft app/icons/icon-192.png, icon-512.png en apple-touch-icon.png (180x180).
 * Uitvoer is RGB zonder alfakanaal (iOS maakt transparante delen zwart).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium, webkit } = require('@playwright/test');
const png = require('./png');

const ICONS = path.resolve(__dirname, '..', '..', 'app', 'icons');
const SVG = fs.readFileSync(path.join(ICONS, 'icon.svg'), 'utf8');
const OUT = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180]
];
const EDGE_PATHS = [
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
];

async function launch() {
  if (EDGE_PATHS.some((p) => fs.existsSync(p))) {
    try { return await chromium.launch({ channel: 'msedge' }); } catch (e) { /* door naar de volgende */ }
  }
  try { return await chromium.launch(); } catch (e) { /* door naar webkit */ }
  return webkit.launch();
}

(async () => {
  const browser = await launch();
  try {
    for (const [name, size] of OUT) {
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
      const svg = SVG.replace(/width="512" height="512"/, `width="${size}" height="${size}"`);
      await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;padding:0;background:#1f6f5c}svg{display:block}</style></head><body>${svg}</body></html>`);
      const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size, height: size } });
      const img = png.decode(shot);
      const out = png.encodeRGB(img.width, img.height, img.pixels, img.channels, [0x1f, 0x6f, 0x5c]);
      fs.writeFileSync(path.join(ICONS, name), out);
      const i = png.info(out);
      console.log(`${name}: ${i.width}x${i.height}, kleurtype ${i.colorType} (RGB, ondoorzichtig)`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
