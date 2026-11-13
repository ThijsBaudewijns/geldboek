// Instellingen, startsaldo en inkomsten (fase 4).
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openApp, readData, addExpense, addIncome, setEntryType, goTab, isoDaysAgo, fixShotClock } = require('./helpers');

test.describe('Onboarding, uitgave en inkomst', () => {
  test('startsaldo 100 -> uitgave 20 -> inkomst werk 4 uur x 15 -> saldo € 140,00', async ({ page }) => {
    await openApp(page, { onboarded: false });
    await page.locator('#o-start-balance').fill('100');
    await page.locator('#o-wage').fill('15');
    await page.locator('#o-submit').click();
    await expect(page.locator('#view-invoer')).toBeVisible();

    await addExpense(page, { amount: '20', what: 'Boodschappen', note: 'Eten voor de week' });
    await expect(page.locator('#toast')).toHaveText('Opgeslagen: € 20,00 ≈ 1,3 uur werk — Boodschappen');

    await setEntryType(page, 'income');
    await expect(page.locator('#income-form')).toBeVisible();
    await expect(page.locator('#expense-form')).toBeHidden();
    await expect(page.locator('#view-title')).toHaveText('Nieuwe inkomst');
    await expect(page.locator('[data-group="source"] [data-value="werk"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#i-hours')).toBeVisible();
    await page.locator('#i-hours').fill('4');
    await expect(page.locator('#i-amount')).toHaveValue('60,00');
    await page.locator('#i-submit').click();
    await expect(page.locator('#toast')).toHaveText('Opgeslagen: € 60,00 — Werk');

    const data = await readData(page);
    const inc = data.entries.find((e) => e.type === 'income');
    expect(inc).toMatchObject({ type: 'income', amountCents: 6000, source: 'werk', hours: 4, note: '', what: 'Werk' });

    await goTab(page, 'overzicht');
    await expect(page.locator('#balance')).toHaveText('€ 140,00');
    await expect(page.locator('#balance')).toHaveAttribute('data-cents', '14000');
    await expect(page.locator('.entry-row.is-income')).toContainText('Inkomst · werk');
  });
});

test.describe('Inkomstformulier', () => {
  test('bedrag voorinvullen is overschrijfbaar; uren alleen bij werk; omschrijving in note', async ({ page }) => {
    await openApp(page, { settings: { hourlyWageCents: 1500 } });
    await setEntryType(page, 'income');
    await expect(page.locator('#i-hours-hint')).toContainText('€ 15,00');
    await page.locator('#i-hours').fill('6,5');
    await expect(page.locator('#i-amount')).toHaveValue('97,50');
    await page.locator('#i-amount').fill('100');
    await page.locator('#i-note').fill('Bijles');
    await page.locator('#i-submit').click();
    let inc = (await readData(page)).entries[0];
    expect(inc).toMatchObject({ amountCents: 10000, hours: 6.5, note: 'Bijles', what: 'Bijles', source: 'werk' });

    // Andere bron: geen urenveld; hours wordt null.
    await page.locator('[data-group="source"] [data-value="belasting"]').click();
    await expect(page.locator('#i-hours')).toBeHidden();
    await page.locator('#i-amount').fill('42,10');
    await page.locator('#i-submit').click();
    inc = (await readData(page)).entries.find((e) => e.source === 'belasting');
    expect(inc).toMatchObject({ amountCents: 4210, hours: null, what: 'Belasting', note: '' });
  });

  test('zonder uurloon: hint naar Instellingen, bedrag zelf invullen; validatie', async ({ page }) => {
    await openApp(page);
    await setEntryType(page, 'income');
    await expect(page.locator('#i-hours-hint')).toContainText('Stel een uurloon in');
    await page.locator('#i-hours').fill('3');
    await expect(page.locator('#i-amount')).toHaveValue('');
    await page.locator('#i-submit').click();
    await expect(page.locator('#i-amount-error')).toHaveText('Vul een bedrag in, bijvoorbeeld 12,50.');
    await page.locator('#i-hours').fill('veel');
    await page.locator('#i-amount').fill('30');
    await page.locator('#i-submit').click();
    await expect(page.locator('#i-hours-error')).toContainText('aantal uren');
    expect((await readData(page)).entries).toHaveLength(0);
    // Terug naar Uitgave toont het uitgaveformulier weer.
    await setEntryType(page, 'expense');
    await expect(page.locator('#expense-form')).toBeVisible();
    await expect(page.locator('#income-form')).toBeHidden();
    await expect(page.locator('#view-title')).toHaveText('Nieuwe uitgave');
  });

  test('inkomst bewerken in Overzicht toont het inkomstformulier', async ({ page }) => {
    await openApp(page, { settings: { hourlyWageCents: 1500 } });
    await addIncome(page, { hours: 4 });
    await goTab(page, 'overzicht');
    await page.locator('.entry-row.is-income').click();
    await expect(page.locator('#view-title')).toHaveText('Inkomst bewerken');
    await expect(page.locator('#edit-form [data-group="source"] [data-value="werk"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#edit-hours')).toHaveValue('4');
    await expect(page.locator('#edit-amount')).toHaveValue('60,00');
    await expect(page.locator('#edit-what')).toHaveCount(0);
    await page.locator('#edit-hours').fill('5');
    await expect(page.locator('#edit-amount')).toHaveValue('75,00');
    await page.locator('#edit-note').fill('Zaterdag');
    await page.locator('#edit-submit').click();
    await expect(page.locator('#edit-form')).toHaveCount(0);
    const e = (await readData(page)).entries[0];
    expect(e).toMatchObject({ type: 'income', amountCents: 7500, hours: 5, note: 'Zaterdag', what: 'Zaterdag' });
    await expect(page.locator('#balance')).toHaveAttribute('data-cents', '7500');
  });

  test('screenshot inkomst (390x844)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone', 'screenshot alleen in het iphone-project');
    await page.setViewportSize({ width: 390, height: 844 });
    await fixShotClock(page);
    await openApp(page, { settings: { hourlyWageCents: 1500, startBalanceCents: 10000 } });
    await setEntryType(page, 'income');
    await page.locator('#i-hours').fill('4');
    await page.locator('#i-note').fill('Zaterdag in de winkel');
    await page.locator('#i-note').blur();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(__dirname, 'screens', 'inkomst.png') });
  });
});

test.describe('Instellingen', () => {
  test('tandwiel opent Instellingen; startsaldo, startdatum en uurloon opslaan', async ({ page }) => {
    await openApp(page, { settings: { startBalanceCents: 10000, hourlyWageCents: 1500 } });
    await page.locator('#settings-link').click();
    await expect(page.locator('#view-instellingen')).toBeVisible();
    await expect(page.locator('#view-title')).toHaveText('Instellingen');
    await expect(page.locator('#s-start-balance')).toHaveValue('100,00');
    await expect(page.locator('#s-wage')).toHaveValue('15,00');
    await expect(page.locator('#s-start-date-hint')).toHaveText('Uitgaven vóór deze datum tellen niet mee in je saldo.');

    await page.locator('#s-start-balance').fill('');
    await page.locator('#s-save').click();
    await expect(page.locator('#s-start-balance-error')).toBeVisible();

    await page.locator('#s-start-balance').fill('-40');
    await page.locator('#s-start-date').fill(isoDaysAgo(3));
    await page.locator('#s-wage').fill('');
    await page.locator('#s-save').click();
    await expect(page.locator('#toast')).toHaveText('Instellingen opgeslagen');
    expect((await readData(page)).settings).toMatchObject({ startBalanceCents: -4000, startDate: isoDaysAgo(3), hourlyWageCents: null });

    // Saldo volgt: -40, en een uitgave van 4 dagen geleden telt niet mee.
    await goTab(page, 'invoer');
    await page.locator('#f-datetime').fill(isoDaysAgo(4) + 'T12:00');
    await addExpense(page, { amount: '10', what: 'Oud', note: 'Voor de start' });
    await goTab(page, 'overzicht');
    await expect(page.locator('#balance')).toHaveAttribute('data-cents', '-4000');
  });

  test('categorie hernoemen past bestaande uitgaven en het invoerformulier aan', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-group="category"] [data-value="Uitgaan"]').click();
    await addExpense(page, { amount: '15', what: 'Bioscoop', note: 'Met vrienden' });

    await page.locator('#settings-link').click();
    const input = page.locator('#category-list input[data-category="Uitgaan"]');
    await input.fill('Stappen');
    await input.press('Enter');
    await expect(page.locator('#toast')).toContainText('Hernoemd naar "Stappen" (1 uitgave aangepast)');
    await expect(page.locator('#category-list input[data-category="Stappen"]')).toHaveCount(1);

    const data = await readData(page);
    expect(data.settings.categories).toContain('Stappen');
    expect(data.settings.categories).not.toContain('Uitgaan');
    expect(data.entries[0].category).toBe('Stappen');

    await goTab(page, 'invoer');
    await expect(page.locator('#expense-form [data-group="category"] [data-value="Stappen"]')).toHaveCount(1);
    await expect(page.locator('#expense-form [data-group="category"] [data-value="Uitgaan"]')).toHaveCount(0);
    await goTab(page, 'overzicht');
    await expect(page.locator('.entry-row')).toContainText('Stappen');
  });

  test('categorie toevoegen en verwijderen', async ({ page }) => {
    await openApp(page, { hash: 'instellingen' });
    await page.locator('#s-cat-new').fill('Sport');
    await page.locator('#s-cat-add').click();
    await expect(page.locator('#category-list input[data-category="Sport"]')).toHaveCount(1);
    // Dubbel geweigerd.
    await page.locator('#s-cat-new').fill('sport');
    await page.locator('#s-cat-add').click();
    await expect(page.locator('#toast')).toHaveText('Die categorie bestaat al.');

    page.once('dialog', (d) => d.accept());
    await page.locator('[data-remove="Kleding"]').click();
    await expect(page.locator('#category-list input[data-category="Kleding"]')).toHaveCount(0);
    const cats = (await readData(page)).settings.categories;
    expect(cats).toContain('Sport');
    expect(cats).not.toContain('Kleding');

    await goTab(page, 'invoer');
    await expect(page.locator('#expense-form [data-group="category"] [data-value="Sport"]')).toHaveCount(1);
    await expect(page.locator('#expense-form [data-group="category"] [data-value="Kleding"]')).toHaveCount(0);
  });

  test('alle invoervelden in Instellingen hebben font-size >= 16px (iphone)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone', 'alleen in het iphone-project');
    await openApp(page, { hash: 'instellingen' });
    await expect(page.locator('#s-start-balance')).toBeVisible();
    const sizes = await page.$$eval('#view-instellingen input, #view-instellingen textarea', (els) =>
      els.map((el) => ({ id: el.id, size: parseFloat(getComputedStyle(el).fontSize) })));
    expect(sizes.length).toBeGreaterThan(3);
    for (const s of sizes) expect(s.size, s.id).toBeGreaterThanOrEqual(16);
  });
});
