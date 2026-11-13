/*
 * Geldboek - Instellingen (#instellingen, tandwiel rechtsboven).
 * Het scherm bestaat uit blokken (kaarten), in volgorde van Geldboek.instellingen.blocks:
 *   { id: 'saldo', title, render(app, refresh) -> Element }
 * Ingebouwd: 'saldo' (startsaldo, startdatum, uurloon, spaardoel #s-goal, betaaldag #s-month-start) en 'categorieen'.
 * Latere fases voegen een blok toe met Geldboek.instellingen.blocks.push({ id: 'gegevens', title: 'Gegevens', render: fn })
 * vanuit hun eigen script (na dit bestand geladen). Elk blok wordt bij elk tonen opnieuw opgebouwd;
 * refresh() bouwt het hele scherm opnieuw op (bijv. na een wijziging).
 */
(function (root) {
  'use strict';

  var G = root.Geldboek = root.Geldboek || {};
  var h = G.invoerForm.h;

  function hint(id, text) {
    return h('p', { className: 'hint', id: id, text: text });
  }

  function errEl(id) {
    return h('p', { className: 'error', id: id, 'aria-live': 'polite', hidden: true });
  }

  function setFieldError(fieldEl, err, msg) {
    fieldEl.classList.toggle('invalid', !!msg);
    err.textContent = msg || '';
    err.hidden = !msg;
  }

  // ---- blok: saldo ----

  function renderSaldo(app) {
    var calc = G.calc;
    var form = G.invoerForm;
    var s = app.store.getSettings();

    var balance = form.signedAmountField({ id: 's-start-balance', label: 'Startsaldo' });
    balance.input.value = form.centsToInput(Math.abs(s.startBalanceCents));
    if (s.startBalanceCents < 0) balance.input.value = '-' + balance.input.value;
    balance.field.insertBefore(hint('s-start-balance-hint', 'Hoeveel geld je had op de startdatum. Sta je rood? Tik op ± voor een min.'), balance.field.lastChild);

    var date = h('input', { id: 's-start-date', name: 'startDate', className: 'input', type: 'date', value: s.startDate, 'aria-describedby': 's-start-date-hint s-start-date-error' });
    var dateErr = errEl('s-start-date-error');
    var fDate = h('div', { className: 'field', 'data-field': 's-start-date' }, [
      h('label', { className: 'label', 'for': 's-start-date', text: 'Startdatum' }),
      date,
      hint('s-start-date-hint', 'Uitgaven vóór deze datum tellen niet mee in je saldo.'),
      dateErr
    ]);

    var wage = h('input', {
      id: 's-wage', name: 'wage', className: 'input input-money', type: 'text', inputmode: 'decimal', autocomplete: 'off',
      placeholder: 'Bijv. 15,00', value: s.hourlyWageCents ? form.centsToInput(s.hourlyWageCents) : '',
      'aria-describedby': 's-wage-hint s-wage-error'
    });
    var wageErr = errEl('s-wage-error');
    var fWage = h('div', { className: 'field', 'data-field': 's-wage' }, [
      h('label', { className: 'label', 'for': 's-wage', text: 'Uurloon (optioneel)' }),
      h('div', { className: 'amount-wrap amount-wrap-small' }, [h('span', { className: 'currency', 'aria-hidden': 'true', text: '€' }), wage]),
      hint('s-wage-hint', 'Gebruikt voor "uren werk" en om inkomsten uit werk voor te vullen. Leeg = geen uurloon.'),
      wageErr
    ]);

    // Spaardoel (integer centen; leeg of 0 = geen spaardoel) en betaaldag (1-28).
    var goal = h('input', {
      id: 's-goal', name: 'goal', className: 'input input-money', type: 'text', inputmode: 'decimal', autocomplete: 'off',
      placeholder: 'Bijv. 200', value: s.savingsGoalCents ? form.centsToInput(s.savingsGoalCents) : '',
      'aria-describedby': 's-goal-hint s-goal-error'
    });
    var goalErr = errEl('s-goal-error');
    var fGoal = h('div', { className: 'field', 'data-field': 's-goal' }, [
      h('label', { className: 'label', 'for': 's-goal', text: 'Spaardoel per maand' }),
      h('div', { className: 'amount-wrap amount-wrap-small' }, [h('span', { className: 'currency', 'aria-hidden': 'true', text: '€' }), goal]),
      hint('s-goal-hint', 'Zoveel moet je saldo elke spaarmaand hoger eindigen dan de maand ervoor. Leeg of 0 = geen spaardoel.'),
      goalErr
    ]);

    var day = h('input', {
      id: 's-month-start', name: 'monthStartDay', className: 'input input-day', type: 'text', inputmode: 'numeric',
      pattern: '[0-9]*', autocomplete: 'off', maxlength: '2', value: String(s.monthStartDay || 25),
      'aria-describedby': 's-month-start-hint s-month-start-error'
    });
    var dayErr = errEl('s-month-start-error');
    var fDay = h('div', { className: 'field', 'data-field': 's-month-start' }, [
      h('label', { className: 'label', 'for': 's-month-start', text: 'Betaaldag (1-28)' }),
      day,
      hint('s-month-start-hint', 'De dag waarop je salaris binnenkomt; een spaarmaand loopt van deze dag tot de dag ervoor in de volgende maand. Kies 1 voor gewone kalendermaanden.'),
      dayErr
    ]);

    date.addEventListener('input', function () { setFieldError(fDate, dateErr, null); });
    wage.addEventListener('input', function () { setFieldError(fWage, wageErr, null); });
    goal.addEventListener('input', function () { setFieldError(fGoal, goalErr, null); });
    day.addEventListener('input', function () { setFieldError(fDay, dayErr, null); });

    var save = h('button', { type: 'submit', className: 'btn btn-primary btn-block', id: 's-save', text: 'Opslaan' });
    var f = h('form', { className: 'form', id: 'settings-form', novalidate: true, autocomplete: 'off' }, [balance.el, fDate, fWage, fGoal, fDay, save]);

    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var ok = true;
      var raw = balance.input.value;
      var start = calc.parseSignedAmount(raw);
      if (raw.trim() === '') { balance.setError('Vul een startsaldo in (0 mag ook).'); ok = false; }
      else if (start === null) { balance.setError('Dit is geen geldig bedrag. Gebruik bijvoorbeeld 250,00 of -40.'); ok = false; }
      else balance.setError(null);

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value) || !calc.parseLocalDateTime(date.value)) {
        setFieldError(fDate, dateErr, 'Kies een startdatum.');
        ok = false;
      }
      var wageCents = null;
      if (wage.value.trim() !== '') {
        wageCents = calc.parseAmount(wage.value);
        if (wageCents === null) { setFieldError(fWage, wageErr, 'Dit is geen geldig uurloon. Gebruik bijvoorbeeld 15,00, of laat het leeg.'); ok = false; }
      }
      var goalCents = 0;
      if (goal.value.trim() !== '' && !/^\s*0+([.,]0*)?\s*$/.test(goal.value)) {
        goalCents = calc.parseAmount(goal.value);
        if (goalCents === null) { setFieldError(fGoal, goalErr, 'Dit is geen geldig bedrag. Gebruik bijvoorbeeld 200, of laat het leeg.'); ok = false; }
      }
      var dayNum = /^\s*\d{1,2}\s*$/.test(day.value) ? parseInt(day.value, 10) : NaN;
      if (!(dayNum >= 1 && dayNum <= 28)) { setFieldError(fDay, dayErr, 'Kies een dag van 1 tot en met 28.'); ok = false; }
      if (!ok) {
        var bad = f.querySelector('.invalid input');
        if (bad) bad.focus();
        return;
      }
      app.store.updateSettings({ startBalanceCents: start, startDate: date.value, hourlyWageCents: wageCents, savingsGoalCents: goalCents || 0, monthStartDay: dayNum });
      if (app.store.lastError) app.toast('Let op: opslaan op dit toestel mislukte.', 5000);
      else app.toast('Instellingen opgeslagen');
    });
    return f;
  }

  // ---- blok: categorieën ----

  function renderCategories(app, refresh) {
    var cats = app.store.getSettings().categories;
    var wrap = h('div', { className: 'cat-block' });
    var list = h('ul', { className: 'cat-list', id: 'category-list' });

    cats.forEach(function (name, i) {
      var input = h('input', {
        id: 's-cat-' + i, className: 'input', type: 'text', value: name, maxlength: '40',
        autocomplete: 'off', autocapitalize: 'sentences', 'data-category': name, 'aria-label': 'Categorie ' + name + ' hernoemen'
      });
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
      });
      input.addEventListener('change', function () {
        var next = input.value.trim();
        if (next === name) return;
        var changed;
        try {
          changed = app.store.renameCategory(name, next);
        } catch (err) {
          app.toast(err.message, 4000);
          input.value = name;
          return;
        }
        app.toast('Hernoemd naar "' + next + '"' + (changed ? ' (' + changed + (changed === 1 ? ' uitgave' : ' uitgaven') + ' aangepast)' : ''));
        refresh();
      });
      var del = h('button', {
        type: 'button', className: 'btn btn-danger btn-small', 'data-remove': name, 'aria-label': name + ' verwijderen', text: 'Verwijder'
      });
      del.addEventListener('click', function () {
        if (!app.confirm('Categorie "' + name + '" verwijderen? Uitgaven met deze categorie houden hem gewoon.')) return;
        app.store.removeCategory(name);
        app.toast('Verwijderd: ' + name);
        refresh();
      });
      list.appendChild(h('li', { className: 'cat-row', 'data-category-row': name }, [input, del]));
    });

    var add = h('input', {
      id: 's-cat-new', className: 'input', type: 'text', maxlength: '40', autocomplete: 'off',
      autocapitalize: 'sentences', placeholder: 'Nieuwe categorie', 'aria-label': 'Nieuwe categorie'
    });
    var addBtn = h('button', { type: 'submit', className: 'btn', id: 's-cat-add', text: 'Toevoegen' });
    var addForm = h('form', { className: 'cat-row cat-add', id: 'category-add-form', novalidate: true, autocomplete: 'off' }, [add, addBtn]);
    addForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      try {
        app.store.addCategory(add.value);
      } catch (err) {
        app.toast(err.message, 4000);
        return;
      }
      app.toast('Toegevoegd: ' + add.value.trim());
      refresh();
    });

    wrap.appendChild(hint('s-cat-hint', 'Tik op een naam om hem te wijzigen. Hernoemen past ook je bestaande uitgaven aan.'));
    wrap.appendChild(list);
    wrap.appendChild(addForm);
    return wrap;
  }

  var blocks = [
    { id: 'saldo', title: 'Saldo, uurloon en spaardoel', render: renderSaldo },
    { id: 'categorieen', title: 'Categorieën', render: renderCategories }
  ];

  function render(el, app) {
    el.innerHTML = '';
    var refresh = function () { render(el, app); };
    blocks.forEach(function (b) {
      var content;
      try {
        content = b.render(app, refresh);
      } catch (err) {
        content = h('p', { className: 'error', text: 'Dit blok kon niet geladen worden: ' + err.message });
      }
      el.appendChild(h('section', { className: 'card settings-block', id: 'settings-' + b.id, 'aria-labelledby': 'settings-' + b.id + '-title' }, [
        h('h2', { className: 'card-title', id: 'settings-' + b.id + '-title', text: b.title }),
        content
      ]));
    });
  }

  G.instellingen = { blocks: blocks, render: render };

  G.app.register('instellingen', {
    show: function (el, app) { render(el, app); }
  });
})(window);
