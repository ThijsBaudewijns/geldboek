// Fase 9: alle schermen doorlopen op 390x844 en 360x740.
// Per scherm: geen horizontale scroll (document.documentElement.scrollWidth <= innerWidth);
// over de hele doorloop: geen console-fouten en geen paginafouten.
const { test, expect } = require('@playwright/test');
const { openApp, goTab, setEntryType, collectErrors, scrollWidths } = require('./helpers');
const fixture = require('./fixtures/maand.json');

const NOW = new Date(2026, 10, 1, 20, 0); // zoals reflectie.spec.js / backup.spec.js
const SIZES = [{ width: 390, height: 844 }, { width: 360, height: 740 }];

/** Maakt een check-functie die per scherm de breedte controleert (soft, zodat alle schermen gemeld worden). */
function checker(page, size) {
  const seen = [];
  const check = async (name) => {
    seen.push(name);
    const w = await scrollWidths(page);
    expect.soft(w.scrollWidth, `${name} (${size.width}x${size.height}): horizontale scroll`).toBeLessThanOrEqual(w.innerWidth);
  };
  check.seen = seen;
  return check;
}

for (const size of SIZES) {
  test.describe(`schermen ${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    test('installatie en eerste keer', async ({ page }) => {
      const errors = collectErrors(page);
      const check = checker(page, size);
      await page.clock.setFixedTime(NOW);
      await openApp(page, { standalone: false, onboarded: false });
      await expect(page.locator('#install-screen')).toBeVisible();
      await check('installatie');
      await page.locator('#install-browser').click();
      await expect(page.locator('#welcome-screen')).toBeVisible();
      await check('welkom');
      // Foutmeldingen tonen (lege invoer) mag ook niet te breed worden.
      await page.locator('#o-wage').fill('abc');
      await page.locator('#o-submit').click();
      await expect(page.locator('#o-wage-error')).toBeVisible();
      await check('welkom met fouten');
      await page.locator('#o-start-balance').fill('250,00');
      await page.locator('#o-wage').fill('15,00');
      await page.locator('#o-submit').click();
      await expect(page.locator('#view-invoer')).toBeVisible();
      await check('invoer na onboarding');
      expect(errors).toEqual([]);
    });

    test('alle tabbladen met een maand aan data', async ({ page }) => {
      const errors = collectErrors(page);
      const check = checker(page, size);
      await page.clock.setFixedTime(NOW);
      await openApp(page, { data: fixture });

      // Invoer: uitgave met back-upherinnering, snelle chips en alle velden.
      await expect(page.locator('#backup-reminder')).toBeVisible();
      await check('invoer uitgave met herinnering');
      // Met de (compacte) herinnering erbij passen de verplichte velden op 390x844 nog zonder scrollen
      // boven de vaste Opslaan-balk; op elk formaat zijn ze helemaal zichtbaar te scrollen.
      const saveTop = () => page.locator('#f-submit').evaluate((el) => el.closest('.save-bar').getBoundingClientRect().top);
      const required = ['#f-amount', '#f-what', '#f-note', '[data-group="fixed"]', '#f-datetime'];
      if (size.width === 390) {
        await page.evaluate(() => window.scrollTo(0, 0));
        const top = await saveTop();
        for (const sel of required) {
          const b = await page.locator(sel).boundingBox();
          expect.soft(b.y, `${sel} zonder scrollen in beeld`).toBeGreaterThanOrEqual(0);
          expect.soft(b.y + b.height, `${sel} zonder scrollen boven de Opslaan-balk`).toBeLessThanOrEqual(top + 0.5);
        }
      }
      for (const sel of required) {
        await page.locator(sel).evaluate((el) => el.scrollIntoView({ block: 'center' }));
        const b = await page.locator(sel).boundingBox();
        expect.soft(b.y + b.height, `${sel} boven de Opslaan-balk te scrollen`).toBeLessThanOrEqual((await saveTop()) + 0.5);
      }
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await check('invoer uitgave onderaan');
      // Foutmeldingen bij leeg opslaan.
      await page.locator('#f-submit').click();
      await check('invoer uitgave met fouten');
      await setEntryType(page, 'income');
      await expect(page.locator('#i-amount')).toBeVisible();
      await check('invoer inkomst');
      await page.locator('#i-submit').click();
      await check('invoer inkomst met fouten');
      await setEntryType(page, 'expense');
      await page.locator('#backup-reminder-close').click();
      await expect(page.locator('#backup-reminder')).toHaveCount(0);
      await check('invoer zonder herinnering');

      // Overzicht met Openstaand en bewerkmodus.
      await goTab(page, 'overzicht');
      await expect(page.locator('section#openstaand')).toBeVisible();
      await check('overzicht');
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await check('overzicht onderaan');
      await page.locator('.entry-row[data-entry-id]').first().click();
      await expect(page.locator('#edit-form')).toBeVisible();
      await check('overzicht bewerkmodus uitgave');
      await page.locator('#edit-back').click();
      await page.locator('.entry-row.is-income').first().click();
      await expect(page.locator('#edit-form')).toBeVisible();
      await check('overzicht bewerkmodus inkomst');
      await page.locator('#edit-back').click();
      await expect(page.locator('#edit-form')).toHaveCount(0);

      // Terugkijken: kaart en lege toestand.
      await goTab(page, 'terugkijken');
      await expect(page.locator('#review-card')).toBeVisible();
      await check('terugkijken');
      for (let i = 0; i < 100 && (await page.locator('#review-skip').count()); i++) {
        await page.locator('#review-skip').click();
      }
      await expect(page.locator('#review-empty')).toBeVisible();
      await check('terugkijken leeg');

      // Reflectie: alle periodes.
      await goTab(page, 'reflectie');
      for (const p of ['all', 'week', 'lastweek']) {
        await page.locator(`#refl-period .seg-btn[data-period="${p}"]`).click();
        await expect(page.locator(`#refl-period .seg-btn[data-period="${p}"]`)).toHaveAttribute('aria-pressed', 'true');
        await check(`reflectie ${p}`);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await check(`reflectie ${p} onderaan`);
      }

      // Instellingen incl. Gegevens, met de update-balk zichtbaar.
      await page.locator('#settings-link').click();
      await expect(page.locator('#view-instellingen')).toBeVisible();
      await check('instellingen');
      await page.locator('#settings-gegevens').scrollIntoViewIfNeeded();
      await expect(page.locator('#backup-json')).toBeVisible();
      await check('instellingen gegevens');
      await page.evaluate(() => { document.getElementById('update-bar').hidden = false; });
      await check('update-balk');

      expect(check.seen.length).toBeGreaterThan(15);
      expect(errors).toEqual([]);
    });
  });
}
