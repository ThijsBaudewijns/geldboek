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

    /** true als de app vanaf het beginscherm draait (U22; het installatiescherm volgt in fase 4). */
    isStandalone: function () {
      if (root.navigator && root.navigator.standalone === true) return true;
      try {
        return !!(root.matchMedia && root.matchMedia('(display-mode: standalone)').matches);
      } catch (err) {
        return false;
      }
    },

    start: function () {
      if (started) return;
      started = true;
      app.store = G.store.createStore(safeLocalStorage());
      root.addEventListener('hashchange', function () { app.render(routeFromHash()); });
      app.render(routeFromHash());
    }
  };

  G.app = app;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', app.start);
  } else {
    setTimeout(app.start, 0);
  }
})(window);
