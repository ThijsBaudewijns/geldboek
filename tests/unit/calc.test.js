'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const calc = require('../../app/js/calc.js');

function exp(amountCents, datetime, extra) {
  return Object.assign({ id: 'x' + Math.random(), type: 'expense', amountCents, datetime, what: 'Iets', note: 'omdat het moest', fixed: 'variabel', category: null, need: null, worth: null, mood: null, worthLater: null, worthLaterAt: null, worthLaterSkipped: false, advanceFor: null, repaidAt: null }, extra || {});
}
function inc(amountCents, datetime, extra) {
  return Object.assign({ id: 'y' + Math.random(), type: 'income', amountCents, datetime, what: '', note: '', source: 'overig', hours: null, linkedExpenseId: null }, extra || {});
}

// ---------- parseAmount ----------
test('parseAmount: komma-invoer', () => {
  assert.equal(calc.parseAmount('12,50'), 1250);
  assert.equal(calc.parseAmount('12,5'), 1250);
  assert.equal(calc.parseAmount('0,99'), 99);
  assert.equal(calc.parseAmount(',5'), 50);
});

test('parseAmount: punt-invoer', () => {
  assert.equal(calc.parseAmount('12.5'), 1250);
  assert.equal(calc.parseAmount('12.50'), 1250);
  assert.equal(calc.parseAmount('12'), 1200);
  assert.equal(calc.parseAmount('  7 '), 700);
});

test('parseAmount: euroteken, duizendtallen en geen float-afrondingsfouten', () => {
  assert.equal(calc.parseAmount('€ 12,50'), 1250);
  assert.equal(calc.parseAmount('1.250,00'), 125000);
  assert.equal(calc.parseAmount('1,250.00'), 125000);
  assert.equal(calc.parseAmount('1.250'), 125000);
  assert.equal(calc.parseAmount('0,29'), 29);
  assert.equal(calc.parseAmount('1,15'), 115);
});

test('parseAmount: negatief, leeg, nul en onzin geweigerd', () => {
  for (const bad of ['-5', '-12,50', '', '   ', '0', '0,00', 'abc', '12,345', '1,2,3', '12a', null, undefined, -3, 0, '1.2.3']) {
    assert.equal(calc.parseAmount(bad), null, 'verwacht null voor ' + JSON.stringify(bad));
  }
});

// ---------- formatEuro ----------
test('formatEuro: exact "€ 12,50" met gewone spatie', () => {
  assert.equal(calc.formatEuro(1250), '€ 12,50');
  assert.equal(calc.formatEuro(1250).charCodeAt(1), 32);
  assert.equal(calc.formatEuro(5), '€ 0,05');
});

test('formatEuro: duizendtallen, nul en negatief', () => {
  assert.equal(calc.formatEuro(125000), '€ 1.250,00');
  assert.equal(calc.formatEuro(0), '€ 0,00');
  assert.equal(calc.formatEuro(-1250), '€ -12,50');
  assert.equal(calc.formatEuro(undefined), '€ 0,00');
  assert.ok(!/[  ]/.test(calc.formatEuro(-123456)));
});

// ---------- balance ----------
test('balance: startsaldo + inkomsten - uitgaven', () => {
  const settings = { startBalanceCents: 10000, startDate: '2026-11-01' };
  const entries = [exp(2000, '2026-11-02T10:00'), inc(6000, '2026-11-03T09:00'), exp(1550, '2026-11-04T12:00')];
  assert.equal(calc.balance(settings, entries), 10000 + 6000 - 2000 - 1550);
});

test('balance: entries vóór de startdatum tellen niet mee; startdatum zelf wel', () => {
  const settings = { startBalanceCents: 0, startDate: '2026-11-10' };
  const entries = [exp(500, '2026-11-09T23:59'), exp(300, '2026-11-10T00:00')];
  assert.equal(calc.balance(settings, entries), -300);
  assert.equal(calc.balance({}, []), 0);
  assert.equal(calc.balance({ startBalanceCents: -2500 }, []), -2500);
});

test('balance + totals: voorgeschoten 20, terugbetaald 20 -> saldo als vóór de uitgave, eigen uitgaven 0', () => {
  const settings = { startBalanceCents: 10000, startDate: '2026-11-01' };
  const before = calc.balance(settings, []);
  const advance = exp(2000, '2026-11-05T12:00', { advanceFor: 'Sam', repaidAt: '2026-11-06T10:00:00.000Z' });
  const repay = inc(2000, '2026-11-06T11:00', { source: 'terugbetaling', linkedExpenseId: advance.id });
  assert.equal(calc.balance(settings, [advance]), before - 2000);
  assert.equal(calc.balance(settings, [advance, repay]), before);
  const t = calc.totals([advance, repay], {});
  assert.equal(t.ownExpenseCents, 0);
  assert.equal(t.expenseCents, 2000);
  assert.equal(t.advancedCents, 2000);
  assert.equal(t.repaymentCents, 2000);
  assert.equal(t.netCents, 0);
});

// ---------- totals ----------
test('totals: binnen periode, grenzen inclusief hele dag', () => {
  const entries = [
    exp(100, '2026-11-01T00:00'), exp(200, '2026-11-07T23:59'), exp(400, '2026-11-08T00:00'),
    inc(1000, '2026-11-03T08:00'), exp(800, '2026-10-31T23:59')
  ];
  const t = calc.totals(entries, { from: '2026-11-01', to: '2026-11-07' });
  assert.equal(t.expenseCents, 300);
  assert.equal(t.incomeCents, 1000);
  assert.equal(t.ownExpenseCents, 300);
  assert.equal(t.count, 3);
});

test('totals: lege lijst en zonder periode', () => {
  assert.deepEqual(calc.totals([], {}), { expenseCents: 0, incomeCents: 0, ownExpenseCents: 0, advancedCents: 0, repaymentCents: 0, netCents: 0, count: 0 });
  assert.equal(calc.totals([exp(5, '2020-01-01T00:00')]).expenseCents, 5);
});

// ---------- groupBy ----------
test('groupBy: som per categorie, grootste eerst, inkomsten genegeerd', () => {
  const entries = [
    exp(500, '2026-11-01T10:00', { category: 'Boodschappen' }),
    exp(1500, '2026-11-02T10:00', { category: 'Uitgaan' }),
    exp(700, '2026-11-03T10:00', { category: 'Boodschappen' }),
    inc(9999, '2026-11-03T10:00')
  ];
  assert.deepEqual(calc.groupBy(entries, 'category'), [
    { key: 'Uitgaan', totalCents: 1500, count: 1 },
    { key: 'Boodschappen', totalCents: 1200, count: 2 }
  ]);
});

test('groupBy: ontbrekende waarde wordt key null; need/fixed/mood werken; ownOnly', () => {
  const entries = [
    exp(100, '2026-11-01T10:00', { need: 'wil', fixed: 'vast' }),
    exp(300, '2026-11-01T11:00', { need: null }),
    exp(50, '2026-11-01T12:00', { need: 'wil', advanceFor: 'Sam' })
  ];
  assert.deepEqual(calc.groupBy(entries, 'need'), [
    { key: null, totalCents: 300, count: 1 },
    { key: 'wil', totalCents: 150, count: 2 }
  ]);
  assert.deepEqual(calc.groupBy(entries, 'need', { ownOnly: true }).find(g => g.key === 'wil'), { key: 'wil', totalCents: 100, count: 1 });
  assert.deepEqual(calc.groupBy(entries, 'fixed').map(g => g.key), ['variabel', 'vast']);
  assert.deepEqual(calc.groupBy([], 'mood'), []);
});

// ---------- byWeek ----------
test('byWeek: weken beginnen op maandag', () => {
  // 2026-11-09 is een maandag, 2026-11-15 een zondag
  const entries = [
    exp(100, '2026-11-09T00:00'), exp(200, '2026-11-15T23:59'),
    exp(400, '2026-11-16T08:00'), inc(1000, '2026-11-12T10:00'),
    exp(50, '2026-11-10T10:00', { advanceFor: 'Sam' })
  ];
  const w = calc.byWeek(entries);
  assert.equal(w.length, 2);
  assert.deepEqual(w[0], { weekStart: '2026-11-09', expenseCents: 350, ownExpenseCents: 300, incomeCents: 1000, count: 4 });
  assert.deepEqual(w[1], { weekStart: '2026-11-16', expenseCents: 400, ownExpenseCents: 400, incomeCents: 0, count: 1 });
});

test('byWeek: lege lijst, jaargrens en ongeldige datum', () => {
  assert.deepEqual(calc.byWeek([]), []);
  // 2027-01-01 is een vrijdag -> week begint maandag 2026-12-28
  const w = calc.byWeek([exp(100, '2027-01-01T12:00'), exp(1, 'kapot')]);
  assert.deepEqual(w.map(x => x.weekStart), ['2026-12-28']);
});

// ---------- hoursOfWork ----------
test('hoursOfWork: bedrag / uurloon op één decimaal', () => {
  assert.equal(calc.hoursOfWork(4500, 1500), 3);
  assert.equal(calc.hoursOfWork(1000, 1500), 0.7);
  assert.equal(calc.hoursOfWork(1250, 1000), 1.3);
  assert.equal(calc.formatHours(calc.hoursOfWork(4500, 1500)), '3,0');
});

test('hoursOfWork: zonder (geldig) uurloon -> null', () => {
  assert.equal(calc.hoursOfWork(4500, null), null);
  assert.equal(calc.hoursOfWork(4500, 0), null);
  assert.equal(calc.hoursOfWork(4500, undefined), null);
  assert.equal(calc.hoursOfWork(4500, -100), null);
});

// ---------- reviewQueue ----------
test('reviewQueue: precies op de 7-dagengrens', () => {
  const now = new Date(2026, 10, 20, 14, 30); // 20 nov 2026 14:30 lokaal
  const exactly7 = exp(100, '2026-11-13T14:30', { id: 'exact' });
  const justUnder = exp(100, '2026-11-13T14:31', { id: 'onder' });
  const older = exp(100, '2026-11-10T09:00', { id: 'ouder' });
  const q = calc.reviewQueue([justUnder, exactly7, older], now);
  assert.deepEqual(q.map(e => e.id), ['ouder', 'exact']);
});

test('reviewQueue: filtert beoordeeld, overgeslagen, zonder score/argumentatie en inkomsten', () => {
  const now = new Date(2026, 10, 30, 12, 0);
  const entries = [
    exp(100, '2026-11-01T10:00', { id: 'ok-note' }),
    exp(100, '2026-11-01T10:00', { id: 'ok-worth', note: '', worth: 4 }),
    exp(100, '2026-11-01T10:00', { id: 'leeg', note: '  ', worth: null }),
    exp(100, '2026-11-01T10:00', { id: 'gedaan', worthLater: 3 }),
    exp(100, '2026-11-01T10:00', { id: 'skip', worthLaterSkipped: true }),
    inc(100, '2026-11-01T10:00', { id: 'inkomst', note: 'loon' })
  ];
  assert.deepEqual(calc.reviewQueue(entries, now).map(e => e.id), ['ok-note', 'ok-worth']);
  assert.deepEqual(calc.reviewQueue([], now), []);
});

// ---------- quickPicks ----------
test('quickPicks: top 6 meest gebruikt, gegevens van de laatste keer', () => {
  const now = new Date(2026, 10, 20, 12, 0);
  const entries = [];
  const names = ['Lunch', 'Lunch', 'Lunch', 'Koffie', 'Koffie', 'Bus', 'Bus', 'Pizza', 'Bier', 'Krant', 'Snoep'];
  names.forEach((w, i) => entries.push(exp(100 + i, '2026-11-' + String(10 + (i % 9)).padStart(2, '0') + 'T10:00', { what: w })));
  entries.push(exp(1350, '2026-11-19T12:00', { what: 'lunch ', fixed: 'vast', category: 'Eten & drinken buiten de deur' }));
  const q = calc.quickPicks(entries, now);
  assert.equal(q.length, 6);
  assert.deepEqual(q[0], { what: 'lunch', amountCents: 1350, fixed: 'vast', category: 'Eten & drinken buiten de deur', count: 4 });
  assert.deepEqual(q.slice(1, 3).map(x => x.what).sort(), ['Bus', 'Koffie']);
});

test('quickPicks: alleen uitgaven uit de laatste 30 dagen, niet in de toekomst', () => {
  const now = new Date(2026, 10, 20, 12, 0);
  const entries = [
    exp(100, '2026-10-21T11:00', { what: 'Oud' }), // meer dan 30 dagen
    exp(100, '2026-10-21T12:00', { what: 'Grens' }), // precies 30 dagen
    exp(100, '2026-11-25T12:00', { what: 'Toekomst' }),
    inc(100, '2026-11-19T12:00', { what: 'Salaris' }),
    exp(100, '2026-11-19T12:00', { what: '' })
  ];
  assert.deepEqual(calc.quickPicks(entries, now).map(x => x.what), ['Grens']);
  assert.deepEqual(calc.quickPicks([], now), []);
});

test('parseSignedAmount: 0 en negatief toegestaan (startsaldo)', () => {
  assert.equal(calc.parseSignedAmount('0'), 0);
  assert.equal(calc.parseSignedAmount('0,00'), 0);
  assert.equal(calc.parseSignedAmount('-0'), 0);
  assert.equal(calc.parseSignedAmount('100'), 10000);
  assert.equal(calc.parseSignedAmount('-25,50'), -2550);
  assert.equal(calc.parseSignedAmount('−25,50'), -2550); // echt minteken
  assert.equal(calc.parseSignedAmount('€ -1.250,00'), -125000);
  assert.equal(calc.parseSignedAmount('+3.5'), 350);
  assert.equal(calc.parseSignedAmount(-12.5), -1250);
});

test('parseSignedAmount: leeg en onzin geweigerd', () => {
  for (const v of ['', '   ', '-', 'abc', '12,345', '--3', null, undefined, NaN]) {
    assert.equal(calc.parseSignedAmount(v), null, String(v));
  }
});

test('parseHours: komma en punt, max. 2 decimalen, > 0', () => {
  assert.equal(calc.parseHours('4'), 4);
  assert.equal(calc.parseHours('6,5'), 6.5);
  assert.equal(calc.parseHours('1.25'), 1.25);
  for (const v of ['', '0', '-1', 'abc', '1,234', null]) assert.equal(calc.parseHours(v), null, String(v));
});

test('wageAmount: uren x uurloon in centen; zonder uurloon null', () => {
  assert.equal(calc.wageAmount(4, 1500), 6000);
  assert.equal(calc.wageAmount(1.5, 1333), 2000); // 1999,5 -> afgerond
  assert.equal(calc.wageAmount(4, null), null);
  assert.equal(calc.wageAmount(0, 1500), null);
});

test('openAdvances: alleen open voorgeschoten uitgaven, per persoon (hoofdletterongevoelig), oudste eerst', () => {
  const a = exp(3000, '2026-11-05T12:00', { advanceFor: 'Sam' });
  const b = exp(1250, '2026-11-03T09:00', { advanceFor: 'sam ' });
  const c = exp(800, '2026-11-04T10:00', { advanceFor: 'Anna' });
  const repaid = exp(500, '2026-11-02T10:00', { advanceFor: 'Sam', repaidAt: '2026-11-06T10:00:00.000Z' });
  const own = exp(999, '2026-11-02T10:00');
  const res = calc.openAdvances([a, b, c, repaid, own, inc(100, '2026-11-01T00:00')]);
  assert.deepEqual(res.map((g) => [g.name, g.totalCents, g.items.map((e) => e.id)]), [
    ['Anna', 800, [c.id]],
    ['Sam', 4250, [b.id, a.id]]
  ]);
  assert.deepEqual(calc.openAdvances([]), []);
  assert.deepEqual(calc.openAdvances([own, repaid]), []);
});

test('advanceNames: unieke namen, meest recente eerst', () => {
  const list = [
    exp(100, '2026-11-01T10:00', { advanceFor: 'Sam' }),
    exp(100, '2026-11-05T10:00', { advanceFor: 'Anna' }),
    exp(100, '2026-11-03T10:00', { advanceFor: 'sam' }),
    exp(100, '2026-11-06T10:00')
  ];
  assert.deepEqual(calc.advanceNames(list), ['Anna', 'sam']);
  assert.deepEqual(calc.advanceNames([]), []);
});
