/*
 * Geldboek - rekenlogica (puur, zonder DOM).
 * Werkt in de browser (window.Geldboek.calc) en in Node (module.exports).
 * Alle bedragen zijn gehele centen (integer). Alleen formatEuro zet om naar tekst.
 */
(function (root) {
  'use strict';

  var DAY_MS = 24 * 60 * 60 * 1000;

  // ---------- hulpfuncties ----------

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /** Date -> "YYYY-MM-DD" in lokale tijd. */
  function toISODate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** Date -> "YYYY-MM-DDTHH:mm" in lokale tijd (formaat van entry.datetime). */
  function toLocalDateTime(d) {
    return toISODate(d) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /** "YYYY-MM-DD" of "YYYY-MM-DDTHH:mm[:ss]" (lokale tijd) -> Date, of null. */
  function parseLocalDateTime(s) {
    if (typeof s !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
    return isNaN(d.getTime()) ? null : d;
  }

  function toDate(now) {
    if (now instanceof Date) return new Date(now.getTime());
    if (typeof now === 'number') return new Date(now);
    if (typeof now === 'string') return parseLocalDateTime(now) || new Date(now);
    return new Date();
  }

  function cents(entry) {
    var n = entry && entry.amountCents;
    return typeof n === 'number' && isFinite(n) ? Math.round(n) : 0;
  }

  function isExpense(e) {
    return !!e && e.type === 'expense';
  }

  function isIncome(e) {
    return !!e && e.type === 'income';
  }

  function isOwnExpense(e) {
    return isExpense(e) && !(typeof e.advanceFor === 'string' && e.advanceFor.trim() !== '');
  }

  /** Valt entry.datetime binnen [from, to]? Datum-grenzen (10 tekens) zijn inclusief de hele dag. */
  function inRange(e, from, to) {
    var dt = e && typeof e.datetime === 'string' ? e.datetime : '';
    if (from && dt < from) return false;
    if (to) {
      if (to.length <= 10) {
        if (dt.slice(0, 10) > to) return false;
      } else if (dt > to) {
        return false;
      }
    }
    return true;
  }

  // ---------- bedragen ----------

  /**
   * Tekst -> gehele centen. Accepteert "12,50", "12.5", "12", "€ 12,50", "1.250,00", "1,250.00".
   * Ongeldig, leeg, nul of negatief -> null.
   * Regels: met zowel punt als komma is het laatste teken het decimaalteken.
   * Alleen komma('s): één komma = decimaal. Alleen punt(en): één punt met precies 3 cijfers
   * erachter, of meerdere punten = duizendtallen ("1.250" = 1250 euro); anders decimaal.
   * Maximaal 2 decimalen.
   */
  function parseAmount(input) {
    if (typeof input === 'number') {
      if (!isFinite(input) || input <= 0) return null;
      var c = Math.round(input * 100);
      return c > 0 ? c : null;
    }
    if (typeof input !== 'string') return null;
    var s = input.replace(/[\s  €]/g, '').replace(/^eur/i, '');
    if (s === '' || s.charAt(0) === '-') return null;
    s = s.replace(/^\+/, '');
    if (!/^[0-9.,]+$/.test(s)) return null;

    var lastDot = s.lastIndexOf('.');
    var lastComma = s.lastIndexOf(',');
    var intPart, fracPart;

    if (lastDot >= 0 && lastComma >= 0) {
      var decSep = lastDot > lastComma ? '.' : ',';
      var thouSep = decSep === '.' ? ',' : '.';
      var idx = s.lastIndexOf(decSep);
      intPart = s.slice(0, idx);
      fracPart = s.slice(idx + 1);
      if (intPart.indexOf(decSep) >= 0) return null;
      if (!validThousands(intPart, thouSep)) return null;
      intPart = intPart.split(thouSep).join('');
    } else if (lastComma >= 0 || lastDot >= 0) {
      var sep = lastComma >= 0 ? ',' : '.';
      var parts = s.split(sep);
      if (parts.length === 2 && !(sep === '.' && parts[1].length === 3 && parts[0].length > 0)) {
        intPart = parts[0];
        fracPart = parts[1];
      } else if (validThousands(s, sep)) {
        intPart = parts.join('');
        fracPart = '';
      } else {
        return null;
      }
    } else {
      intPart = s;
      fracPart = '';
    }

    if (intPart === '') intPart = '0';
    if (!/^\d+$/.test(intPart) || !/^\d{0,2}$/.test(fracPart)) return null;

    var result = parseInt(intPart, 10) * 100 + (fracPart === '' ? 0 : parseInt((fracPart + '0').slice(0, 2), 10));
    if (!isFinite(result) || result <= 0 || result > Number.MAX_SAFE_INTEGER) return null;
    return result;
  }

  function validThousands(s, sep) {
    if (s.indexOf(sep) < 0) return /^\d+$/.test(s);
    var groups = s.split(sep);
    if (!/^[1-9]\d{0,2}$/.test(groups[0])) return false;
    for (var i = 1; i < groups.length; i++) {
      if (!/^\d{3}$/.test(groups[i])) return false;
    }
    return true;
  }

  var euroFormatter = null;
  function getEuroFormatter() {
    if (!euroFormatter) {
      euroFormatter = new Intl.NumberFormat('nl-NL', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }
    return euroFormatter;
  }

  /**
   * Gehele centen -> "€ 12,50". Intl geeft een non-breaking space (U+00A0) of
   * narrow no-break space (U+202F); die worden genormaliseerd naar een gewone spatie,
   * zodat de uitvoer in elke engine exact gelijk is. Negatief: "€ -12,50" (Intl nl-NL).
   */
  function formatEuro(amountCents) {
    var c = typeof amountCents === 'number' && isFinite(amountCents) ? Math.round(amountCents) : 0;
    var text = getEuroFormatter().format(c / 100);
    return text.replace(/[  ]/g, ' ').replace(/−/g, '-');
  }

  // ---------- saldo en totalen ----------

  /**
   * U11: startsaldo + som inkomsten - som uitgaven, over alle entries vanaf settings.startDate
   * (inclusief). Zonder startDate tellen alle entries mee.
   */
  function balance(settings, entries) {
    var s = settings || {};
    var start = typeof s.startBalanceCents === 'number' && isFinite(s.startBalanceCents) ? Math.round(s.startBalanceCents) : 0;
    var from = typeof s.startDate === 'string' && s.startDate ? s.startDate.slice(0, 10) : null;
    var total = start;
    (entries || []).forEach(function (e) {
      if (!inRange(e, from, null)) return;
      if (isIncome(e)) total += cents(e);
      else if (isExpense(e)) total -= cents(e);
    });
    return total;
  }

  /**
   * Totalen binnen [from, to] (beide optioneel, "YYYY-MM-DD" inclusief of "YYYY-MM-DDTHH:mm").
   * ownExpenseCents (U12) = uitgaven zonder advanceFor.
   * repaymentCents = inkomsten met bron 'terugbetaling' (zit ook in incomeCents).
   */
  function totals(entries, range) {
    var r = range || {};
    var out = { expenseCents: 0, incomeCents: 0, ownExpenseCents: 0, advancedCents: 0, repaymentCents: 0, netCents: 0, count: 0 };
    (entries || []).forEach(function (e) {
      if (!inRange(e, r.from, r.to)) return;
      if (isExpense(e)) {
        out.count++;
        out.expenseCents += cents(e);
        if (isOwnExpense(e)) out.ownExpenseCents += cents(e);
        else out.advancedCents += cents(e);
      } else if (isIncome(e)) {
        out.count++;
        out.incomeCents += cents(e);
        if (e.source === 'terugbetaling') out.repaymentCents += cents(e);
      }
    });
    out.netCents = out.incomeCents - out.expenseCents;
    return out;
  }

  /**
   * Som van de uitgaven per waarde van `key` (bijv. 'category', 'need', 'mood', 'fixed').
   * opts.type: 'expense' (standaard) of 'income'; opts.ownOnly: alleen eigen uitgaven.
   * Resultaat: [{ key, totalCents, count }], grootste totaal eerst; ontbrekende waarde = key null.
   */
  function groupBy(entries, key, opts) {
    var o = opts || {};
    var type = o.type || 'expense';
    var map = {};
    var order = [];
    (entries || []).forEach(function (e) {
      if (!e || e.type !== type) return;
      if (o.ownOnly && !isOwnExpense(e)) return;
      var v = e[key];
      if (v === undefined || v === '') v = null;
      var k = v === null ? '\u0000null' : String(v);
      if (!map[k]) {
        map[k] = { key: v, totalCents: 0, count: 0 };
        order.push(k);
      }
      map[k].totalCents += cents(e);
      map[k].count++;
    });
    return order.map(function (k) { return map[k]; }).sort(function (a, b) {
      return b.totalCents - a.totalCents;
    });
  }

  /** Maandag (lokale datum) van de week waarin d valt, als "YYYY-MM-DD". */
  function weekStartOf(d) {
    var day = (d.getDay() + 6) % 7; // maandag = 0
    var m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
    return toISODate(m);
  }

  /**
   * Totalen per week; weken beginnen op maandag (nl-NL / ISO).
   * Resultaat oplopend: [{ weekStart: "YYYY-MM-DD", expenseCents, ownExpenseCents, incomeCents, count }].
   * Alleen weken met minstens één entry.
   */
  function byWeek(entries) {
    var map = {};
    (entries || []).forEach(function (e) {
      var d = parseLocalDateTime(e && e.datetime);
      if (!d || !(isExpense(e) || isIncome(e))) return;
      var ws = weekStartOf(d);
      if (!map[ws]) map[ws] = { weekStart: ws, expenseCents: 0, ownExpenseCents: 0, incomeCents: 0, count: 0 };
      var w = map[ws];
      w.count++;
      if (isExpense(e)) {
        w.expenseCents += cents(e);
        if (isOwnExpense(e)) w.ownExpenseCents += cents(e);
      } else {
        w.incomeCents += cents(e);
      }
    });
    return Object.keys(map).sort().map(function (k) { return map[k]; });
  }

  // ---------- uren werk ----------

  /** U14: bedrag / uurloon, afgerond op één decimaal (Number). Zonder (geldig) uurloon -> null. */
  function hoursOfWork(amountCents, hourlyWageCents) {
    if (typeof hourlyWageCents !== 'number' || !isFinite(hourlyWageCents) || hourlyWageCents <= 0) return null;
    if (typeof amountCents !== 'number' || !isFinite(amountCents)) return null;
    return Math.round((amountCents / hourlyWageCents) * 10) / 10;
  }

  /** 3 -> "3,0"; 1.25 -> "1,3". Voor weergave van hoursOfWork. */
  function formatHours(hours) {
    if (typeof hours !== 'number' || !isFinite(hours)) return '';
    return (Math.round(hours * 10) / 10).toFixed(1).replace('.', ',');
  }

  // ---------- terugkijken ----------

  /**
   * U13: uitgaven met een eerste waard-score of argumentatie, nog zonder worthLater en niet
   * overgeslagen, waarvan de datetime minstens 7 kalenderdagen vóór `now` ligt
   * (precies 7 dagen geleden telt mee). Oudste eerst.
   */
  function reviewQueue(entries, now) {
    var n = toDate(now);
    var threshold = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 7, n.getHours(), n.getMinutes(), n.getSeconds(), n.getMilliseconds());
    var out = [];
    (entries || []).forEach(function (e) {
      if (!isExpense(e)) return;
      var hasWorth = typeof e.worth === 'number' && e.worth >= 1 && e.worth <= 5;
      var hasNote = typeof e.note === 'string' && e.note.trim() !== '';
      if (!hasWorth && !hasNote) return;
      if (e.worthLater !== null && e.worthLater !== undefined) return;
      if (e.worthLaterSkipped === true) return;
      var d = parseLocalDateTime(e.datetime);
      if (!d || d.getTime() > threshold.getTime()) return;
      out.push(e);
    });
    out.sort(function (a, b) { return a.datetime < b.datetime ? -1 : a.datetime > b.datetime ? 1 : 0; });
    return out;
  }

  // ---------- snelle chips ----------

  /**
   * U7: de 6 meest gebruikte "wat"-waarden van uitgaven uit de laatste 30 dagen (t.o.v. `now`).
   * Gelijk tellen: meest recent eerst. "wat" vergelijken zonder hoofdletters/spaties rondom.
   * Resultaat: [{ what, amountCents, fixed, category, count }], waarbij what/amountCents/fixed/category
   * van de meest recente uitgave met die "wat" komen.
   */
  function quickPicks(entries, now, limit) {
    var max = typeof limit === 'number' ? limit : 6;
    var n = toDate(now);
    var from = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 30, n.getHours(), n.getMinutes());
    var fromStr = toLocalDateTime(from);
    var nowStr = toLocalDateTime(n);
    var map = {};
    (entries || []).forEach(function (e) {
      if (!isExpense(e) || typeof e.what !== 'string') return;
      var what = e.what.trim();
      if (!what) return;
      var dt = typeof e.datetime === 'string' ? e.datetime.slice(0, 16) : '';
      if (dt < fromStr || dt > nowStr) return;
      var k = what.toLowerCase();
      var stamp = dt + '|' + (e.createdAt || '');
      var g = map[k];
      if (!g) g = map[k] = { count: 0, latest: null, stamp: '' };
      g.count++;
      if (!g.latest || stamp >= g.stamp) {
        g.latest = e;
        g.stamp = stamp;
      }
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return a.stamp < b.stamp ? 1 : a.stamp > b.stamp ? -1 : 0;
    }).slice(0, max).map(function (g) {
      var e = g.latest;
      return {
        what: e.what.trim(),
        amountCents: cents(e),
        fixed: e.fixed === 'vast' ? 'vast' : 'variabel',
        category: typeof e.category === 'string' && e.category ? e.category : null,
        count: g.count
      };
    });
  }

  var calc = {
    DAY_MS: DAY_MS,
    parseAmount: parseAmount,
    formatEuro: formatEuro,
    balance: balance,
    totals: totals,
    groupBy: groupBy,
    byWeek: byWeek,
    weekStartOf: weekStartOf,
    hoursOfWork: hoursOfWork,
    formatHours: formatHours,
    reviewQueue: reviewQueue,
    quickPicks: quickPicks,
    isOwnExpense: isOwnExpense,
    toISODate: toISODate,
    toLocalDateTime: toLocalDateTime,
    parseLocalDateTime: parseLocalDateTime
  };

  root.Geldboek = root.Geldboek || {};
  root.Geldboek.calc = calc;
  if (typeof module !== 'undefined' && module.exports) module.exports = calc;
})(typeof window !== 'undefined' ? window : globalThis);
