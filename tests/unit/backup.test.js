'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../../app/js/backup.js');
const S = require('../../app/js/store.js');
const fixture = require('../e2e/fixtures/maand.json');

const NOW = new Date(2026, 10, 13, 9, 5);

test('module: patroon zonder DOM, hangt ook aan globalThis.Geldboek', () => {
  assert.equal(globalThis.Geldboek.backup, B);
});

test('bestandsnamen: geldboek-<lokale datum>.json / .csv', () => {
  assert.equal(B.jsonFileName(NOW), 'geldboek-2026-11-13.json');
  assert.equal(B.csvFileName(new Date(2026, 0, 2, 23, 59)), 'geldboek-2026-01-02.csv');
});

test('toJSON: volledige data, opnieuw in te lezen, lastExportAt = moment van export', () => {
  const json = B.toJSON(fixture, NOW);
  const back = JSON.parse(json);
  assert.equal(back.version, 1);
  assert.equal(back.entries.length, 40);
  assert.deepEqual(back.entries, fixture.entries);
  assert.equal(back.settings.lastExportAt, NOW.toISOString());
  assert.equal(fixture.settings.lastExportAt, null, 'origineel ongewijzigd');
  const parsed = B.parseBackup(json);
  assert.equal(parsed.ok, true);
  const store = S.createStore(null);
  store.replaceAll(parsed.data);
  assert.equal(store.listEntries().length, 40);
});

test('centsToDecimal: decimale komma, geen duizendtallen', () => {
  assert.equal(B.centsToDecimal(1250), '12,50');
  assert.equal(B.centsToDecimal(5), '0,05');
  assert.equal(B.centsToDecimal(-123456), '-1234,56');
  assert.equal(B.centsToDecimal(0), '0,00');
  assert.equal(B.centsToDecimal(null), '');
});

test('toCSV: BOM, kopregel, ; als scheidingsteken, één regel per entry, CRLF', () => {
  const csv = B.toCSV(fixture);
  assert.equal(csv.charAt(0), '﻿');
  const lines = csv.slice(1).split('\r\n').filter((l) => l !== '');
  assert.equal(lines.length, 41);
  assert.equal(lines[0], B.COLUMNS.join(';'));
  ['id', 'type', 'amountCents', 'datetime', 'what', 'note', 'createdAt', 'fixed', 'category', 'need', 'worth',
    'worthLater', 'worthLaterAt', 'worthLaterSkipped', 'advanceFor', 'repaidAt', 'source', 'hours', 'linkedExpenseId']
    .forEach((f) => assert.ok(B.COLUMNS.includes(f), 'kolom ' + f));
  const first = lines[1].split(';');
  assert.equal(first[B.COLUMNS.indexOf('datum')], '2026-10-05');
  assert.equal(first[B.COLUMNS.indexOf('tijd')], '08:15');
  assert.equal(first[B.COLUMNS.indexOf('bedrag')], '-4,50');
  assert.equal(first[B.COLUMNS.indexOf('soort')], 'uitgave');
});

test('toCSV: tekst met ; " en enter wordt geciteerd; formules onschadelijk; uren met komma', () => {
  const csv = B.toCSV({ entries: [
    { id: 'a', type: 'expense', amountCents: 100, datetime: '2026-11-01T10:00', what: 'Koffie; groot', note: 'zei "ja"\nklaar', worthLaterSkipped: true },
    { id: 'b', type: 'income', amountCents: 9750, datetime: '2026-11-02T10:00', what: '=SUM(A1)', note: '', source: 'werk', hours: 6.5 }
  ] });
  const body = csv.slice(1);
  assert.ok(body.includes('"Koffie; groot"'));
  assert.ok(body.includes('"zei ""ja""\nklaar"'));
  assert.ok(body.includes(";'=SUM(A1);"));
  assert.ok(body.includes(';97,50;'));
  assert.ok(body.includes(';6,5;'));
  assert.ok(body.includes(';ja;'));
});

test('toCSV: lege data -> alleen kopregel', () => {
  const head = B.BOM + B.COLUMNS.join(';') + '\r\n';
  assert.equal(B.toCSV({ entries: [] }), head);
  assert.equal(B.toCSV(null), head);
});

test('parseBackup: weigert leeg, geen JSON, geen geldboek, onbekende of nieuwere versie', () => {
  assert.equal(B.parseBackup('').ok, false);
  assert.equal(B.parseBackup('niet json').ok, false);
  assert.equal(B.parseBackup('[1,2]').ok, false);
  assert.equal(B.parseBackup(JSON.stringify({ entries: [], settings: {} })).ok, false, 'version ontbreekt');
  assert.equal(B.parseBackup(JSON.stringify({ version: '1', entries: [], settings: {} })).ok, false);
  const newer = B.parseBackup(JSON.stringify({ version: 2, entries: [], settings: {} }));
  assert.equal(newer.ok, false);
  assert.match(newer.error, /nieuwere versie/);
  assert.equal(B.parseBackup(JSON.stringify({ version: 1, entries: {}, settings: {} })).ok, false);
  assert.equal(B.parseBackup(B.BOM + JSON.stringify({ version: 1, entries: [], settings: {} })).ok, true, 'BOM mag');
});

test('reminderDue: na 7 dagen sinds eerste gebruik (oudste createdAt), zonder export', () => {
  const s = { lastExportAt: null };
  const e = [{ createdAt: new Date(2026, 10, 6, 9, 0).toISOString() }, { createdAt: new Date(2026, 10, 10).toISOString() }];
  assert.equal(B.reminderDue(s, e, new Date(2026, 10, 13, 8, 59)), false, 'net geen 7 dagen');
  assert.equal(B.reminderDue(s, e, new Date(2026, 10, 13, 9, 0)), true, 'precies 7 dagen');
  assert.equal(B.reminderDue(s, [], NOW), false, 'geen entries -> geen herinnering');
  assert.equal(B.daysSinceExport(s, e, new Date(2026, 10, 20, 10, 0)), 14);
});

test('reminderDue: telt vanaf lastExportAt; weggeklikt geldt alleen voor die dag', () => {
  const e = [{ createdAt: new Date(2026, 9, 1).toISOString() }];
  assert.equal(B.reminderDue({ lastExportAt: new Date(2026, 10, 10).toISOString() }, e, NOW), false);
  assert.equal(B.reminderDue({ lastExportAt: new Date(2026, 10, 5).toISOString() }, e, NOW), true);
  assert.equal(B.reminderDue({ lastExportAt: null, backupReminderDismissedOn: '2026-11-13' }, e, NOW), false);
  assert.equal(B.reminderDue({ lastExportAt: null, backupReminderDismissedOn: '2026-11-12' }, e, NOW), true);
});
