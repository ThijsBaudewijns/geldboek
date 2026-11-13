'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../app/js/store.js');

function fakeStorage(initial) {
  const map = Object.assign({}, initial || {});
  return {
    map,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null),
    setItem: (k, v) => { map[k] = String(v); }
  };
}
const fixedNow = () => new Date(2026, 10, 13, 14, 32);
function expense(extra) {
  return Object.assign({ type: 'expense', amountCents: 1250, datetime: '2026-11-13T14:32', what: 'Lunch', note: 'had honger' }, extra || {});
}

test('module: patroon zonder DOM, hangt ook aan globalThis.Geldboek', () => {
  assert.equal(globalThis.Geldboek.store, S);
  assert.equal(S.STORAGE_KEY, 'geldboek.v1');
  assert.deepEqual(S.DEFAULT_CATEGORIES, ['Boodschappen', 'Eten & drinken buiten de deur', 'Vervoer', 'Uitgaan', 'Kleding', 'Abonnementen', 'Wonen', 'Cadeaus', 'Overig']);
});

test('load: lege opslag -> standaarddata volgens datamodel', () => {
  const store = S.createStore(fakeStorage(), { now: fixedNow });
  const d = store.load();
  assert.deepEqual(d, {
    version: 1,
    settings: { startBalanceCents: 0, startDate: '2026-11-13', hourlyWageCents: null, categories: S.DEFAULT_CATEGORIES, lastExportAt: null, onboarded: false },
    entries: []
  });
});

test('load: kapotte JSON in opslag -> lege standaarddata, geen crash', () => {
  for (const raw of ['{kapot', 'null', '"tekst"', '[]', '42', '{"version":1,"settings":"x","entries":{}}']) {
    const store = S.createStore(fakeStorage({ 'geldboek.v1': raw }), { now: fixedNow });
    const d = store.load();
    assert.equal(d.version, 1, raw);
    assert.deepEqual(d.entries, [], raw);
    assert.equal(d.settings.startDate, '2026-11-13', raw);
  }
});

test('load: getItem die gooit -> standaarddata, lastError gezet', () => {
  const storage = { getItem() { throw new Error('geen toegang'); }, setItem() {} };
  const store = S.createStore(storage, { now: fixedNow });
  assert.deepEqual(store.listEntries(), []);
  assert.ok(store.lastError);
});

test('load: ontbrekende velden aangevuld, onbekende velden behouden', () => {
  const raw = JSON.stringify({
    version: 1,
    settings: { startBalanceCents: 5000, extraVeld: 'blijft' },
    entries: [
      { id: 'e_1_a', type: 'expense', amountCents: 300, datetime: '2026-11-13T10:00', what: 'Koffie' },
      { id: 'e_2_b', type: 'income', amountCents: 1000, datetime: '2026-11-13T11:00' },
      'geen object'
    ]
  });
  const store = S.createStore(fakeStorage({ 'geldboek.v1': raw }), { now: fixedNow });
  const s = store.getSettings();
  assert.equal(s.startBalanceCents, 5000);
  assert.equal(s.extraVeld, 'blijft');
  assert.deepEqual(s.categories, S.DEFAULT_CATEGORIES);
  assert.equal(s.onboarded, false);
  const [inc, exp] = store.listEntries();
  assert.equal(exp.fixed, 'variabel');
  assert.equal(exp.note, '');
  assert.equal(exp.worthLaterSkipped, false);
  assert.equal(exp.advanceFor, null);
  assert.equal(exp.worthLater, null);
  assert.equal(inc.source, 'overig');
  assert.equal(inc.hours, null);
  assert.equal(inc.linkedExpenseId, null);
  assert.equal(store.listEntries().length, 2);
});

test('addEntry: id volgens e_<timestamp>_<random>, schrijft direct weg', () => {
  const storage = fakeStorage();
  const store = S.createStore(storage, { now: fixedNow });
  const e = store.addEntry(expense());
  assert.match(e.id, /^e_\d+_[a-z0-9]+$/);
  assert.equal(e.id.split('_')[1], String(fixedNow().getTime()));
  assert.equal(e.amountCents, 1250);
  assert.equal(e.fixed, 'variabel');
  assert.ok(e.createdAt);
  const saved = JSON.parse(storage.map['geldboek.v1']);
  assert.equal(saved.version, 1);
  assert.equal(saved.entries.length, 1);
  assert.equal(saved.entries[0].amountCents, 1250);
  // opnieuw laden uit dezelfde opslag
  const store2 = S.createStore(storage, { now: fixedNow });
  assert.deepEqual(store2.listEntries(), [e]);
  // twee entries in dezelfde milliseconde krijgen toch verschillende ids
  const e2 = store.addEntry(expense());
  assert.notEqual(e2.id, e.id);
});

test('addEntry: negatief, nul, float of leeg bedrag en onbekend type geweigerd', () => {
  const store = S.createStore(fakeStorage(), { now: fixedNow });
  for (const amountCents of [-100, 0, 12.5, NaN, null, undefined, '1250']) {
    assert.throws(() => store.addEntry(expense({ amountCents })), /amountCents/);
  }
  assert.throws(() => store.addEntry(expense({ type: 'transfer' })), /type/);
  assert.throws(() => store.addEntry(null));
  assert.equal(store.listEntries().length, 0);
});

test('updateEntry: past velden aan, id blijft, onbekend id -> null', () => {
  const storage = fakeStorage();
  const store = S.createStore(storage, { now: fixedNow });
  const e = store.addEntry(expense());
  const u = store.updateEntry(e.id, { amountCents: 2000, worthLater: 4, id: 'anders' });
  assert.equal(u.id, e.id);
  assert.equal(u.amountCents, 2000);
  assert.equal(u.worthLater, 4);
  assert.equal(JSON.parse(storage.map['geldboek.v1']).entries[0].amountCents, 2000);
  assert.equal(store.updateEntry('bestaat-niet', { amountCents: 1 }), null);
  assert.throws(() => store.updateEntry(e.id, { amountCents: -5 }));
  assert.equal(store.getEntry(e.id).amountCents, 2000);
});

test('deleteEntry: verwijdert uit lijst en opslag; onbekend id -> false', () => {
  const storage = fakeStorage();
  const store = S.createStore(storage, { now: fixedNow });
  const a = store.addEntry(expense());
  const b = store.addEntry(expense({ what: 'Bus' }));
  assert.equal(store.deleteEntry(a.id), true);
  assert.deepEqual(store.listEntries().map(e => e.id), [b.id]);
  assert.equal(JSON.parse(storage.map['geldboek.v1']).entries.length, 1);
  assert.equal(store.deleteEntry(a.id), false);
});

test('listEntries: nieuwste eerst en geeft kopieën', () => {
  const store = S.createStore(fakeStorage(), { now: fixedNow });
  store.addEntry(expense({ datetime: '2026-11-10T08:00', what: 'oud' }));
  store.addEntry(expense({ datetime: '2026-11-12T08:00', what: 'nieuw' }));
  store.addEntry(expense({ datetime: '2026-11-11T08:00', what: 'midden' }));
  const list = store.listEntries();
  assert.deepEqual(list.map(e => e.what), ['nieuw', 'midden', 'oud']);
  list[0].amountCents = 1;
  assert.equal(store.listEntries()[0].amountCents, 1250);
});

test('updateSettings: samenvoegen en normaliseren', () => {
  const storage = fakeStorage();
  const store = S.createStore(storage, { now: fixedNow });
  const s = store.updateSettings({ startBalanceCents: -2500, hourlyWageCents: 1500, onboarded: true });
  assert.equal(s.startBalanceCents, -2500);
  assert.equal(s.hourlyWageCents, 1500);
  assert.equal(s.onboarded, true);
  assert.equal(s.startDate, '2026-11-13');
  assert.equal(JSON.parse(storage.map['geldboek.v1']).settings.hourlyWageCents, 1500);
  assert.equal(store.updateSettings({ hourlyWageCents: 0 }).hourlyWageCents, null);
  assert.equal(store.updateSettings(null).startBalanceCents, -2500);
});

test('replaceAll: vervangt alles, weigert ongeldige of nieuwere data', () => {
  const storage = fakeStorage();
  const store = S.createStore(storage, { now: fixedNow });
  store.addEntry(expense());
  const backup = { version: 1, settings: { startBalanceCents: 777, startDate: '2026-11-01', onboarded: true }, entries: [{ id: 'e_9_z', type: 'income', amountCents: 500, datetime: '2026-11-02T10:00', source: 'werk', hours: 2 }] };
  store.replaceAll(backup);
  assert.equal(store.getSettings().startBalanceCents, 777);
  assert.deepEqual(store.listEntries().map(e => e.id), ['e_9_z']);
  assert.equal(JSON.parse(storage.map['geldboek.v1']).entries[0].hours, 2);
  assert.throws(() => store.replaceAll('kapot'));
  assert.throws(() => store.replaceAll({ version: 2, settings: {}, entries: [] }), /versie/);
  assert.equal(store.listEntries().length, 1);
});

test('save: opslag die gooit (vol) -> false en lastError, geen crash', () => {
  const storage = { getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } };
  const store = S.createStore(storage, { now: fixedNow });
  assert.doesNotThrow(() => store.addEntry(expense()));
  assert.equal(store.save(), false);
  assert.match(String(store.lastError), /Quota/);
  assert.equal(store.listEntries().length, 1);
});

test('createStore zonder opslag werkt in geheugen', () => {
  const store = S.createStore(null, { now: fixedNow });
  store.addEntry(expense());
  assert.equal(store.save(), true);
  assert.equal(store.listEntries().length, 1);
});
