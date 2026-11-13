/*
 * Geldboek - tabblad Overzicht: saldo, totalen deze week/maand, lijst per dag, bewerken/verwijderen.
 *
 * Uitbreidbaar voor latere fases:
 *   Geldboek.overzicht.renderRow(entry, ctx) -> <button class="entry-row">  (ctx: { settings })
 *   Geldboek.overzicht.rowLabels.push(function (entry, ctx) { return [{ text, className }] | null; })
 *     voegt extra kleine labels toe aan elke regel (bijv. "voorgeschoten", "≈ 1,5 uur werk").
 * De bewerkmodus hergebruikt Geldboek.invoerForm.create (uitgave) of .createIncome (inkomst)
 * met idPrefix 'edit-' / formId 'edit-form'.
 * Het bewerkformulier staat alleen in de DOM zolang het open is.
 *
 * Voorgeschoten (U12): kaart #openstaand (section.card.open-card) boven de lijst zolang er iets openstaat;
 * per persoon .open-person[data-person] met .open-total[data-cents] en posten .open-item[data-expense-id]
 * met knop .open-repaid[data-repay-id] ("Terugbetaald"). Labels in de lijst: .tag-advance (.is-open / .is-repaid).
 * In de bewerkmodus van een voorgeschoten uitgave: #edit-repaid-box met #edit-mark-repaid of #edit-undo-repaid.
 */
(function (root) {
  'use strict';

  var G = root.Geldboek = root.Geldboek || {};
  var h = G.invoerForm.h;
  var MINUS = '−';

  var NEED_LABELS = { nodig: 'Nodig', wil: 'Wil', impuls: 'Impuls' };
  var WEEKDAYS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
  var MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  /** Bedrag met teken: "− € 12,50" / "+ € 12,50" (sign: -1, 0, 1). */
  function signedEuro(cents, sign) {
    var abs = G.calc.formatEuro(Math.abs(cents));
    if (sign < 0) return MINUS + ' ' + abs;
    if (sign > 0) return '+ ' + abs;
    return abs;
  }

  /** Saldo/netto: negatief met minteken, positief zonder plus. */
  function balanceText(cents) {
    return cents < 0 ? signedEuro(cents, -1) : G.calc.formatEuro(cents);
  }

  function dayLabel(iso, now) {
    var calc = G.calc;
    var today = calc.toISODate(now);
    var y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (iso === today) return 'Vandaag';
    if (iso === calc.toISODate(y)) return 'Gisteren';
    var d = calc.parseLocalDateTime(iso);
    if (!d) return iso;
    var txt = WEEKDAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
    if (d.getFullYear() !== now.getFullYear()) txt += ' ' + d.getFullYear();
    return txt;
  }

  /** Standaardlabels: need en "Vast" (variabel is de standaard en krijgt geen label). */
  function baseLabels(e) {
    var out = [];
    if (e.type === 'expense') {
      if (e.need && NEED_LABELS[e.need]) out.push({ text: NEED_LABELS[e.need], className: 'tag-need tag-' + e.need });
      if (e.fixed === 'vast') out.push({ text: 'Vast', className: 'tag-fixed' });
    }
    return out;
  }

  var rowLabels = [];

  // Label "voorgeschoten · open" / "voorgeschoten · terug" (U12).
  rowLabels.push(function (e) {
    if (e.type !== 'expense' || !e.advanceFor) return null;
    return e.repaidAt
      ? [{ text: 'voorgeschoten · terug', className: 'tag-advance is-repaid' }]
      : [{ text: 'voorgeschoten · open', className: 'tag-advance is-open' }];
  });

  function shortDate(iso) {
    var d = G.calc.parseLocalDateTime(String(iso || '').slice(0, 10));
    return d ? d.getDate() + ' ' + MONTHS[d.getMonth()] : '';
  }

  /** Kaart Openstaand (null als er niets openstaat). */
  function renderOpen(entries) {
    var groups = G.calc.openAdvances(entries);
    if (!groups.length) return null;
    var card = h('section', { className: 'card open-card', id: 'openstaand', 'aria-labelledby': 'openstaand-title' }, [
      h('h2', { className: 'card-title', id: 'openstaand-title', text: 'Openstaand' })
    ]);
    groups.forEach(function (g) {
      var items = h('ul', { className: 'open-items' });
      g.items.forEach(function (e) {
        items.appendChild(h('li', { className: 'open-item', 'data-expense-id': e.id }, [
          h('span', { className: 'open-item-main' }, [
            h('span', { className: 'open-item-what', text: e.what || '(zonder omschrijving)' }),
            h('span', { className: 'open-item-date', text: shortDate(e.datetime) })
          ]),
          h('span', { className: 'open-item-amount amount', 'data-cents': String(e.amountCents), text: G.calc.formatEuro(e.amountCents) }),
          h('button', {
            type: 'button', className: 'btn btn-small open-repaid', 'data-repay-id': e.id, text: 'Terugbetaald',
            'aria-label': 'Terugbetaald: ' + (e.what || '') + ', ' + G.calc.formatEuro(e.amountCents) + ' door ' + g.name
          })
        ]));
      });
      card.appendChild(h('div', { className: 'open-person', 'data-person': g.name }, [
        h('div', { className: 'open-head' }, [
          h('span', { className: 'open-name', text: g.name }),
          h('span', { className: 'open-total amount', 'data-cents': String(g.totalCents), text: G.calc.formatEuro(g.totalCents) })
        ]),
        items
      ]));
    });
    return card;
  }

  function markRepaid(app, id) {
    var exp = app.store.getEntry(id);
    try {
      app.store.markRepaid(id);
    } catch (err) {
      app.toast(err.message, 4000);
      return false;
    }
    if (app.store.lastError) app.toast('Let op: opslaan op dit toestel mislukte.', 5000);
    else app.toast('Terugbetaald: ' + G.calc.formatEuro(exp.amountCents) + ' van ' + exp.advanceFor);
    return true;
  }

  function renderRow(e, ctx) {
    var isIncome = e.type === 'income';
    var labels = baseLabels(e);
    rowLabels.forEach(function (fn) {
      try {
        var extra = fn(e, ctx || {});
        if (extra && extra.length) labels = labels.concat(extra);
      } catch (err) { /* een kapotte uitbreiding mag de lijst niet breken */ }
    });

    var meta = h('span', { className: 'entry-meta' });
    var sub = isIncome ? (e.source ? 'Inkomst · ' + e.source : 'Inkomst') : (e.category || 'Geen categorie');
    meta.appendChild(h('span', { className: 'entry-cat', text: sub }));
    labels.forEach(function (l) {
      meta.appendChild(h('span', { className: 'tag' + (l.className ? ' ' + l.className : ''), text: l.text }));
    });

    return h('button', {
      type: 'button',
      className: 'entry-row ' + (isIncome ? 'is-income' : 'is-expense'),
      'data-entry-id': e.id,
      'aria-label': (e.what || '') + ', ' + signedEuro(e.amountCents, isIncome ? 1 : -1) + ', bewerken'
    }, [
      h('span', { className: 'entry-main' }, [
        h('span', { className: 'entry-what', text: e.what || '(zonder omschrijving)' }),
        meta
      ]),
      h('span', { className: 'entry-side' }, [
        h('span', { className: 'entry-amount amount ' + (isIncome ? 'amount-income' : 'amount-expense'), 'data-cents': String(isIncome ? e.amountCents : -e.amountCents), text: signedEuro(e.amountCents, isIncome ? 1 : -1) }),
        h('span', { className: 'entry-time', text: (e.datetime || '').slice(11, 16) })
      ])
    ]);
  }

  function periodTile(id, title, t) {
    var tile = h('div', { className: 'stat', id: id, 'data-expense-cents': String(t.expenseCents), 'data-income-cents': String(t.incomeCents) }, [
      h('span', { className: 'stat-title', text: title }),
      h('span', { className: 'stat-value amount-expense', text: signedEuro(t.expenseCents, t.expenseCents ? -1 : 0) }),
      h('span', { className: 'stat-sub', text: 'uitgegeven' })
    ]);
    if (t.incomeCents) tile.appendChild(h('span', { className: 'stat-sub amount-income', text: signedEuro(t.incomeCents, 1) + ' binnen' }));
    return tile;
  }

  function renderSummary(app, entries, now) {
    var calc = G.calc;
    var settings = app.store.getSettings();
    var bal = calc.balance(settings, entries);
    var weekFrom = calc.weekStartOf(now);
    var wf = calc.parseLocalDateTime(weekFrom);
    var weekTo = calc.toISODate(new Date(wf.getFullYear(), wf.getMonth(), wf.getDate() + 6));
    var monthFrom = calc.toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
    var monthTo = calc.toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    return h('section', { className: 'summary', 'aria-label': 'Saldo en totalen' }, [
      h('div', { className: 'balance' }, [
        h('span', { className: 'stat-title', text: 'Saldo' }),
        h('span', { className: 'balance-value' + (bal < 0 ? ' is-negative' : ''), id: 'balance', 'data-cents': String(bal), text: balanceText(bal) })
      ]),
      h('div', { className: 'stats' }, [
        periodTile('total-week', 'Deze week', calc.totals(entries, { from: weekFrom, to: weekTo })),
        periodTile('total-month', 'Deze maand', calc.totals(entries, { from: monthFrom, to: monthTo }))
      ])
    ]);
  }

  function renderList(app, entries, now) {
    var ctx = { settings: app.store.getSettings() };
    var wrap = h('div', { className: 'entry-list', id: 'entry-list' });
    var groups = [];
    var byDay = {};
    entries.forEach(function (e) {
      var day = (e.datetime || '').slice(0, 10);
      if (!byDay[day]) {
        byDay[day] = { day: day, items: [], net: 0 };
        groups.push(byDay[day]);
      }
      byDay[day].items.push(e);
      byDay[day].net += e.type === 'income' ? e.amountCents : -e.amountCents;
    });
    groups.forEach(function (g) {
      var list = h('div', { className: 'day-items' });
      g.items.forEach(function (e) { list.appendChild(renderRow(e, ctx)); });
      wrap.appendChild(h('section', { className: 'day', 'data-day': g.day }, [
        h('h2', { className: 'day-head' }, [
          h('span', { className: 'day-label', text: dayLabel(g.day, now) }),
          h('span', {
            className: 'day-total amount ' + (g.net < 0 ? 'amount-expense' : g.net > 0 ? 'amount-income' : ''),
            'data-cents': String(g.net),
            text: signedEuro(g.net, g.net < 0 ? -1 : g.net > 0 ? 1 : 0)
          })
        ]),
        list
      ]));
    });
    return wrap;
  }

  // ---- tabblad ----

  var listView = null;
  var editView = null;
  var editForm = null;
  var editingId = null;
  var sectionTitle = 'Overzicht';

  function setTitle(text) {
    var t = document.getElementById('view-title');
    if (t) t.textContent = text;
  }

  function render(app) {
    var entries = app.store.listEntries();
    var now = new Date();
    listView.innerHTML = '';
    listView.appendChild(renderSummary(app, entries, now));
    if (!entries.length) {
      listView.appendChild(h('p', { className: 'placeholder empty', id: 'overzicht-empty', text: 'Nog niets vastgelegd. Tik op Invoer om je eerste uitgave toe te voegen.' }));
      return;
    }
    var open = renderOpen(entries);
    if (open) listView.appendChild(open);
    listView.appendChild(renderList(app, entries, now));
  }

  function closeEdit(app) {
    if (editView && editView.parentNode) editView.parentNode.removeChild(editView);
    editView = null;
    editForm = null;
    editingId = null;
    if (listView) listView.hidden = false;
    setTitle(sectionTitle);
    if (app) render(app);
  }

  function openEdit(app, el, id) {
    var entry = app.store.getEntry(id);
    if (!entry) { render(app); return; }
    closeEdit(null);
    editingId = id;

    var formOpts = {
      submitLabel: 'Opslaan',
      idPrefix: 'edit-',
      formId: 'edit-form',
      onSubmit: function (fields) {
        var patch = {};
        Object.keys(fields).forEach(function (k) { if (k !== 'type') patch[k] = fields[k]; });
        var saved;
        try {
          saved = app.store.updateEntry(editingId, patch);
        } catch (err) {
          app.toast('Opslaan mislukt: ' + err.message, 5000);
          return;
        }
        if (!saved) app.toast('Deze regel bestaat niet meer.');
        else if (app.store.lastError) app.toast('Let op: opslaan op dit toestel mislukte.', 5000);
        else app.toast('Bijgewerkt: ' + G.calc.formatEuro(saved.amountCents) + ' — ' + saved.what);
        closeEdit(app);
        root.scrollTo(0, 0);
      }
    };
    if (entry.type === 'income') {
      formOpts.getHourlyWageCents = function () { return app.store.getSettings().hourlyWageCents; };
      editForm = G.invoerForm.createIncome(formOpts);
    } else {
      formOpts.categories = app.store.getSettings().categories;
      formOpts.getAdvanceNames = function () { return G.calc.advanceNames(app.store.listEntries()); };
      editForm = G.invoerForm.create(formOpts);
    }
    editForm.fill(entry);

    var back = h('button', { type: 'button', className: 'btn btn-link', id: 'edit-back', text: '‹ Terug' });
    back.addEventListener('click', function () { closeEdit(app); root.scrollTo(0, 0); });

    var del = h('button', { type: 'button', className: 'btn btn-danger btn-block', id: 'edit-delete', text: 'Verwijderen' });
    del.addEventListener('click', function () {
      var cur = app.store.getEntry(editingId);
      var label = cur ? (cur.what + ' (' + G.calc.formatEuro(cur.amountCents) + ')') : 'deze regel';
      if (!app.confirm('Weet je zeker dat je ' + label + ' wilt verwijderen?')) return;
      var linked = cur && cur.type === 'expense' ? app.store.linkedIncome(editingId) : null;
      var withLinked = false;
      if (linked) {
        withLinked = app.confirm('Deze uitgave is terugbetaald (' + G.calc.formatEuro(linked.amountCents) +
          ' als inkomst). Wil je die terugbetaling ook verwijderen?\n\nOK = ook verwijderen, Annuleren = inkomst laten staan.');
      }
      app.store.deleteEntry(editingId, { withLinked: withLinked });
      if (app.store.lastError) app.toast('Let op: opslaan op dit toestel mislukte.', 5000);
      else app.toast('Verwijderd: ' + label);
      closeEdit(app);
      root.scrollTo(0, 0);
    });

    var repaidBox = entry.type === 'expense' && entry.advanceFor ? renderRepaidBox(app, el, entry) : null;

    editView = h('div', { className: 'edit-view', id: 'edit-view', 'data-editing': id }, [
      h('div', { className: 'edit-head' }, [back]),
      repaidBox,
      editForm.el,
      h('div', { className: 'edit-danger' }, [del])
    ]);
    listView.hidden = true;
    el.appendChild(editView);
    setTitle(entry.type === 'income' ? 'Inkomst bewerken' : 'Uitgave bewerken');
    root.scrollTo(0, 0);
  }

  /** Blok in de bewerkmodus van een voorgeschoten uitgave: terugbetaald markeren of ongedaan maken. */
  function renderRepaidBox(app, el, entry) {
    var box = h('div', { className: 'card repaid-box', id: 'edit-repaid-box', 'data-state': entry.repaidAt ? 'repaid' : 'open' });
    var who = entry.advanceFor;
    if (entry.repaidAt) {
      var at = new Date(entry.repaidAt);
      var when = isNaN(at.getTime()) ? '' : ' op ' + at.getDate() + ' ' + MONTHS[at.getMonth()];
      box.appendChild(h('p', { className: 'repaid-text', text: 'Voorgeschoten voor ' + who + ' · terugbetaald' + when + '.' }));
      var undo = h('button', { type: 'button', className: 'btn btn-small', id: 'edit-undo-repaid', text: 'Terugbetaling ongedaan maken' });
      undo.addEventListener('click', function () {
        var curId = editingId;
        app.store.undoRepaid(curId);
        if (app.store.lastError) app.toast('Let op: opslaan op dit toestel mislukte.', 5000);
        else app.toast('Terugbetaling ongedaan gemaakt. ' + who + ' staat weer open.');
        openEdit(app, el, curId);
      });
      box.appendChild(undo);
    } else {
      box.appendChild(h('p', { className: 'repaid-text', text: 'Voorgeschoten voor ' + who + ' · nog niet terugbetaald.' }));
      var mark = h('button', { type: 'button', className: 'btn btn-small', id: 'edit-mark-repaid', text: 'Terugbetaald' });
      mark.addEventListener('click', function () {
        var curId = editingId;
        if (markRepaid(app, curId)) openEdit(app, el, curId);
      });
      box.appendChild(mark);
    }
    return box;
  }

  G.overzicht = {
    renderRow: renderRow,
    rowLabels: rowLabels,
    signedEuro: signedEuro,
    dayLabel: dayLabel
  };

  G.app.register('overzicht', {
    init: function (el, app) {
      sectionTitle = el.getAttribute('data-title') || 'Overzicht';
      listView = h('div', { className: 'list-view', id: 'list-view' });
      listView.addEventListener('click', function (ev) {
        var t = ev.target;
        while (t && t !== listView) {
          if (t.getAttribute && t.getAttribute('data-repay-id')) {
            markRepaid(app, t.getAttribute('data-repay-id'));
            render(app);
            return;
          }
          if (t.getAttribute && t.getAttribute('data-entry-id')) {
            openEdit(app, el, t.getAttribute('data-entry-id'));
            return;
          }
          t = t.parentNode;
        }
      });
      el.appendChild(listView);
    },
    show: function (el, app) {
      closeEdit(app);
    },
    hide: function () {
      closeEdit(null);
    }
  });
})(window);
