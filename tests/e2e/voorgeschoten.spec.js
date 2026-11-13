// Fase 5: voorgeschoten en terugbetaald (U12).
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openApp, readData, addExpense, goTab, isoDaysAgo } = require('./helpers');

function advance(id, amountCents, what, name, extra) {
  return Object.assign({
    id, type: 'expense', amountCents, what, note: 'Voorgeschoten', datetime: isoDaysAgo(1) + 'T12:00',
    createdAt: '2026-01-01T00:00:00.000Z', advanceFor: name
  }, extra || {});
}

/** Een terugbetaalde uitgave plus de gekoppelde inkomst. */
function repaidPair() {
  return [
    advance('e_adv', 3000, 'Bioscoop', 'Sam', { repaidAt: '2026-11-10T10:00:00.000Z' }),
    {
      id: 'e_inc', type: 'income', amountCents: 3000, source: 'terugbetaling', what: 'Terugbetaald door Sam',
      note: '', datetime: isoDaysAgo(0) + 'T09:00', createdAt: '2026-01-02T00:00:00.000Z', linkedExpenseId: 'e_adv'
    }
  ];
}

test.describe('Voorgeschoten en terugbetaald', () => {
  test('voorschieten 30 voor Sam -> Openstaand -> Terugbetaald -> weg, saldo terug', async ({ page }) => {
    await openApp(page, { settings: { startBalanceCents: 10000 } });
    await goTab(page, 'overzicht');
    await expect(page.locator('#balance')).toHaveAttribute('data-cents', '10000');
    await expect(page.locator('#openstaand')).toHaveCount(0);

    await goTab(page, 'invoer');
    await page.locator('#f-advance-for').fill('Sam');
    await addExpense(page, { amount: '30', what: 'Bioscoopkaartjes', note: 'Sam was zijn pas vergeten' });
    const d1 = await readData(page);
    expect(d1.entries).toHaveLength(1);
    expect(d1.entries[0].advanceFor).toBe('Sam');
    expect(d1.entries[0].repaidAt).toBeNull();
    await expect(page.locator('#f-advance-for')).toHaveValue('');

    await goTab(page, 'overzicht');
    await expect(page.locator('#balance')).toHaveAttribute('data-cents', '7000');
    const card = page.locator('#openstaand');
    await expect(card).toBeVisible();
    const sam = card.locator('.open-person[data-person="Sam"]');
    await expect(sam.locator('.open-name')).toHaveText('Sam');
    await expect(sam.locator('.open-total')).toHaveAttribute('data-cents', '3000');
    await expect(sam.locator('.open-total')).toHaveText(/€\s30,00/);
    await expect(sam.locator('.open-item')).toHaveCount(1);
    await expect(page.locator('.entry-row .tag-advance')).toHaveText('voorgeschoten · open');

    await sam.locator('.open-repaid').click();
    await expect(page.locator('#openstaand')).toHaveCount(0);
    await expect(page.locator('#balance')).toHaveAttribute('data-cents', '10000');
    await expect(page.locator('.entry-row')).toHaveCount(2);
    await expect(page.locator('.entry-row.is-expense .tag-advance')).toHaveText('voorgeschoten · terug');

    const d2 = await readData(page);
    const exp = d2.entries.find((e) => e.type === 'expense');
    const inc = d2.entries.find((e) => e.type === 'income');
    expect(exp.repaidAt).toBeTruthy();
    expect(inc).toMatchObject({ source: 'terugbetaling', amountCents: 3000, linkedExpenseId: exp.id });
  });

  test('per persoon totaal en losse posten; eerder gebruikte namen als suggestie', async ({ page }) => {
    await openApp(page, {
      entries: [
        advance('e_1', 1250, 'Lunch', 'Sam'),
        advance('e_2', 800, 'Koffie', 'Anna'),
        advance('e_3', 2000, 'Tickets', 'Sam', { datetime: isoDaysAgo(2) + 'T10:00' })
      ]
    });
    await expect(page.locator('#f-advance-list option')).toHaveCount(2);
    await page.locator('#f-advance-for').focus();
    const names = await page.locator('#f-advance-list option').evaluateAll((els) => els.map((o) => o.value).sort());
    expect(names).toEqual(['Anna', 'Sam']);
    await expect(page.locator('#f-advance-for')).toHaveAttribute('list', 'f-advance-list');

    await goTab(page, 'overzicht');
    await expect(page.locator('.open-person .open-name')).toHaveText(['Anna', 'Sam']);
    const sam = page.locator('.open-person[data-person="Sam"]');
    await expect(sam.locator('.open-total')).toHaveAttribute('data-cents', '3250');
    await expect(sam.locator('.open-item')).toHaveCount(2);
    // Eén post van Sam terugbetaald: Sam blijft staan met de rest.
    await sam.locator('.open-item[data-expense-id="e_3"] .open-repaid').click();
    await expect(sam.locator('.open-total')).toHaveAttribute('data-cents', '1250');
    await expect(sam.locator('.open-item')).toHaveCount(1);
    await expect(page.locator('#edit-view')).toHaveCount(0);
  });

  test('bewerkmodus: veld Voorgeschoten voor wijzigen en leegmaken', async ({ page }) => {
    await openApp(page, { hash: 'overzicht', entries: [advance('e_1', 1250, 'Lunch', 'Sam')] });
    await page.locator('.entry-row[data-entry-id="e_1"]').click();
    await expect(page.locator('#edit-advance-for')).toHaveValue('Sam');
    await expect(page.locator('#edit-advance-list option')).toHaveCount(1);
    await page.locator('#edit-advance-for').fill('Anna');
    await page.locator('#edit-submit').click();
    await expect(page.locator('.open-person .open-name')).toHaveText(['Anna']);
    expect((await readData(page)).entries[0].advanceFor).toBe('Anna');

    await page.locator('.entry-row[data-entry-id="e_1"]').click();
    await page.locator('#edit-advance-for').fill('  ');
    await page.locator('#edit-submit').click();
    await expect(page.locator('#openstaand')).toHaveCount(0);
    await expect(page.locator('.tag-advance')).toHaveCount(0);
    expect((await readData(page)).entries[0].advanceFor).toBeNull();
  });

  test('terugbetaling ongedaan maken vanuit de bewerkmodus', async ({ page }) => {
    await openApp(page, { hash: 'overzicht', settings: { startBalanceCents: 5000, startDate: isoDaysAgo(30) }, entries: repaidPair() });
    await expect(page.locator('#balance')).toHaveAttribute('data-cents', '5000');
    await expect(page.locator('#openstaand')).toHaveCount(0);

    await page.locator('.entry-row[data-entry-id="e_adv"]').click();
    await expect(page.locator('#edit-repaid-box')).toHaveAttribute('data-state', 'repaid');
    await page.locator('#edit-undo-repaid').click();
    await expect(page.locator('#edit-repaid-box')).toHaveAttribute('data-state', 'open');
    await expect(page.locator('#edit-mark-repaid')).toBeVisible();
    const d = await readData(page);
    expect(d.entries.map((e) => e.id)).toEqual(['e_adv']);
    expect(d.entries[0].repaidAt).toBeNull();

    await page.locator('#edit-back').click();
    await expect(page.locator('#openstaand .open-total')).toHaveAttribute('data-cents', '3000');
    await expect(page.locator('#balance')).toHaveAttribute('data-cents', '2000');

    // Vanuit de bewerkmodus ook weer als terugbetaald markeren.
    await page.locator('.entry-row[data-entry-id="e_adv"]').click();
    await page.locator('#edit-mark-repaid').click();
    await expect(page.locator('#edit-repaid-box')).toHaveAttribute('data-state', 'repaid');
    await page.locator('#edit-back').click();
    await expect(page.locator('#openstaand')).toHaveCount(0);
    await expect(page.locator('#balance')).toHaveAttribute('data-cents', '5000');
  });

  test('verwijderen met koppeling: ook de inkomst verwijderen', async ({ page }) => {
    await openApp(page, { hash: 'overzicht', entries: repaidPair() });
    const messages = [];
    page.on('dialog', (d) => { messages.push(d.message()); d.accept(); });
    await page.locator('.entry-row[data-entry-id="e_adv"]').click();
    await page.locator('#edit-delete').click();
    await expect(page.locator('#edit-view')).toHaveCount(0);
    expect(messages).toHaveLength(2);
    expect(messages[1]).toContain('terugbetaling ook verwijderen');
    expect((await readData(page)).entries).toEqual([]);
    await expect(page.locator('.entry-row')).toHaveCount(0);
  });

  test('verwijderen met koppeling: inkomst laten staan', async ({ page }) => {
    await openApp(page, { hash: 'overzicht', entries: repaidPair() });
    let n = 0;
    page.on('dialog', (d) => { n++; if (n === 1) d.accept(); else d.dismiss(); });
    await page.locator('.entry-row[data-entry-id="e_adv"]').click();
    await page.locator('#edit-delete').click();
    await expect(page.locator('#edit-view')).toHaveCount(0);
    expect(n).toBe(2);
    const d = await readData(page);
    expect(d.entries).toHaveLength(1);
    expect(d.entries[0]).toMatchObject({ id: 'e_inc', type: 'income', linkedExpenseId: null });
    await expect(page.locator('.entry-row[data-entry-id="e_inc"]')).toBeVisible();
  });

  test('verwijderen zonder koppeling vraagt maar één keer', async ({ page }) => {
    await openApp(page, { hash: 'overzicht', entries: [advance('e_1', 1250, 'Lunch', 'Sam')] });
    let n = 0;
    page.on('dialog', (d) => { n++; d.accept(); });
    await page.locator('.entry-row[data-entry-id="e_1"]').click();
    await page.locator('#edit-delete').click();
    await expect(page.locator('#edit-view')).toHaveCount(0);
    expect(n).toBe(1);
    await expect(page.locator('#openstaand')).toHaveCount(0);
  });

  test('screenshot openstaand (390x844)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone', 'screenshot alleen in het iphone-project');
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page, {
      hash: 'overzicht',
      settings: { startBalanceCents: 25000, startDate: isoDaysAgo(30) },
      entries: [
        advance('e_a', 3000, 'Bioscoopkaartjes', 'Sam', { datetime: isoDaysAgo(2) + 'T20:15', category: 'Uitgaan' }),
        advance('e_b', 1250, 'Lunch', 'Sam', { datetime: isoDaysAgo(0) + 'T12:30', category: 'Eten & drinken buiten de deur' }),
        advance('e_c', 860, 'Boodschappen', 'Anna', { datetime: isoDaysAgo(1) + 'T17:40', category: 'Boodschappen' }),
        advance('e_d', 450, 'Koffie', 'Anna', { datetime: isoDaysAgo(1) + 'T09:10', repaidAt: '2026-11-12T10:00:00.000Z', category: 'Eten & drinken buiten de deur' }),
        { id: 'e_e', type: 'income', amountCents: 450, source: 'terugbetaling', what: 'Terugbetaald door Anna', note: '', datetime: isoDaysAgo(0) + 'T08:00', linkedExpenseId: 'e_d' },
        { id: 'e_f', type: 'expense', amountCents: 340, what: 'Koffie', note: 'Lange dag', datetime: isoDaysAgo(0) + 'T10:05', need: 'impuls', category: 'Eten & drinken buiten de deur' }
      ]
    });
    await expect(page.locator('#openstaand .open-item')).toHaveCount(3);
    await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; window.scrollTo(0, 0); });
    await page.screenshot({ path: path.join(__dirname, 'screens', 'openstaand.png') });
  });
});
