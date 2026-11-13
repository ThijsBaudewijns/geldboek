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

  /**
   * Als parseAmount, maar 0 en negatief mogen ook (voor het startsaldo).
   * "-25,50" / "−25,50" -> -2550; "0" / "0,00" -> 0; leeg of ongeldig -> null.
   */
  function parseSignedAmount(input) {
    if (typeof input === 'number') {
      if (!isFinite(input)) return null;
      var n = Math.round(input * 100);
      return n === 0 ? 0 : n;
    }
    if (typeof input !== 'string') return null;
    var s = input.replace(/[\s  €]/g, '').replace(/^eur/i, '');
    var sign = 1;
    var m = /^([-−+]?)(.*)$/.exec(s);
    if (m[1] === '-' || m[1] === '−') sign = -1;
    s = m[2];
    if (s === '') return null;
    if (/^0*([.,]0{0,2})?$/.test(s) && /0/.test(s)) return 0;
    var c = parseAmount(s);
    if (c === null) return null;
    return sign * c;
  }

  /** Aantal uren als tekst ("4", "6,5", "1.25") -> getal > 0 (max. 2 decimalen), anders null. */
  function parseHours(input) {
    if (typeof input === 'number') return isFinite(input) && input > 0 ? input : null;
    if (typeof input !== 'string') return null;
    var s = input.replace(/\s/g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(s) && !/^\.\d{1,2}$/.test(s)) return null;
    var h = parseFloat(s);
    return isFinite(h) && h > 0 ? h : null;
  }

  /** U10: uren x uurloon in gehele centen (afgerond). Zonder geldige uren of uurloon -> null. */
  function wageAmount(hours, hourlyWageCents) {
    if (typeof hours !== 'number' || !isFinite(hours) || hours <= 0) return null;
    if (typeof hourlyWageCents !== 'number' || !isFinite(hourlyWageCents) || hourlyWageCents <= 0) return null;
    return Math.round(hours * hourlyWageCents);
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

  /**
   * Label voor uren werk: "≈ 3,0 uur werk" (U14). Zonder geldig uurloon -> null.
   * Gebruikt in Overzicht-regels, de opslaan-melding en Terugkijken.
   */
  function hoursLabel(amountCents, hourlyWageCents) {
    var h = hoursOfWork(amountCents, hourlyWageCents);
    if (h === null) return null;
    return '≈ ' + formatHours(h) + ' uur werk';
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

  /**
   * Openstaande voorgeschoten bedragen (U12): uitgaven met advanceFor en zonder repaidAt,
   * gegroepeerd per persoon (naam hoofdletterongevoelig, de naam van de nieuwste post wordt getoond).
   * -> [{ name, totalCents, items: [uitgave, ...] (oudste eerst) }], personen op naam gesorteerd.
   */
  function openAdvances(entries) {
    var groups = {};
    var list = [];
    (entries || []).forEach(function (e) {
      if (!isExpense(e) || isOwnExpense(e) || e.repaidAt) return;
      var name = e.advanceFor.trim();
      var key = name.toLowerCase();
      var g = groups[key];
      if (!g) {
        g = groups[key] = { name: name, totalCents: 0, items: [], latest: '' };
        list.push(g);
      }
      g.totalCents += cents(e);
      g.items.push(e);
      var dt = String(e.datetime || '');
      if (dt >= g.latest) { g.latest = dt; g.name = name; }
    });
    return list.map(function (g) {
      g.items.sort(function (a, b) {
        var x = String(a.datetime || ''), y = String(b.datetime || '');
        return x < y ? -1 : x > y ? 1 : 0;
      });
      return { name: g.name, totalCents: g.totalCents, items: g.items };
    }).sort(function (a, b) {
      var x = a.name.toLowerCase(), y = b.name.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    });
  }

  /** Eerder gebruikte namen bij "Voorgeschoten voor", meest recente eerst, zonder dubbelen (hoofdletterongevoelig). */
  function advanceNames(entries) {
    var sorted = (entries || []).filter(function (e) { return isExpense(e) && !isOwnExpense(e); }).slice().sort(function (a, b) {
      var x = String(a.datetime || ''), y = String(b.datetime || '');
      return x < y ? 1 : x > y ? -1 : 0;
    });
    var seen = {};
    var out = [];
    sorted.forEach(function (e) {
      var name = e.advanceFor.trim();
      if (seen[name.toLowerCase()]) return;
      seen[name.toLowerCase()] = true;
      out.push(name);
    });
    return out;
  }

  // ---------- reflectie (fase 7) ----------

  function addDaysISO(iso, n) {
    var d = parseLocalDateTime(iso);
    if (!d) return null;
    return toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
  }

  function isScore(v) {
    return typeof v === 'number' && v >= 1 && v <= 5;
  }

  function byDatetimeAsc(a, b) {
    var x = String(a.datetime || ''), y = String(b.datetime || '');
    return x < y ? -1 : x > y ? 1 : 0;
  }

  /**
   * Periode voor de reflectie, als { from, to } met "YYYY-MM-DD" (beide inclusief).
   * kind: 'all' (vanaf settings.startDate, geen einde), 'week' (de week van now, maandag t/m zondag),
   * 'lastweek' (de week daarvoor).
   */
  function periodRange(kind, settings, now) {
    var n = toDate(now);
    if (kind === 'week' || kind === 'lastweek') {
      var ws = weekStartOf(n);
      if (kind === 'lastweek') ws = addDaysISO(ws, -7);
      return { from: ws, to: addDaysISO(ws, 6) };
    }
    var s = settings || {};
    return { from: typeof s.startDate === 'string' && s.startDate ? s.startDate.slice(0, 10) : null, to: null };
  }

  /** Aantal verschillende kalenderdagen met minstens één registratie (uitgave of inkomst). */
  function activeDays(entries) {
    var seen = {};
    var n = 0;
    (entries || []).forEach(function (e) {
      if (!(isExpense(e) || isIncome(e)) || typeof e.datetime !== 'string') return;
      var day = e.datetime.slice(0, 10);
      if (!seen[day]) { seen[day] = true; n++; }
    });
    return n;
  }

  /**
   * Gemiddelde van een score-veld ('worth' of 'worthLater') over uitgaven met een geldige score (1-5).
   * -> { average (Number, één decimaal) | null, count }.
   */
  function averageScore(entries, field) {
    var sum = 0, count = 0;
    (entries || []).forEach(function (e) {
      if (!isExpense(e) || !isScore(e[field])) return;
      sum += e[field];
      count++;
    });
    return { average: count ? Math.round((sum / count) * 10) / 10 : null, count: count };
  }

  /**
   * "Minder waard dan gedacht": uitgaven met worthLater < worth.
   * Grootste daling eerst, dan hoogste bedrag, dan oudste.
   */
  function lessWorthThanThought(entries) {
    return (entries || []).filter(function (e) {
      return isExpense(e) && isScore(e.worth) && isScore(e.worthLater) && e.worthLater < e.worth;
    }).sort(function (a, b) {
      var da = a.worth - a.worthLater, db = b.worth - b.worthLater;
      if (db !== da) return db - da;
      if (cents(b) !== cents(a)) return cents(b) - cents(a);
      return byDatetimeAsc(a, b);
    });
  }

  /** Laatste oordeel over een uitgave: de terugkijkscore als die er is, anders de eerste score; anders null. */
  function finalScore(e) {
    if (isScore(e && e.worthLater)) return e.worthLater;
    if (isScore(e && e.worth)) return e.worth;
    return null;
  }

  /**
   * "Laagst gescoord": uitgaven met een score, op laatste oordeel (finalScore) oplopend,
   * bij gelijke score het hoogste bedrag eerst, dan oudste. Standaard de eerste 5.
   */
  function lowestScored(entries, limit) {
    var max = typeof limit === 'number' ? limit : 5;
    return (entries || []).filter(function (e) {
      return isExpense(e) && finalScore(e) !== null;
    }).sort(function (a, b) {
      var sa = finalScore(a), sb = finalScore(b);
      if (sa !== sb) return sa - sb;
      if (cents(b) !== cents(a)) return cents(b) - cents(a);
      return byDatetimeAsc(a, b);
    }).slice(0, max);
  }

  /**
   * Voegt aan groupBy-uitkomsten een aandeel toe: [{ key, totalCents, count, percent }] (percent = geheel getal,
   * afgerond, van het totaal van de lijst). Lege lijst of totaal 0 -> percent 0.
   */
  function withShares(groups) {
    var total = 0;
    (groups || []).forEach(function (g) { total += g.totalCents; });
    return (groups || []).map(function (g) {
      return { key: g.key, totalCents: g.totalCents, count: g.count, percent: total > 0 ? Math.round((g.totalCents / total) * 100) : 0 };
    });
  }

  /**
   * Uitgaven per week voor een grafiek: aaneengesloten weken (maandag) van weekStartOf(from) t/m weekStartOf(to),
   * lege weken met 0. -> [{ weekStart, expenseCents, ownExpenseCents, incomeCents, count }].
   */
  function weekSeries(entries, from, to) {
    var known = {};
    byWeek(entries).forEach(function (w) { known[w.weekStart] = w; });
    var a = parseLocalDateTime(from), b = parseLocalDateTime(to);
    if (!a || !b) return byWeek(entries);
    var ws = weekStartOf(a), end = weekStartOf(b);
    var out = [];
    var guard = 0;
    while (ws <= end && guard < 520) {
      out.push(known[ws] || { weekStart: ws, expenseCents: 0, ownExpenseCents: 0, incomeCents: 0, count: 0 });
      ws = addDaysISO(ws, 7);
      guard++;
    }
    return out;
  }

  /**
   * Samenvatting voor de reflectiepagina over range { from, to } ("YYYY-MM-DD", inclusief; to null = geen einde).
   * Entries vóór settings.startDate tellen nooit mee (net als het saldo, U11); from wordt daarop afgekapt.
   * range.now (optioneel, Date/string): bij to null lopen de weken in de grafiek door tot die datum.
   *
   * Keuze: verdelingen (categorie, vast/variabel, nodig/wil/impuls, stemming), weken-grafiekwaarde,
   * waard-scores en uren werk gaan over EIGEN uitgaven (zonder advanceFor, U12); voorgeschoten bedragen
   * zijn niet voor jezelf. count en activeDays tellen alle registraties (uitgaven en inkomsten).
   *
   * -> { from, to, startBalanceCents, openingCents, closingCents, balanceCents, incomeCents, expenseCents,
   *      ownExpenseCents, advancedCents, repaymentCents, count, activeDays, hoursOfWork (Number|null),
   *      weeks, byCategory, byFixed, byNeed, byMood (met percent), worth, worthLater ({average,count}),
   *      lessWorth, lowest }
   */
  function reflection(settings, entries, range) {
    var s = settings || {};
    var r = range || {};
    var startDate = typeof s.startDate === 'string' && s.startDate ? s.startDate.slice(0, 10) : null;
    var from = r.from ? String(r.from).slice(0, 10) : null;
    if (startDate && (!from || from < startDate)) from = startDate;
    var to = r.to ? String(r.to).slice(0, 10) : null;
    var all = entries || [];

    var inPeriod = all.filter(function (e) { return (isExpense(e) || isIncome(e)) && inRange(e, from, to); });
    var own = inPeriod.filter(isOwnExpense);
    var t = totals(inPeriod);

    // Saldo aan het begin van de periode: startsaldo + alles vanaf startDate tot from.
    var startBalance = typeof s.startBalanceCents === 'number' && isFinite(s.startBalanceCents) ? Math.round(s.startBalanceCents) : 0;
    var opening = startBalance;
    if (from) {
      all.forEach(function (e) {
        if (!inRange(e, startDate, null)) return;
        if (typeof e.datetime !== 'string' || e.datetime.slice(0, 10) >= from) return;
        if (isIncome(e)) opening += cents(e);
        else if (isExpense(e)) opening -= cents(e);
      });
    }

    // Weken voor de grafiek.
    var weekFrom = from, weekTo = to;
    if (!weekFrom || !weekTo) {
      var sorted = inPeriod.slice().sort(byDatetimeAsc);
      if (!weekFrom && sorted.length) weekFrom = sorted[0].datetime.slice(0, 10);
      if (!weekTo) {
        weekTo = sorted.length ? sorted[sorted.length - 1].datetime.slice(0, 10) : weekFrom;
        if (r.now) {
          var nowISO = toISODate(toDate(r.now));
          if (!weekTo || nowISO > weekTo) weekTo = nowISO;
        }
      }
    }
    var weeks = weekFrom && weekTo && weekFrom <= weekTo ? weekSeries(inPeriod, weekFrom, weekTo) : byWeek(inPeriod);

    return {
      from: from,
      to: to,
      startBalanceCents: startBalance,
      openingCents: opening,
      closingCents: opening + t.incomeCents - t.expenseCents,
      balanceCents: balance(s, all),
      incomeCents: t.incomeCents,
      expenseCents: t.expenseCents,
      ownExpenseCents: t.ownExpenseCents,
      advancedCents: t.advancedCents,
      repaymentCents: t.repaymentCents,
      count: t.count,
      activeDays: activeDays(inPeriod),
      hoursOfWork: hoursOfWork(t.ownExpenseCents, s.hourlyWageCents),
      weeks: weeks,
      byCategory: withShares(groupBy(own, 'category')),
      byFixed: withShares(groupBy(own, 'fixed')),
      byNeed: withShares(groupBy(own, 'need')),
      byMood: withShares(groupBy(own, 'mood')),
      worth: averageScore(own, 'worth'),
      worthLater: averageScore(own, 'worthLater'),
      lessWorth: lessWorthThanThought(own),
      lowest: lowestScored(own, 5)
    };
  }

  // ---------- spaardoel ----------

  var MONTHS_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  /** Betaaldag 1-28 (standaard 25). */
  function monthStartDayOf(v) {
    var n = typeof v === 'number' && isFinite(v) ? Math.round(v) : 25;
    return n >= 1 && n <= 28 ? n : 25;
  }

  /**
   * Spaarmaand waarin `date` valt: { from, to } als "YYYY-MM-DD", beide inclusief.
   * Een spaarmaand loopt van monthStartDay tot de dag ervoor in de volgende maand
   * (25 okt t/m 24 nov); met dag 1 is het de kalendermaand. monthStartDay is hooguit 28,
   * dus elke maand heeft die dag.
   */
  function savingsPeriodOf(date, monthStartDay) {
    var d = toDate(date);
    var msd = monthStartDayOf(monthStartDay);
    var y = d.getFullYear(), m = d.getMonth();
    if (d.getDate() < msd) m -= 1;
    var from = new Date(y, m, msd);
    var to = new Date(y, m + 1, msd - 1);
    return { from: toISODate(from), to: toISODate(to) };
  }

  /**
   * Spaarmaanden vanaf de spaarmaand waarin settings.startDate valt t/m die van `now`.
   * Doel: elke spaarmaand eindigt het saldo minstens settings.savingsGoalCents hoger dan
   * aan het eind van de vorige. De eerste (mogelijk gedeeltelijke) spaarmaand wordt
   * vergeleken met het startsaldo; zijn `from` is dan de startdatum (partial: true).
   * Saldo volgt U11 (alleen entries vanaf startDate). endCents = saldo t/m de laatste dag
   * van de spaarmaand (voor de lopende maand dus het saldo nu).
   * Geen doel (0/leeg) of geen startdatum -> [].
   * Elk item: { from, to, startCents, endCents, diffCents, goalCents, achieved, current, partial, daysLeft }
   * (daysLeft alleen bij de lopende maand: dagen tot de nieuwe spaarmaand begint).
   */
  function savingsMonths(settings, entries, now) {
    var s = settings || {};
    var goal = typeof s.savingsGoalCents === 'number' && isFinite(s.savingsGoalCents) ? Math.round(s.savingsGoalCents) : 0;
    if (goal <= 0) return [];
    var startDate = typeof s.startDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s.startDate) ? s.startDate.slice(0, 10) : null;
    if (!startDate) return [];
    var msd = monthStartDayOf(s.monthStartDay);
    var n = toDate(now);
    var today = toISODate(n);
    var startCents = typeof s.startBalanceCents === 'number' && isFinite(s.startBalanceCents) ? Math.round(s.startBalanceCents) : 0;
    var list = (entries || []).filter(function (e) { return inRange(e, startDate, null); });

    var period = savingsPeriodOf(startDate, msd);
    var current = savingsPeriodOf(today, msd);
    if (current.from < period.from) current = period; // klok voor de startdatum: alleen de eerste maand
    var out = [];
    var prevEnd = startCents;
    var guard = 0;
    while (period && guard++ < 1200) {
      var end = startCents;
      var to = period.to;
      list.forEach(function (e) {
        if (!inRange(e, null, to)) return;
        if (isIncome(e)) end += cents(e);
        else if (isExpense(e)) end -= cents(e);
      });
      var isCurrent = period.from === current.from;
      var item = {
        from: out.length === 0 && startDate > period.from ? startDate : period.from,
        to: period.to,
        startCents: prevEnd,
        endCents: end,
        diffCents: end - prevEnd,
        goalCents: goal,
        achieved: end - prevEnd >= goal,
        current: isCurrent,
        partial: out.length === 0 && startDate > period.from,
        daysLeft: null
      };
      if (isCurrent) {
        var t = parseLocalDateTime(today), e2 = parseLocalDateTime(addDaysISO(period.to, 1));
        item.daysLeft = Math.round((e2.getTime() - t.getTime()) / DAY_MS);
      }
      out.push(item);
      if (isCurrent) break;
      prevEnd = end;
      period = savingsPeriodOf(addDaysISO(period.to, 1), msd);
    }
    return out;
  }

  /** { from, to } -> "25 okt – 24 nov" (jaartal erbij als from en to in verschillende jaren vallen en withYear). */
  function formatPeriod(p, withYear) {
    var a = parseLocalDateTime(p && p.from), b = parseLocalDateTime(p && p.to);
    if (!a || !b) return '';
    var left = a.getDate() + ' ' + MONTHS_SHORT[a.getMonth()];
    var right = b.getDate() + ' ' + MONTHS_SHORT[b.getMonth()];
    if (withYear) {
      if (a.getFullYear() !== b.getFullYear()) left += ' ' + a.getFullYear();
      right += ' ' + b.getFullYear();
    }
    return left + ' – ' + right;
  }

  var calc = {
    savingsPeriodOf: savingsPeriodOf,
    savingsMonths: savingsMonths,
    formatPeriod: formatPeriod,
    DAY_MS: DAY_MS,
    periodRange: periodRange,
    activeDays: activeDays,
    averageScore: averageScore,
    lessWorthThanThought: lessWorthThanThought,
    finalScore: finalScore,
    lowestScored: lowestScored,
    withShares: withShares,
    weekSeries: weekSeries,
    reflection: reflection,
    addDaysISO: addDaysISO,
    parseAmount: parseAmount,
    parseSignedAmount: parseSignedAmount,
    parseHours: parseHours,
    wageAmount: wageAmount,
    formatEuro: formatEuro,
    balance: balance,
    totals: totals,
    groupBy: groupBy,
    byWeek: byWeek,
    weekStartOf: weekStartOf,
    hoursOfWork: hoursOfWork,
    formatHours: formatHours,
    hoursLabel: hoursLabel,
    reviewQueue: reviewQueue,
    quickPicks: quickPicks,
    isOwnExpense: isOwnExpense,
    openAdvances: openAdvances,
    advanceNames: advanceNames,
    toISODate: toISODate,
    toLocalDateTime: toLocalDateTime,
    parseLocalDateTime: parseLocalDateTime
  };

  root.Geldboek = root.Geldboek || {};
  root.Geldboek.calc = calc;
  if (typeof module !== 'undefined' && module.exports) module.exports = calc;
})(typeof window !== 'undefined' ? window : globalThis);
