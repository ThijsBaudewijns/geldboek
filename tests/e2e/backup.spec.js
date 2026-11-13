// Fase 8: back-up (JSON/CSV via deelmenu of download), terugzetten, herinnering, IndexedDB-vangnet,
// service worker (offline) en geen console-fouten vanaf file://.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openApp, readData, goTab, stubNoShare, STORAGE_KEY } = require('./helpers');
const fixture = require('./fixtures/maand.json');

const NOW = new Date(2026, 10, 1, 20, 0); // zondag 1 november 2026, 20:00 lokaal (zoals reflectie.spec.js)
const BALANCE = 14311; // € 143,11 met de fixture

/** Nep-deelmenu (zoals iOS): registreert elke aanroep met naam, type en inhoud van het bestand. */
async function stubShare(page) {
  await page.addInitScript(() => {
    window.__shares = [];
    const canShare = (d) => !!(d && Array.isArray(d.files) && d.files.length > 0 && d.files.every((f) => f instanceof File));
    const share = async (d) => {
      const rec = { title: d.title || null, files: [] };
      for (const f of d.files || []) rec.files.push({ name: f.name, type: f.type, text: await f.text() });
      window.__shares.push(rec);
    };
    for (const [k, v] of [['share', share], ['canShare', canShare]]) {
      try { Object.defineProperty(Navigator.prototype, k, { value: v, configurable: true, writable: true }); } catch (e) { /* negeren */ }
    }
  });
}

async function openWithFixture(page, opts = {}) {
  await page.clock.setFixedTime(NOW);
  await openApp(page, Object.assign({ data: fixture }, opts));
}

async function openGegevens(page) {
  await page.locator('#settings-link').click();
  await expect(page.locator('#settings-gegevens')).toBeVisible();
}

async function balanceCents(page) {
  await goTab(page, 'overzicht');
  return Number(await page.locator('#balance').getAttribute('data-cents'));
}

/** Context-opties van het huidige project (zonder browser-opties zoals channel). */
function contextOptions(use) {
  const out = {};
  for (const k of ['viewport', 'userAgent', 'deviceScaleFactor', 'isMobile', 'hasTouch', 'locale', 'colorScheme']) {
    if (use[k] !== undefined) out[k] = use[k];
  }
  return out;
}

test.describe('Back-up en terugzetten', () => {
  test('back-up via download -> nieuwe context -> terugzetten -> zelfde entries en saldo', async ({ page, browser }, testInfo) => {
    await stubNoShare(page);
    await openWithFixture(page);
    expect(await balanceCents(page)).toBe(BALANCE);
    await openGegevens(page);
    await expect(page.locator('#backup-status')).toHaveText('Je hebt nog geen back-up gemaakt.');

    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#backup-json').click()]);
    expect(download.suggestedFilename()).toBe('geldboek-2026-11-01.json');
    const file = testInfo.outputPath('backup.json');
    await download.saveAs(file);
    const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(backup.version).toBe(1);
    expect(backup.entries).toHaveLength(40);
    expect(backup.settings.lastExportAt).toBe(NOW.toISOString());
    await expect.poll(async () => (await readData(page)).settings.lastExportAt).toBe(NOW.toISOString());
    await expect(page.locator('#backup-status')).toContainText('Laatste back-up of export: 1 november 2026');

    // Nieuwe context = lege telefoon.
    const ctx = await browser.newContext(contextOptions(testInfo.project.use));
    const page2 = await ctx.newPage();
    await page2.clock.setFixedTime(NOW);
    await openApp(page2, { settings: { startBalanceCents: 0 } });
    expect((await readData(page2)).entries).toHaveLength(0);
    await openGegevens(page2);
    let dialogText = '';
    page2.once('dialog', (d) => { dialogText = d.message(); d.accept(); });
    await page2.locator('#backup-file').setInputFiles(file);
    await expect(page2.locator('#toast')).toHaveText('Back-up teruggezet: 40 regels');
    expect(dialogText).toContain('(0 regels)');
    expect(dialogText).toContain('(40 regels)');
    const restored = await readData(page2);
    expect(restored.entries).toHaveLength(40);
    expect(restored.settings.startBalanceCents).toBe(50000);
    expect(await balanceCents(page2)).toBe(BALANCE);
    await ctx.close();
  });

  test('terugzetten: annuleren verandert niets; ongeldig of nieuwere versie wordt geweigerd', async ({ page }, testInfo) => {
    await openWithFixture(page, { hash: 'instellingen' });
    await expect(page.locator('#settings-gegevens')).toBeVisible();

    const other = testInfo.outputPath('ander.json');
    fs.writeFileSync(other, JSON.stringify({ version: 1, settings: { onboarded: true }, entries: [] }));
    page.once('dialog', (d) => d.dismiss());
    await page.locator('#backup-file').setInputFiles(other);
    await expect(page.locator('#toast')).toHaveText('Niets veranderd');
    expect((await readData(page)).entries).toHaveLength(40);

    const newer = testInfo.outputPath('nieuwer.json');
    fs.writeFileSync(newer, JSON.stringify({ version: 2, settings: {}, entries: [] }));
    await page.locator('#backup-file').setInputFiles(newer);
    await expect(page.locator('#toast')).toContainText('nieuwere versie');
    expect((await readData(page)).entries).toHaveLength(40);

    const junk = testInfo.outputPath('rommel.json');
    fs.writeFileSync(junk, 'dit is geen json');
    await page.locator('#backup-file').setInputFiles(junk);
    await expect(page.locator('#toast')).toContainText('geen Geldboek-back-up');
    expect((await readData(page)).entries).toHaveLength(40);
  });

  test('met deelmenu: navigator.share krijgt het JSON- en het CSV-bestand', async ({ page }) => {
    await stubShare(page);
    await openWithFixture(page);
    await openGegevens(page);

    await page.locator('#backup-json').click();
    await expect(page.locator('#toast')).toHaveText('Back-up gedeeld');
    await page.locator('#backup-csv').click();
    await expect(page.locator('#toast')).toHaveText('CSV gedeeld');

    const shares = await page.evaluate(() => window.__shares);
    expect(shares).toHaveLength(2);
    expect(shares[0].files).toHaveLength(1);
    expect(shares[0].files[0].name).toBe('geldboek-2026-11-01.json');
    expect(shares[0].files[0].type).toBe('application/json');
    expect(JSON.parse(shares[0].files[0].text).entries).toHaveLength(40);
    expect(shares[1].files[0].name).toBe('geldboek-2026-11-01.csv');
    expect(shares[1].files[0].type).toBe('text/csv');
    expect((await readData(page)).settings.lastExportAt).toBe(NOW.toISOString());
  });

  test('CSV (download): BOM, kopregel met ; en evenveel regels als entries', async ({ page }, testInfo) => {
    await stubNoShare(page);
    await openWithFixture(page, { hash: 'instellingen' });
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#backup-csv').click()]);
    expect(download.suggestedFilename()).toBe('geldboek-2026-11-01.csv');
    const file = testInfo.outputPath('export.csv');
    await download.saveAs(file);
    const buf = fs.readFileSync(file);
    expect([...buf.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM
    const lines = buf.toString('utf8').slice(1).split('\r\n').filter((l) => l !== '');
    expect(lines).toHaveLength(1 + fixture.entries.length);
    expect(lines[0].split(';')).toEqual(expect.arrayContaining(['datum', 'bedrag', 'id', 'type', 'amountCents', 'what', 'note', 'category', 'worthLater', 'advanceFor', 'source', 'hours']));
    expect(lines[1]).toContain(';-4,50;'); // eerste uitgave (koffie € 4,50), decimale komma
    await expect.poll(async () => (await readData(page)).settings.lastExportAt).toBe(NOW.toISOString());
  });
});

test.describe('Back-upherinnering (U18)', () => {
  test('na 7 dagen zonder back-up: balk op Invoer; "Back-up maken" downloadt en de balk verdwijnt', async ({ page }) => {
    await stubNoShare(page);
    await openWithFixture(page);
    const bar = page.locator('#backup-reminder');
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('Nog geen back-up gemaakt.');
    // Bovenaan de Invoer-sectie.
    expect(await page.evaluate(() => document.getElementById('view-invoer').firstElementChild.id)).toBe('backup-reminder');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#backup-reminder-now').click()]);
    expect(download.suggestedFilename()).toBe('geldboek-2026-11-01.json');
    await expect(bar).toHaveCount(0);
    expect((await readData(page)).settings.lastExportAt).toBe(NOW.toISOString());
  });

  test('wegklikken blijft die dag weg (ook na herladen), de volgende dag komt hij terug', async ({ page }) => {
    await openWithFixture(page);
    await expect(page.locator('#backup-reminder')).toBeVisible();
    await page.locator('#backup-reminder-close').click();
    await expect(page.locator('#backup-reminder')).toHaveCount(0);
    expect((await readData(page)).settings.backupReminderDismissedOn).toBe('2026-11-01');
    await page.reload();
    await expect(page.locator('#entry-type')).toBeVisible();
    await expect(page.locator('#backup-reminder')).toHaveCount(0);
    await page.clock.setFixedTime(new Date(2026, 10, 2, 9, 0));
    await page.reload();
    await expect(page.locator('#backup-reminder')).toBeVisible();
  });

  test('screenshot herinnering en Gegevens (390x844)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone', 'screenshot alleen in het iphone-project');
    await page.setViewportSize({ width: 390, height: 844 });
    await openWithFixture(page);
    await expect(page.locator('#backup-reminder')).toBeVisible();
    await page.screenshot({ path: path.join(__dirname, 'screens', 'herinnering.png') });
    await openGegevens(page);
    await page.locator('#settings-gegevens').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(__dirname, 'screens', 'gegevens.png') });
  });

  test('geen herinnering bij een verse app of een recente back-up', async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    const recent = JSON.parse(JSON.stringify(fixture));
    recent.settings.lastExportAt = new Date(2026, 9, 28, 12, 0).toISOString();
    await openApp(page, { data: recent });
    await expect(page.locator('#entry-type')).toBeVisible();
    await expect(page.locator('#backup-reminder')).toHaveCount(0);
  });
});

/** Leest de IndexedDB-spiegel (database geldboek, store data, sleutel v1) uit de pagina. */
async function readMirror(page) {
  return page.evaluate(() => new Promise((resolve) => {
    if (!window.indexedDB) { resolve(null); return; }
    const req = indexedDB.open('geldboek', 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('data')) req.result.createObjectStore('data'); };
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      const get = db.transaction('data', 'readonly').objectStore('data').get('v1');
      get.onsuccess = () => { db.close(); resolve(typeof get.result === 'string' ? JSON.parse(get.result) : null); };
      get.onerror = () => { db.close(); resolve(null); };
    };
  }));
}

test.describe('Opslagvangnet (U23)', () => {
  for (const http of [false, true]) {
    test(`localStorage leeg + herladen -> hersteld uit IndexedDB (${http ? 'http' : 'file://'})`, async ({ page }) => {
      await openWithFixture(page, { seedOnce: true, http });
      await expect.poll(async () => { const m = await readMirror(page); return m ? m.entries.length : -1; }).toBe(40);
      await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
      await page.reload();
      await page.waitForFunction(() => window.Geldboek && window.Geldboek.app && window.Geldboek.app.store);
      await expect(page.locator('#toast')).toContainText('hersteld');
      await expect.poll(async () => { const d = await readData(page); return d ? d.entries.length : 0; }).toBe(40);
      await expect(page.locator('#entry-type')).toBeVisible();
      expect(await balanceCents(page)).toBe(BALANCE);
    });
  }

  test('nieuwe wijziging gaat ook naar IndexedDB', async ({ page }) => {
    await openApp(page, { settings: { startBalanceCents: 1000 } });
    await page.evaluate(() => window.Geldboek.app.store.updateSettings({ startBalanceCents: 4242 }));
    await expect.poll(async () => { const m = await readMirror(page); return m ? m.settings.startBalanceCents : null; }).toBe(4242);
  });
});

test.describe('PWA', () => {
  test('via http: service worker registreert, cachet de app en de pagina laadt offline', async ({ page, context }) => {
    await openApp(page, { http: true, settings: { startBalanceCents: 2500 } });
    const hasSW = await page.evaluate(() => 'serviceWorker' in navigator);
    test.skip(!hasSW, 'Deze Playwright-browser heeft geen service workers');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 10000 }).toBe(true);
    expect(await page.evaluate(() => caches.keys())).toContainEqual(expect.stringMatching(/^geldboek-v\d+$/));
    expect(await page.evaluate(async () => !!(await caches.match('./js/app.js')))).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => window.Geldboek && window.Geldboek.app && window.Geldboek.app.store);
    await expect(page.locator('#entry-type')).toBeVisible();
    await goTab(page, 'overzicht');
    await expect(page.locator('#balance')).toHaveAttribute('data-cents', '2500');
    await context.setOffline(false);
  });

  test('manifest en apple-touch-icon worden via http goed geserveerd', async ({ page, request }) => {
    await openApp(page, { http: true });
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const m = await request.get('http://localhost:8765/' + href);
    expect(m.ok()).toBe(true);
    expect(m.headers()['content-type']).toContain('application/manifest+json');
    expect((await m.json()).display).toBe('standalone');
    const icon = await request.get('http://localhost:8765/' + await page.locator('link[rel="apple-touch-icon"]').getAttribute('href'));
    expect(icon.headers()['content-type']).toBe('image/png');
    const sw = await request.get('http://localhost:8765/sw.js');
    expect(sw.headers()['content-type']).toContain('text/javascript');
  });

  test('balk "Nieuwe versie": tik stuurt skipWaiting naar de wachtende worker', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      window.__msgs = [];
      window.Geldboek.app.showUpdateBar({ postMessage: (m) => window.__msgs.push(m) });
    });
    const bar = page.locator('#update-bar');
    await expect(bar).toBeVisible();
    await expect(bar).toHaveText('Nieuwe versie, tik om te verversen');
    await bar.click();
    expect(await page.evaluate(() => window.__msgs)).toEqual([{ type: 'skipWaiting' }]);
  });

  test('vanaf file://: geen service worker en geen console-fouten op alle schermen', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await openWithFixture(page);
    expect(await page.evaluate(() => location.protocol)).toBe('file:');
    expect(await page.locator('link[rel="manifest"]').getAttribute('href')).toBeNull(); // alleen via http(s)
    for (const r of ['overzicht', 'terugkijken', 'reflectie', 'invoer']) await goTab(page, r);
    await openGegevens(page);
    expect(await page.evaluate(() => ('serviceWorker' in navigator) ? navigator.serviceWorker.controller : null)).toBeNull();
    expect(errors).toEqual([]);
  });
});
