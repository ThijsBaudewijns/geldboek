/*
 * Geldboek - opstarten en hash-routing (U15).
 * Tabbladen melden zich aan met Geldboek.app.register(route, { init(el, app), show(el, app), hide(el, app) }).
 * Routes zonder aangemeld tabblad tonen "binnenkort".
 */
(function (root) {
  'use strict';

  var G = root.Geldboek = root.Geldboek || {};
  var ROUTES = ['invoer', 'overzicht', 'terugkijken', 'reflectie', 'instellingen'];
  var DEFAULT_ROUTE = 'invoer';

  var views = {};      // route -> { init, show, hide, initialized }
  var gates = {};      // 'install' | 'welcome' -> { show(el, app) }
  var gate = null;     // actief scherm vóór de app (installatie of eerste keer), anders null
  var BROWSER_KEY = 'geldboek.browser';
  var GATE_IDS = { install: 'install-screen', welcome: 'welcome-screen' };
  var GATE_TITLES = { install: 'Geldboek installeren', welcome: 'Welkom bij Geldboek' };
  var current = null;
  var toastTimer = null;
  var started = false;

  function safeLocalStorage() {
    try {
      var ls = root.localStorage;
      if (!ls) return null;
      var k = '__geldboek_test__';
      ls.setItem(k, '1');
      ls.removeItem(k);
      return ls;
    } catch (err) {
      return null;
    }
  }

  function routeFromHash() {
    var h = (root.location.hash || '').replace(/^#\/?/, '');
    return ROUTES.indexOf(h) >= 0 ? h : DEFAULT_ROUTE;
  }

  function sectionFor(route) {
    return document.getElementById('view-' + route);
  }

  var app = {
    store: null,
    routes: ROUTES.slice(),

    /** Meldt een tabblad aan. def: { init(el, app), show(el, app), hide(el, app) } (alle optioneel). */
    register: function (route, def) {
      if (ROUTES.indexOf(route) < 0) throw new Error('Onbekende route: ' + route);
      views[route] = { def: def || {}, initialized: false };
      if (started && current === route) app.render(route);
    },

    /** Naar een route gaan (zet de hash; hashchange doet de rest). */
    go: function (route) {
      if (('#' + route) === root.location.hash) app.render(route);
      else root.location.hash = '#' + route;
    },

    current: function () { return current; },

    render: function (route) {
      if (gate) { app.showGate(gate); return; }
      var prev = current;
      if (prev && prev !== route && views[prev] && typeof views[prev].def.hide === 'function') {
        views[prev].def.hide(sectionFor(prev), app);
      }
      current = route;
      ROUTES.forEach(function (r) {
        var el = sectionFor(r);
        if (el) el.hidden = r !== route;
      });
      var el = sectionFor(route);
      var title = document.getElementById('view-title');
      if (title && el) title.textContent = el.getAttribute('data-title') || 'Geldboek';

      var tabs = document.querySelectorAll('[data-route]');
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].getAttribute('data-route') === route) tabs[i].setAttribute('aria-current', 'page');
        else tabs[i].removeAttribute('aria-current');
      }
      var gear = document.getElementById('settings-link');
      if (gear) {
        if (route === 'instellingen') gear.setAttribute('aria-current', 'page');
        else gear.removeAttribute('aria-current');
      }

      var v = views[route];
      if (!v) {
        if (el && !el.getAttribute('data-placeholder')) {
          el.innerHTML = '';
          var p = document.createElement('p');
          p.className = 'placeholder';
          p.textContent = 'Dit tabblad komt binnenkort.';
          el.appendChild(p);
          el.setAttribute('data-placeholder', '1');
        }
        return;
      }
      if (el && el.getAttribute('data-placeholder')) {
        el.innerHTML = '';
        el.removeAttribute('data-placeholder');
      }
      if (!v.initialized) {
        v.initialized = true;
        if (typeof v.def.init === 'function') v.def.init(el, app);
      }
      if (typeof v.def.show === 'function') v.def.show(el, app);
    },

    /** Korte melding onderaan (verdwijnt vanzelf). */
    toast: function (message, ms) {
      var t = document.getElementById('toast');
      if (!t) return;
      t.textContent = message;
      t.hidden = false;
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { t.hidden = true; }, ms || 3000);
    },

    /**
     * Ja/nee-vraag (bijv. voor verwijderen). Gebruikt de native confirm() (werkt ook in iOS standalone);
     * zonder confirm() wordt er niet gevraagd en is het antwoord ja.
     */
    confirm: function (message) {
      if (typeof root.confirm !== 'function') return true;
      try {
        return !!root.confirm(message);
      } catch (err) {
        return true;
      }
    },

    /** true als de app vanaf het beginscherm draait (U22). */
    isStandalone: function () {
      if (root.navigator && root.navigator.standalone === true) return true;
      try {
        return !!(root.matchMedia && root.matchMedia('(display-mode: standalone)').matches);
      } catch (err) {
        return false;
      }
    },

    /**
     * Scherm vóór de app (U22). def: { show(el, app) }. name: 'install' of 'welcome'.
     * De secties #install-screen en #welcome-screen staan in index.html.
     */
    registerGate: function (name, def) {
      if (!GATE_IDS[name]) throw new Error('Onbekend scherm: ' + name);
      gates[name] = def || {};
      if (started && gate === name) app.showGate(name);
    },

    /** Welk scherm moet vóór de app komen? 'install', 'welcome' of null (direct de app). */
    gateFor: function () {
      if (app.store.getSettings().onboarded) return null;
      if (app.isStandalone() || app.browserChosen()) return 'welcome';
      return 'install';
    },

    /** true als in deze sessie gekozen is voor "Toch in de browser gebruiken". */
    browserChosen: function () {
      try {
        return !!(root.sessionStorage && root.sessionStorage.getItem(BROWSER_KEY) === '1');
      } catch (err) {
        return false;
      }
    },

    /** "Toch in de browser gebruiken": onthoud dat (deze sessie) en ga door naar het eerste-keer-scherm. */
    chooseBrowser: function () {
      try {
        if (root.sessionStorage) root.sessionStorage.setItem(BROWSER_KEY, '1');
      } catch (err) { /* privémodus e.d.: dan alleen voor nu */ }
      app.showGate('welcome');
    },

    /** Toont een scherm vóór de app; tabbalk en tandwiel zijn dan verborgen. */
    showGate: function (name) {
      if (current && views[current] && typeof views[current].def.hide === 'function') {
        views[current].def.hide(sectionFor(current), app);
      }
      current = null;
      gate = name;
      document.body.classList.add('gated');
      document.body.setAttribute('data-gate', name);
      ROUTES.forEach(function (r) {
        var el = sectionFor(r);
        if (el) el.hidden = true;
      });
      Object.keys(GATE_IDS).forEach(function (k) {
        var g = document.getElementById(GATE_IDS[k]);
        if (g) g.hidden = k !== name;
      });
      var title = document.getElementById('view-title');
      if (title) title.textContent = GATE_TITLES[name];
      var el = document.getElementById(GATE_IDS[name]);
      if (gates[name] && typeof gates[name].show === 'function') gates[name].show(el, app);
    },

    /** Klaar met het eerste-keer-scherm: naar de gewone app (Invoer). */
    finishGate: function () {
      gate = null;
      document.body.classList.remove('gated');
      document.body.removeAttribute('data-gate');
      Object.keys(GATE_IDS).forEach(function (k) {
        var g = document.getElementById(GATE_IDS[k]);
        if (g) { g.hidden = true; g.innerHTML = ''; }
      });
      app.go(DEFAULT_ROUTE);
    },

    gate: function () { return gate; },

    /** Werkt de badge #review-badge op het tabblad Terugkijken bij (aantal uit calc.reviewQueue). */
    updateReviewBadge: function () {
      var b = document.getElementById('review-badge');
      if (!b || !app.store || !G.calc) return 0;
      var n = 0;
      try {
        n = G.calc.reviewQueue(app.store.listEntries(), new Date()).length;
      } catch (err) {
        n = 0;
      }
      b.textContent = n > 0 ? (n > 99 ? '99+' : String(n)) : '';
      b.setAttribute('data-count', String(n));
      b.hidden = n === 0;
      var tab = document.querySelector('.tab[data-route="terugkijken"]');
      if (tab) {
        if (n > 0) tab.setAttribute('aria-label', 'Terugkijken, ' + n + (n === 1 ? ' uitgave' : ' uitgaven') + ' om terug te kijken');
        else tab.removeAttribute('aria-label');
      }
      return n;
    },

    start: function () {
      if (started) return;
      started = true;
      app.store = G.store.createStore(safeLocalStorage());
      // Badge bij opstarten, na elke opslag en bij elke tabwissel (er kunnen intussen uitgaven 7 dagen oud zijn geworden).
      app.store.onChange(function () { app.updateReviewBadge(); });
      app.updateReviewBadge();
      root.addEventListener('hashchange', function () { app.updateReviewBadge(); app.render(routeFromHash()); });
      var g = app.gateFor();
      if (g) app.showGate(g);
      else app.render(routeFromHash());
    }
  };

  G.app = app;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', app.start);
  } else {
    setTimeout(app.start, 0);
  }
})(window);
