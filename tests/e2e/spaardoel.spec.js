// Spaardoel in Overzicht: spaarmaand van betaaldag tot betaaldag, doel en betaaldag in Instellingen.
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openApp, readData, goTab, SHOT_NOW } = require('./helpers');

const MINUS = '−';

// Vaste klok: vrijdag 13 november 2026, 20:00 (SHOT_NOW). Betaaldag 25 (standaard), doel € 200 (standaard).
// Eerste spaarmaand: 1 okt (startdatum) t/m 24 okt; lopende spaarmaand: 25 okt t/m 24 nov.
function seed(extraSettings) {
  return {
    version: 1,
    settings: Object.assign({ onboarded: true, startBalanceCents: 50000, startDate: '2026-10-01', lastExportAt: '2026-11-13T08:00:00.000Z' }, extraSettings || {}),
    entries: [
      { id: 'e_1_a', type: 'expense', amountCents: 9900, datetime: '2026-09-30T12:00', what: 'Voor de start', note: 'telt niet mee', fixed: 'variabel' },
      { id: 'e_2_b', type: 'income', amountCents: 30000, datetime: '2026-10-02T17:00', what: 'Werk', note: '', source: 'werk' },
      { id: 'e_3_c', type: 'expense', amountCents: 5000, datetime: '2026-10-10T13:00', what: 'Boodschappen', note: 'Weekboodschappen', fixed: 'variabel' },
      { id: 'e_4_d', type: 'income', amountCents: 120000, datetime: '2026-10-25T09:00', what: 'Salaris', note: 'loon oktober', source: 'werk' },
      { id: 'e_5_e', type: 'expense', amountCents: 90000, datetime: '2026-11-01T09:00', what: 'Huur', note: 'Elke maand', fixed: 'vast' },
      { id: 'e_6_f', type: 'expense', amountCents: 15000, datetime: '2026-11-10T19:00', what: 'Uit eten', note: 'Verjaardag', fixed: 'variabel' }
    ]
  };
}

async function saveSettings(page, values) {
  await page.locator('#settings-link').click();
  await expect(page.locator('#view-instellingen')).toBeVisible();
  if (values.goal !== undefined) await page.locator('#s-goal').fill(values.goal);
  if (values.day !== undefined) await page.locator('#s-month-start').fill(values.day);
  await page.locator('#s-save').click();
  await expect(page.locator('#toast')).toHaveText('Instellingen opgeslagen');
  await goTab(page, 'overzicht');
}

test.describe('Spaardoel', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(SHOT_NOW);
  });

  test('kaart toont lopende spaarmaand en vorige maand als behaald', async ({ page }) => {
    await openApp(page, { data: seed(), hash: 'overzicht' });
    // Saldo: 500 + 300 - 50 + 1200 - 900 - 150 = 900 (de uitgave van 30 sep telt niet mee).
    await expect(page.locator('#balance')).toHaveAttribute('data-cents', '90000');
    const card = page.locator('section#spaardoel');
    await expect(card).toBeVisible();
    await expect(card.locator('.card-title')).toHaveText('Spaardoel');
    await expect(page.locator('#goal-period')).toHaveText('25 okt – 24 nov');
    await expect(page.locator('#goal-target')).toHaveText('Doel: € 200,00 meer dan vorige maand');
    // Eind eerste spaarmaand: 500 + 300 - 50 = 750; nu 900 -> + 150.
    await expect(page.locator('#goal-diff')).toHaveAttribute('data-cents', '15000');
    await expect(page.locator('#goal-diff')).toHaveText('+ € 150,00');
    await expect(card.locator('.goal-bar')).toHaveAttribute('aria-valuenow', '75');
    // 20 van de 31 dagen voorbij: 150 >= 200 x 20/31 -> op koers.
    await expect(page.locator('#goal-status')).toHaveAttribute('data-status', 'op-koers');
    await expect(page.locator('#goal-status')).toHaveText('Op koers · nog € 50,00 te gaan');
    await expect(page.locator('#goal-days')).toHaveText('Nog 12 dagen tot de nieuwe spaarmaand (25 nov).');
    // Historie: eerste (gedeeltelijke) spaarmaand t.o.v. het startsaldo: + 250 -> behaald.
    const months = card.locator('.goal-month');
    await expect(months).toHaveCount(1);
    await expect(months.first()).toHaveAttribute('data-from', '2026-10-01');
    await expect(months.first()).toHaveAttribute('data-achieved', 'true');
    await expect(months.first().locator('.goal-month-period')).toHaveText('1 okt – 24 okt');
    await expect(months.first().locator('.goal-month-diff')).toHaveText('+ € 250,00');
    await expect(months.first().locator('.goal-month-result')).toHaveText('✓ behaald');
    // Kaart staat direct onder het saldo, boven de lijst.
    const order = await page.locator('#list-view > *').evaluateAll((els) => els.map((el) => el.id || el.className));
    expect(order.indexOf('spaardoel')).toBe(1);
  });

  test('doel wijzigen in Instellingen past de kaart aan; doel 0 haalt hem weg', async ({ page }) => {
    await openApp(page, { data: seed(), hash: 'overzicht' });
    await expect(page.locator('#goal-status')).toHaveAttribute('data-status', 'op-koers');

    // Instellingen tonen de standaardwaarden.
    await page.locator('#settings-link').click();
    await expect(page.locator('#s-goal')).toHaveValue('200,00');
    await expect(page.locator('#s-month-start')).toHaveValue('25');
    await expect(page.locator('#s-month-start-hint')).toContainText('De dag waarop je salaris binnenkomt');
    await goTab(page, 'overzicht');

    // Doel 100: deze maand al behaald.
    await saveSettings(page, { goal: '100' });
    expect((await readData(page)).settings.savingsGoalCents).toBe(10000);
    await expect(page.locator('#goal-target')).toHaveText('Doel: € 100,00 meer dan vorige maand');
    await expect(page.locator('#goal-status')).toHaveAttribute('data-status', 'behaald');
    await expect(page.locator('#goal-status')).toHaveText('Behaald: € 50,00 boven je doel');
    await expect(page.locator('.goal-bar')).toHaveAttribute('aria-valuenow', '100');

    // Doel 300: vorige maand (+ 250) niet behaald, deze maand achter.
    await saveSettings(page, { goal: '300' });
    await expect(page.locator('.goal-month').first()).toHaveAttribute('data-achieved', 'false');
    await expect(page.locator('.goal-month-result').first()).toHaveText('✗ niet behaald');
    await expect(page.locator('#goal-status')).toHaveAttribute('data-status', 'te-gaan');
    await expect(page.locator('#goal-status')).toHaveText('Nog € 150,00 te gaan');

    // Betaaldag 1: kalendermaanden; nov tot nu: - 900 - 150 = - 1050.
    await saveSettings(page, { day: '1' });
    expect((await readData(page)).settings.monthStartDay).toBe(1);
    await expect(page.locator('#goal-period')).toHaveText('1 nov – 30 nov');
    await expect(page.locator('#goal-diff')).toHaveText(`${MINUS} € 1.050,00`);
    await expect(page.locator('.goal-bar')).toHaveAttribute('aria-valuenow', '0');
    await expect(page.locator('#goal-days')).toHaveText('Nog 18 dagen tot de nieuwe spaarmaand (1 dec).');
    await expect(page.locator('.goal-month-period')).toHaveText(['1 okt – 31 okt']);

    // Ongeldige betaaldag en ongeldig doel: Nederlandse foutmelding, niets opgeslagen.
    await page.locator('#settings-link').click();
    await page.locator('#s-month-start').fill('31');
    await page.locator('#s-goal').fill('abc');
    await page.locator('#s-save').click();
    await expect(page.locator('#s-month-start-error')).toHaveText('Kies een dag van 1 tot en met 28.');
    await expect(page.locator('#s-goal-error')).toBeVisible();
    expect((await readData(page)).settings.monthStartDay).toBe(1);
    await page.locator('#s-month-start').fill('25');

    // Doel 0 (of leeg): geen kaart.
    await page.locator('#s-goal').fill('0');
    await page.locator('#s-save').click();
    await expect(page.locator('#toast')).toHaveText('Instellingen opgeslagen');
    expect((await readData(page)).settings.savingsGoalCents).toBe(0);
    await goTab(page, 'overzicht');
    await expect(page.locator('#balance')).toBeVisible();
    await expect(page.locator('#spaardoel')).toHaveCount(0);

    // Weer een doel: kaart terug.
    await saveSettings(page, { goal: '200' });
    await expect(page.locator('#spaardoel')).toBeVisible();
  });

  test('negatief verschil netjes met minteken; eerste maand vergelijkt met startsaldo', async ({ page }) => {
    await openApp(page, {
      hash: 'overzicht',
      settings: { startBalanceCents: 10000, startDate: '2026-11-01' },
      entries: [{ id: 'e_1_a', type: 'expense', amountCents: 3500, datetime: '2026-11-02T12:00', what: 'Kapper', note: 'Haar te lang', fixed: 'variabel' }]
    });
    await expect(page.locator('#goal-period')).toHaveText('1 nov – 24 nov');
    await expect(page.locator('#goal-target')).toHaveText('Doel: € 200,00 meer dan je startsaldo');
    await expect(page.locator('#goal-diff')).toHaveText(`${MINUS} € 35,00`);
    await expect(page.locator('#goal-status')).toHaveText('Nog € 235,00 te gaan');
    await expect(page.locator('.goal-month')).toHaveCount(0);
  });

  test('screenshot spaardoel (390x844)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone', 'screenshot alleen in het iphone-project');
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page, { data: seed(), hash: 'overzicht' });
    await expect(page.locator('#spaardoel')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(__dirname, 'screens', 'spaardoel.png') });
  });
});
