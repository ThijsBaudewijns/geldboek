# Plan: Geldboek, een uitgaven-app voor een maand "huiswerk"

**Stand:** 2026-11-13
**Doel:** een web-app voor de iPhone (PWA op het beginscherm, puur HTML/CSS/JS, geen build) waarmee een vriend van Thijs een maand lang elke uitgave en inkomst in een paar tikken vastlegt, met argumentatie en reflectievelden, en die na die maand een reflectiepagina en export biedt om samen terug te kijken.
**Waarom nu:** de vriend wil beter met geld omgaan; de app is zijn "huiswerk" voor een maand. Hoe sneller en prettiger de invoer, hoe kleiner de kans dat hij het uitstelt.
**Uitvoeren:** fase voor fase met `/run-plan PLAN.md`, in een nieuwe sessie. Elke fase heeft een eigen "Klaar als".

Alle paden zijn relatief aan `c:\Users\thijs\Desktop\financien`, tenzij anders vermeld.

## Fases en afhankelijkheden

| Fase | Levert op | Hangt af van |
| --- | --- | --- |
| 1. Fundament: datamodel, opslag, rekenlogica | `app/js/store.js`, `app/js/calc.js`, unit-tests groen, git-repo | - |
| 2. Invoerscherm uitgave + testopstelling browser | `app/index.html` met snelle invoer, Playwright-smoketest via `file://` | 1 |
| 3. Overzicht: lijst, saldo, bewerken/verwijderen | tabblad Overzicht met lopend saldo en bewerkbare regels | 2 |
| 4. Installatiescherm, instellingen, startsaldo, inkomsten | iOS-installatiescherm, eerste-keer-scherm, instellingen, invoer inkomsten | 3 |
| 5. Voorgeschoten en terugbetaald | markering "voorgeschoten voor", lijst Openstaand, afvinken | 4 |
| 6. Terugkijken na een week + uren-werk | tabblad Terugkijken met tweede waard-score, uren-werk bij elke uitgave | 4 |
| 7. Reflectiepagina | tabblad Reflectie met totalen, verdelingen en SVG-grafieken | 5, 6 |
| 8. Backup, opslagvangnet en PWA | back-up via het iOS-deelmenu, terugzetten, IndexedDB-vangnet, manifest, iconen, service worker met update-melding | 7 |
| 9. End-to-end-test, publicatieworkflow en handleidingen | volledige flow-test in iPhone-WebKit, GitHub Pages-workflow, `README.md` voor vriend en voor Thijs | 8 |

Eerst het datamodel en de rekenlogica met tests (fase 1): alles wat volgt leest en schrijft via die laag, en saldo en terugbetalingen zijn de plek waar rekenfouten ontstaan. Daarna direct het invoerscherm (fase 2), omdat dat het belangrijkste is en omdat het grootste technische risico (werkt het vanaf `file://` in een browser, zonder server) daar meteen getoetst wordt. Fases 5 en 6 hangen niet van elkaar af; als een van beide faalt kan de ander door.

## Uitgangspunten (besloten)

| # | Besluit |
| --- | --- |
| U1 | **PWA, alle data op de telefoon van de vriend, in `localStorage`.** Geen server, geen login, geen account. Voor de reflectie exporteert hij een bestand (fase 8). |
| U2 | **Puur HTML/CSS/JS, geen build-stap, geen runtime-dependencies, geen CDN.** Alles staat in `app/` en werkt offline. Gewone `<script>`-tags, **geen ES-modules** (`type="module"` werkt niet vanaf `file://`). Gedeelde code hangt aan één globaal object `window.Geldboek`. |
| U3 | **Doelapparaat is een iPhone; de app wordt gehost op GitHub Pages en door de vriend op zijn beginscherm gezet.** Een lokaal bestand openen kan op een iPhone niet zinvol, dus hosten is nodig. De run maakt een GitHub Actions-workflow die `app/` publiceert (fase 9); Thijs maakt de repo aan, pusht en zet Pages aan (buiten de run). Voor ontwikkeling werkt de app ook vanaf `file://` op de pc; de service worker wordt alleen geregistreerd als `location.protocol` `http:` of `https:` is. |
| U22 | **Data alleen in de beginscherm-app.** Op iOS heeft een op het beginscherm gezette web-app eigen opslag, los van Safari, en die valt niet onder Safari's regel die sitedata wist na 7 dagen zonder gebruik. Daarom: de app detecteert of hij standalone draait (`navigator.standalone === true` of `matchMedia('(display-mode: standalone)').matches`). Zo niet, dan toont de app in plaats van het eerste-keer-scherm een **installatiescherm**: "Zet Geldboek eerst op je beginscherm", met 3 stappen en icoontjes (Safari > Deel-knop > Zet op beginscherm > Voeg toe), plus onderaan een klein linkje "Toch in de browser gebruiken" (voor de pc en voor testen). Zo ontstaan er geen twee losse datasets. |
| U23 | **Opslag zo vast mogelijk:** bij opstarten `navigator.storage.persist()` aanroepen als het bestaat (Safari 17+). Elke wijziging schrijft naar `localStorage` **en** spiegelt de volledige data naar IndexedDB (database `geldboek`, store `data`, sleutel `v1`). Als `localStorage` bij opstarten leeg is maar IndexedDB niet, herstelt de app uit IndexedDB. Dat is een vangnet; de echte bescherming zijn U22 en de back-up (U18). |
| U24 | **Back-up op de iPhone via het deelmenu:** de knop "Back-up maken" gebruikt `navigator.share({ files: [jsonFile] })` (werkt in iOS Safari en standalone), zodat hij hem in Bestanden/iCloud Drive bewaart of via WhatsApp naar Thijs stuurt. Zonder `share` met bestanden: download via `<a download>`. Import via `<input type="file" accept=".json,application/json">`. |
| U25 | **iOS-details die de invoer prettig houden:** alle invoervelden `font-size` ≥ 16px (anders zoomt iOS in); `viewport-fit=cover` en `env(safe-area-inset-*)` voor de tabbalk en de bovenrand; `apple-touch-icon` 180×180; `<meta name="apple-mobile-web-app-capable" content="yes">`, `mobile-web-app-capable` en `apple-mobile-web-app-status-bar-style` `default`; `apple-mobile-web-app-title` "Geldboek". iOS opent het toetsenbord niet bij `focus()` zonder tik; daarom is het bedragveld groot, staat het bovenaan en is het met één tik actief (geen autofocus-trucs). |
| U26 | **Updates komen vanzelf binnen:** de service worker gebruikt een versienummer (`const VERSION = 'v1'` in `sw.js`). Bij een nieuwe versie toont de app de balk "Nieuwe versie, tik om te verversen"; tikken activeert de nieuwe worker (`skipWaiting`) en herlaadt. Data blijft staan, want die zit niet in de cache. |
| U27 | **De URL verandert nooit meer na de eerste installatie.** Data hoort bij het adres (de origin); een ander adres betekent een lege app. De README waarschuwt Thijs hiervoor, en ook dat het verwijderen van het beginscherm-icoon de data wist (dus eerst een back-up maken). |
| U4 | **Taal Nederlands, valuta euro, `nl-NL`-opmaak.** Bedragen intern als gehele centen (`amountCents`, integer), nooit als float. Invoer accepteert komma en punt (`12,50`, `12.5`). |
| U5 | **Mobile-first, invoer in zo weinig tikken als kan.** Bij openen van de app staat het invoerscherm open, met de focus op het bedrag (`inputmode="decimal"`). Datum/tijd staat al op nu. Tikvelden voor opties zijn chips (knoppen), geen dropdowns. Knoppen minimaal 44px hoog. Licht en donker thema via `prefers-color-scheme`. |
| U6 | **Verplicht bij een uitgave: bedrag, wat, vast/variabel (standaard `variabel`).** Datum/tijd is vooringevuld. Optioneel: argumentatie (staat wel direct onder "wat"), categorie, nodig/wil/impuls, waard-score 1-5, voorgeschoten-voor. Argumentatie was eerst verplicht, maar is optioneel gemaakt: het merendeel van de uitgaven (boodschappen, vaste kosten) spreekt voor zich. Stemming is helemaal geschrapt (voegde niets toe). |
| U7 | **Snel toevoegen:** boven het formulier staan de 6 meest gebruikte "wat"-waarden van de laatste 30 dagen als chips. Een tik vult wat, bedrag (laatst gebruikte), vast/variabel en categorie in; hij past aan wat nodig is en vult de argumentatie in. |
| U8 | **Standaardcategorieën:** Boodschappen, Eten & drinken buiten de deur, Vervoer, Uitgaan, Kleding, Abonnementen, Wonen, Cadeaus, Overig. Aan te passen in Instellingen. |
| U9 | **Nodig/wil/impuls** als drie chips. (Stemming is geschrapt.) **Waard-score** 1-5 als vijf knoppen. |
| U10 | **Inkomsten** hebben een bron: `werk`, `terugbetaling`, `belasting`, `overig`. Bij `werk` optioneel een aantal uren; met een uurloon uit Instellingen vult uren × uurloon het bedrag voor (overschrijfbaar). |
| U11 | **Saldo = startsaldo + som inkomsten − som uitgaven**, over alle regels vanaf de startdatum. Startsaldo, startdatum (standaard de dag van het eerste gebruik) en uurloon (optioneel) komen uit het eerste-keer-scherm. |
| U12 | **Voorgeschoten:** een uitgave kan `advanceFor` (naam) hebben. Op "terugbetaald" tikken maakt een inkomst aan met bron `terugbetaling`, gekoppeld via `linkedExpenseId`, en zet `repaidAt` op de uitgave. Terugdraaien verwijdert die inkomst weer. In de reflectie telt "eigen uitgaven" = uitgaven zonder `advanceFor`. |
| U13 | **Terugkijken:** uitgaven ouder dan 7 dagen met een eerste waard-score of argumentatie en nog zonder `worthLater` komen in het tabblad Terugkijken, met de vraag "Was het het geld nog steeds waard?" (1-5). Een badge op het tabblad toont het aantal. Overslaan kan (`worthLaterSkipped: true`). |
| U14 | **Uren-werk:** als er een uurloon is ingesteld, staat bij elke uitgave in lijst en reflectie "≈ x,x uur werk" (bedrag / uurloon, één decimaal). Zonder uurloon niet tonen. |
| U15 | **Navigatie:** vaste tabbalk onderaan met vier tabbladen: Invoer, Overzicht, Terugkijken, Reflectie. Instellingen via een tandwiel rechtsboven. Eén HTML-pagina, de tabbladen zijn secties die met JS worden getoond/verborgen (hash-routing `#invoer`, `#overzicht`, `#terugkijken`, `#reflectie`, `#instellingen`). |
| U16 | **Grafieken als inline SVG, zelf getekend, zonder library.** De fase-agent laadt de skill `dataviz` voordat hij grafiekcode schrijft. |
| U17 | **Opslagschema:** één `localStorage`-sleutel `geldboek.v1` met `{ version: 1, settings, entries }`. Zie "Datamodel" hieronder. Elke wijziging schrijft meteen weg. |
| U18 | **Backup:** export naar JSON (volledige data, opnieuw te importeren) en CSV (voor een spreadsheet, één regel per entry). Import vervangt na bevestiging alle data. Na 7 dagen zonder export toont de app een kleine, wegklikbare herinnering. Hoe dat op de iPhone gaat staat in U24. |
| U19 | **Ontwikkeltools staan buiten `app/`.** `package.json`, tests en Playwright staan in de root en `tests/`; de vriend heeft alleen `app/` nodig. Unit-tests met de ingebouwde Node-testrunner (`node --test`), browsertests met Playwright. |
| U20 | **Lokale git-repo, branch `main`, geen remote.** Elke fase sluit af met een commit. Niet pushen. `node_modules/` staat in `.gitignore`. |
| U21 | **Naam van de app: "Geldboek".** |

## Datamodel

```js
// localStorage['geldboek.v1']
{
  version: 1,
  settings: {
    startBalanceCents: 0,          // integer
    startDate: "2026-11-13",       // ISO-datum
    hourlyWageCents: null,         // integer of null
    categories: ["Boodschappen", ...],   // U8
    lastExportAt: null,            // ISO-datetime of null
    onboarded: false
  },
  entries: [
    {
      id: "e_<timestamp>_<random>",
      type: "expense" | "income",
      amountCents: 1250,           // altijd positief
      datetime: "2026-11-13T14:32", // lokale tijd, zonder zone
      what: "Lunch",
      note: "",                    // expense: argumentatie (verplicht); income: omschrijving (optioneel)
      createdAt: "...ISO...",
      // alleen expense:
      fixed: "vast" | "variabel",
      category: "Eten & drinken buiten de deur" | null,
      need: "nodig" | "wil" | "impuls" | null,
      worth: 1..5 | null,
      mood: "verveeld" | "gestrest" | "sociaal" | "blij" | "moe" | "neutraal" | null,
      worthLater: 1..5 | null, worthLaterAt: ISO | null, worthLaterSkipped: false,
      advanceFor: "Sam" | null, repaidAt: ISO | null,
      // alleen income:
      source: "werk" | "terugbetaling" | "belasting" | "overig",
      hours: 6.5 | null,
      linkedExpenseId: "e_..." | null
    }
  ]
}
```

## Harde regels (in elke fase)

- **Geen dependencies in `app/`.** Geen npm-pakketten, geen CDN-links, geen ES-modules, geen build-stap. `app/index.html` moet werken na dubbelklikken (U2, U3).
- **Bedragen als integer centen** in opslag en berekening; alleen bij weergave omzetten (U4).
- **Opslagschema `geldboek.v1` niet breken.** Nieuwe velden mogen erbij (met standaardwaarde bij inlezen); bestaande velden niet hernoemen.
- **Git:** lokaal op `main`, commit aan het eind van elke fase, nooit pushen, geen remote toevoegen. `node_modules/` en `test-results/` nooit committen.
- **Niets publiceren of hosten.** Geen repo op GitHub aanmaken, niet pushen, Pages niet aanzetten. De workflow-file mag wel gemaakt worden (fase 9); het publiceren doet Thijs.
- **Alles moet werken in iOS Safari / WebKit** (U3, U25). Gebruik geen API zonder controle of hij bestaat (`if ('share' in navigator)` enz.), en test elke fase ook in het WebKit-project van Playwright.
- Buiten `c:\Users\thijs\Desktop\financien` niets aanmaken of wijzigen (behalve de Playwright-browsercache als die nodig is).

## Achtergrond die elke fase nodig heeft

**Mappenstructuur (na fase 2)**
- `app/index.html`: de enige pagina, met alle tabblad-secties.
- `app/css/style.css`: alle stijlen, met CSS-variabelen voor kleuren op `:root` en een donkere variant onder `@media (prefers-color-scheme: dark)`.
- `app/js/store.js`: laden/opslaan van `geldboek.v1`, migratie/standaardwaarden, CRUD op entries en settings. Puur, zonder DOM.
- `app/js/calc.js`: rekenlogica (saldo, totalen, verdelingen, uren-werk, terugkijk-lijst, top-chips, bedrag parsen/formatteren). Puur, zonder DOM.
- `app/js/ui-*.js`: één bestand per tabblad (`ui-invoer.js`, `ui-overzicht.js`, `ui-terugkijken.js`, `ui-reflectie.js`, `ui-instellingen.js`), plus `app/js/app.js` voor routing en opstarten.
- `tests/unit/*.test.js`: Node-unit-tests op `store.js` en `calc.js`.
- `tests/e2e/*.spec.js`: Playwright-tests, die `app/index.html` via een `file://`-URL openen.

**Patroon voor gedeelde code (U2)**
`store.js` en `calc.js` moeten zowel in de browser als in Node draaien. Patroon:
```js
(function (root) {
  const calc = { /* ... */ };
  root.Geldboek = root.Geldboek || {};
  root.Geldboek.calc = calc;
  if (typeof module !== 'undefined' && module.exports) module.exports = calc;
})(typeof window !== 'undefined' ? window : globalThis);
```
`store.js` krijgt de opslag als parameter (`createStore(storage)`), zodat de unit-tests een nep-`localStorage` (een object met `getItem`/`setItem`) kunnen meegeven.

**Commando's**
- Unit-tests: `npm test` (= `node --test tests/unit/`).
- Browsertests: `npm run e2e` (= `npx playwright test`). Configuratie in `playwright.config.js` met twee projecten:
  - `iphone`: `devices['iPhone 14']` (WebKit, 390×844, touch). Dit is het hoofdproject, want de vriend heeft een iPhone. Vereist `npx playwright install webkit`.
  - `chromium`: viewport 390×844, `channel: 'msedge'` als Edge geïnstalleerd is (standaard op Windows 11); anders `npx playwright install chromium` zonder `channel`.
  Beide projecten moeten slagen. Kan WebKit vanaf `file://` iets niet wat in iOS wel werkt (of andersom), dan draaien de WebKit-tests tegen de lokale server uit `tests/tools/serve.js` (zie fase 2).
- Standalone-modus nabootsen in tests: `page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }))`. Zonder die regel toont de app het installatiescherm (U22); tests die dat scherm niet testen, zetten hem via een helper in `tests/e2e/helpers.js`.
- Elke e2e-test begint met lege `localStorage` (nieuwe context per test, Playwright doet dat standaard).

**Omgeving**
- Windows 11, Node v22.11.0, Python 3.11. Shells: PowerShell 5.1 (geen `&&`) en Git Bash.
- De werkmap was leeg bij het schrijven van dit plan; er was nog geen git-repo.
- `localStorage` werkt in Chromium/Edge vanaf `file://`; service workers niet (daarom U3).

## Fase 1: Fundament: datamodel, opslag, rekenlogica

**Doel:** een geteste data- en rekenlaag waar alle schermen op bouwen.
**Hangt af van:** -

- `git init -b main`, `.gitignore` (`node_modules/`, `test-results/`, `playwright-report/`), `package.json` (private, scripts `test` en `e2e`, nog geen dependencies).
- `app/js/store.js` volgens het patroon in Achtergrond: `createStore(storage)` met `load()`, `save()`, `getSettings()`, `updateSettings(patch)`, `addEntry(entry)`, `updateEntry(id, patch)`, `deleteEntry(id)`, `listEntries()`, `replaceAll(data)`. Bij laden: ontbrekende velden aanvullen met standaardwaarden uit het Datamodel; kapotte JSON levert lege standaarddata op zonder crash. `id`-generatie volgens het Datamodel.
- `app/js/calc.js`: `parseAmount("12,50") -> 1250` (ongeldig -> `null`), `formatEuro(1250) -> "€ 12,50"` (via `Intl.NumberFormat('nl-NL')`), `balance(settings, entries)` (U11), `totals(entries, {from, to})` (uitgaven, inkomsten, eigen uitgaven volgens U12), `groupBy(entries, key)` (som per categorie / need / mood / fixed), `byWeek(entries)`, `hoursOfWork(amountCents, hourlyWageCents)` (U14, `null` zonder uurloon), `reviewQueue(entries, now)` (U13), `quickPicks(entries, now)` (U7).
- `tests/unit/store.test.js` en `tests/unit/calc.test.js`: minimaal per functie een normaal geval en een randgeval; expliciet: komma- en puntinvoer, negatief/leeg bedrag geweigerd, saldo met terugbetaling (voorgeschoten 20, terugbetaald 20 -> saldo gelijk aan vóór de uitgave; eigen uitgaven 0), terugkijk-lijst precies op de 7-dagengrens, kapotte JSON in opslag.
- Commit.

**Klaar als:**
- [ ] `npm test` slaagt, met minstens 20 tests
- [ ] `store.js` en `calc.js` gebruiken geen `import`/`export`-syntax en geen DOM (`grep -E "^(import|export) |document\." app/js/store.js app/js/calc.js` geeft niets)
- [ ] commit op `main`

## Fase 2: Invoerscherm uitgave + testopstelling browser

**Doel:** een uitgave vastleggen in een paar tikken, vanaf `file://`, bewezen met een browsertest.
**Hangt af van:** fase 1 (`store.js`, `calc.js`)

- `app/index.html` (lang `nl`, viewport-meta, `theme-color`), `app/css/style.css`, `app/js/app.js` (hash-routing volgens U15; de tabbalk met vier tabbladen; tabbladen die nog niet bestaan tonen "binnenkort"), `app/js/ui-invoer.js`.
- Invoerformulier volgens U5, U6, U7, U9: bedrag (focus, `inputmode="decimal"`), wat, argumentatie, vast/variabel-schakelaar, datum/tijd (`datetime-local`, vooringevuld met nu), categorie-chips, nodig/wil/impuls-chips, waard 1-5. De optionele velden staan onder een inklapbaar blok "Meer" dat standaard open staat (de vriend moet ze zien), maar het formulier blijft zonder scrollen bruikbaar op 390×844 voor de verplichte velden + Opslaan.
- Validatie in het Nederlands, bij het veld. Na Opslaan: korte melding "Opgeslagen: € 12,50 — Lunch", formulier leeg, datum/tijd weer op nu, focus terug op bedrag.
- Snelle-chips (U7) boven het formulier via `calc.quickPicks`.
- iOS-basis in `index.html` en `style.css` volgens U25: meta-tags, safe-area-padding op tabbalk en kop, invoervelden ≥ 16px.
- `tests/tools/serve.js`: een statische server met alleen Node-ingebouwde modules (`http`, `fs`, `path`) die `app/` serveert op poort 8765, met de juiste `Content-Type` voor `.webmanifest` en `.js`. In de Playwright-config als `webServer` (`reuseExistingServer: true`).
- Playwright: `npm i -D @playwright/test`, `npx playwright install webkit`, `playwright.config.js` volgens Achtergrond (projecten `iphone` en `chromium`), `tests/e2e/helpers.js` met `openApp(page)` (standalone aan, app openen), `tests/e2e/invoer.spec.js`: opent de app, vult een uitgave in met `12,50`, slaat op, controleert dat `localStorage['geldboek.v1']` een entry met `amountCents: 1250` bevat; plus een test dat opslaan zonder argumentatie geweigerd wordt; plus een test dat na een opgeslagen "Lunch" een chip "Lunch" verschijnt.
- Commit.

**Klaar als:**
- [ ] `npm run e2e` slaagt (3 tests, in zowel `iphone` als `chromium`) en `npm test` nog steeds
- [ ] in het `iphone`-project hebben alle `input`/`textarea`-elementen een berekende `font-size` ≥ 16px (in een test gecontroleerd)
- [ ] `app/` bevat geen `type="module"`, geen `http`-links naar scripts/stijlen (`grep -rE 'type="module"|src="http|href="http' app/` geeft niets)
- [ ] een screenshot `tests/e2e/screens/invoer.png` (390×844) bestaat en wordt gecommit
- [ ] commit op `main`

## Fase 3: Overzicht: lijst, saldo, bewerken/verwijderen

**Doel:** de vriend ziet wat hij heeft vastgelegd en zijn huidige saldo, en kan fouten herstellen.
**Hangt af van:** fase 2 (pagina, routing, invoerformulier)

- `app/js/ui-overzicht.js`: bovenaan het saldo (`calc.balance`) en de totalen van deze week en deze maand. Daaronder alle entries, nieuwste eerst, gegroepeerd per dag met dagtotaal. Per regel: bedrag (uitgave rood/min, inkomst groen/plus), wat, categorie, kleine labels voor need/vast.
- Tik op een regel opent dezelfde invoer-UI in bewerkmodus (hergebruik de formuliercode uit `ui-invoer.js`, geen tweede formulier), met Opslaan en Verwijderen (met bevestiging).
- Lege toestand: "Nog niets vastgelegd. Tik op Invoer om je eerste uitgave toe te voegen."
- `tests/e2e/overzicht.spec.js`: twee uitgaven toevoegen -> saldo klopt; een bewerken (bedrag) -> saldo past zich aan; een verwijderen -> verdwijnt uit lijst en opslag.
- Commit.

**Klaar als:**
- [ ] `npm run e2e` en `npm test` slagen, inclusief de nieuwe overzichtstests
- [ ] screenshot `tests/e2e/screens/overzicht.png` gecommit
- [ ] commit op `main`

## Fase 4: Instellingen, startsaldo, inkomsten

**Doel:** saldo begint bij het echte startsaldo en inkomsten kunnen worden vastgelegd.
**Hangt af van:** fase 3 (overzicht en bewerkmodus)

- Installatiescherm volgens U22, getoond als de app niet standalone draait en `settings.onboarded` false is (staat het al op het beginscherm, dan direct het eerste-keer-scherm). De drie stappen met inline-SVG-icoontjes van de iOS-deelknop en "Zet op beginscherm". Linkje "Toch in de browser gebruiken" gaat door naar het eerste-keer-scherm en onthoudt die keuze in `sessionStorage`.
- Eerste-keer-scherm (als `settings.onboarded` false is): korte uitleg van het huiswerk (2-3 zinnen: "Leg een maand lang elke uitgave vast, met waarom. Daarna kijken we samen terug."), startsaldo (verplicht, mag 0 of negatief), uurloon (optioneel). Daarna naar Invoer.
- `app/js/ui-instellingen.js` (`#instellingen`, tandwiel rechtsboven): startsaldo, startdatum, uurloon, categorieën toevoegen/hernoemen/verwijderen (hernoemen past bestaande entries aan).
- Op het invoerscherm een schakelaar bovenaan: **Uitgave | Inkomst**. Inkomst-formulier: bedrag, bron-chips (U10), omschrijving (optioneel), datum/tijd, bij `werk` een veld uren dat met uurloon het bedrag voorinvult.
- Unit-tests aanvullen waar `calc`/`store` uitgebreid wordt (categorie hernoemen). `tests/e2e/instellingen.spec.js`: onboarding met startsaldo 100 -> uitgave 20 -> inkomst `werk` 4 uur × uurloon 15 -> saldo € 140,00.
- `tests/e2e/installatie.spec.js`: zonder standalone -> installatiescherm zichtbaar; met standalone -> direct het eerste-keer-scherm; "Toch in de browser gebruiken" -> eerste-keer-scherm.
- Bestaande e2e-tests aanpassen zodat ze de onboarding afhandelen (uitbreiden van `openApp` in `tests/e2e/helpers.js`).
- Commit.

**Klaar als:**
- [ ] `npm run e2e` en `npm test` slagen
- [ ] screenshots `installatie.png`, `onboarding.png` en `inkomst.png` (project `iphone`) in `tests/e2e/screens/` gecommit
- [ ] commit op `main`

## Fase 5: Voorgeschoten en terugbetaald

**Doel:** voorgeschoten bedragen bijhouden en met één tik als terugbetaald afvinken.
**Hangt af van:** fase 4 (inkomsten met bron `terugbetaling`)

- In het uitgaveformulier (blok "Meer") een veld "Voorgeschoten voor" (naam, met suggesties van eerder gebruikte namen via `<datalist>`).
- In Overzicht een kaart **Openstaand** boven de lijst (alleen als er iets openstaat): per persoon het totaal en de losse posten, elk met een knop "Terugbetaald". Dat volgt U12 (inkomst aanmaken, `repaidAt` zetten). In de lijst een label "voorgeschoten · open" of "voorgeschoten · terug".
- Terugbetaling ongedaan maken vanuit de bewerkmodus van de uitgave (verwijdert de gekoppelde inkomst). Verwijderen van een uitgave met gekoppelde inkomst vraagt of die inkomst ook weg moet.
- Unit-tests voor de koppeling in `store`; `tests/e2e/voorgeschoten.spec.js`: voorschieten 30 voor "Sam" -> Openstaand toont Sam € 30 -> Terugbetaald -> Openstaand weg, saldo terug op de oude waarde.
- Commit.

**Klaar als:**
- [ ] `npm run e2e` en `npm test` slagen
- [ ] screenshot `openstaand.png` gecommit
- [ ] commit op `main`

## Fase 6: Terugkijken na een week + uren-werk

**Doel:** de vriend beoordeelt uitgaven een week later opnieuw, en ziet uitgaven ook in uren werk.
**Hangt af van:** fase 4 (uurloon in instellingen)

- `app/js/ui-terugkijken.js`: lijst uit `calc.reviewQueue` (U13). Per uitgave: datum, wat, bedrag, de oorspronkelijke argumentatie en eerste waard-score, en de vraag "Was het het geld nog steeds waard?" met 1-5 en "Overslaan". Na antwoord schuift de volgende in beeld. Lege toestand: "Niets om terug te kijken. Uitgaven komen hier een week na aankoop."
- Badge met het aantal op het tabblad Terugkijken (bij opstarten en na elke wijziging bijwerken).
- Uren-werk (U14) tonen in de Overzicht-regels, in de opslaan-melding ("€ 45,00 ≈ 3,0 uur werk") en in Terugkijken.
- `tests/e2e/terugkijken.spec.js`: een uitgave met datum 8 dagen terug -> badge 1 -> score 2 geven -> badge weg, `worthLater: 2` in opslag. Test met uurloon 15 en uitgave 45 -> "3,0 uur werk" zichtbaar.
- Commit.

**Klaar als:**
- [ ] `npm run e2e` en `npm test` slagen
- [ ] screenshot `terugkijken.png` gecommit
- [ ] commit op `main`

## Fase 7: Reflectiepagina

**Doel:** één pagina die de maand samenvat als basis voor het reflectiegesprek.
**Hangt af van:** fase 5 (eigen uitgaven / voorgeschoten), fase 6 (`worthLater`, uren-werk)

- Laad eerst de skill `dataviz` (U16). Grafieken als inline SVG, kleuren uit de CSS-variabelen, leesbaar in licht en donker.
- `app/js/ui-reflectie.js`, periode-keuze: "Hele periode" (vanaf startdatum, standaard), "Deze week", "Vorige week".
- Inhoud, van boven naar beneden:
  1. Kerncijfers: startsaldo -> huidig saldo, totaal inkomsten, totaal eigen uitgaven, aantal registraties, aantal dagen met minstens één registratie, totaal in uren werk (als er een uurloon is).
  2. Uitgaven per week (staafdiagram).
  3. Verdeling per categorie, vast tegenover variabel, nodig/wil/impuls (horizontale staven met bedrag en percentage).
  4. Waard-scores: gemiddelde eerste score en gemiddelde terugkijkscore; een lijst "Minder waard dan gedacht" (`worthLater` < `worth`) en "Laagst gescoord" (top 5).
  5. (Stemming: geschrapt.)
  6. Reflectievragen als vaste tekst om samen te bespreken: "Welke uitgave zou je niet opnieuw doen?", "Waar verraste het totaal je?", "Wat wil je volgende maand anders doen?", "Heeft het bijhouden je gedrag veranderd?".
- Pure berekeningen die er nog niet zijn gaan naar `calc.js`, met unit-tests.
- `tests/e2e/reflectie.spec.js`: seed `localStorage` met een vaste dataset (fixture `tests/e2e/fixtures/maand.json`, ~40 entries over 4 weken, alle velden gevarieerd) -> controleer de kerncijfers tegen vooraf berekende waarden en dat er SVG-staven zijn.
- Commit.

**Klaar als:**
- [ ] `npm run e2e` en `npm test` slagen
- [ ] screenshots `reflectie.png` (licht) en `reflectie-donker.png` (`colorScheme: 'dark'`) gecommit
- [ ] commit op `main`

## Fase 8: Backup, opslagvangnet en PWA

**Doel:** data raakt niet kwijt, en de app gedraagt zich op het iPhone-beginscherm als een echte app.
**Hangt af van:** fase 7 (complete app)

- In Instellingen een blok **Gegevens**: "Back-up maken" (JSON, `geldboek-<datum>.json`, via het deelmenu volgens U24), "Exporteer CSV" (`geldboek-<datum>.csv`, scheidingsteken `;`, decimale komma, UTF-8 met BOM zodat Excel NL het goed opent, kolommen voor alle velden, ook via het deelmenu), "Back-up terugzetten" (valideert `version`, vraagt bevestiging, vervangt alles). Een geslaagde export zet `lastExportAt`.
- Back-upherinnering volgens U18, als kleine balk bovenaan Invoer met een knop "Nu back-up maken".
- Opslagvangnet volgens U23 in `store.js` (de IndexedDB-spiegel als aparte laag, zodat de unit-tests met de nep-opslag blijven werken) en `storage.persist()` in `app.js`.
- `app/manifest.webmanifest` (naam en `short_name` Geldboek, `display: standalone`, `start_url: "./index.html"`, `scope: "./"`, kleuren), iconen `app/icons/icon-192.png`, `icon-512.png` en `apple-touch-icon.png` (180×180, zonder transparantie, want iOS maakt die zwart), gerenderd uit één SVG door een script `tests/tools/icons.js` dat Playwright gebruikt.
- `app/sw.js` volgens U26: cache-first voor alle bestanden in `app/`, `VERSION` in de cachenaam, oude caches opruimen bij `activate`, en het bericht "Nieuwe versie" in de app. Registratie alleen op http(s) (U3).
- `tests/e2e/backup.spec.js` (met `navigator.share` weggestubd, zodat de download-route getest wordt, plus een test dat `share` met een bestand wordt aangeroepen als het bestaat): met fixture -> back-up -> nieuwe context -> terugzetten -> zelfde aantal entries en saldo. CSV heeft een kopregel en evenveel regels als entries. `localStorage` leegmaken en herladen -> data hersteld uit IndexedDB. Via de server op poort 8765: service worker registreert en de pagina laadt daarna offline (`context.setOffline(true)`).
- Commit.

**Klaar als:**
- [ ] `npm run e2e` (beide projecten) en `npm test` slagen
- [ ] vanaf `file://` werken de bestaande tests nog (geen fout in de console door de service worker)
- [ ] `app/icons/apple-touch-icon.png` is 180×180 en ondoorzichtig; `index.html` verwijst ernaar en naar het manifest
- [ ] commit op `main`

## Fase 9: End-to-end-test, publicatieworkflow en handleidingen

**Doel:** de hele maand-flow is in één test bewezen en de vriend en Thijs weten hoe ze het gebruiken.
**Hangt af van:** fase 8

- `tests/e2e/maand.spec.js`: onboarding -> 5 uitgaven met verschillende velden -> 1 inkomst werk -> 1 voorgeschoten + terugbetaald -> klok 8 dagen vooruit (`page.clock`) -> terugkijken -> reflectie toont de juiste totalen -> export JSON. Op 390×844.
- Doorloop alle schermen op 390×844 en 360×740: geen horizontale scroll (`document.documentElement.scrollWidth <= innerWidth`), geen console-fouten. Los op wat stuk is.
- `.github/workflows/pages.yml`: GitHub Actions die bij een push naar `main` de map `app/` publiceert op GitHub Pages (`actions/configure-pages`, `actions/upload-pages-artifact` met `path: app`, `actions/deploy-pages`). Niet pushen (Harde regels).
- `README.md` in de root, in twee delen:
  - **Voor je vriend (iPhone), kort en met stappen:** open de link **in Safari** > tik op de Deel-knop > "Zet op beginscherm" > Voeg toe; open Geldboek voortaan alleen via het icoon (niet via Safari, anders zie je je gegevens niet); het huiswerk in een paar zinnen; elke week op "Back-up maken" tikken en naar Thijs sturen of in Bestanden bewaren; het icoon nooit verwijderen zonder eerst een back-up. Tip: zet een dagelijkse herinnering in de iOS-app Herinneringen ("Geldboek bijwerken", 's avonds).
  - **Voor Thijs:** lokaal openen (`app/index.html` of `node tests/tools/serve.js`), tests draaien, en publiceren: repo aanmaken op GitHub, pushen, Settings > Pages > Source "GitHub Actions"; de link wordt `https://<gebruiker>.github.io/<repo>/`. Kies de repo-naam meteen goed: de URL mag na installatie niet meer veranderen (U27). Testen op je eigen telefoon via je wifi: `node tests/tools/serve.js` en `http://<pc-ip>:8765` (beginscherm-installatie en de service worker werken alleen via https, dus test dat via de Pages-link). Hoe je de back-up samen bekijkt: de JSON terugzetten in je eigen browser (via "Toch in de browser gebruiken"), of de CSV in Excel.
- Commit.

**Klaar als:**
- [ ] `npm run e2e` en `npm test` slagen, inclusief `maand.spec.js`
- [ ] de check op horizontale scroll slaagt voor alle tabbladen op beide formaten
- [ ] `README.md` bestaat met beide delen; `.github/workflows/pages.yml` bestaat en publiceert `app/`
- [ ] `maand.spec.js` slaagt in het project `iphone`
- [ ] commit op `main`, `git status` schoon

## Risico's

| Risico | Maatregel |
| --- | --- |
| iOS wist sitedata van Safari na 7 dagen zonder gebruik | Installatiescherm dwingt het beginscherm af; die opslag valt niet onder de regel (U22, fase 4) |
| Vriend gebruikt soms Safari en soms het icoon: twee losse datasets | Installatiescherm in Safari; README: alleen via het icoon (U22, fase 9) |
| Data kwijt door verwijderd icoon, nieuwe telefoon of gewiste opslag | `storage.persist()`, IndexedDB-vangnet, wekelijkse back-up via het deelmenu naar Thijs (U23, U24, fase 8) |
| Andere URL na installatie = lege app | Repo-naam en URL vooraf vastleggen, waarschuwing in README (U27) |
| Vriend haakt af omdat invoer te lang duurt | Bedragveld groot bovenaan, snelle chips, alles chips i.p.v. dropdowns, verplichte velden passen zonder scrollen, geen inzoomen (U5, U7, U25, fase 2) |
| Oude versie blijft hangen op de iPhone door de cache | Versienummer in de service worker + balk "Nieuwe versie" (U26, fase 8) |
| Iets werkt in Chromium maar niet in iOS Safari | WebKit-project met iPhone-profiel is het hoofdproject in elke fase (Achtergrond, Harde regels) |
| Afrondingsfouten in saldo | Integer centen overal (U4), unit-tests op saldo en terugbetaling (fase 1) |
| Playwright kan geen browser vinden | Eerst `channel: 'msedge'`, anders `npx playwright install chromium` (Achtergrond) |

## Door Thijs, buiten de run

- **Vooraf:** bypass-permissions aan bij `/run-plan`. Internet voor `npm i -D @playwright/test` en de WebKit-download (`npx playwright install webkit`).
- **Na afloop:**
  - Een GitHub-repo aanmaken (de naam bepaalt de URL, die daarna niet meer mag veranderen), pushen, en Pages aanzetten met als bron "GitHub Actions".
  - De Pages-link eerst zelf proberen op een iPhone (of met je vriend erbij): installeren op het beginscherm, een uitgave invoeren, de app sluiten en weer openen, een back-up maken.
  - De link en het deel "Voor je vriend" uit de README naar je vriend sturen.
  - Na een maand samen de back-up bekijken en de reflectiepagina doorlopen.
