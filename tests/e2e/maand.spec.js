// Fase 9: de hele maand-flow in één test (390x844), hoofdproject iphone (WebKit) en ook chromium.
// Onboarding -> 5 uitgaven -> inkomst werk (uren x uurloon) -> voorgeschoten + terugbetaald ->
// klok 8 dagen vooruit -> terugkijken (badge, score) -> reflectie met de juiste totalen -> export JSON.
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { openApp, readData, addExpense, addIncome, goTab, stubNoShare, collectErrors } = require('./helpers');

const DAY0 = new Date(2026, 10, 2, 20, 0); // maandag 2 november 2026, 20:00 lokaal (onboarding)
const DAY8 = new Date(2026, 10, 10, 20, 0); // 8 dagen later
const D = '2026-11-02';

// Vijf eigen uitgaven met verschillende velden.
const EXPENSES = [
  { amount: '12,50', what: 'Lunch', note: 'Geen brood meegenomen', time: '12:30', category: 'Eten & drinken buiten de deur', need: 'wil', worth: '3' },
  { amount: '42,10', what: 'Boodschappen', note: 'Voor de hele week', time: '17:40', category: 'Boodschappen', need: 'nodig', worth: '5' },
  { amount: '9,99', what: 'Spotify', note: 'Elke maand', time: '08:00', category: 'Abonnementen', fixed: 'vast', need: 'wil', worth: '4' },
  { amount: '3,40', what: 'Koffie', note: 'Lange dag', time: '10:05', category: 'Eten & drinken buiten de deur', need: 'impuls' },
  { amount: '25,00', what: 'Trui', note: 'In de uitverkoop', time: '15:20', category: 'Kleding', need: 'impuls', worth: '2' }
];
const OWN_EXPENSE = 1250 + 4210 + 999 + 340 + 2500; // 9299
const START = 10000; // € 100,00 startsaldo
const WAGE = 1500; // € 15,00 per uur
const WORK = 4 * WAGE; // 4 uur werk = € 60,00
const ADVANCE = 3000; // € 30,00 voorgeschoten voor Sam, daarna terugbetaald
const END = START - OWN_EXPENSE - ADVANCE + WORK + ADVANCE; // 6701

test('maand-flow: onboarding tot en met export (390x844)', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = collectErrors(page);
  await stubNoShare(page);
  await page.clock.setFixedTime(DAY0);

  // 1. Onboarding: verse app vanaf het beginscherm -> eerste-keer-scherm.
  await openApp(page, { standalone: true, onboarded: false });
  await expect(page.locator('#welcome-screen')).toBeVisible();
  await page.locator('#o-start-balance').fill('100,00');
  await page.locator('#o-wage').fill('15,00');
  await page.locator('#o-submit').click();
  await expect(page.locator('#view-invoer')).toBeVisible();
  expect((await readData(page)).settings).toMatchObject({ onboarded: true, startBalanceCents: START, hourlyWageCents: WAGE, startDate: D });

  // 2. Vijf uitgaven met verschillende velden.
  const form = page.locator('form', { has: page.locator('#f-amount') });
  for (const x of EXPENSES) {
    await page.locator('#f-datetime').fill(`${D}T${x.time}`);
    await form.locator(`[data-group="category"] [data-value="${x.category}"]`).click();
    if (x.need) await form.locator(`[data-group="need"] [data-value="${x.need}"]`).click();
    if (x.worth) await form.locator(`[data-group="worth"] [data-value="${x.worth}"]`).click();
    await addExpense(page, x);
    await expect(page.locator('#f-amount')).toHaveValue('');
  }

  // 3. Inkomst uit werk: 4 uur met uurloon € 15,00 -> bedrag wordt voorgevuld (€ 60,00).
  await addIncome(page, { source: 'werk', hours: 4, note: 'Zaterdag in de winkel', datetime: `${D}T18:00` });
  await expect(page.locator('#i-amount')).toHaveValue('');

  // 4. Voorgeschoten voor Sam, daarna terugbetaald via Overzicht > Openstaand.
  await page.locator('[data-group="entry-type"] [data-value="expense"]').click();
  await page.locator('#f-datetime').fill(`${D}T19:00`);
  await page.locator('#f-advance-for').fill('Sam');
  await addExpense(page, { amount: '30,00', what: 'Bioscoopkaartjes', note: 'Sam had geen geld bij zich' });

  await goTab(page, 'overzicht');
  await expect(page.locator('.entry-row')).toHaveCount(7);
  await expect(page.locator('#openstaand .open-item')).toHaveCount(1);
  await expect(page.locator('#balance')).toHaveAttribute('data-cents', String(END - ADVANCE));
  await page.locator('#openstaand button.open-repaid').click();
  await expect(page.locator('#openstaand')).toHaveCount(0);
  await expect(page.locator('#balance')).toHaveAttribute('data-cents', String(END));

  let data = await readData(page);
  expect(data.entries).toHaveLength(8);
  const work = data.entries.find((e) => e.type === 'income' && e.source === 'werk');
  expect(work).toMatchObject({ amountCents: WORK, hours: 4 });
  const adv = data.entries.find((e) => e.advanceFor === 'Sam');
  expect(adv.repaidAt).toBeTruthy();
  expect(data.entries.find((e) => e.source === 'terugbetaling')).toMatchObject({ amountCents: ADVANCE, linkedExpenseId: adv.id });
  const trui = data.entries.find((e) => e.what === 'Trui');
  expect(trui).toMatchObject({ amountCents: 2500, category: 'Kleding', need: 'impuls', worth: 2, fixed: 'variabel' });
  expect(data.entries.find((e) => e.what === 'Spotify')).toMatchObject({ fixed: 'vast', category: 'Abonnementen' });

  // Vandaag nog niets om terug te kijken.
  await expect(page.locator('#review-badge')).toBeHidden();

  // 5. Klok 8 dagen vooruit; herladen zodat de app met de nieuwe datum begint.
  await page.clock.setFixedTime(DAY8);
  await page.reload();
  await page.waitForFunction(() => window.Geldboek && window.Geldboek.app && window.Geldboek.app.store);

  // 6. Terugkijken: alle 6 uitgaven (met argumentatie) zijn nu een week oud.
  const badge = page.locator('#review-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('data-count', '6');
  await goTab(page, 'terugkijken');
  const first = await page.locator('#review-card').getAttribute('data-entry-id');
  await page.locator('#review-card .review-score[data-score="4"]').click();
  await expect(badge).toHaveAttribute('data-count', '5');
  await expect(page.locator('#review-card')).not.toHaveAttribute('data-entry-id', first);
  await page.locator('#review-skip').click();
  await expect(badge).toHaveAttribute('data-count', '4');
  data = await readData(page);
  expect(data.entries.find((e) => e.id === first).worthLater).toBe(4);

  // 7. Reflectie, hele periode: de juiste totalen.
  await goTab(page, 'reflectie');
  await page.locator('#refl-period .seg-btn[data-period="all"]').click();
  await expect(page.locator('#refl-start')).toHaveAttribute('data-cents', String(START));
  await expect(page.locator('#refl-end')).toHaveAttribute('data-cents', String(END));
  await expect(page.locator('#refl-income')).toHaveAttribute('data-cents', String(WORK + ADVANCE));
  await expect(page.locator('#refl-own-expense')).toHaveAttribute('data-cents', String(OWN_EXPENSE));
  await expect(page.locator('#refl-count')).toHaveAttribute('data-count', '8');
  await expect(page.locator('#refl-days')).toHaveAttribute('data-count', '1');
  await expect(page.locator('#refl-hours')).toContainText('6,2 uur'); // 92,99 / 15,00 = 6,2
  await expect(page.locator('svg#refl-weeks-chart')).toBeVisible();
  // Vorige week (2-8 nov) bevat dezelfde registraties; deze week is leeg.
  await page.locator('#refl-period .seg-btn[data-period="lastweek"]').click();
  await expect(page.locator('#refl-own-expense')).toHaveAttribute('data-cents', String(OWN_EXPENSE));
  await page.locator('#refl-period .seg-btn[data-period="week"]').click();
  await expect(page.locator('#refl-count')).toHaveAttribute('data-count', '0');

  // 8. Export JSON via de download-route (geen deelmenu).
  await page.locator('#settings-link').click();
  await expect(page.locator('#settings-gegevens')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#backup-json').click()]);
  expect(download.suggestedFilename()).toBe('geldboek-2026-11-10.json');
  const file = testInfo.outputPath('maand.json');
  await download.saveAs(file);
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(backup.version).toBe(1);
  expect(backup.entries).toHaveLength(8);
  expect(backup.settings).toMatchObject({ startBalanceCents: START, hourlyWageCents: WAGE, startDate: D, lastExportAt: DAY8.toISOString() });
  expect(backup.entries.find((e) => e.id === first).worthLater).toBe(4);

  expect(errors).toEqual([]);
});
