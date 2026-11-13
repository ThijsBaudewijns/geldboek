/*
 * Geldboek - opslag (puur, zonder DOM).
 * Werkt in de browser (window.Geldboek.store) en in Node (module.exports).
 * createStore(storage) krijgt een object met getItem/setItem (localStorage of een nep-versie).
 * Schema: localStorage['geldboek.v1'] = { version: 1, settings, entries } (zie PLAN.md "Datamodel").
 */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'geldboek.v1';
  var VERSION = 1;
  var DEFAULT_CATEGORIES = [
    'Boodschappen',
    'Eten & drinken buiten de deur',
    'Vervoer',
    'Uitgaan',
    'Kleding',
    'Abonnementen',
    'Wonen',
    'Cadeaus',
    'Overig'
  ];
  var FIXED = ['vast', 'variabel'];
  var NEEDS = ['nodig', 'wil', 'impuls'];
  var MOODS = ['verveeld', 'gestrest', 'sociaal', 'blij', 'moe', 'neutraal'];
  var SOURCES = ['werk', 'terugbetaling', 'belasting', 'overig'];

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function todayISO(now) {
    var d = now instanceof Date ? now : new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function clone(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }

  function isObj(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function intOr(v, fallback) {
    return typeof v === 'number' && isFinite(v) ? Math.round(v) : fallback;
  }

  function oneOf(v, list, fallback) {
    return list.indexOf(v) >= 0 ? v : fallback;
  }

  function strOrNull(v) {
    return typeof v === 'string' && v.trim() !== '' ? v : null;
  }

  function scoreOrNull(v) {
    return typeof v === 'number' && v >= 1 && v <= 5 && Math.round(v) === v ? v : null;
  }

  /** "e_<timestamp>_<random>" */
  function generateId(now) {
    var t = typeof now === 'number' ? now : Date.now();
    return 'e_' + t + '_' + Math.random().toString(36).slice(2, 8);
  }

  function defaultSettings(now) {
    return {
      startBalanceCents: 0,
      startDate: todayISO(now),
      hourlyWageCents: null,
      categories: DEFAULT_CATEGORIES.slice(),
      lastExportAt: null,
      onboarded: false
    };
  }

  function defaultData(now) {
    return { version: VERSION, settings: defaultSettings(now), entries: [] };
  }

  function normalizeSettings(s, now) {
    var d = defaultSettings(now);
    var out = isObj(s) ? clone(s) : {}; // onbekende velden blijven behouden
    out.startBalanceCents = intOr(out.startBalanceCents, d.startBalanceCents);
    out.startDate = typeof out.startDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(out.startDate) ? out.startDate.slice(0, 10) : d.startDate;
    out.hourlyWageCents = typeof out.hourlyWageCents === 'number' && isFinite(out.hourlyWageCents) && out.hourlyWageCents > 0 ? Math.round(out.hourlyWageCents) : null;
    out.categories = Array.isArray(out.categories)
      ? out.categories.filter(function (c) { return typeof c === 'string' && c.trim() !== ''; })
      : d.categories;
    out.lastExportAt = strOrNull(out.lastExportAt);
    out.onboarded = out.onboarded === true;
    return out;
  }

  /** Vult ontbrekende velden aan met standaardwaarden; onbekende velden blijven behouden. */
  function normalizeEntry(e, now) {
    var out = isObj(e) ? clone(e) : {};
    var nowDate = now instanceof Date ? now : new Date();
    out.id = typeof out.id === 'string' && out.id ? out.id : generateId(nowDate.getTime());
    out.type = out.type === 'income' ? 'income' : 'expense';
    out.amountCents = Math.abs(intOr(out.amountCents, 0));
    out.datetime = typeof out.datetime === 'string' && /^\d{4}-\d{2}-\d{2}/.test(out.datetime)
      ? out.datetime
      : todayISO(nowDate) + 'T' + pad2(nowDate.getHours()) + ':' + pad2(nowDate.getMinutes());
    out.what = typeof out.what === 'string' ? out.what : '';
    out.note = typeof out.note === 'string' ? out.note : '';
    out.createdAt = strOrNull(out.createdAt) || nowDate.toISOString();
    if (out.type === 'expense') {
      out.fixed = oneOf(out.fixed, FIXED, 'variabel');
      out.category = strOrNull(out.category);
      out.need = oneOf(out.need, NEEDS, null);
      out.worth = scoreOrNull(out.worth);
      out.mood = oneOf(out.mood, MOODS, null);
      out.worthLater = scoreOrNull(out.worthLater);
      out.worthLaterAt = strOrNull(out.worthLaterAt);
      out.worthLaterSkipped = out.worthLaterSkipped === true;
      out.advanceFor = strOrNull(out.advanceFor);
      out.repaidAt = strOrNull(out.repaidAt);
    } else {
      out.source = oneOf(out.source, SOURCES, 'overig');
      out.hours = typeof out.hours === 'number' && isFinite(out.hours) && out.hours >= 0 ? out.hours : null;
      out.linkedExpenseId = strOrNull(out.linkedExpenseId);
    }
    return out;
  }

  /** Maakt van willekeurige invoer geldige geldboek.v1-data (nooit een exception). */
  function normalize(data, now) {
    if (!isObj(data)) return defaultData(now);
    var out = {};
    Object.keys(data).forEach(function (k) {
      if (k !== 'settings' && k !== 'entries') out[k] = clone(data[k]);
    });
    out.version = VERSION;
    out.settings = normalizeSettings(data.settings, now);
    var seen = {};
    out.entries = (Array.isArray(data.entries) ? data.entries : [])
      .filter(isObj)
      .map(function (e) {
        var n = normalizeEntry(e, now);
        while (seen[n.id]) n.id = generateId();
        seen[n.id] = true;
        return n;
      });
    return out;
  }

  function validateAmount(amountCents) {
    if (typeof amountCents !== 'number' || !isFinite(amountCents) || Math.round(amountCents) !== amountCents || amountCents <= 0) {
      throw new Error('amountCents moet een positief geheel getal (centen) zijn');
    }
  }

  function sortNewestFirst(a, b) {
    if (a.datetime !== b.datetime) return a.datetime < b.datetime ? 1 : -1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return 0;
  }

  /**
   * createStore(storage, options)
   * storage: { getItem(key), setItem(key, value) } of null (dan alleen in geheugen).
   * options.now: functie die een Date geeft (voor tests); standaard () => new Date().
   * Laadt meteen bij aanmaken. Elke wijziging schrijft direct weg.
   */
  function createStore(storage, options) {
    var opts = options || {};
    var nowFn = typeof opts.now === 'function' ? opts.now : function () { return new Date(); };
    var data = defaultData(nowFn());
    var store = { lastError: null };

    /** Leest uit de opslag. Ontbrekend of kapot -> standaarddata (geen crash). Geeft een kopie. */
    store.load = function () {
      var raw = null;
      store.lastError = null;
      try {
        raw = storage ? storage.getItem(STORAGE_KEY) : null;
      } catch (err) {
        store.lastError = err;
      }
      var parsed = null;
      if (typeof raw === 'string' && raw !== '') {
        try {
          parsed = JSON.parse(raw);
        } catch (err) {
          store.lastError = err;
          parsed = null;
        }
      }
      data = normalize(parsed, nowFn());
      return clone(data);
    };

    /** Schrijft de huidige data weg. true bij succes, false bij fout (zie store.lastError). */
    store.save = function () {
      if (!storage) return true;
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(data));
        store.lastError = null;
        return true;
      } catch (err) {
        store.lastError = err;
        return false;
      }
    };

    /** Volledige data (kopie), bijv. voor export. */
    store.getData = function () {
      return clone(data);
    };

    store.getSettings = function () {
      return clone(data.settings);
    };

    store.updateSettings = function (patch) {
      var merged = Object.assign({}, data.settings, isObj(patch) ? patch : {});
      data.settings = normalizeSettings(merged, nowFn());
      store.save();
      return clone(data.settings);
    };

    // ---- categorieën (Instellingen) ----

    function findCategory(list, name) {
      var key = String(name).trim().toLowerCase();
      for (var i = 0; i < list.length; i++) {
        if (list[i].trim().toLowerCase() === key) return i;
      }
      return -1;
    }

    /** Voegt een categorie toe (achteraan). Gooit bij een lege naam of een bestaande naam (hoofdletterongevoelig). */
    store.addCategory = function (name) {
      var n = typeof name === 'string' ? name.trim() : '';
      if (!n) throw new Error('Vul een naam in.');
      if (findCategory(data.settings.categories, n) >= 0) throw new Error('Die categorie bestaat al.');
      data.settings.categories.push(n);
      store.save();
      return clone(data.settings);
    };

    /**
     * Hernoemt een categorie en past alle uitgaven met die categorie aan.
     * Bestaat de nieuwe naam al (andere categorie), dan worden ze samengevoegd.
     * Geeft het aantal aangepaste entries. Gooit bij een lege nieuwe naam of een onbekende oude naam.
     */
    store.renameCategory = function (oldName, newName) {
      var n = typeof newName === 'string' ? newName.trim() : '';
      if (!n) throw new Error('Vul een naam in.');
      var cats = data.settings.categories;
      var idx = cats.indexOf(oldName);
      if (idx < 0) throw new Error('Categorie "' + oldName + '" bestaat niet.');
      var other = findCategory(cats, n);
      if (other >= 0 && other !== idx) {
        n = cats[other];
        cats.splice(idx, 1);
      } else {
        cats[idx] = n;
      }
      var changed = 0;
      data.entries.forEach(function (e) {
        if (e.type === 'expense' && e.category === oldName && oldName !== n) {
          e.category = n;
          changed++;
        }
      });
      store.save();
      return changed;
    };

    /** Haalt een categorie uit de lijst. Bestaande uitgaven houden hun categorie (geschiedenis). true als hij bestond. */
    store.removeCategory = function (name) {
      var idx = data.settings.categories.indexOf(name);
      if (idx < 0) return false;
      data.settings.categories.splice(idx, 1);
      store.save();
      return true;
    };

    /**
     * Voegt een entry toe. id en createdAt worden gezet als ze ontbreken.
     * Gooit een Error bij een ongeldig type of een bedrag dat geen positief geheel getal is.
     * Geeft de opgeslagen entry (kopie).
     */
    store.addEntry = function (entry) {
      if (!isObj(entry)) throw new Error('entry moet een object zijn');
      if (entry.type !== 'expense' && entry.type !== 'income') throw new Error('type moet "expense" of "income" zijn');
      validateAmount(entry.amountCents);
      var now = nowFn();
      var input = clone(entry);
      if (!input.id || data.entries.some(function (e) { return e.id === input.id; })) input.id = generateId(now.getTime());
      if (!input.createdAt) input.createdAt = now.toISOString();
      var e = normalizeEntry(input, now);
      data.entries.push(e);
      store.save();
      return clone(e);
    };

    /** Past velden aan (id kan niet veranderen). Geeft de nieuwe entry of null als id onbekend is. */
    store.updateEntry = function (id, patch) {
      var idx = -1;
      for (var i = 0; i < data.entries.length; i++) {
        if (data.entries[i].id === id) { idx = i; break; }
      }
      if (idx < 0) return null;
      var p = isObj(patch) ? clone(patch) : {};
      delete p.id;
      if ('amountCents' in p) validateAmount(p.amountCents);
      if ('type' in p && p.type !== 'expense' && p.type !== 'income') throw new Error('type moet "expense" of "income" zijn');
      var merged = Object.assign({}, data.entries[idx], p);
      data.entries[idx] = normalizeEntry(merged, nowFn());
      store.save();
      return clone(data.entries[idx]);
    };

    /** Verwijdert een entry. true als hij bestond. */
    store.deleteEntry = function (id) {
      var before = data.entries.length;
      data.entries = data.entries.filter(function (e) { return e.id !== id; });
      if (data.entries.length === before) return false;
      store.save();
      return true;
    };

    store.getEntry = function (id) {
      for (var i = 0; i < data.entries.length; i++) {
        if (data.entries[i].id === id) return clone(data.entries[i]);
      }
      return null;
    };

    /** Alle entries (kopieën), nieuwste eerst (datetime, dan createdAt). */
    store.listEntries = function () {
      return clone(data.entries).sort(sortNewestFirst);
    };

    /** Vervangt alle data (bijv. bij terugzetten van een back-up). Gooit bij geen object of een nieuwere versie. */
    store.replaceAll = function (newData) {
      if (!isObj(newData)) throw new Error('ongeldige data');
      if (typeof newData.version === 'number' && newData.version > VERSION) {
        throw new Error('data heeft een nieuwere versie (' + newData.version + ') dan deze app (' + VERSION + ')');
      }
      data = normalize(newData, nowFn());
      store.save();
      return clone(data);
    };

    store.load();
    return store;
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    VERSION: VERSION,
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES.slice(),
    FIXED: FIXED.slice(),
    NEEDS: NEEDS.slice(),
    MOODS: MOODS.slice(),
    SOURCES: SOURCES.slice(),
    createStore: createStore,
    defaultData: defaultData,
    normalize: normalize,
    normalizeEntry: normalizeEntry,
    generateId: generateId
  };

  root.Geldboek = root.Geldboek || {};
  root.Geldboek.store = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
