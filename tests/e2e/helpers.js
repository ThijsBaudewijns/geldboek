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
 * Zet data in localStorage['geldboek.v1'] vóór de app laadt, maar alleen als de sleutel nog leeg is
 * (zodat een reload binnen een test de data van die test niet overschrijft).
 */
async function seedData(page, data) {
  await page.addInitScript(({ key, json }) => {
    try {
      if (!localStorage.getItem(key)) localStorage.setItem(key, json);
    } catch (e) { /* negeren */ }
  }, { key: STORAGE_KEY, json: JSON.stringify(data) });
}

/**
 * Opent de app via file:// (standaard).
 * opts.hash: bijv. 'overzicht'; opts.http: true om via de lokale server (poort 8765) te openen.
 * opts.standalone (standaard true): alsof de app vanaf het beginscherm draait (U22).
 * opts.onboarded (standaard true): seedt settings met onboarded: true, zodat de app direct opent
 *   (zonder installatie-/eerste-keer-scherm). false = verse app, geen seed.
 * opts.settings: extra settings om te seeden (bijv. { hourlyWageCents: 1500, startBalanceCents: 10000 }).
 * opts.entries: entries om te seeden (worden bij het laden genormaliseerd).
 * opts.data: volledige geldboek.v1-data om te seeden (bijv. een fixture); gaat vóór settings/entries.
 */
async function openApp(page, opts = {}) {
  if (opts.standalone !== false) await setStandalone(page);
  const onboarded = opts.onboarded !== false;
  let data = opts.data || null;
  if (!data && (onboarded || opts.settings || opts.entries)) {
    data = {
      version: 1,
      settings: Object.assign({ onboarded }, opts.settings || {}),
      entries: opts.entries || []
    };
  }
  if (data) await seedData(page, data);
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

/** Schakelt op het invoerscherm naar Uitgave ('expense') of Inkomst ('income'). */
async function setEntryType(page, type) {
  await page.locator(`[data-group="entry-type"] [data-value="${type}"]`).click();
}

/**
 * Vult het inkomstformulier en slaat op (schakelt eerst naar Inkomst).
 * { amount?, source? ('werk' standaard), hours?, note?, datetime? }
 */
async function addIncome(page, { amount, source, hours, note, datetime } = {}) {
  await setEntryType(page, 'income');
  if (source) await page.locator(`[data-group="source"] [data-value="${source}"]`).click();
  if (hours !== undefined) await page.locator('#i-hours').fill(String(hours));
  if (amount !== undefined) await page.locator('#i-amount').fill(amount);
  if (note !== undefined) await page.locator('#i-note').fill(note);
  if (datetime) await page.locator('#i-datetime').fill(datetime);
  await page.locator('#i-submit').click();
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

module.exports = { APP_FILE_URL, APP_HTTP_URL, STORAGE_KEY, setStandalone, seedData, openApp, readData, addExpense, addIncome, setEntryType, goTab, isoDaysAgo };
