/*
 * Geldboek - tabblad Invoer (uitgave). U5, U6, U7, U9.
 * Het formulier is herbruikbaar: Geldboek.invoerForm.create(options) geeft een controller
 * { el, reset(), fill(entry), focusAmount(), read() } zodat fase 3 het in bewerkmodus kan tonen.
 */
(function (root) {
  'use strict';

  var G = root.Geldboek = root.Geldboek || {};

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'text') el.textContent = v;
        else if (k === 'className') el.className = v;
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function centsToInput(cents) {
    return (cents / 100).toFixed(2).replace('.', ',');
  }

  /**
   * Chipgroep met enkelvoudige keuze.
   * opts: { name, values, labels?, allowNone (tik opnieuw = uit), className, value }
   */
  function chipGroup(opts) {
    var wrap = h('div', { className: 'chips', role: 'group', 'data-group': opts.name, 'aria-label': opts.ariaLabel || opts.name });
    var value = opts.value === undefined ? null : opts.value;
    var buttons = [];
    function sync() {
      buttons.forEach(function (b) {
        b.setAttribute('aria-pressed', String(b._value === value));
      });
    }
    opts.values.forEach(function (v, i) {
      var b = h('button', {
        type: 'button',
        className: opts.className || (opts.seg ? 'seg-btn' : 'chip'),
        'data-value': String(v),
        text: opts.labels ? opts.labels[i] : String(v)
      });
      b._value = v;
      b.addEventListener('click', function () {
        if (value === v && opts.allowNone) value = null;
        else value = v;
        sync();
        if (opts.onChange) opts.onChange(value);
      });
      buttons.push(b);
      wrap.appendChild(b);
    });
    if (opts.seg) wrap.className = 'seg';
    sync();
    return {
      el: wrap,
      get: function () { return value; },
      set: function (v) { value = v === undefined ? null : v; sync(); }
    };
  }

  function field(id, labelText, control, extraClass) {
    var err = h('p', { className: 'error', id: id + '-error', 'aria-live': 'polite', hidden: true });
    var f = h('div', { className: 'field' + (extraClass ? ' ' + extraClass : ''), 'data-field': id }, [
      h('label', { className: 'label', 'for': id, text: labelText }),
      control,
      err
    ]);
    f._error = err;
    return f;
  }

  function groupField(name, labelText, group) {
    return h('div', { className: 'field', 'data-field': name }, [
      h('span', { className: 'label', id: 'label-' + name, text: labelText }),
      group.el
    ]);
  }

  function setError(f, msg) {
    if (!f) return;
    if (msg) {
      f.classList.add('invalid');
      f._error.textContent = msg;
      f._error.hidden = false;
      var input = f.querySelector('input, textarea');
      if (input) input.setAttribute('aria-invalid', 'true');
    } else {
      f.classList.remove('invalid');
      f._error.textContent = '';
      f._error.hidden = true;
      var inp = f.querySelector('input, textarea');
      if (inp) inp.removeAttribute('aria-invalid');
    }
  }

  /**
   * options: { categories: [..], submitLabel: 'Opslaan', onSubmit(entryFields) }
   * onSubmit krijgt een gevalideerd object met type 'expense' en integer amountCents.
   */
  function createForm(options) {
    var opts = options || {};
    var calc = G.calc;
    var storeApi = G.store;

    var amount = h('input', {
      id: 'f-amount', name: 'amount', className: 'input input-amount', type: 'text',
      inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'next', placeholder: '0,00',
      'aria-describedby': 'f-amount-error'
    });
    var amountWrap = h('div', { className: 'amount-wrap' }, [h('span', { className: 'currency', 'aria-hidden': 'true', text: '€' }), amount]);
    var what = h('input', {
      id: 'f-what', name: 'what', className: 'input', type: 'text', autocomplete: 'off',
      autocapitalize: 'sentences', enterkeyhint: 'next', placeholder: 'Bijv. Lunch', maxlength: '80',
      'aria-describedby': 'f-what-error'
    });
    var note = h('textarea', {
      id: 'f-note', name: 'note', className: 'input', rows: '2', autocapitalize: 'sentences',
      placeholder: 'Waarom gaf je dit uit?', 'aria-describedby': 'f-note-error'
    });
    var datetime = h('input', {
      id: 'f-datetime', name: 'datetime', className: 'input', type: 'datetime-local',
      'aria-describedby': 'f-datetime-error'
    });

    var fixed = chipGroup({ name: 'fixed', values: storeApi.FIXED.slice(), labels: ['Vast', 'Variabel'], seg: true, value: 'variabel', ariaLabel: 'Vast of variabel' });
    var category = chipGroup({ name: 'category', values: (opts.categories || storeApi.DEFAULT_CATEGORIES).slice(), allowNone: true, ariaLabel: 'Categorie' });
    var need = chipGroup({ name: 'need', values: storeApi.NEEDS.slice(), labels: ['Nodig', 'Wil', 'Impuls'], allowNone: true, ariaLabel: 'Nodig, wil of impuls' });
    var worth = chipGroup({ name: 'worth', values: [1, 2, 3, 4, 5], allowNone: true, className: 'chip chip-score', ariaLabel: 'Was het het geld waard (1 tot 5)' });
    var mood = chipGroup({ name: 'mood', values: storeApi.MOODS.slice(), allowNone: true, ariaLabel: 'Stemming' });

    var fAmount = field('f-amount', 'Bedrag', amountWrap);
    var fWhat = field('f-what', 'Wat', what);
    var fNote = field('f-note', 'Waarom (argumentatie)', note);
    var fDatetime = field('f-datetime', 'Datum en tijd', datetime);
    var fFixed = groupField('fixed', 'Vast of variabel', fixed);

    var more = h('details', { className: 'more', open: true }, [
      h('summary', { text: 'Meer' }),
      h('div', { className: 'more-body' }, [
        groupField('category', 'Categorie', category),
        groupField('need', 'Nodig, wil of impuls?', need),
        groupField('worth', 'Was het het geld waard? (1-5)', worth),
        groupField('mood', 'Stemming', mood)
      ])
    ]);

    var submit = h('button', { type: 'submit', className: 'btn btn-primary btn-block', id: 'f-submit', text: opts.submitLabel || 'Opslaan' });
    var form = h('form', { className: 'form', id: 'expense-form', novalidate: true, autocomplete: 'off' }, [
      fAmount,
      fWhat,
      fNote,
      fFixed,
      fDatetime,
      more,
      h('div', { className: 'save-bar' }, [submit])
    ]);

    // Fouten wissen zodra er getypt wordt.
    [[amount, fAmount], [what, fWhat], [note, fNote], [datetime, fDatetime]].forEach(function (pair) {
      pair[0].addEventListener('input', function () { setError(pair[1], null); });
    });

    function validate() {
      var errors = [];
      var cents = calc.parseAmount(amount.value);
      if (amount.value.trim() === '') errors.push([fAmount, 'Vul een bedrag in, bijvoorbeeld 12,50.', amount]);
      else if (cents === null) errors.push([fAmount, 'Dit is geen geldig bedrag. Gebruik bijvoorbeeld 12,50.', amount]);
      if (what.value.trim() === '') errors.push([fWhat, 'Vul in waar het geld aan op ging.', what]);
      if (note.value.trim().length < 3) errors.push([fNote, 'Schrijf kort waarom je dit uitgaf (minstens 3 tekens).', note]);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(datetime.value)) errors.push([fDatetime, 'Kies een datum en tijd.', datetime]);
      [fAmount, fWhat, fNote, fDatetime].forEach(function (f) { setError(f, null); });
      errors.forEach(function (e) { setError(e[0], e[1]); });
      return { ok: errors.length === 0, cents: cents, first: errors.length ? errors[0][2] : null };
    }

    function read() {
      return {
        type: 'expense',
        amountCents: calc.parseAmount(amount.value),
        what: what.value.trim(),
        note: note.value.trim(),
        datetime: datetime.value.slice(0, 16),
        fixed: fixed.get() || 'variabel',
        category: category.get(),
        need: need.get(),
        worth: worth.get(),
        mood: mood.get()
      };
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = validate();
      if (!v.ok) {
        if (v.first) v.first.focus();
        return;
      }
      if (opts.onSubmit) opts.onSubmit(read());
    });

    var ctrl = {
      el: form,
      read: read,
      validate: validate,
      focusAmount: function () {
        try { amount.focus({ preventScroll: true }); } catch (err) { amount.focus(); }
      },
      reset: function () {
        amount.value = '';
        what.value = '';
        note.value = '';
        datetime.value = calc.toLocalDateTime(new Date());
        fixed.set('variabel');
        category.set(null);
        need.set(null);
        worth.set(null);
        mood.set(null);
        [fAmount, fWhat, fNote, fDatetime].forEach(function (f) { setError(f, null); });
      },
      /** Vult (een deel van) de velden, bijv. vanuit een snelle chip of een bestaande entry. */
      fill: function (e) {
        if (!e) return;
        if (typeof e.amountCents === 'number') amount.value = centsToInput(e.amountCents);
        if (typeof e.what === 'string') what.value = e.what;
        if (typeof e.note === 'string') note.value = e.note;
        if (typeof e.datetime === 'string') datetime.value = e.datetime.slice(0, 16);
        if (e.fixed) fixed.set(e.fixed);
        if ('category' in e) category.set(e.category);
        if ('need' in e) need.set(e.need);
        if ('worth' in e) worth.set(e.worth);
        if ('mood' in e) mood.set(e.mood);
        [fAmount, fWhat, fNote, fDatetime].forEach(function (f) { setError(f, null); });
      },
      focusNote: function () { note.focus(); }
    };
    ctrl.reset();
    return ctrl;
  }

  // ---- Tabblad Invoer ----

  var form = null;
  var quickWrap = null;

  function renderQuickPicks(app) {
    var picks = G.calc.quickPicks(app.store.listEntries(), new Date(), 6);
    quickWrap.innerHTML = '';
    quickWrap.hidden = picks.length === 0;
    if (!picks.length) return;
    var list = h('div', { className: 'chips chips-scroll', role: 'group', 'aria-label': 'Snel toevoegen' });
    picks.forEach(function (p) {
      var b = h('button', { type: 'button', className: 'chip chip-quick', 'data-quick': p.what }, [
        h('span', { className: 'chip-label', text: p.what }),
        h('span', { className: 'chip-amount', text: G.calc.formatEuro(p.amountCents) })
      ]);
      b.addEventListener('click', function () {
        form.fill({ what: p.what, amountCents: p.amountCents, fixed: p.fixed, category: p.category });
        form.focusNote();
      });
      list.appendChild(b);
    });
    quickWrap.appendChild(h('p', { className: 'label quick-title', text: 'Snel toevoegen' }));
    quickWrap.appendChild(list);
  }

  G.invoerForm = { create: createForm, centsToInput: centsToInput };

  G.app.register('invoer', {
    init: function (el, app) {
      quickWrap = h('div', { className: 'quick', id: 'quick-picks' });
      form = createForm({
        categories: app.store.getSettings().categories,
        onSubmit: function (fields) {
          var saved;
          try {
            saved = app.store.addEntry(fields);
          } catch (err) {
            app.toast('Opslaan mislukt: ' + err.message, 5000);
            return;
          }
          if (app.store.lastError) {
            app.toast('Let op: opslaan op dit toestel mislukte.', 5000);
          } else {
            app.toast('Opgeslagen: ' + G.calc.formatEuro(saved.amountCents) + ' — ' + saved.what);
          }
          form.reset();
          renderQuickPicks(app);
          root.scrollTo(0, 0);
          form.focusAmount();
        }
      });
      el.appendChild(quickWrap);
      el.appendChild(form.el);
    },
    show: function (el, app) {
      renderQuickPicks(app);
      form.focusAmount();
    }
  });
})(window);
