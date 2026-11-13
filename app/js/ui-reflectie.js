/*
 * Geldboek - tabblad Reflectie (fase 7): de periode samengevat als basis voor het reflectiegesprek.
 *
 * Periode-keuze #refl-period (.seg) met knoppen [data-period="all" | "week" | "lastweek"] (aria-pressed).
 * #refl-range: tekst met de gekozen periode.
 * Kerncijfers (#refl-key): #refl-start en #refl-end (saldo begin -> eind, data-cents), #refl-income,
 *   #refl-own-expense, #refl-count, #refl-days, #refl-hours (alleen met uurloon). Bedragen hebben data-cents.
 * Uitgaven per week: svg#refl-weeks-chart met staven .chart-bar[data-week][data-cents] + tabel in <details>.
 * Verdelingen: #refl-by-category, #refl-by-fixed, #refl-by-need, #refl-by-mood met rijen .hbar-row[data-key]
 *   (.hbar-label, .hbar-value, svg.hbar met rect.chart-bar).
 * Waard-scores: #refl-worth-avg, #refl-worth-later-avg, lijsten #refl-less-worth en #refl-lowest (li[data-entry-id]).
 * Reflectievragen: #refl-questions.
 *
 * Alle cijfers komen uit calc.reflection. Verdelingen, weken, waard-scores en uren werk gaan over
 * eigen uitgaven (zonder advanceFor, U12). Grafieken zijn inline SVG zonder library (U16); kleuren
 * komen uit CSS-variabelen (--chart-bar, --chart-track, --chart-grid) en volgen het thema.
 */
(function (root) {
  'use strict';

  var G = root.Geldboek = root.Geldboek || {};
  var h = G.invoerForm.h;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  var MONTHS_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  var PERIODS = [
    { key: 'all', label: 'Hele periode' },
    { key: 'week', label: 'Deze week' },
    { key: 'lastweek', label: 'Vorige week' }
  ];

  var QUESTIONS = [
    'Welke uitgave zou je niet opnieuw doen?',
    'Waar verraste het totaal je?',
    'Wat wil je volgende maand anders doen?',
    'Heeft het bijhouden je gedrag veranderd?'
  ];

  var LABELS = {
    category: { 'null': 'Geen categorie' },
    fixed: { vast: 'Vast', variabel: 'Variabel', 'null': 'Niet ingevuld' },
    need: { nodig: 'Nodig', wil: 'Wil', impuls: 'Impuls', 'null': 'Niet ingevuld' },
    mood: { verveeld: 'Verveeld', gestrest: 'Gestrest', sociaal: 'Sociaal', blij: 'Blij', moe: 'Moe', neutraal: 'Neutraal', 'null': 'Geen stemming' }
  };

  var period = 'all';
  var viewEl = null;
  var appRef = null;
  var unsubscribe = null;

  // ---------- hulpjes ----------

  function svg(tag, attrs, children) {
    var el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'text') el.textContent = v;
        else el.setAttribute(k, String(v));
      });
    }
    (children || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }

  function euro(c) { return G.calc.formatEuro(c); }

  /** Afgerond op hele euro's voor op een staaf: "€ 820", "€ 1.234". */
  function euroShort(c) {
    var n = Math.round(Math.abs(c) / 100);
    var s = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (c < 0 ? '€ -' : '€ ') + s;
  }

  function dateLong(iso) {
    var d = G.calc.parseLocalDateTime(String(iso || '').slice(0, 10));
    if (!d) return '';
    var txt = d.getDate() + ' ' + MONTHS[d.getMonth()];
    if (d.getFullYear() !== new Date().getFullYear()) txt += ' ' + d.getFullYear();
    return txt;
  }

  function dateShort(iso) {
    var d = G.calc.parseLocalDateTime(String(iso || '').slice(0, 10));
    return d ? d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] : '';
  }

  function score1(n) {
    return n === null || n === undefined ? '-' : String(n).replace('.', ',');
  }

  function labelFor(group, key) {
    var map = LABELS[group] || {};
    var k = key === null || key === undefined ? 'null' : String(key);
    return map[k] || String(key);
  }

  function rangeText(r) {
    if (period === 'all') return r.from ? 'Vanaf ' + dateLong(r.from) + ' (startdatum) tot nu' : 'Alles tot nu';
    return dateLong(r.from) + ' t/m ' + dateLong(r.to);
  }

  // ---------- onderdelen ----------

  function periodSwitch(app) {
    var wrap = h('div', { className: 'seg refl-period', id: 'refl-period', role: 'group', 'aria-label': 'Periode' });
    PERIODS.forEach(function (p) {
      var b = h('button', {
        type: 'button', className: 'seg-btn', 'data-period': p.key, text: p.label,
        'aria-pressed': p.key === period ? 'true' : 'false'
      });
      b.addEventListener('click', function () {
        if (period === p.key) return;
        period = p.key;
        render(app);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  function stat(id, title, value, attrs, sub) {
    var v = h('span', Object.assign({ className: 'stat-value', id: id, text: value }, attrs || {}));
    return h('div', { className: 'stat' }, [
      h('span', { className: 'stat-title', text: title }),
      v,
      sub ? h('span', { className: 'stat-sub', text: sub }) : null
    ]);
  }

  function keyFigures(r, settings) {
    var all = period === 'all';
    var balanceRow = h('div', { className: 'refl-balance' }, [
      h('span', { className: 'stat-title', text: all ? 'Startsaldo → huidig saldo' : 'Saldo begin → eind van de week' }),
      h('p', { className: 'refl-balance-values' }, [
        h('span', { id: 'refl-start', 'data-cents': String(r.openingCents), className: r.openingCents < 0 ? 'is-negative' : '', text: euro(r.openingCents) }),
        h('span', { className: 'refl-arrow', 'aria-hidden': 'true', text: ' → ' }),
        h('span', { className: 'visually-hidden', text: ' naar ' }),
        h('span', { id: 'refl-end', 'data-cents': String(r.closingCents), className: r.closingCents < 0 ? 'is-negative' : '', text: euro(r.closingCents) })
      ])
    ]);
    var tiles = [
      stat('refl-income', 'Inkomsten', euro(r.incomeCents), { 'data-cents': String(r.incomeCents), className: 'stat-value amount-income' }),
      stat('refl-own-expense', 'Eigen uitgaven', euro(r.ownExpenseCents), { 'data-cents': String(r.ownExpenseCents), className: 'stat-value amount-expense' },
        r.advancedCents ? '+ ' + euro(r.advancedCents) + ' voorgeschoten' : null),
      stat('refl-count', 'Registraties', String(r.count), { 'data-count': String(r.count) }),
      stat('refl-days', 'Dagen met registratie', String(r.activeDays), { 'data-count': String(r.activeDays) })
    ];
    if (r.hoursOfWork !== null) {
      tiles.push(stat('refl-hours', 'Uren werk', '≈ ' + G.calc.formatHours(r.hoursOfWork) + ' uur',
        { 'data-hours': String(r.hoursOfWork) }, 'eigen uitgaven ÷ uurloon ' + euro(settings.hourlyWageCents)));
    }
    return h('section', { className: 'card refl-card', id: 'refl-key', 'aria-labelledby': 'refl-key-title' }, [
      h('h2', { className: 'card-title', id: 'refl-key-title', text: 'Kerncijfers' }),
      balanceRow,
      h('div', { className: 'refl-stats' }, tiles)
    ]);
  }

  /** Kolommen per week: één reeks (eigen uitgaven), dus één kleur en geen legenda. */
  function weekChart(weeks) {
    var W = 320, H = 180, top = 22, bottom = 26, side = 6;
    var base = H - bottom;
    var n = weeks.length;
    var max = 0;
    weeks.forEach(function (w) { if (w.ownExpenseCents > max) max = w.ownExpenseCents; });
    var slot = (W - 2 * side) / Math.max(n, 1);
    var barW = Math.max(6, Math.min(24, slot * 0.55));
    var labelAll = n <= 6;
    var xEvery = Math.max(1, Math.ceil(n / 6));

    var chart = svg('svg', {
      id: 'refl-weeks-chart', class: 'chart chart-weeks', viewBox: '0 0 ' + W + ' ' + H, width: '100%',
      role: 'img', 'aria-label': 'Eigen uitgaven per week: ' + weeks.map(function (w) {
        return 'week van ' + dateShort(w.weekStart) + ' ' + euro(w.ownExpenseCents);
      }).join(', '),
      preserveAspectRatio: 'xMidYMid meet'
    });
    chart.appendChild(svg('line', { class: 'chart-axis', x1: side, x2: W - side, y1: base + 0.5, y2: base + 0.5 }));

    weeks.forEach(function (w, i) {
      var cx = side + slot * i + slot / 2;
      var hgt = max > 0 ? Math.round((w.ownExpenseCents / max) * (base - top)) : 0;
      if (w.ownExpenseCents > 0 && hgt < 2) hgt = 2;
      var x = cx - barW / 2, y = base - hgt;
      var g = svg('g', { class: 'chart-col' });
      g.appendChild(svg('title', { text: 'Week van ' + dateLong(w.weekStart) + ': ' + euro(w.ownExpenseCents) }));
      // Ruim raakvlak voor de tooltip (groter dan de staaf).
      g.appendChild(svg('rect', { class: 'chart-hit', x: side + slot * i, y: top - 18, width: slot, height: base - top + 18, fill: 'transparent' }));
      if (hgt > 0) {
        var rr = Math.min(4, hgt, barW / 2);
        g.appendChild(svg('path', {
          class: 'chart-bar', 'data-week': w.weekStart, 'data-cents': String(w.ownExpenseCents),
          d: 'M' + x + ',' + base + 'V' + (y + rr) + 'Q' + x + ',' + y + ' ' + (x + rr) + ',' + y +
            'H' + (x + barW - rr) + 'Q' + (x + barW) + ',' + y + ' ' + (x + barW) + ',' + (y + rr) + 'V' + base + 'Z'
        }));
      }
      var isMax = w.ownExpenseCents === max && max > 0;
      if (labelAll || isMax) {
        g.appendChild(svg('text', { class: 'chart-value', x: cx, y: y - 6, 'text-anchor': 'middle', text: euroShort(w.ownExpenseCents) }));
      }
      if (i % xEvery === 0) {
        g.appendChild(svg('text', { class: 'chart-label', x: cx, y: H - 8, 'text-anchor': 'middle', text: dateShort(w.weekStart) }));
      }
      chart.appendChild(g);
    });
    return chart;
  }

  function weekTable(weeks) {
    var body = h('tbody', null, weeks.map(function (w) {
      return h('tr', null, [h('td', { text: 'Week van ' + dateLong(w.weekStart) }), h('td', { className: 'num', text: euro(w.ownExpenseCents) })]);
    }));
    return h('details', { className: 'chart-table' }, [
      h('summary', { text: 'Als tabel' }),
      h('table', null, [h('thead', null, [h('tr', null, [h('th', { text: 'Week' }), h('th', { className: 'num', text: 'Eigen uitgaven' })])]), body])
    ]);
  }

  function weeksCard(r) {
    var hasData = r.weeks.some(function (w) { return w.ownExpenseCents > 0; });
    return h('section', { className: 'card refl-card', id: 'refl-weeks', 'aria-labelledby': 'refl-weeks-title' }, [
      h('h2', { className: 'card-title', id: 'refl-weeks-title', text: 'Uitgaven per week' }),
      h('p', { className: 'hint', text: 'Eigen uitgaven, week begint op maandag.' }),
      hasData ? weekChart(r.weeks) : h('p', { className: 'refl-empty', text: 'Geen uitgaven in deze periode.' }),
      hasData ? weekTable(r.weeks) : null
    ]);
  }

  /** Horizontale staaf: lengte = aandeel; ronde kop, rechte basis. */
  function hbar(percent, cents) {
    var p = percent;
    if (cents > 0 && p < 1) p = 1;
    var s = svg('svg', { class: 'hbar', width: '100%', height: '10', 'aria-hidden': 'true', focusable: 'false' });
    s.appendChild(svg('rect', { class: 'chart-track', x: 0, y: 0, width: '100%', height: 10, rx: 5 }));
    if (p > 0) {
      s.appendChild(svg('rect', { class: 'chart-bar', x: 0, y: 0, width: p + '%', height: 10, rx: 4, 'data-cents': String(cents) }));
      s.appendChild(svg('rect', { class: 'chart-bar chart-bar-base', x: 0, y: 0, width: (p / 2) + '%', height: 10 }));
    }
    return s;
  }

  function distribution(id, title, group, rows) {
    var list = h('ul', { className: 'hbar-list', id: id });
    rows.forEach(function (g) {
      var label = labelFor(group, g.key);
      list.appendChild(h('li', {
        className: 'hbar-row', 'data-key': g.key === null ? '' : String(g.key), 'data-cents': String(g.totalCents), 'data-percent': String(g.percent)
      }, [
        h('div', { className: 'hbar-text' }, [
          h('span', { className: 'hbar-label', text: label }),
          h('span', { className: 'hbar-value' }, [
            h('span', { className: 'hbar-amount', text: euro(g.totalCents) }),
            h('span', { className: 'hbar-percent', text: g.percent + '%' })
          ])
        ]),
        hbar(g.percent, g.totalCents)
      ]));
    });
    return h('div', { className: 'refl-dist' }, [
      h('h3', { className: 'refl-subtitle', text: title }),
      rows.length ? list : h('p', { className: 'refl-empty', text: 'Geen uitgaven in deze periode.' })
    ]);
  }

  function entryItem(e, settings, scoreText) {
    var hours = G.calc.hoursLabel(e.amountCents, settings.hourlyWageCents);
    return h('li', { className: 'refl-item', 'data-entry-id': e.id }, [
      h('div', { className: 'refl-item-main' }, [
        h('span', { className: 'refl-item-what', text: e.what || '(zonder omschrijving)' }),
        h('span', { className: 'refl-item-meta', text: dateShort(e.datetime) + (hours ? ' · ' + hours : '') })
      ]),
      h('div', { className: 'refl-item-side' }, [
        h('span', { className: 'refl-item-amount', text: euro(e.amountCents) }),
        h('span', { className: 'refl-item-score', text: scoreText })
      ])
    ]);
  }

  function worthCard(r, settings) {
    var less = h('ul', { className: 'refl-list', id: 'refl-less-worth' }, r.lessWorth.map(function (e) {
      return entryItem(e, settings, 'score ' + e.worth + ' → ' + e.worthLater);
    }));
    var lowest = h('ol', { className: 'refl-list', id: 'refl-lowest' }, r.lowest.map(function (e) {
      var later = e.worthLater !== null && e.worthLater !== undefined;
      return entryItem(e, settings, 'score ' + (later ? e.worthLater + ' (eerst ' + e.worth + ')' : e.worth));
    }));
    return h('section', { className: 'card refl-card', id: 'refl-worth', 'aria-labelledby': 'refl-worth-title' }, [
      h('h2', { className: 'card-title', id: 'refl-worth-title', text: 'Was het het waard?' }),
      h('div', { className: 'refl-stats' }, [
        stat('refl-worth-avg', 'Gemiddeld bij aankoop', score1(r.worth.average), { 'data-average': r.worth.average === null ? '' : String(r.worth.average) },
          r.worth.count ? 'van 5, ' + r.worth.count + (r.worth.count === 1 ? ' score' : ' scores') : 'nog geen scores'),
        stat('refl-worth-later-avg', 'Gemiddeld een week later', score1(r.worthLater.average), { 'data-average': r.worthLater.average === null ? '' : String(r.worthLater.average) },
          r.worthLater.count ? 'van 5, ' + r.worthLater.count + (r.worthLater.count === 1 ? ' score' : ' scores') : 'nog niet teruggekeken')
      ]),
      h('h3', { className: 'refl-subtitle', text: 'Minder waard dan gedacht' }),
      r.lessWorth.length ? less : h('p', { className: 'refl-empty', text: 'Geen uitgaven die achteraf tegenvielen.' }),
      h('h3', { className: 'refl-subtitle', text: 'Laagst gescoord' }),
      r.lowest.length ? lowest : h('p', { className: 'refl-empty', text: 'Nog geen uitgaven met een score.' })
    ]);
  }

  function questionsCard() {
    return h('section', { className: 'card refl-card', id: 'refl-questions-card', 'aria-labelledby': 'refl-questions-title' }, [
      h('h2', { className: 'card-title', id: 'refl-questions-title', text: 'Om samen te bespreken' }),
      h('ol', { className: 'refl-questions', id: 'refl-questions' }, QUESTIONS.map(function (q) { return h('li', { text: q }); }))
    ]);
  }

  // ---------- tekenen ----------

  function render(app) {
    if (!viewEl) return;
    var settings = app.store.getSettings();
    var entries = app.store.listEntries();
    var now = new Date();
    var range = G.calc.periodRange(period, settings, now);
    var r = G.calc.reflection(settings, entries, { from: range.from, to: range.to, now: now });

    viewEl.innerHTML = '';
    viewEl.setAttribute('data-period', period);
    viewEl.appendChild(periodSwitch(app));
    viewEl.appendChild(h('p', { className: 'hint refl-range', id: 'refl-range', text: rangeText(r) }));
    viewEl.appendChild(keyFigures(r, settings));
    viewEl.appendChild(weeksCard(r));
    viewEl.appendChild(h('section', { className: 'card refl-card', id: 'refl-distribution', 'aria-labelledby': 'refl-dist-title' }, [
      h('h2', { className: 'card-title', id: 'refl-dist-title', text: 'Waar ging het naartoe?' }),
      h('p', { className: 'hint', text: 'Eigen uitgaven; voorgeschoten bedragen tellen niet mee.' }),
      distribution('refl-by-category', 'Per categorie', 'category', r.byCategory),
      distribution('refl-by-fixed', 'Vast of variabel', 'fixed', r.byFixed),
      distribution('refl-by-need', 'Nodig, wil of impuls', 'need', r.byNeed)
    ]));
    viewEl.appendChild(worthCard(r, settings));
    viewEl.appendChild(h('section', { className: 'card refl-card', id: 'refl-mood', 'aria-labelledby': 'refl-mood-title' }, [
      h('h2', { className: 'card-title', id: 'refl-mood-title', text: 'Stemming' }),
      h('p', { className: 'hint', text: 'Hoeveel je uitgaf per stemming.' }),
      distribution('refl-by-mood', 'Bedrag per stemming', 'mood', r.byMood)
    ]));
    viewEl.appendChild(questionsCard());
  }

  G.reflectie = { render: render, QUESTIONS: QUESTIONS };

  G.app.register('reflectie', {
    init: function (el, app) {
      viewEl = el;
      appRef = app;
    },
    show: function (el, app) {
      viewEl = el;
      appRef = app;
      if (!unsubscribe) {
        unsubscribe = app.store.onChange(function () {
          if (appRef && appRef.current() === 'reflectie') render(appRef);
        });
      }
      render(app);
    },
    hide: function () {
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    }
  });
})(window);
