/*
 * Geldboek - back-up en export (puur, zonder DOM).
 * Werkt in de browser (window.Geldboek.backup) en in Node (module.exports).
 * - JSON-back-up: de volledige geldboek.v1-data (opnieuw te importeren).
 * - CSV: één regel per entry, scheidingsteken ";", decimale komma, UTF-8 met BOM (Excel NL), CRLF.
 * - parseBackup: controleert een teruggezet bestand (version, settings, entries).
 * - reminderDue: back-upherinnering na 7 dagen zonder export (U18).
 */
(function (root) {
  'use strict';

  var VERSION = 1;
  var REMINDER_DAYS = 7;
  var DAY_MS = 24 * 60 * 60 * 1000;
  var BOM = '﻿';

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function isObj(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  /** Lokale datum "YYYY-MM-DD". */
  function fileDate(now) {
    var d = now instanceof Date ? now : new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function jsonFileName(now) {
    return 'geldboek-' + fileDate(now) + '.json';
  }

  function csvFileName(now) {
    return 'geldboek-' + fileDate(now) + '.csv';
  }

  /**
   * De data voor een back-up: kopie met settings.lastExportAt = moment van exporteren
   * (zodat een teruggezette back-up weet wanneer hij gemaakt is).
   */
  function exportData(data, now) {
    var d = now instanceof Date ? now : new Date();
    var out = JSON.parse(JSON.stringify(isObj(data) ? data : {}));
    if (!isObj(out.settings)) out.settings = {};
    out.settings.lastExportAt = d.toISOString();
    if (typeof out.version !== 'number') out.version = VERSION;
    if (!Array.isArray(out.entries)) out.entries = [];
    return out;
  }

  function toJSON(data, now) {
    return JSON.stringify(exportData(data, now), null, 2);
  }

  /** 1250 -> "12,50"; -5 -> "-0,05" (geen duizendtallen, Excel NL leest dit als getal). */
  function centsToDecimal(cents) {
    if (typeof cents !== 'number' || !isFinite(cents)) return '';
    var c = Math.round(cents);
    var neg = c < 0;
    var a = Math.abs(c);
    return (neg ? '-' : '') + Math.floor(a / 100) + ',' + pad2(a % 100);
  }

  function numberToDecimal(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    return String(n).replace('.', ',');
  }

  /** Kolommen: [kop, functie(entry) -> waarde]. Alle velden uit het datamodel, plus leesbare datum/tijd/bedrag. */
  var COLUMNS = [
    ['datum', function (e) { return String(e.datetime || '').slice(0, 10); }],
    ['tijd', function (e) { return String(e.datetime || '').slice(11, 16); }],
    ['soort', function (e) { return e.type === 'income' ? 'inkomst' : 'uitgave'; }],
    ['bedrag', function (e) { return centsToDecimal(e.type === 'income' ? e.amountCents : -e.amountCents); }],
    ['id', function (e) { return e.id; }],
    ['type', function (e) { return e.type; }],
    ['amountCents', function (e) { return e.amountCents; }],
    ['datetime', function (e) { return e.datetime; }],
    ['what', function (e) { return e.what; }],
    ['note', function (e) { return e.note; }],
    ['createdAt', function (e) { return e.createdAt; }],
    ['fixed', function (e) { return e.fixed; }],
    ['category', function (e) { return e.category; }],
    ['need', function (e) { return e.need; }],
    ['worth', function (e) { return e.worth; }],
    ['mood', function (e) { return e.mood; }],
    ['worthLater', function (e) { return e.worthLater; }],
    ['worthLaterAt', function (e) { return e.worthLaterAt; }],
    ['worthLaterSkipped', function (e) { return e.type === 'expense' ? (e.worthLaterSkipped === true ? 'ja' : 'nee') : ''; }],
    ['advanceFor', function (e) { return e.advanceFor; }],
    ['repaidAt', function (e) { return e.repaidAt; }],
    ['source', function (e) { return e.source; }],
    ['hours', function (e) { return numberToDecimal(e.hours); }],
    ['linkedExpenseId', function (e) { return e.linkedExpenseId; }]
  ];

  function csvCell(v) {
    if (v === null || v === undefined) return '';
    var s = typeof v === 'number' ? String(v) : String(v);
    // Geen formules in Excel uit vrije tekst (=, +, -, @ aan het begin), behalve bij getallen.
    if (typeof v === 'string' && /^[=+\-@]/.test(s) && !/^-?\d+(,\d+)?$/.test(s)) s = "'" + s;
    if (/[;"\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function sortOldestFirst(a, b) {
    var da = String(a.datetime || ''), db = String(b.datetime || '');
    if (da !== db) return da < db ? -1 : 1;
    var ca = String(a.createdAt || ''), cb = String(b.createdAt || '');
    if (ca !== cb) return ca < cb ? -1 : 1;
    return 0;
  }

  /** CSV-tekst (met BOM) voor alle entries, oudste eerst. */
  function toCSV(data) {
    var entries = isObj(data) && Array.isArray(data.entries) ? data.entries.filter(isObj).slice() : [];
    entries.sort(sortOldestFirst);
    var lines = [COLUMNS.map(function (c) { return c[0]; }).join(';')];
    entries.forEach(function (e) {
      lines.push(COLUMNS.map(function (c) { return csvCell(c[1](e)); }).join(';'));
    });
    return BOM + lines.join('\r\n') + '\r\n';
  }

  /**
   * Controleert de tekst van een back-upbestand.
   * Geeft { ok: true, data } of { ok: false, error: '<Nederlandse melding>' }.
   */
  function parseBackup(text) {
    if (typeof text !== 'string' || text.trim() === '') return { ok: false, error: 'Dit bestand is leeg.' };
    var t = text.charAt(0) === BOM ? text.slice(1) : text;
    var parsed;
    try {
      parsed = JSON.parse(t);
    } catch (err) {
      return { ok: false, error: 'Dit is geen Geldboek-back-up (geen geldige JSON).' };
    }
    if (!isObj(parsed) || !('version' in parsed) || !Array.isArray(parsed.entries) || !isObj(parsed.settings)) {
      return { ok: false, error: 'Dit is geen Geldboek-back-up.' };
    }
    if (typeof parsed.version !== 'number' || Math.round(parsed.version) !== parsed.version || parsed.version < 1) {
      return { ok: false, error: 'Deze back-up heeft een onbekende versie.' };
    }
    if (parsed.version > VERSION) {
      return { ok: false, error: 'Deze back-up komt uit een nieuwere versie van Geldboek. Ververs de app en probeer het opnieuw.' };
    }
    return { ok: true, data: parsed };
  }

  /**
   * Vanaf wanneer telt de herinnering? lastExportAt, of anders het eerste gebruik
   * (de oudste createdAt van de entries). Geen entries -> null (niets om te bewaren).
   */
  function reminderSince(settings, entries) {
    var s = isObj(settings) ? settings : {};
    var list = Array.isArray(entries) ? entries : [];
    if (list.length === 0) return null;
    if (typeof s.lastExportAt === 'string' && !isNaN(Date.parse(s.lastExportAt))) return new Date(s.lastExportAt);
    var first = null;
    list.forEach(function (e) {
      var t = isObj(e) && typeof e.createdAt === 'string' ? Date.parse(e.createdAt) : NaN;
      if (!isNaN(t) && (first === null || t < first)) first = t;
    });
    return first === null ? null : new Date(first);
  }

  /** true als de back-upherinnering getoond moet worden (U18): 7 dagen zonder export en vandaag niet weggeklikt. */
  function reminderDue(settings, entries, now) {
    var d = now instanceof Date ? now : new Date();
    var s = isObj(settings) ? settings : {};
    if (s.backupReminderDismissedOn === fileDate(d)) return false;
    var since = reminderSince(s, entries);
    if (!since) return false;
    return d.getTime() - since.getTime() >= REMINDER_DAYS * DAY_MS;
  }

  /** Hele dagen sinds de laatste export (of het eerste gebruik), of null. */
  function daysSinceExport(settings, entries, now) {
    var d = now instanceof Date ? now : new Date();
    var since = reminderSince(settings, entries);
    if (!since) return null;
    return Math.max(0, Math.floor((d.getTime() - since.getTime()) / DAY_MS));
  }

  var api = {
    VERSION: VERSION,
    REMINDER_DAYS: REMINDER_DAYS,
    BOM: BOM,
    COLUMNS: COLUMNS.map(function (c) { return c[0]; }),
    fileDate: fileDate,
    jsonFileName: jsonFileName,
    csvFileName: csvFileName,
    exportData: exportData,
    toJSON: toJSON,
    toCSV: toCSV,
    centsToDecimal: centsToDecimal,
    parseBackup: parseBackup,
    reminderSince: reminderSince,
    reminderDue: reminderDue,
    daysSinceExport: daysSinceExport
  };

  root.Geldboek = root.Geldboek || {};
  root.Geldboek.backup = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
