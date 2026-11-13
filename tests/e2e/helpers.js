// Gedeelde helpers voor de Playwright-tests.
const path = require('path');
const { pathToFileURL } = require('url');

const APP_FILE_URL = pathToFileURL(path.resolve(__dirname, '..', '..', 'app', 'index.html')).href;
const APP_HTTP_URL = 'http://localhost:8765/index.html';
const STORAGE_KEY = 'geldboek.v1';

/** Zet standalone-modus aan (alsof de app vanaf het beginscherm draait, U22). */
async function setStandalone(page) {
  await page.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    } catch (e) { /* negeren */ }
  });
}

/**
 * Opent de app via file:// (standaard) met standalone aan.
 * opts.hash: bijv. 'overzicht'; opts.http: true om via de lokale server (poort 8765) te openen.
 */
async function openApp(page, opts = {}) {
  await setStandalone(page);
  const base = opts.http ? APP_HTTP_URL : APP_FILE_URL;
  await page.goto(base + (opts.hash ? '#' + opts.hash : ''));
  await page.waitForFunction(() => window.Geldboek && window.Geldboek.app && window.Geldboek.app.store);
}

/** Leest localStorage['geldboek.v1'] als object (of null). */
async function readData(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY);
}

/** Vult de verplichte velden van het uitgaveformulier en slaat op. */
async function addExpense(page, { amount, what, note, fixed } = {}) {
  await page.locator('#f-amount').fill(amount);
  await page.locator('#f-what').fill(what);
  await page.locator('#f-note').fill(note);
  if (fixed) await page.locator(`[data-group="fixed"] [data-value="${fixed}"]`).click();
  await page.locator('#f-submit').click();
}

/** Tikt op een tabblad in de tabbalk en wacht tot de sectie zichtbaar is. */
async function goTab(page, route) {
  await page.locator(`.tab[data-route="${route}"]`).click();
  await page.locator(`#view-${route}`).waitFor({ state: 'visible' });
}

/** Lokale datum van n dagen geleden als "YYYY-MM-DD" (voor #f-datetime). */
function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

module.exports = { APP_FILE_URL, APP_HTTP_URL, STORAGE_KEY, setStandalone, openApp, readData, addExpense, goTab, isoDaysAgo };
