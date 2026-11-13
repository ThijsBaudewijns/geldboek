// Installatiescherm (U22) en eerste-keer-scherm (fase 4).
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openApp, readData } = require('./helpers');

test.describe('Installatiescherm', () => {
  test('zonder standalone -> installatiescherm met 3 stappen, zonder tabbalk', async ({ page }) => {
    await openApp(page, { standalone: false, onboarded: false });
    await expect(page.locator('#install-screen')).toBeVisible();
    await expect(page.locator('#install-screen')).toContainText('Zet Geldboek eerst op je beginscherm');
    await expect(page.locator('#install-steps .step')).toHaveCount(3);
    await expect(page.locator('#install-steps svg')).toHaveCount(3);
    await expect(page.locator('#install-steps')).toContainText('Deel-knop');
    await expect(page.locator('#install-steps')).toContainText('Zet op beginscherm');
    await expect(page.locator('#install-steps')).toContainText('Voeg toe');
    await expect(page.locator('.tabbar')).toBeHidden();
    await expect(page.locator('#settings-link')).toBeHidden();
    await expect(page.locator('#view-invoer')).toBeHidden();
    await expect(page.locator('#welcome-screen')).toBeHidden();
    // Een hash naar een tabblad omzeilt het scherm niet.
    await page.evaluate(() => { location.hash = '#overzicht'; });
    await expect(page.locator('#install-screen')).toBeVisible();
    await expect(page.locator('#view-overzicht')).toBeHidden();
  });

  test('met standalone -> direct het eerste-keer-scherm', async ({ page }) => {
    await openApp(page, { onboarded: false });
    await expect(page.locator('#welcome-screen')).toBeVisible();
    await expect(page.locator('#install-screen')).toBeHidden();
    await expect(page.locator('#welcome-intro')).toHaveText('Leg een maand lang elke uitgave vast, met waarom. Daarna kijken we samen terug.');
    await expect(page.locator('#o-start-balance')).toBeVisible();
    await expect(page.locator('#o-wage')).toBeVisible();
    await expect(page.locator('.tabbar')).toBeHidden();
  });

  test('"Toch in de browser gebruiken" -> eerste-keer-scherm, onthouden bij herladen', async ({ page }) => {
    await openApp(page, { standalone: false, onboarded: false });
    await page.locator('#install-browser').click();
    await expect(page.locator('#welcome-screen')).toBeVisible();
    await expect(page.locator('#install-screen')).toBeHidden();
    expect(await page.evaluate(() => sessionStorage.getItem('geldboek.browser'))).toBe('1');
    await page.reload();
    await page.waitForFunction(() => window.Geldboek && window.Geldboek.app && window.Geldboek.app.store);
    await expect(page.locator('#welcome-screen')).toBeVisible();
    await expect(page.locator('#install-screen')).toBeHidden();
  });

  test('al onboarded (ook zonder standalone) -> direct de app', async ({ page }) => {
    await openApp(page, { standalone: false });
    await expect(page.locator('#view-invoer')).toBeVisible();
    await expect(page.locator('#install-screen')).toBeHidden();
    await expect(page.locator('.tabbar')).toBeVisible();
  });
});

test.describe('Eerste-keer-scherm', () => {
  test('startsaldo is verplicht; 0 mag; daarna naar Invoer en onboarded', async ({ page }) => {
    await openApp(page, { onboarded: false });
    await page.locator('#o-submit').click();
    await expect(page.locator('#o-start-balance-error')).toBeVisible();
    await expect(page.locator('#o-start-balance-error')).toContainText('Vul in hoeveel geld je nu hebt');
    await page.locator('#o-start-balance').fill('abc');
    await page.locator('#o-submit').click();
    await expect(page.locator('#o-start-balance-error')).toContainText('geen geldig bedrag');
    await page.locator('#o-start-balance').fill('0');
    await page.locator('#o-submit').click();
    await expect(page.locator('#view-invoer')).toBeVisible();
    await expect(page.locator('#welcome-screen')).toBeHidden();
    await expect(page.locator('.tabbar')).toBeVisible();
    await expect(page).toHaveURL(/#invoer$/);
    const s = (await readData(page)).settings;
    const today = await page.evaluate(() => window.Geldboek.calc.toISODate(new Date()));
    expect(s).toMatchObject({ onboarded: true, startBalanceCents: 0, hourlyWageCents: null, startDate: today });

    // Herladen: geen eerste-keer-scherm meer.
    await page.reload();
    await page.waitForFunction(() => window.Geldboek && window.Geldboek.app && window.Geldboek.app.store);
    await expect(page.locator('#view-invoer')).toBeVisible();
    await expect(page.locator('#welcome-screen')).toBeHidden();
  });

  test('negatief startsaldo via de ±-knop en uurloon', async ({ page }) => {
    await openApp(page, { onboarded: false });
    await page.locator('#o-start-balance').fill('25,50');
    await page.locator('#o-start-balance-sign').click();
    await expect(page.locator('#o-start-balance')).toHaveValue('-25,50');
    await page.locator('#o-wage').fill('x');
    await page.locator('#o-submit').click();
    await expect(page.locator('#o-wage-error')).toContainText('geen geldig uurloon');
    await page.locator('#o-wage').fill('12,75');
    await page.locator('#o-submit').click();
    await expect(page.locator('#view-invoer')).toBeVisible();
    expect((await readData(page)).settings).toMatchObject({ onboarded: true, startBalanceCents: -2550, hourlyWageCents: 1275 });
  });

  test('screenshots installatie en onboarding (390x844)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone', 'screenshot alleen in het iphone-project');
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page, { standalone: false, onboarded: false });
    await expect(page.locator('#install-screen')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(__dirname, 'screens', 'installatie.png') });

    await page.locator('#install-browser').click();
    await expect(page.locator('#welcome-screen')).toBeVisible();
    await page.locator('#o-start-balance').fill('250,00');
    await page.locator('#o-wage').fill('15,00');
    await page.locator('#o-wage').blur();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(__dirname, 'screens', 'onboarding.png') });
  });
});
