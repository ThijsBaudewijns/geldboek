/*
 * Geldboek - tabblad Invoer (uitgave). U5, U6, U7, U9.
 * Het formulier is herbruikbaar: Geldboek.invoerForm.create(options) geeft een controller
 * { el, read(), validate(), reset(), fill(entry), focusAmount(), focusNote() }.
 * options.idPrefix (standaard 'f-') en options.formId (standaard 'expense-form') voorkomen dubbele ids
 * als een tweede formulier in de DOM staat (bewerkmodus in Overzicht gebruikt 'edit-' / 'edit-form').
 * Inkomsten (U10): Geldboek.invoerForm.createIncome(options) met dezelfde controller-vorm;
 * standaard idPrefix 'i-' en formId 'income-form'. Bovenaan het tabblad een schakelaar
 * Uitgave | Inkomst (data-group="entry-type", data-value "expense" / "income").
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

  function groupField(name, labelText, group, prefix) {
    return h('div', { className: 'field', 'data-field': name }, [
      h('span', { className: 'label', id: (prefix || '') + 'label-' + name, text: labelText }),
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
   * options: { categories: [..], submitLabel: 'Opslaan', onSubmit(entryFields), idPrefix: 'f-', formId: 'expense-form',
   *            getAdvanceNames() -> ['Sam', ...] (suggesties voor "Voorgeschoten voor", #<P>advance-for / #<P>advance-list) }
   * onSubmit krijgt een gevalideerd object met type 'expense' en integer amountCents.
   */
  function createForm(options) {
    var opts = options || {};
    var calc = G.calc;
    var storeApi = G.store;
    var P = typeof opts.idPrefix === 'string' && opts.idPrefix ? opts.idPrefix : 'f-';

    var amount = h('input', {
      id: P + 'amount', name: 'amount', className: 'input input-amount', type: 'text',
      inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'next', placeholder: '0,00',
      'aria-describedby': P + 'amount-error'
    });
    var amountWrap = h('div', { className: 'amount-wrap' }, [h('span', { className: 'currency', 'aria-hidden': 'true', text: '€' }), amount]);
    var what = h('input', {
      id: P + 'what', name: 'what', className: 'input', type: 'text', autocomplete: 'off',
      autocapitalize: 'sentences', enterkeyhint: 'next', placeholder: 'Bijv. Lunch', maxlength: '80',
      'aria-describedby': P + 'what-error'
    });
    var note = h('textarea', {
      id: P + 'note', name: 'note', className: 'input', rows: '2', autocapitalize: 'sentences',
      placeholder: 'Waarom gaf je dit uit?', 'aria-describedby': P + 'note-error'
    });
    var datetime = h('input', {
      id: P + 'datetime', name: 'datetime', className: 'input', type: 'datetime-local',
      'aria-describedby': P + 'datetime-error'
    });

    var fixed = chipGroup({ name: 'fixed', values: storeApi.FIXED.slice(), labels: ['Vast', 'Variabel'], seg: true, value: 'variabel', ariaLabel: 'Vast of variabel' });
    var category = chipGroup({ name: 'category', values: (opts.categories || storeApi.DEFAULT_CATEGORIES).slice(), allowNone: true, ariaLabel: 'Categorie' });
    var need = chipGroup({ name: 'need', values: storeApi.NEEDS.slice(), labels: ['Nodig', 'Wil', 'Impuls'], allowNone: true, ariaLabel: 'Nodig, wil of impuls' });
    var worth = chipGroup({ name: 'worth', values: [1, 2, 3, 4, 5], allowNone: true, className: 'chip chip-score', ariaLabel: 'Was het het geld waard (1 tot 5)' });
    var mood = chipGroup({ name: 'mood', values: storeApi.MOODS.slice(), allowNone: true, ariaLabel: 'Stemming' });
    // Voorgeschoten voor (U12): naam met suggesties van eerder gebruikte namen (opts.getAdvanceNames()).
    var advanceList = h('datalist', { id: P + 'advance-list' });
    var advance = h('input', {
      id: P + 'advance-for', name: 'advanceFor', className: 'input', type: 'text', autocomplete: 'off',
      autocapitalize: 'words', enterkeyhint: 'done', placeholder: 'Naam (leeg = voor mezelf)', maxlength: '40',
      list: P + 'advance-list', 'aria-describedby': P + 'advance-hint'
    });
    function refreshAdvanceNames() {
      var names = [];
      try { names = typeof opts.getAdvanceNames === 'function' ? (opts.getAdvanceNames() || []) : []; } catch (err) { names = []; }
      advanceList.innerHTML = '';
      names.forEach(function (n) { advanceList.appendChild(h('option', { value: n })); });
    }
    advance.addEventListener('focus', refreshAdvanceNames);
    refreshAdvanceNames();
    var fAdvance = field(P + 'advance-for', 'Voorgeschoten voor', advance);
    fAdvance.insertBefore(h('p', { className: 'hint', id: P + 'advance-hint', text: 'Betaalde je dit voor iemand anders? Dan telt het niet als eigen uitgave.' }), fAdvance._error);
    fAdvance.appendChild(advanceList);

    var fAmount = field(P + 'amount', 'Bedrag', amountWrap);
    var fWhat = field(P + 'what', 'Wat', what);
    var fNote = field(P + 'note', 'Waarom (argumentatie)', note);
    var fDatetime = field(P + 'datetime', 'Datum en tijd', datetime);
    var fFixed = groupField('fixed', 'Vast of variabel', fixed, P === 'f-' ? '' : P);

    var more = h('details', { className: 'more', open: true }, [
      h('summary', { text: 'Meer' }),
      h('div', { className: 'more-body' }, [
        groupField('category', 'Categorie', category, P === 'f-' ? '' : P),
        groupField('need', 'Nodig, wil of impuls?', need, P === 'f-' ? '' : P),
        groupField('worth', 'Was het het geld waard? (1-5)', worth, P === 'f-' ? '' : P),
        groupField('mood', 'Stemming', mood, P === 'f-' ? '' : P),
        fAdvance
      ])
    ]);

    var submit = h('button', { type: 'submit', className: 'btn btn-primary btn-block', id: P + 'submit', text: opts.submitLabel || 'Opslaan' });
    var form = h('form', { className: 'form', id: opts.formId || 'expense-form', novalidate: true, autocomplete: 'off' }, [
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
        mood: mood.get(),
        advanceFor: advance.value.trim() || null
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
        advance.value = '';
        refreshAdvanceNames();
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
        if ('advanceFor' in e) advance.value = e.advanceFor || '';
        [fAmount, fWhat, fNote, fDatetime].forEach(function (f) { setError(f, null); });
      },
      focusNote: function () { note.focus(); },
      refreshAdvanceNames: refreshAdvanceNames
    };
    ctrl.reset();
    return ctrl;
  }

  var SOURCE_LABELS = { werk: 'Werk', terugbetaling: 'Terugbetaling', belasting: 'Belasting', overig: 'Overig' };

  /** Uren als invoertekst: 6.5 -> "6,5". */
  function hoursToInput(hours) {
    return typeof hours === 'number' && isFinite(hours) ? String(hours).replace('.', ',') : '';
  }

  /**
   * Bedragveld dat ook 0 en negatief accepteert (startsaldo), met een ±-knop omdat het
   * decimale iOS-toetsenbord geen minteken heeft. Geeft { el, input, field }.
   * opts: { id, label, large (groot bedragveld), placeholder }
   */
  function signedAmountField(opts) {
    var input = h('input', {
      id: opts.id, name: opts.id, className: 'input' + (opts.large ? ' input-amount' : ' input-money'), type: 'text',
      inputmode: 'decimal', autocomplete: 'off', placeholder: opts.placeholder || '0,00',
      'aria-describedby': opts.id + '-error'
    });
    var sign = h('button', { type: 'button', className: 'sign-btn', id: opts.id + '-sign', 'aria-label': 'Wissel tussen plus en min', text: '±' });
    var wrap = h('div', { className: 'amount-wrap signed' + (opts.large ? '' : ' amount-wrap-small') }, [
      h('span', { className: 'currency', 'aria-hidden': 'true', text: '€' }), input, sign
    ]);
    var f = field(opts.id, opts.label, wrap);
    sign.addEventListener('click', function () {
      var v = input.value.replace(/^\s+/, '');
      if (/^[-−]/.test(v)) input.value = v.replace(/^[-−]\s*/, '');
      else input.value = '-' + v;
      setError(f, null);
      input.focus();
    });
    input.addEventListener('input', function () { setError(f, null); });
    return { el: f, input: input, field: f, setError: function (msg) { setError(f, msg); } };
  }

  /**
   * Inkomstformulier (U10): bedrag, bron-chips, uren (alleen bij werk; met uurloon vult
   * uren x uurloon het bedrag voor, overschrijfbaar), omschrijving (optioneel, in `note`), datum/tijd.
   * options: { idPrefix: 'i-', formId: 'income-form', submitLabel, getHourlyWageCents(), onSubmit(fields) }
   * onSubmit krijgt { type: 'income', amountCents, source, hours, note, what, datetime }.
   * `what` = de omschrijving, of anders de bron ("Werk").
   */
  function createIncomeForm(options) {
    var opts = options || {};
    var calc = G.calc;
    var storeApi = G.store;
    var P = typeof opts.idPrefix === 'string' && opts.idPrefix ? opts.idPrefix : 'i-';
    var getWage = typeof opts.getHourlyWageCents === 'function' ? opts.getHourlyWageCents : function () { return null; };

    var amount = h('input', {
      id: P + 'amount', name: 'amount', className: 'input input-amount', type: 'text',
      inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'next', placeholder: '0,00',
      'aria-describedby': P + 'amount-error'
    });
    var amountWrap = h('div', { className: 'amount-wrap' }, [h('span', { className: 'currency', 'aria-hidden': 'true', text: '€' }), amount]);
    var hours = h('input', {
      id: P + 'hours', name: 'hours', className: 'input', type: 'text', inputmode: 'decimal',
      autocomplete: 'off', placeholder: 'Bijv. 4', 'aria-describedby': P + 'hours-hint ' + P + 'hours-error'
    });
    var note = h('textarea', {
      id: P + 'note', name: 'note', className: 'input', rows: '2', autocapitalize: 'sentences',
      placeholder: 'Bijv. loon november', maxlength: '200', 'aria-describedby': P + 'note-error'
    });
    var datetime = h('input', {
      id: P + 'datetime', name: 'datetime', className: 'input', type: 'datetime-local',
      'aria-describedby': P + 'datetime-error'
    });
    var source = chipGroup({
      name: 'source', values: storeApi.SOURCES.slice(),
      labels: storeApi.SOURCES.map(function (s) { return SOURCE_LABELS[s] || s; }),
      value: 'werk', ariaLabel: 'Bron', onChange: function () { syncHours(); }
    });

    var hint = h('p', { className: 'hint', id: P + 'hours-hint' });
    var fAmount = field(P + 'amount', 'Bedrag', amountWrap);
    var fHours = field(P + 'hours', 'Uren gewerkt (optioneel)', hours);
    fHours.insertBefore(hint, fHours._error);
    var fNote = field(P + 'note', 'Omschrijving (optioneel)', note);
    var fDatetime = field(P + 'datetime', 'Datum en tijd', datetime);
    var fSource = groupField('source', 'Bron', source, P);

    var submit = h('button', { type: 'submit', className: 'btn btn-primary btn-block', id: P + 'submit', text: opts.submitLabel || 'Opslaan' });
    var form = h('form', { className: 'form', id: opts.formId || 'income-form', novalidate: true, autocomplete: 'off' }, [
      fAmount,
      fSource,
      fHours,
      fNote,
      fDatetime,
      h('div', { className: 'save-bar' }, [submit])
    ]);

    function syncHours() {
      fHours.hidden = source.get() !== 'werk';
      var wage = getWage();
      hint.textContent = wage
        ? 'Met je uurloon (' + calc.formatEuro(wage) + ') vult Geldboek het bedrag voor.'
        : 'Stel een uurloon in bij Instellingen, dan rekent Geldboek het bedrag uit.';
    }

    hours.addEventListener('input', function () {
      setError(fHours, null);
      var c = calc.wageAmount(calc.parseHours(hours.value), getWage());
      if (c !== null) {
        amount.value = centsToInput(c);
        setError(fAmount, null);
      }
    });
    [[amount, fAmount], [note, fNote], [datetime, fDatetime]].forEach(function (pair) {
      pair[0].addEventListener('input', function () { setError(pair[1], null); });
    });

    function validate() {
      var errors = [];
      var cents = calc.parseAmount(amount.value);
      if (amount.value.trim() === '') errors.push([fAmount, 'Vul een bedrag in, bijvoorbeeld 12,50.', amount]);
      else if (cents === null) errors.push([fAmount, 'Dit is geen geldig bedrag. Gebruik bijvoorbeeld 12,50.', amount]);
      if (source.get() === 'werk' && hours.value.trim() !== '' && calc.parseHours(hours.value) === null) {
        errors.push([fHours, 'Vul het aantal uren in als getal, bijvoorbeeld 4 of 6,5.', hours]);
      }
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(datetime.value)) errors.push([fDatetime, 'Kies een datum en tijd.', datetime]);
      [fAmount, fHours, fNote, fDatetime].forEach(function (f) { setError(f, null); });
      errors.forEach(function (e) { setError(e[0], e[1]); });
      return { ok: errors.length === 0, cents: cents, first: errors.length ? errors[0][2] : null };
    }

    function read() {
      var src = source.get() || 'overig';
      var n = note.value.trim();
      return {
        type: 'income',
        amountCents: calc.parseAmount(amount.value),
        source: src,
        hours: src === 'werk' ? calc.parseHours(hours.value) : null,
        note: n,
        what: n || SOURCE_LABELS[src] || src,
        datetime: datetime.value.slice(0, 16)
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
      focusNote: function () { note.focus(); },
      /** Werkt de uurloon-hint bij (na wijzigen van Instellingen). */
      refresh: syncHours,
      reset: function () {
        amount.value = '';
        hours.value = '';
        note.value = '';
        datetime.value = calc.toLocalDateTime(new Date());
        source.set('werk');
        [fAmount, fHours, fNote, fDatetime].forEach(function (f) { setError(f, null); });
        syncHours();
      },
      fill: function (e) {
        if (!e) return;
        if (typeof e.amountCents === 'number') amount.value = centsToInput(e.amountCents);
        if (e.source) source.set(e.source);
        if ('hours' in e) hours.value = hoursToInput(e.hours);
        if (typeof e.note === 'string') note.value = e.note;
        if (typeof e.datetime === 'string') datetime.value = e.datetime.slice(0, 16);
        [fAmount, fHours, fNote, fDatetime].forEach(function (f) { setError(f, null); });
        syncHours();
      }
    };
    ctrl.reset();
    return ctrl;
  }

  // ---- Tabblad Invoer ----

  var form = null;          // uitgaveformulier (#expense-form, ids f-...)
  var incomeForm = null;    // inkomstformulier (#income-form, ids i-...)
  var quickWrap = null;
  var expenseWrap = null;
  var typeSwitch = null;
  var mode = 'expense';
  var categoriesKey = '';
  var viewEl = null;

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

  G.invoerForm = {
    create: createForm,
    createIncome: createIncomeForm,
    signedAmountField: signedAmountField,
    centsToInput: centsToInput,
    hoursToInput: hoursToInput,
    SOURCE_LABELS: SOURCE_LABELS,
    h: h
  };

  function afterSave(app, saved) {
    if (app.store.lastError) {
      app.toast('Let op: opslaan op dit toestel mislukte.', 5000);
    } else {
      // Uitgave met uurloon: "Opgeslagen: € 45,00 ≈ 3,0 uur werk — Lunch" (U14); inkomsten zonder uren-werk.
      var hours = saved.type === 'expense' ? G.calc.hoursLabel(saved.amountCents, app.store.getSettings().hourlyWageCents) : null;
      app.toast('Opgeslagen: ' + G.calc.formatEuro(saved.amountCents) + (hours ? ' ' + hours : '') + ' — ' + saved.what, hours ? 4000 : 3000);
    }
  }

  function makeExpenseForm(app) {
    var cats = app.store.getSettings().categories;
    categoriesKey = JSON.stringify(cats);
    return createForm({
      categories: cats,
      getAdvanceNames: function () { return G.calc.advanceNames(app.store.listEntries()); },
      onSubmit: function (fields) {
        var saved;
        try {
          saved = app.store.addEntry(fields);
        } catch (err) {
          app.toast('Opslaan mislukt: ' + err.message, 5000);
          return;
        }
        afterSave(app, saved);
        form.reset();
        renderQuickPicks(app);
        root.scrollTo(0, 0);
        form.focusAmount();
      }
    });
  }

  function setTitle() {
    var text = mode === 'income' ? 'Nieuwe inkomst' : 'Nieuwe uitgave';
    var t = document.getElementById('view-title');
    if (t) t.textContent = text;
    if (viewEl) viewEl.setAttribute('data-title', text);
  }

  function setMode(m) {
    mode = m === 'income' ? 'income' : 'expense';
    typeSwitch.set(mode);
    expenseWrap.hidden = mode !== 'expense';
    incomeForm.el.hidden = mode !== 'income';
    setTitle();
    if (mode === 'income') {
      incomeForm.refresh();
      incomeForm.focusAmount();
    } else {
      form.focusAmount();
    }
  }

  G.app.register('invoer', {
    init: function (el, app) {
      viewEl = el;
      typeSwitch = chipGroup({
        name: 'entry-type', values: ['expense', 'income'], labels: ['Uitgave', 'Inkomst'], seg: true,
        value: 'expense', ariaLabel: 'Uitgave of inkomst', onChange: function (v) { setMode(v); }
      });
      typeSwitch.el.className = 'seg type-switch';
      typeSwitch.el.id = 'entry-type';

      quickWrap = h('div', { className: 'quick', id: 'quick-picks' });
      form = makeExpenseForm(app);
      expenseWrap = h('div', { className: 'expense-wrap', id: 'expense-wrap' }, [quickWrap, form.el]);

      incomeForm = createIncomeForm({
        getHourlyWageCents: function () { return app.store.getSettings().hourlyWageCents; },
        onSubmit: function (fields) {
          var saved;
          try {
            saved = app.store.addEntry(fields);
          } catch (err) {
            app.toast('Opslaan mislukt: ' + err.message, 5000);
            return;
          }
          afterSave(app, saved);
          incomeForm.reset();
          root.scrollTo(0, 0);
          incomeForm.focusAmount();
        }
      });
      incomeForm.el.hidden = true;

      el.appendChild(typeSwitch.el);
      el.appendChild(expenseWrap);
      el.appendChild(incomeForm.el);
    },
    show: function (el, app) {
      // Categorieën gewijzigd in Instellingen? Dan het uitgaveformulier opnieuw opbouwen.
      if (JSON.stringify(app.store.getSettings().categories) !== categoriesKey) {
        var fresh = makeExpenseForm(app);
        expenseWrap.replaceChild(fresh.el, form.el);
        form = fresh;
      }
      renderQuickPicks(app);
      setMode(mode);
    }
  });
})(window);
