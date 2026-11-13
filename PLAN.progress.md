# Voortgang PLAN.md (Geldboek)

Fases:
1. Fundament: datamodel, opslag, rekenlogica
2. Invoerscherm uitgave + testopstelling browser
3. Overzicht: lijst, saldo, bewerken/verwijderen
4. Installatiescherm, instellingen, startsaldo, inkomsten
5. Voorgeschoten en terugbetaald
6. Terugkijken na een week + uren-werk
7. Reflectiepagina
8. Backup, opslagvangnet en PWA
9. End-to-end-test, publicatieworkflow en handleidingen

Conventie: per afgeronde fase één regel onderaan:
`Fase N: DONE — ...` of `Fase N: FAILED — ...`

Fase 1: DONE — store.js + calc.js (IIFE, window.Geldboek/module.exports, integer centen), 35 unit-tests groen via npm test (script gebruikt glob tests/unit/*.test.js omdat Node 22 geen map accepteert), commit b7fd5a6 op main
Fase 2: DONE — invoerscherm (index.html, style.css, app.js met register()-routing, ui-invoer.js met herbruikbaar formulier + snelle chips), serve.js, Playwright iphone(WebKit)+chromium(Edge) via file://; 18 e2e groen (+2 project-skips), 35 unit groen, screenshot invoer.png, commit a83ccf0 op main
Fase 3: DONE — ui-overzicht.js (saldo, week/maand-totalen, lijst per dag met dagtotaal, bewerkmodus via invoerForm.create met idPrefix 'edit-', verwijderen met app.confirm); 29 e2e groen (+3 project-skips, iphone+chromium), 35 unit groen, screenshot overzicht.png, commit 6deab5d op main
Fase 4: DONE — installatiescherm (U22, sessionStorage-keuze), eerste-keer-scherm (startsaldo 0/negatief via ±, uurloon, startDate vandaag), ui-instellingen.js (blokken saldo + categorieën, uitbreidbaar via Geldboek.instellingen.blocks), Uitgave|Inkomst-schakelaar + inkomstformulier (i-/edit-), openApp seedt onboarded settings; 58 e2e groen (+6 project-skips, iphone+chromium), 43 unit groen, screenshots installatie/onboarding/inkomst, commit a2911f7 op main
Fase 5: DONE — veld Voorgeschoten voor (datalist), kaart Openstaand met Terugbetaald (U12), labels open/terug, ongedaan maken + verwijderen-met-koppeling in bewerkmodus; store.markRepaid/undoRepaid/linkedIncome, calc.openAdvances/advanceNames; 73 e2e groen (+7 project-skips, iphone+chromium), 51 unit groen, screenshot openstaand.png, commit 665fe0a op main
Fase 6: DONE — ui-terugkijken.js (één kaart tegelijk uit calc.reviewQueue, score 1-5 / Overslaan), badge #review-badge via nieuwe store.onChange, calc.hoursLabel ("≈ 3,0 uur werk") in Overzicht-label .tag-hours, opslaan-melding en Terugkijken; 90 e2e groen (+8 project-skips, iphone+chromium), 55 unit groen, screenshot terugkijken.png, commit 36d0c5c op main
Fase 7: DONE — ui-reflectie.js (periode hele periode/deze week/vorige week, kerncijfers, SVG-weekstaven, horizontale SVG-staven per categorie/vast-variabel/nodig-wil-impuls/stemming, waard-scores + lijsten, reflectievragen), calc.reflection e.a. (verdelingen = eigen uitgaven), fixture tests/e2e/fixtures/maand.json (40 entries) met page.clock.setFixedTime; 106 e2e groen (+10 project-skips, iphone+chromium), 64 unit groen, screenshots reflectie.png + reflectie-donker.png, commit efe387e op main
Fase 8: DONE — Instellingen > Gegevens (#backup-json/#backup-csv/#backup-restore+#backup-file; share met bestand anders <a download>; lastExportAt), back-upherinnering #backup-reminder op Invoer (7 dagen vanaf oudste createdAt, wegklikken per dag), IndexedDB-spiegel + herstel (store.createIdbMirror/attachMirror), storage.persist, manifest (href alleen via http(s)), iconen uit icon.svg (RGB, 180x180 ondoorzichtig), sw.js VERSION v1 cache-first + update-balk #update-bar; 135 e2e groen (+11 project-skips, iphone+chromium, SW-offline ook in WebKit), 87 unit groen, screenshots herinnering.png + gegevens.png, commit 933bdd2 op main
Fase 9: DONE — maand.spec.js (onboarding->5 uitgaven->werk-inkomst->voorgeschoten+terug->+8 dagen->terugkijken->reflectie-totalen->export JSON) slaagt in iphone+chromium; schermen.spec.js: alle schermen 390x844+360x740 zonder horizontale scroll/console-fouten; back-upherinnering compact (Vast of variabel past boven Opslaan); screenshots met vaste klok; sw v2; pages.yml + README.md; 145 e2e groen (+11 skips), 87 unit groen, commit 1285aa6 op main
