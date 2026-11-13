// Overzicht: saldo, lijst per dag, bewerken en verwijderen (fase 3).
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openApp, readData, addExpense, goTab, isoDaysAgo } = require('./helpers');

const MINUS = '−';

test.describe('Overzicht', () => {
  test('lege toestand', async ({ page }) => {
    await openApp(page, { hash: 'overzicht' });
    await expect(page.locator('#overzicht-empty')).toHaveText('Nog niets vastgelegd. Tik op Invoer om je eerste uitgave toe te voegen.');
    await expect(page.locator('#balance')).toHaveText('€ 0,00');
    await expect(page.locator('#view-title')).toHaveText('Overzicht');
  });

  test('twee uitgaven -> saldo klopt; bewerken past saldo aan; verwijderen haalt hem weg', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-group="category"] [data-value="Eten & drinken buiten de deur"]').click();
    await page.locator('[data-group="need"] [data-value="wil"]').click();
    await addExpense(page, { amount: '12,50', what: 'Lunch', note: 'Geen brood meegenomen' });
    await addExpense(page, { amount: '3,40', what: 'Koffie', note: 'Lange dag', fixed: 'vast' });

    await goTab(page, 'overzicht');
    await expect(page.locator('#balance')).toHaveAttribute('data-cents', '-1590');
    await expect(page.locator('#balance')).toHaveText(`${MINUS} € 15,90`);
    await expect(page.locator('#total-week')).toHaveAttribute('data-expense-cents', '1590');
    await expect(page.locator('#total-month')).toHaveAttribute('data-expense-cents', '1590');

    const rows = page.locator('.entry-row');
    await expect(rows).toHaveCount(2);
    // Nieuwste eerst (zelfde minuut: createdAt beslist).
    await expect(rows.nth(0).locator('.entry-what')).toHaveText('Koffie');
    await expect(rows.nth(1).locator('.entry-what')).toHaveText('Lunch');
    await expect(rows.nth(1).locator('.entry-amount')).toHaveText(`${MINUS} € 12,50`);
    await expect(rows.nth(1)).toContainText('Eten & drinken buiten de deur');
    await expect(rows.nth(1).locator('.tag')).toHaveText(['Wil']);
    await expect(rows.nth(0).locator('.tag')).toHaveText(['Vast']);
    await expect(page.locator('.day')).toHaveCount(1);
    await expect(page.locator('.day-label')).toHaveText('Vandaag');
    await expect(page.locator('.day-total')).toHaveAttribute('data-cents', '-1590');

    // Bewerken: Lunch 12,50 -> 20,00
    const lunchId = (await readData(page)).entries.find((e) => e.what === 'Lunch').id;
    await rows.nth(1).click();
    await expect(page.locator('#edit-form')).toBeVisible();
    await expect(page.locator('#view-title')).toHaveText('Uitgave bewerken');
    await expect(page.locator('#edit-amount')).toHaveValue('12,50');
    await expect(page.locator('#edit-what')).toHaveValue('Lunch');
    await expect(page.locator('#edit-form [data-group="need"] [data-value="wil"]')).toHaveAttribute('aria-pressed', 'true');
    // Geen dubbele ids: het invoerformulier blijft #expense-form met #f-...
    expect(await page.locator('#f-amount').count()).toBe(1);
    expect(await page.locator('#edit-amount').count()).toBe(1);
    await page.locator('#edit-amount').fill('20');
    await page.locator('#edit-submit').click();

    await expect(page.locator('#edit-form')).toHaveCount(0);
    await expect(page.locator('#toast')).toHaveText('Bijgewerkt: € 20,00 — Lunch');
    await expect(page.locator('#balance')).toHaveAttribute('data-cents', '-2340');
    await expect(page.locator('#balance')).toHaveText(`${MINUS} € 23,40`);
    let data = await readData(page);
    expect(data.entries).toHaveLength(2);
    const lunch = data.entries.find((e) => e.id === lunchId);
    expect(lunch).toMatchObject({ amountCents: 2000, what: 'Lunch', need: 'wil', category: 'Eten & drinken buiten de deur' });

    // Verwijderen annuleren: blijft staan.
    await page.locator(`.entry-row[data-entry-id="${lunchId}"]`).click();
    page.once('dialog', (d) => d.dismiss());
    await page.locator('#edit-delete').click();
    await expect(page.locator('#edit-form')).toBeVisible();
    expect((await readData(page)).entries).toHaveLength(2);

    // Verwijderen bevestigen.
    let message = '';
    page.once('dialog', (d) => { message = d.message(); d.accept(); });
    await page.locator('#edit-delete').click();
    await expect(page.locator('#edit-form')).toHaveCount(0);
    expect(message).toContain('Lunch');
    await expect(page.locator(`.entry-row[data-entry-id="${lunchId}"]`)).toHaveCount(0);
    await expect(page.locator('.entry-row')).toHaveCount(1);
    await expect(page.locator('#balance')).toHaveAttribute('data-cents', '-340');
    data = await readData(page);
    expect(data.entries).toHaveLength(1);
    expect(data.entries.find((e) => e.id === lunchId)).toBeUndefined();
  });

  test('ongeldige bewerking wordt geweigerd; Terug laat alles staan', async ({ page }) => {
    await openApp(page);
    await addExpense(page, { amount: '5', what: 'Broodje', note: 'Honger' });
    await goTab(page, 'overzicht');
    await page.locator('.entry-row').first().click();
    await page.locator('#edit-amount').fill('abc');
    await page.locator('#edit-submit').click();
    await expect(page.locator('#edit-amount-error')).toContainText('geen geldig bedrag');
    await page.locator('#edit-back').click();
    await expect(page.locator('#edit-form')).toHaveCount(0);
    await expect(page.locator('#balance')).toHaveAttribute('data-cents', '-500');
    expect((await readData(page)).entries[0].amountCents).toBe(500);
  });

  test('wisselen van tabblad sluit de bewerkmodus; invoer blijft werken', async ({ page }) => {
    await openApp(page);
    await addExpense(page, { amount: '5', what: 'Broodje', note: 'Honger' });
    await goTab(page, 'overzicht');
    await page.locator('.entry-row').first().click();
    await expect(page.locator('#edit-form')).toBeVisible();
    await goTab(page, 'invoer');
    await expect(page.locator('#edit-form')).toHaveCount(0);
    await addExpense(page, { amount: '2', what: 'Thee', note: 'Koud', fixed: 'vast' });
    expect((await readData(page)).entries).toHaveLength(2);
    await goTab(page, 'overzicht');
    await expect(page.locator('#view-title')).toHaveText('Overzicht');
    await expect(page.locator('.entry-row')).toHaveCount(2);
  });

  test('gegroepeerd per dag met dagtotaal, nieuwste dag eerst', async ({ page }) => {
    await openApp(page);
    await page.locator('#f-datetime').fill(isoDaysAgo(1) + 'T12:00');
    await addExpense(page, { amount: '7,25', what: 'Pizza', note: 'Geen zin om te koken' });
    await page.locator('#f-datetime').fill(isoDaysAgo(1) + 'T09:00');
    await addExpense(page, { amount: '2,75', what: 'Koffie', note: 'Onderweg' });
    await addExpense(page, { amount: '1', what: 'Snoep', note: 'Zin in' });
    await goTab(page, 'overzicht');
    await expect(page.locator('.day-label')).toHaveText(['Vandaag', 'Gisteren']);
    await expect(page.locator('.day').nth(1).locator('.day-total')).toHaveAttribute('data-cents', '-1000');
    await expect(page.locator('.day').nth(1).locator('.entry-what')).toHaveText(['Pizza', 'Koffie']);
  });

  test('screenshot overzicht (390x844)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone', 'screenshot alleen in het iphone-project');
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page);
    // Startdatum gisteren, zodat de entries van gisteren in het saldo meetellen (U11).
    await page.evaluate((d) => window.Geldboek.app.store.updateSettings({ startDate: d }), isoDaysAgo(1));
    const add = async (o) => {
      if (o.category) await page.locator(`[data-group="category"] [data-value="${o.category}"]`).click();
      if (o.need) await page.locator(`[data-group="need"] [data-value="${o.need}"]`).click();
      if (o.datetime) await page.locator('#f-datetime').fill(o.datetime);
      await addExpense(page, o);
    };
    await add({ amount: '42,10', what: 'Boodschappen AH', note: 'Weekboodschappen', category: 'Boodschappen', need: 'nodig', datetime: isoDaysAgo(1) + 'T17:40' });
    await add({ amount: '9,99', what: 'Spotify', note: 'Elke maand', category: 'Abonnementen', fixed: 'vast', datetime: isoDaysAgo(1) + 'T08:00' });
    await add({ amount: '12,50', what: 'Lunch', note: 'Geen brood meegenomen', category: 'Eten & drinken buiten de deur', need: 'wil' });
    await add({ amount: '3,40', what: 'Koffie', note: 'Lange dag', category: 'Eten & drinken buiten de deur', need: 'impuls' });
    await goTab(page, 'overzicht');
    await expect(page.locator('.entry-row')).toHaveCount(4);
    await page.locator('#toast').evaluate((el) => { el.hidden = true; });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(__dirname, 'screens', 'overzicht.png') });
  });
});
