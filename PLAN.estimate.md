# Tijdschatting: PLAN.md

Geschat met estimate-plan op 2026-11-13 14:48, model claude-opus-5-5 (gekalibreerd op claude-opus-5; voor opus-5-5 nog geen meetdata).
Basis: 760 aanroepen, 1011k output-tokens, 87 tok/s, 2.0 s overhead per aanroep.

| Fase | Claude (min) | Bandbreedte | Mens (min) | Echt (min) |
|---|---:|---|---:|---:|
| 1. Fundament: datamodel, opslag, rekenlogica | 15 | 12-24 | 0 | 4 |
| 2. Invoerscherm uitgave + testopstelling browser | 36 | 29-53 | 0 | 5 |
| 3. Overzicht: lijst, saldo, bewerken/verwijderen | 25 | 20-37 | 0 | 4 |
| 4. Installatiescherm, instellingen, startsaldo, inkomsten | 43 | 34-64 | 0 | 9 |
| 5. Voorgeschoten en terugbetaald | 29 | 23-43 | 0 | 5 |
| 6. Terugkijken na een week + uren-werk | 28 | 22-41 | 0 | 4 |
| 7. Reflectiepagina | 38 | 33-55 | 0 | 9 |
| 8. Backup, opslagvangnet en PWA | 50 | 41-73 | 0 | 11 |
| 9. End-to-end-test, publicatieworkflow en handleidingen | 38 | 32-54 | 0 | |
| **Totaal** | 302 | 246-444 | 0 | |
