# Geldboek

Een kleine app voor de iPhone om een maand lang elke uitgave en inkomst bij te houden, met waarom.
Alles blijft op de telefoon; er is geen account en geen server.

---

## Voor je vriend (iPhone)

### Installeren (één keer)

1. Open de link die je van Thijs kreeg **in Safari** (niet in een andere app of browser).
2. Tik onderaan op de **Deel-knop** (het vierkantje met het pijltje omhoog).
3. Scrol een stukje omlaag en tik op **"Zet op beginscherm"**.
4. Tik rechtsboven op **Voeg toe**. Nu staat Geldboek als icoon op je beginscherm.
5. Open Geldboek **voortaan alleen via dat icoon**, nooit meer via Safari. Anders zie je je gegevens niet.

### Je huiswerk

Leg een maand lang **elke uitgave** vast, meteen of dezelfde dag: hoeveel, wat, en waarom je het kocht.
Kreeg je geld (loon, iets terugbetaald)? Zet het erbij onder **Inkomst**.
Na een week vraagt Geldboek bij **Terugkijken** of iets het geld nog waard was: geef dan eerlijk een cijfer.
Na de maand kijken we samen naar de **Reflectie**.
Velden met een **\*** zijn verplicht; wat onder **Optioneel** staat mag je overslaan, maar het helpt bij het terugkijken.

### Spaardoel

Bovenaan in **Overzicht** zie je je **spaardoel**: elke maand moet je saldo minstens € 200 hoger eindigen dan de maand ervoor.
Een "spaarmaand" loopt van je **betaaldag** (de dag waarop je salaris binnenkomt, standaard de 25e) tot de dag ervoor in de volgende maand.
Je ziet hoe ver je deze maand bent, hoeveel dagen er nog over zijn, en of je vorige maanden het doel haalde.
Het bedrag en de betaaldag pas je aan bij het **tandwiel** (Instellingen). Doel op 0 = geen spaardoel.

### Elke week: back-up maken

1. Tik rechtsboven op het **tandwiel** (Instellingen) en ga naar **Gegevens**.
2. Tik op **Back-up maken**.
3. Stuur het bestand naar Thijs, of kies **Bewaar in Bestanden**.

**Verwijder het icoon nooit zonder eerst een back-up te maken.** Met het icoon verdwijnen ook al je gegevens.

### Tip

Zet een dagelijkse herinnering in de iOS-app **Herinneringen**, bijvoorbeeld "Geldboek bijwerken", 's avonds.

---

## Voor Thijs

### Lokaal openen

- Dubbelklik op `app/index.html` (werkt vanaf `file://`, zonder service worker en zonder installeren), of
- start de lokale server: `node tests/tools/serve.js` en open http://localhost:8765

### Tests draaien

```sh
npm install
npx playwright install webkit   # eenmalig; het project iphone draait in WebKit
npm test                        # unit-tests (node --test)
npm run e2e                     # browsertests (Playwright: iphone/WebKit en chromium/Edge)
```

### Publiceren op GitHub Pages

**De definitieve link is https://thijsbaudewijns.github.io/geldboek/** (publieke repo `geldboek`).
Stuur je vriend precies deze link; hij mag na de installatie nooit meer veranderen.

1. Maak een repo aan op GitHub. **Kies de naam meteen goed:** de link wordt
   `https://<gebruiker>.github.io/<repo>/` en die mag na de installatie op de iPhone **nooit meer veranderen**
   (U27). De gegevens horen bij het adres; een ander adres betekent een lege app.
2. Voeg de repo toe als remote en push `main`.
3. Ga in de repo naar **Settings > Pages** en kies bij **Source** voor **"GitHub Actions"**.
   De workflow `.github/workflows/pages.yml` publiceert dan bij elke push naar `main` de map `app/`.
4. Probeer de link eerst zelf op een iPhone: installeren op het beginscherm, een uitgave invoeren,
   de app sluiten en weer openen, een back-up maken. Stuur daarna de link en het deel
   "Voor je vriend" hierboven door.

### Testen op je eigen telefoon via wifi

- Start `node tests/tools/serve.js` en open op je telefoon `http://<pc-ip>:8765` (zelfde wifi).
- Installeren op het beginscherm en de service worker (offline) werken alleen via **https**;
  test dat via de Pages-link.

### Bij elke wijziging in `app/`

- Hoog `VERSION` op in `app/sw.js` (`'v2'` -> `'v3'` ...). Anders blijft de oude versie in de cache
  op de iPhone hangen; met een nieuwe versie verschijnt in de app de balk "Nieuwe versie, tik om te verversen".
- Nieuw bestand in `app/`? Zet het ook in `FILES` in `app/sw.js` (een unit-test controleert dit).

### Samen de back-up bekijken

- **In je eigen browser:** open de app (Pages-link of lokaal), kies op het installatiescherm
  **"Toch in de browser gebruiken"**, doorloop het eerste-keer-scherm en ga naar
  Instellingen > Gegevens > **Back-up terugzetten** met het ontvangen `.json`-bestand.
  Daarna zie je Overzicht, Terugkijken en Reflectie precies zoals op zijn telefoon.
  (Gebruik hiervoor een browser of profiel waar je zelf geen Geldboek-gegevens hebt: terugzetten vervangt alles.)
- **In Excel:** open de CSV (Instellingen > Gegevens > **Exporteer CSV**).
