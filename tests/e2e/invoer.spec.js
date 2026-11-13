// Invoerscherm uitgave (fase 2).
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openApp, readData, addExpense } = require('./helpers');

test.describe('Invoer uitgave', () => {
  test('uitgave met "12,50" wordt opgeslagen als 1250 centen', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#view-invoer')).toBeVisible();
    await expect(page.locator('#f-amount')).toBeFocused();
    await expect(page.locator('#f-amount')).toHaveAttribute('inputmode', 'decimal');

    await addExpense(page, { amount: '12,50', what: 'Lunch', note: 'Geen eten meegenomen' });

    await expect(page.locator('#toast')).toHaveText('Opgeslagen: € 12,50 — Lunch');
    const data = await readData(page);
    expect(data).not.toBeNull();
    expect(data.version).toBe(1);
    expect(data.entries).toHaveLength(1);
    const e = data.entries[0];
    expect(e.amountCents).toBe(1250);
    expect(e.type).toBe('expense');
    expect(e.what).toBe('Lunch');
    expect(e.note).toBe('Geen eten meegenomen');
    expect(e.fixed).toBe('variabel');
    expect(e.datetime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

    // Formulier leeg, datum weer op nu, focus terug op bedrag.
    await expect(page.locator('#f-amount')).toHaveValue('');
    await expect(page.locator('#f-what')).toHaveValue('');
    await expect(page.locator('#f-note')).toHaveValue('');
    await expect(page.locator('#f-datetime')).toHaveValue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    await expect(page.locator('#f-amount')).toBeFocused();
  });

  test('optionele velden worden meegeslagen', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('details.more')).toHaveAttribute('open', '');
    await page.locator('[data-group="category"] [data-value="Vervoer"]').click();
    await page.locator('[data-group="need"] [data-value="nodig"]').click();
    await page.locator('[data-group="worth"] [data-value="4"]').click();
    await page.locator('[data-group="mood"] [data-value="moe"]').click();
    await page.locator('#f-datetime').fill('2026-11-10T08:15');
    await addExpense(page, { amount: '3.4', what: 'Bus', note: 'Naar werk', fixed: 'vast' });
    const e = (await readData(page)).entries[0];
    expect(e).toMatchObject({
      amountCents: 340, fixed: 'vast', category: 'Vervoer', need: 'nodig', worth: 4, mood: 'moe',
      datetime: '2026-11-10T08:15'
    });
  });

  test('opslaan zonder argumentatie wordt geweigerd', async ({ page }) => {
    await openApp(page);
    await addExpense(page, { amount: '12,50', what: 'Lunch', note: '' });
    await expect(page.locator('#f-note-error')).toBeVisible();
    await expect(page.locator('#f-note-error')).toContainText('minstens 3 tekens');
    expect((await readData(page)).entries).toHaveLength(0);

    // Te kort (2 tekens) ook geweigerd.
    await page.locator('#f-note').fill('ok');
    await page.locator('#f-submit').click();
    await expect(page.locator('#f-note-error')).toBeVisible();
    expect((await readData(page)).entries).toHaveLength(0);
  });

  test('ongeldig of leeg bedrag geeft een Nederlandse foutmelding', async ({ page }) => {
    await openApp(page);
    await addExpense(page, { amount: '', what: '', note: 'Waarom niet' });
    await expect(page.locator('#f-amount-error')).toHaveText('Vul een bedrag in, bijvoorbeeld 12,50.');
    await expect(page.locator('#f-what-error')).toBeVisible();
    await page.locator('#f-amount').fill('abc');
    await page.locator('#f-submit').click();
    await expect(page.locator('#f-amount-error')).toContainText('geen geldig bedrag');
    expect((await readData(page)).entries).toHaveLength(0);
  });

  test('na een opgeslagen "Lunch" verschijnt een snelle chip "Lunch" die het formulier vult', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('[data-quick]')).toHaveCount(0);
    await page.locator('[data-group="category"] [data-value="Eten & drinken buiten de deur"]').click();
    await addExpense(page, { amount: '12,50', what: 'Lunch', note: 'Vergeten brood te smeren' });

    const chip = page.locator('[data-quick="Lunch"]');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('Lunch');

    await chip.click();
    await expect(page.locator('#f-what')).toHaveValue('Lunch');
    await expect(page.locator('#f-amount')).toHaveValue('12,50');
    await expect(page.locator('[data-group="category"] [data-value="Eten & drinken buiten de deur"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#f-note')).toBeFocused();
  });

  test('tabbalk en hash-routing; nog niet gebouwde tabbladen tonen "binnenkort"', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('.tabbar .tab')).toHaveText(['Invoer', 'Overzicht', 'Terugkijken', 'Reflectie']);
    await page.locator('.tab[data-route="overzicht"]').click();
    await expect(page).toHaveURL(/#overzicht$/);
    await expect(page.locator('#view-overzicht')).toBeVisible();
    await page.locator('.tab[data-route="terugkijken"]').click();
    await expect(page.locator('#view-terugkijken')).toContainText('binnenkort');
    await expect(page.locator('#view-invoer')).toBeHidden();
    await page.locator('#settings-link').click();
    await expect(page.locator('#view-instellingen')).toBeVisible();
    await page.locator('.tab[data-route="invoer"]').click();
    await expect(page.locator('#f-amount')).toBeVisible();
  });

  test('verplichte velden en Opslaan passen zonder scrollen op 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page);
    // Met snelle chips erbij (meest volle toestand).
    await addExpense(page, { amount: '12,50', what: 'Lunch', note: 'Honger' });
    await page.evaluate(() => window.scrollTo(0, 0));
    const tabbarTop = await page.locator('.tabbar').evaluate((el) => el.getBoundingClientRect().top);
    for (const sel of ['#f-amount', '#f-what', '#f-note', '[data-group="fixed"]', '#f-datetime', '#f-submit']) {
      const box = await page.locator(sel).boundingBox();
      expect(box, sel).not.toBeNull();
      expect(box.y, sel).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, sel).toBeLessThanOrEqual(tabbarTop + 0.5);
    }
  });
});

test.describe('iOS-basis', () => {
  test('alle input/textarea hebben font-size >= 16px (iphone)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone', 'alleen in het iphone-project');
    await openApp(page);
    const sizes = await page.$$eval('input, textarea', (els) =>
      els.map((el) => ({ id: el.id || el.name || el.type, size: parseFloat(getComputedStyle(el).fontSize) })));
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) expect(s.size, s.id).toBeGreaterThanOrEqual(16);
  });

  test('meta-tags voor het beginscherm staan erin', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Geldboek');
    await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  });

  test('screenshot invoer (390x844)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone', 'screenshot alleen in het iphone-project');
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page);
    await addExpense(page, { amount: '12,50', what: 'Lunch', note: 'Geen brood meegenomen' });
    await addExpense(page, { amount: '3,40', what: 'Koffie', note: 'Lange dag' });
    await page.locator('#toast').evaluate((el) => { el.hidden = true; });
    await page.locator('#f-amount').blur();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(__dirname, 'screens', 'invoer.png') });
  });
});
