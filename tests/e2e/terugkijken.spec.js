// Fase 6: terugkijken na een week (U13) en uren-werk (U14).
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openApp, readData, addExpense, goTab, isoDaysAgo, SHOT_NOW, fixShotClock } = require('./helpers');

function exp(id, amountCents, what, daysAgo, extra) {
  return Object.assign({
    id, type: 'expense', amountCents, what, note: '', datetime: isoDaysAgo(daysAgo) + 'T12:00',
    createdAt: '2026-01-01T00:00:00.000Z'
  }, extra || {});
}

test.describe('Terugkijken', () => {
  test('uitgave van 8 dagen terug -> badge 1 -> score 2 -> badge weg, worthLater 2 opgeslagen', async ({ page }) => {
    await openApp(page, {
      settings: { startDate: isoDaysAgo(30) },
      entries: [exp('e_1', 2500, 'Sneakers', 8, { note: 'Oude waren kapot', worth: 4 })]
    });
    const badge = page.locator('#review-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('1');

    await goTab(page, 'terugkijken');
    const card = page.locator('#review-card');
    await expect(card).toHaveAttribute('data-entry-id', 'e_1');
    await expect(card.locator('.review-what')).toHaveText('Sneakers');
    await expect(card.locator('.review-amount')).toHaveText('€ 25,00');
    await expect(card.locator('.review-note')).toHaveText('Oude waren kapot');
    await expect(card.locator('.review-worth')).toHaveText('4 van 5');
    await expect(card.locator('#review-question')).toHaveText('Was het het geld nog steeds waard?');
    await expect(card.locator('.review-hours')).toHaveCount(0); // geen uurloon -> geen uren-werk

    await card.locator('.review-score[data-score="2"]').click();
    await expect(badge).toBeHidden();
    await expect(page.locator('#review-empty')).toHaveText('Niets om terug te kijken. Uitgaven komen hier een week na aankoop.');
    const data = await readData(page);
    const e = data.entries.find((x) => x.id === 'e_1');
    expect(e.worthLater).toBe(2);
    expect(typeof e.worthLaterAt).toBe('string');
    expect(Number.isNaN(Date.parse(e.worthLaterAt))).toBe(false);
    expect(e.worthLaterSkipped).toBe(false);
  });

  test('ingevoerd met datum 8 dagen terug verschijnt in Terugkijken; recente en lege uitgaven niet', async ({ page }) => {
    await openApp(page, {
      entries: [
        exp('e_new', 500, 'Koffie', 2, { note: 'Moe', worth: 3 }),
        exp('e_plain', 900, 'Brood', 10, { note: '' })
      ]
    });
    await expect(page.locator('#review-badge')).toBeHidden();
    await page.locator('#f-datetime').fill(isoDaysAgo(8) + 'T12:00');
    await addExpense(page, { amount: '12,50', what: 'Lunch', note: 'Honger' });
    await expect(page.locator('#review-badge')).toHaveText('1');
    await goTab(page, 'terugkijken');
    await expect(page.locator('#review-card .review-what')).toHaveText('Lunch');
    await expect(page.locator('#review-card .review-worth')).toHaveText('Geen score');
  });

  test('Overslaan zet worthLaterSkipped en toont de volgende (oudste eerst)', async ({ page }) => {
    await openApp(page, {
      hash: 'terugkijken',
      entries: [
        exp('e_b', 1500, 'Bioscoop', 8, { note: 'Met vrienden' }),
        exp('e_a', 4000, 'Jas', 12, { worth: 5 })
      ]
    });
    await expect(page.locator('#review-badge')).toHaveText('2');
    await expect(page.locator('#review-progress')).toHaveText('1 van 2');
    await expect(page.locator('#review-card')).toHaveAttribute('data-entry-id', 'e_a');
    await page.locator('#review-skip').click();
    await expect(page.locator('#review-card')).toHaveAttribute('data-entry-id', 'e_b');
    await expect(page.locator('#review-progress')).toHaveText('1 van 1');
    await expect(page.locator('#review-badge')).toHaveText('1');
    let data = await readData(page);
    let a = data.entries.find((x) => x.id === 'e_a');
    expect(a.worthLaterSkipped).toBe(true);
    expect(a.worthLater).toBe(null);

    await page.locator('#review-card .review-score[data-score="5"]').click();
    await expect(page.locator('#review-empty')).toBeVisible();
    await expect(page.locator('#review-badge')).toBeHidden();
    data = await readData(page);
    expect(data.entries.find((x) => x.id === 'e_b').worthLater).toBe(5);

    // Na herladen blijft alles afgehandeld.
    await page.reload();
    await page.locator('#view-terugkijken').waitFor({ state: 'visible' });
    await expect(page.locator('#review-empty')).toBeVisible();
    await expect(page.locator('#review-badge')).toBeHidden();
  });

  test('lege toestand', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#review-badge')).toBeHidden();
    await goTab(page, 'terugkijken');
    await expect(page.locator('#review-empty')).toHaveText('Niets om terug te kijken. Uitgaven komen hier een week na aankoop.');
    await expect(page.locator('#review-card')).toHaveCount(0);
  });

  test('badge volgt ook verwijderen in Overzicht', async ({ page }) => {
    await openApp(page, { hash: 'overzicht', entries: [exp('e_1', 2500, 'Sneakers', 9, { worth: 2 })] });
    await expect(page.locator('#review-badge')).toHaveText('1');
    page.on('dialog', (d) => d.accept());
    await page.locator('.entry-row[data-entry-id="e_1"]').click();
    await page.locator('#edit-delete').click();
    await expect(page.locator('#review-badge')).toBeHidden();
  });
});

test.describe('Uren-werk', () => {
  test('uurloon 15 en uitgave 45 -> "3,0 uur werk" in melding, overzicht en terugkijken', async ({ page }) => {
    await openApp(page, {
      settings: { hourlyWageCents: 1500 },
      entries: [exp('e_old', 4500, 'Concert', 8, { worth: 5, note: 'Favoriete band' })]
    });
    await addExpense(page, { amount: '45', what: 'Lunch', note: 'Etentje' });
    await expect(page.locator('#toast')).toHaveText('Opgeslagen: € 45,00 ≈ 3,0 uur werk — Lunch');

    await goTab(page, 'overzicht');
    const rows = page.locator('.entry-row.is-expense');
    await expect(rows).toHaveCount(2);
    await expect(page.locator('.entry-row .tag-hours')).toHaveText(['≈ 3,0 uur werk', '≈ 3,0 uur werk']);

    await goTab(page, 'terugkijken');
    await expect(page.locator('#review-card .review-hours')).toHaveText('≈ 3,0 uur werk');
  });

  test('zonder uurloon nergens uren-werk; inkomsten nooit', async ({ page }) => {
    await openApp(page, {
      entries: [
        exp('e_old', 4500, 'Concert', 8, { worth: 5 }),
        { id: 'i_1', type: 'income', amountCents: 4500, source: 'werk', what: 'Loon', note: '', datetime: isoDaysAgo(1) + 'T09:00' }
      ]
    });
    await addExpense(page, { amount: '45', what: 'Lunch', note: 'Etentje' });
    await expect(page.locator('#toast')).toHaveText('Opgeslagen: € 45,00 — Lunch');
    await goTab(page, 'overzicht');
    await expect(page.locator('.entry-row')).toHaveCount(3);
    await expect(page.locator('.tag-hours')).toHaveCount(0);
    await goTab(page, 'terugkijken');
    await expect(page.locator('#review-card')).toBeVisible();
    await expect(page.locator('.review-hours')).toHaveCount(0);
  });

  test('inkomst met uurloon krijgt geen uren-werk', async ({ page }) => {
    await openApp(page, {
      hash: 'overzicht',
      settings: { hourlyWageCents: 1500 },
      entries: [{ id: 'i_1', type: 'income', amountCents: 4500, source: 'werk', what: 'Loon', note: '', datetime: isoDaysAgo(1) + 'T09:00' }]
    });
    await expect(page.locator('.entry-row.is-income')).toHaveCount(1);
    await expect(page.locator('.tag-hours')).toHaveCount(0);
  });
});

test('screenshot terugkijken (390x844)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'screenshot alleen in het iphone-project');
  await page.setViewportSize({ width: 390, height: 844 });
  await fixShotClock(page);
  await openApp(page, {
    hash: 'terugkijken',
    settings: { hourlyWageCents: 1500, startBalanceCents: 25000, startDate: isoDaysAgo(30, SHOT_NOW) },
    entries: [
      exp('e_a', 7999, 'Nieuwe koptelefoon', 11, {
        note: 'Mijn oude was kapot en ik luister elke dag muziek in de trein.', worth: 4,
        category: 'Overig', need: 'wil', datetime: isoDaysAgo(11, SHOT_NOW) + 'T16:45'
      }),
      exp('e_b', 1250, 'Lunch', 8, { note: 'Geen tijd om brood te smeren', worth: 2, datetime: isoDaysAgo(8, SHOT_NOW) + 'T12:00' }),
      exp('e_c', 3000, 'Bioscoop', 10, { note: 'Met vrienden', worth: 5, datetime: isoDaysAgo(10, SHOT_NOW) + 'T12:00' })
    ]
  });
  await expect(page.locator('#review-card')).toHaveAttribute('data-entry-id', 'e_a');
  await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; window.scrollTo(0, 0); });
  await page.screenshot({ path: path.join(__dirname, 'screens', 'terugkijken.png') });
});
