/*
 * Geldboek - tabblad Terugkijken (U13): uitgaven een week na aankoop opnieuw beoordelen.
 *
 * Toont steeds één uitgave uit calc.reviewQueue (oudste eerst):
 *   #review-card (article.card.review-card[data-entry-id]) met .review-date, .review-what,
 *   .review-amount[data-cents], .review-hours (alleen met uurloon), .review-note (argumentatie),
 *   .review-worth[data-worth] (eerste score), vraag #review-question,
 *   knoppen .review-score[data-score="1".."5"] en #review-skip ("Overslaan").
 *   #review-progress: "1 van 3".
 * Een score zet worthLater + worthLaterAt; Overslaan zet worthLaterSkipped: true. Daarna komt de volgende.
 * Lege toestand: p#review-empty.
 * De badge #review-badge op het tabblad werkt app.js bij via store.onChange.
 */
(function (root) {
  'use strict';

  var G = root.Geldboek = root.Geldboek || {};
  var h = G.invoerForm.h;
  var WEEKDAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
  var MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

  var EMPTY_TEXT = 'Niets om terug te kijken. Uitgaven komen hier een week na aankoop.';

  var viewEl = null;

  function longDate(datetime) {
    var d = G.calc.parseLocalDateTime(String(datetime || '').slice(0, 10));
    if (!d) return '';
    var txt = WEEKDAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
    if (d.getFullYear() !== new Date().getFullYear()) txt += ' ' + d.getFullYear();
    return txt;
  }

  function daysAgo(datetime) {
    var d = G.calc.parseLocalDateTime(String(datetime || '').slice(0, 10));
    if (!d) return '';
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var n = Math.round((today.getTime() - d.getTime()) / 86400000);
    return n === 1 ? '1 dag geleden' : n + ' dagen geleden';
  }

  function queue(app) {
    return G.calc.reviewQueue(app.store.listEntries(), new Date());
  }

  function answer(app, id, patch) {
    var saved;
    try {
      saved = app.store.updateEntry(id, patch);
    } catch (err) {
      app.toast('Opslaan mislukt: ' + err.message, 5000);
      return;
    }
    if (!saved) app.toast('Deze uitgave bestaat niet meer.');
    else if (app.store.lastError) app.toast('Let op: opslaan op dit toestel mislukte.', 5000);
    render(app);
    var card = document.getElementById('review-card');
    var target = card || document.getElementById('review-empty');
    if (target && typeof target.focus === 'function') {
      try { target.focus({ preventScroll: true }); } catch (err) { target.focus(); }
    }
    root.scrollTo(0, 0);
  }

  function renderCard(app, e, index, total) {
    var settings = app.store.getSettings();
    var hours = G.calc.hoursLabel(e.amountCents, settings.hourlyWageCents);
    var hasNote = typeof e.note === 'string' && e.note.trim() !== '';

    var scores = h('div', { className: 'chips review-scores', role: 'group', 'aria-labelledby': 'review-question' });
    [1, 2, 3, 4, 5].forEach(function (n) {
      var b = h('button', {
        type: 'button', className: 'chip chip-score review-score', 'data-score': String(n), text: String(n),
        'aria-label': 'Score ' + n + ' van 5'
      });
      b.addEventListener('click', function () {
        answer(app, e.id, { worthLater: n, worthLaterAt: new Date().toISOString(), worthLaterSkipped: false });
      });
      scores.appendChild(b);
    });

    var skip = h('button', { type: 'button', className: 'btn btn-link review-skip', id: 'review-skip', text: 'Overslaan' });
    skip.addEventListener('click', function () {
      answer(app, e.id, { worthLaterSkipped: true });
    });

    return h('article', {
      className: 'card review-card', id: 'review-card', 'data-entry-id': e.id, tabindex: '-1',
      'aria-labelledby': 'review-what'
    }, [
      h('p', { className: 'review-date' }, [
        h('span', { text: longDate(e.datetime) }),
        h('span', { className: 'review-ago', text: ' · ' + daysAgo(e.datetime) })
      ]),
      h('div', { className: 'review-head' }, [
        h('h2', { className: 'review-what', id: 'review-what', text: e.what || '(zonder omschrijving)' }),
        h('div', { className: 'review-money' }, [
          h('span', { className: 'review-amount amount amount-expense', 'data-cents': String(e.amountCents), text: G.calc.formatEuro(e.amountCents) }),
          hours ? h('span', { className: 'review-hours', text: hours }) : null
        ])
      ]),
      h('dl', { className: 'review-facts' }, [
        h('dt', { text: 'Waarom je het kocht' }),
        h('dd', { className: 'review-note' + (hasNote ? '' : ' is-empty'), text: hasNote ? e.note : 'Geen argumentatie ingevuld.' }),
        h('dt', { text: 'Toen gaf je' }),
        h('dd', {
          className: 'review-worth', 'data-worth': e.worth ? String(e.worth) : '',
          text: e.worth ? e.worth + ' van 5' : 'Geen score'
        })
      ]),
      h('p', { className: 'review-question', id: 'review-question', text: 'Was het het geld nog steeds waard?' }),
      scores,
      h('p', { className: 'hint review-scale', text: '1 = zonde van het geld, 5 = zeker waard' }),
      h('div', { className: 'review-foot' }, [
        skip,
        h('span', { className: 'review-progress', id: 'review-progress', text: (index + 1) + ' van ' + total })
      ])
    ]);
  }

  function render(app) {
    if (!viewEl) return;
    viewEl.innerHTML = '';
    var q = queue(app);
    if (!q.length) {
      viewEl.appendChild(h('p', { className: 'placeholder empty', id: 'review-empty', tabindex: '-1', text: EMPTY_TEXT }));
      return;
    }
    viewEl.appendChild(h('p', { className: 'hint review-intro', text: 'Een week later: kijk nog eens naar wat je kocht.' }));
    viewEl.appendChild(renderCard(app, q[0], 0, q.length));
  }

  G.terugkijken = { render: render, EMPTY_TEXT: EMPTY_TEXT };

  G.app.register('terugkijken', {
    init: function (el) {
      viewEl = el;
    },
    show: function (el, app) {
      viewEl = el;
      render(app);
    },
    hide: function () {}
  });
})(window);
