// Fase 7: reflectiepagina met kerncijfers, verdelingen en SVG-grafieken.
// De fixture heeft vaste datums (maandag 5 okt t/m zondag 1 nov 2026); de klok in de pagina staat
// vast op zondag 1 nov 2026 20:00 (lokale tijd), zodat de test niet van de echte datum afhangt.
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openApp, goTab, addExpense } = require('./helpers');
const fixture = require('./fixtures/maand.json');
const calc = require('../../app/js/calc.js');

const NOW = new Date(2026, 10, 1, 20, 0); // zondag 1 november 2026, 20:00 lokaal

async function openReflectie(page, opts = {}) {
  await page.clock.setFixedTime(NOW);
  await openApp(page, Object.assign({ data: fixture, hash: 'reflectie' }, opts));
  if (!opts.hash || opts.hash === 'reflectie') await expect(page.locator('#refl-key')).toBeVisible();
}

// Vooraf (met calc in Node) berekend en met de hand nagerekend: 33 uitgaven + 7 inkomsten.
const EXPECTED = {
  all: { start: '€ 500,00', end: '€ 143,11', income: '€ 1.059,00', own: '€ 1.357,89', count: '40', days: '28', hours: '≈ 97,0 uur', range: /Vanaf 5 oktober/ },
  week: { start: '€ 101,00', end: '€ 143,11', income: '€ 210,00', own: '€ 167,89', count: '9', days: '7', hours: '≈ 12,0 uur', range: /26 oktober t\/m 1 november/ },
  lastweek: { start: '€ -30,86', end: '€ 101,00', income: '€ 309,00', own: '€ 155,14', count: '11', days: '7', hours: '≈ 11,1 uur', range: /19 oktober t\/m 25 oktober/ }
};

async function expectKeyFigures(page, x) {
  await expect(page.locator('#refl-start')).toHaveText(x.start);
  await expect(page.locator('#refl-end')).toHaveText(x.end);
  await expect(page.locator('#refl-income')).toHaveText(x.income);
  await expect(page.locator('#refl-own-expense')).toHaveText(x.own);
  await expect(page.locator('#refl-count')).toHaveText(x.count);
  await expect(page.locator('#refl-days')).toHaveText(x.days);
  await expect(page.locator('#refl-hours')).toHaveText(x.hours);
  await expect(page.locator('#refl-range')).toHaveText(x.range);
}

test.describe('Reflectie', () => {
  test('fixture klopt met de vooraf berekende waarden (calc in Node)', () => {
    expect(fixture.entries).toHaveLength(40);
    const r = calc.reflection(fixture.settings, fixture.entries, { from: '2026-10-05', to: null, now: NOW });
    expect([r.openingCents, r.closingCents, r.incomeCents, r.ownExpenseCents, r.advancedCents, r.count, r.activeDays, r.hoursOfWork])
      .toEqual([50000, 14311, 105900, 135789, 5800, 40, 28, 97]);
    expect(r.weeks.map((w) => w.ownExpenseCents)).toEqual([21482, 82004, 15514, 16789]);
  });

  test('hele periode: kerncijfers, weekstaven, verdelingen, waard-scores en vragen', async ({ page }) => {
    await openReflectie(page);
    await expect(page.locator('#view-title')).toHaveText('Reflectie');
    await expect(page.locator('#refl-period [data-period="all"]')).toHaveAttribute('aria-pressed', 'true');
    await expectKeyFigures(page, EXPECTED.all);
    await expect(page.locator('#refl-own-expense + .stat-sub')).toHaveText('+ € 58,00 voorgeschoten');

    // Staafdiagram per week: 4 weken, SVG-staven met de eigen uitgaven.
    const bars = page.locator('svg#refl-weeks-chart .chart-bar');
    await expect(bars).toHaveCount(4);
    expect(await bars.evaluateAll((els) => els.map((e) => e.getAttribute('data-cents')))).toEqual(['21482', '82004', '15514', '16789']);
    expect(await bars.first().evaluate((e) => e.namespaceURI)).toBe('http://www.w3.org/2000/svg');
    expect(await bars.first().evaluate((e) => e.getBBox().height)).toBeGreaterThan(0);

    // Verdelingen = eigen uitgaven (zonder voorgeschoten), zelfde volgorde en bedragen als calc.
    const r = calc.reflection(fixture.settings, fixture.entries, { from: '2026-10-05', to: null, now: NOW });
    for (const [id, list] of [['refl-by-category', r.byCategory], ['refl-by-fixed', r.byFixed], ['refl-by-need', r.byNeed], ['refl-by-mood', r.byMood]]) {
      const rows = page.locator(`#${id} .hbar-row`);
      await expect(rows).toHaveCount(list.length);
      expect(await rows.evaluateAll((els) => els.map((e) => [e.getAttribute('data-key'), +e.getAttribute('data-cents')])))
        .toEqual(list.map((g) => [g.key === null ? '' : g.key, g.totalCents]));
      await expect(page.locator(`#${id} svg.hbar .chart-bar`).first()).toBeAttached();
    }
    const wonen = page.locator('#refl-by-category .hbar-row').first();
    await expect(wonen.locator('.hbar-label')).toHaveText('Wonen');
    await expect(wonen.locator('.hbar-amount')).toHaveText('€ 650,00');
    await expect(wonen.locator('.hbar-percent')).toHaveText('48%');
    // Uitgaan: 18,50 + 15,00 + 26,00 = 59,50 (etentje 36,00 en concertkaartje 22,00 waren voorgeschoten).
    await expect(page.locator('#refl-by-category .hbar-row[data-key="Uitgaan"] .hbar-amount')).toHaveText('€ 59,50');
    await expect(page.locator('#refl-by-fixed .hbar-row[data-key="vast"] .hbar-label')).toHaveText('Vast');
    await expect(page.locator('#refl-by-need .hbar-row[data-key="impuls"] .hbar-label')).toHaveText('Impuls');

    // Waard-scores.
    await expect(page.locator('#refl-worth-avg')).toHaveText('3,7');
    await expect(page.locator('#refl-worth-later-avg')).toHaveText('3');
    await expect(page.locator('#refl-less-worth .refl-item')).toHaveCount(9);
    await expect(page.locator('#refl-less-worth .refl-item').first().locator('.refl-item-what')).toHaveText('Hoodie');
    await expect(page.locator('#refl-less-worth .refl-item').first().locator('.refl-item-score')).toHaveText('score 4 → 1');
    const lowest = page.locator('#refl-lowest .refl-item .refl-item-what');
    await expect(lowest).toHaveText(['Hoodie', 'Bezorgmaaltijd', 'Snoep en chips', 'Game', 'Lunch']);
    await expect(page.locator('#refl-lowest .refl-item').first().locator('.refl-item-meta')).toHaveText('7 okt · ≈ 1,8 uur werk');

    // Stemming en reflectievragen.
    await expect(page.locator('#refl-by-mood .hbar-row[data-key="sociaal"] .hbar-label')).toHaveText('Sociaal');
    await expect(page.locator('#refl-questions li')).toHaveText([
      'Welke uitgave zou je niet opnieuw doen?',
      'Waar verraste het totaal je?',
      'Wat wil je volgende maand anders doen?',
      'Heeft het bijhouden je gedrag veranderd?'
    ]);
  });

  test('periode wisselen: deze week, vorige week en terug naar hele periode', async ({ page }) => {
    await openReflectie(page);
    await page.locator('#refl-period [data-period="week"]').click();
    await expect(page.locator('#refl-period [data-period="week"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#refl-period [data-period="all"]')).toHaveAttribute('aria-pressed', 'false');
    await expectKeyFigures(page, EXPECTED.week);
    await expect(page.locator('#refl-weeks-chart .chart-bar')).toHaveCount(1);
    await expect(page.locator('#refl-worth-later-avg')).toHaveText('-');

    await page.locator('#refl-period [data-period="lastweek"]').click();
    await expectKeyFigures(page, EXPECTED.lastweek);
    await expect(page.locator('#refl-start')).toHaveClass(/is-negative/);
    await expect(page.locator('#refl-weeks-chart .chart-bar')).toHaveAttribute('data-cents', '15514');
    await expect(page.locator('#refl-less-worth .refl-item')).toHaveCount(3);

    await page.locator('#refl-period [data-period="all"]').click();
    await expectKeyFigures(page, EXPECTED.all);
    await expect(page.locator('#refl-weeks-chart .chart-bar')).toHaveCount(4);
  });

  test('zonder uurloon geen uren werk; lege periode toont een lege toestand', async ({ page }) => {
    const data = JSON.parse(JSON.stringify(fixture));
    data.settings.hourlyWageCents = null;
    data.entries = data.entries.filter((e) => e.datetime < '2026-10-26');
    await openReflectie(page, { data });
    await expect(page.locator('#refl-hours')).toHaveCount(0);
    await expect(page.locator('.refl-item-meta').first()).not.toContainText('uur werk');
    await page.locator('#refl-period [data-period="week"]').click();
    await expect(page.locator('#refl-count')).toHaveText('0');
    await expect(page.locator('#refl-weeks-chart')).toHaveCount(0);
    await expect(page.locator('#refl-weeks .refl-empty')).toHaveText('Geen uitgaven in deze periode.');
    await expect(page.locator('#refl-start')).toHaveText('€ 101,00');
    await expect(page.locator('#refl-end')).toHaveText('€ 101,00');
  });

  test('nieuwe uitgave via Invoer telt mee in de reflectie', async ({ page }) => {
    await openReflectie(page, { hash: 'invoer' });
    await addExpense(page, { amount: '10,00', what: 'Boek', note: 'Voor de vakantie' });
    await goTab(page, 'reflectie');
    await expect(page.locator('#refl-count')).toHaveText('41');
    await expect(page.locator('#refl-own-expense')).toHaveText('€ 1.367,89');
    await expect(page.locator('#refl-end')).toHaveText('€ 133,11');
  });

  for (const width of [390, 360]) {
    test(`geen horizontale scroll op ${width} breed`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openReflectie(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const chartW = await page.locator('#refl-weeks-chart').evaluate((e) => e.getBoundingClientRect().right);
      expect(chartW).toBeLessThanOrEqual(width);
    });
  }
});

for (const scheme of ['light', 'dark']) {
  test(`screenshot reflectie ${scheme} (390 breed, hele pagina)`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone', 'screenshot alleen in het iphone-project');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: scheme });
    await openReflectie(page);
    await expect(page.locator('#refl-weeks-chart .chart-bar')).toHaveCount(4);
    await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; window.scrollTo(0, 0); });
    // Bij fullPage zou de vaste tabbalk midden over de pagina vallen; zet hem onderaan de pagina.
    await page.addStyleTag({ content: '.tabbar { position: static !important; }' });
    const name = scheme === 'dark' ? 'reflectie-donker.png' : 'reflectie.png';
    await page.screenshot({ path: path.join(__dirname, 'screens', name), fullPage: true });
  });
}
