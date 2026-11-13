'use strict';
// Fase 8: iconen, manifest en verwijzingen in index.html (PWA, U25/U26).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const png = require('../tools/png');

const APP = path.resolve(__dirname, '..', '..', 'app');
const read = (p) => fs.readFileSync(path.join(APP, p));

function assertOpaque(file, size) {
  const buf = read(file);
  const i = png.info(buf);
  assert.equal(i.width, size, file + ' breedte');
  assert.equal(i.height, size, file + ' hoogte');
  assert.ok(!i.chunkTypes.includes('tRNS'), file + ' zonder tRNS');
  const img = png.decode(buf);
  if (img.channels === 4) {
    for (let p = 3; p < img.pixels.length; p += 4) assert.equal(img.pixels[p], 255, file + ': transparante pixel');
  } else {
    assert.equal(i.colorType, 2, file + ' is RGB zonder alfakanaal');
  }
}

test('apple-touch-icon.png is 180x180 en ondoorzichtig', () => assertOpaque('icons/apple-touch-icon.png', 180));
test('icon-192.png en icon-512.png hebben de juiste maat en zijn ondoorzichtig', () => {
  assertOpaque('icons/icon-192.png', 192);
  assertOpaque('icons/icon-512.png', 512);
});

test('png-helper: RGBA wordt op de achtergrond platgeslagen', () => {
  const rgba = Buffer.from([255, 0, 0, 0, 0, 0, 255, 255]);
  const out = png.encodeRGB(2, 1, rgba, 4, [10, 20, 30]);
  const img = png.decode(out);
  assert.equal(img.channels, 3);
  assert.deepEqual([...img.pixels], [10, 20, 30, 0, 0, 255]);
});

test('manifest: naam, standalone, start_url, scope, kleuren, iconen bestaan', () => {
  const m = JSON.parse(read('manifest.webmanifest').toString('utf8'));
  assert.equal(m.name, 'Geldboek');
  assert.equal(m.short_name, 'Geldboek');
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './index.html');
  assert.equal(m.scope, './');
  assert.match(m.theme_color, /^#[0-9a-f]{6}$/i);
  assert.match(m.background_color, /^#[0-9a-f]{6}$/i);
  m.icons.forEach((ic) => assert.ok(fs.existsSync(path.join(APP, ic.src)), ic.src));
});

test('index.html verwijst naar manifest en apple-touch-icon', () => {
  const html = read('index.html').toString('utf8');
  // Het manifest krijgt zijn href pas via http(s) (WebKit geeft vanaf file:// een CORS-fout), zie index.html.
  assert.match(html, /<link rel="manifest" id="manifest-link" data-href="manifest\.webmanifest">/);
  assert.match(html, /l\.setAttribute\('href', l\.getAttribute\('data-href'\)\)/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/);
});

test('sw.js: VERSION in de cachenaam en elk bestand in FILES bestaat; alle app-bestanden staan erin', () => {
  const sw = read('sw.js').toString('utf8');
  assert.match(sw, /const VERSION = 'v\d+';/);
  const files = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter((f) => f !== '');
  files.forEach((f) => assert.ok(fs.existsSync(path.join(APP, f)), 'bestaat niet: ' + f));
  const all = [];
  (function walk(dir) {
    fs.readdirSync(path.join(APP, dir), { withFileTypes: true }).forEach((d) => {
      const rel = dir ? dir + '/' + d.name : d.name;
      if (d.isDirectory()) walk(rel);
      else if (rel !== 'sw.js') all.push(rel);
    });
  })('');
  all.forEach((f) => assert.ok(files.includes(f), 'ontbreekt in sw.js FILES: ' + f));
});
