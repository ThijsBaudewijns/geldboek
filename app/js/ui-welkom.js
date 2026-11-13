/*
 * Geldboek - schermen vóór de app (U22, U11):
 *   'install': installatiescherm (niet standalone en nog niet onboarded): zet Geldboek op het beginscherm.
 *              "Toch in de browser gebruiken" -> app.chooseBrowser() (onthouden in sessionStorage).
 *   'welcome': eerste-keer-scherm: uitleg, startsaldo (verplicht, mag 0/negatief), uurloon (optioneel).
 *              Zet startDate op vandaag en onboarded op true, daarna naar Invoer.
 * app.js beslist welk scherm getoond wordt (app.gateFor) en verbergt dan tabbalk en tandwiel.
 */
(function (root) {
  'use strict';

  var G = root.Geldboek = root.Geldboek || {};
  var h = G.invoerForm.h;

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /** Klein inline-SVG-icoon uit een lijst [tag, attrs]-paren (stroke = currentColor). */
  function icon(parts, label) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '28');
    svg.setAttribute('height', '28');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    parts.forEach(function (p) {
      var el = document.createElementNS(SVG_NS, p[0]);
      Object.keys(p[1]).forEach(function (k) { el.setAttribute(k, p[1][k]); });
      svg.appendChild(el);
    });
    if (label) svg.setAttribute('data-icon', label);
    return svg;
  }

  // iOS-deelknop: vierkant met pijl omhoog.
  var ICON_SHARE = [
    ['path', { d: 'M12 3v12' }],
    ['path', { d: 'M8 7l4-4 4 4' }],
    ['path', { d: 'M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17.5 10H16' }]
  ];
  // "Zet op beginscherm": afgerond vierkant met plus.
  var ICON_ADD = [
    ['rect', { x: '4', y: '4', width: '16', height: '16', rx: '4' }],
    ['path', { d: 'M12 8.5v7M8.5 12h7' }]
  ];
  // "Voeg toe" en openen via het icoon: app-tegel met euroteken.
  var ICON_APP = [
    ['rect', { x: '3.5', y: '3.5', width: '17', height: '17', rx: '5' }],
    ['path', { d: 'M15 8.6a3.6 3.6 0 1 0 0 6.8M8 11h5M8 13h5' }]
  ];

  function step(n, iconParts, iconName, title, text) {
    return h('li', { className: 'step', 'data-step': String(n) }, [
      h('span', { className: 'step-icon' }, [icon(iconParts, iconName)]),
      h('span', { className: 'step-body' }, [
        h('span', { className: 'step-title', text: n + '. ' + title }),
        text ? h('span', { className: 'step-text', text: text }) : null
      ])
    ]);
  }

  function renderInstall(el, app) {
    el.innerHTML = '';
    var browser = h('button', { type: 'button', className: 'btn btn-link install-browser', id: 'install-browser', text: 'Toch in de browser gebruiken' });
    browser.addEventListener('click', function () {
      app.chooseBrowser();
      root.scrollTo(0, 0);
    });
    el.appendChild(h('div', { className: 'gate' }, [
      h('h2', { className: 'gate-title', text: 'Zet Geldboek eerst op je beginscherm' }),
      h('p', { className: 'gate-lead', text: 'Dan blijven je gegevens veilig op je iPhone. In Safari kan iOS ze na een week zonder gebruik wissen.' }),
      h('ol', { className: 'steps', id: 'install-steps' }, [
        step(1, ICON_SHARE, 'share', 'Tik op de Deel-knop', 'Onderin Safari (het vierkantje met de pijl omhoog).'),
        step(2, ICON_ADD, 'add-home', 'Kies "Zet op beginscherm"', 'Scrol in het menu omlaag als je hem niet meteen ziet.'),
        step(3, ICON_APP, 'app', 'Tik op "Voeg toe"', 'Open Geldboek voortaan via het nieuwe icoon op je beginscherm.')
      ]),
      h('p', { className: 'gate-note', text: 'Werkt alleen in Safari. Gebruik je een andere browser, open de link dan eerst in Safari.' }),
      h('div', { className: 'gate-foot' }, [browser])
    ]));
  }

  function hintEl(id, text) {
    return h('p', { className: 'hint', id: id, text: text });
  }

  function renderWelcome(el, app) {
    var calc = G.calc;
    var form = G.invoerForm;
    el.innerHTML = '';

    var balance = form.signedAmountField({ id: 'o-start-balance', label: 'Hoeveel geld heb je nu?', large: true, placeholder: '0,00' });
    balance.field.insertBefore(hintEl('o-start-balance-hint', 'Tel je betaalrekening en je contante geld op. Sta je rood? Tik dan op ± voor een min.'), balance.field.lastChild);

    var wage = h('input', {
      id: 'o-wage', name: 'wage', className: 'input input-money', type: 'text', inputmode: 'decimal',
      autocomplete: 'off', placeholder: 'Bijv. 15,00', 'aria-describedby': 'o-wage-hint o-wage-error'
    });
    var wageErr = h('p', { className: 'error', id: 'o-wage-error', hidden: true });
    var fWage = h('div', { className: 'field', 'data-field': 'o-wage' }, [
      h('label', { className: 'label', 'for': 'o-wage', text: 'Uurloon (optioneel)' }),
      h('div', { className: 'amount-wrap amount-wrap-small' }, [h('span', { className: 'currency', 'aria-hidden': 'true', text: '€' }), wage]),
      hintEl('o-wage-hint', 'Dan zie je bij elke uitgave hoeveel uur je ervoor moet werken.'),
      wageErr
    ]);
    function setWageError(msg) {
      fWage.classList.toggle('invalid', !!msg);
      wageErr.textContent = msg || '';
      wageErr.hidden = !msg;
    }
    wage.addEventListener('input', function () { setWageError(null); });

    var submit = h('button', { type: 'submit', className: 'btn btn-primary btn-block', id: 'o-submit', text: 'Begin' });
    var f = h('form', { className: 'form', id: 'welcome-form', novalidate: true, autocomplete: 'off' }, [
      balance.el,
      fWage,
      h('div', { className: 'gate-submit' }, [submit])
    ]);

    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var raw = balance.input.value;
      var start = calc.parseSignedAmount(raw);
      var ok = true;
      if (raw.trim() === '') {
        balance.setError('Vul in hoeveel geld je nu hebt. Niets? Vul dan 0 in.');
        ok = false;
      } else if (start === null) {
        balance.setError('Dit is geen geldig bedrag. Gebruik bijvoorbeeld 250,00 of -40.');
        ok = false;
      } else {
        balance.setError(null);
      }
      var wageCents = null;
      if (wage.value.trim() !== '') {
        wageCents = calc.parseAmount(wage.value);
        if (wageCents === null) {
          setWageError('Dit is geen geldig uurloon. Gebruik bijvoorbeeld 15,00, of laat het leeg.');
          ok = false;
        }
      }
      if (!ok) {
        var bad = f.querySelector('.invalid input');
        if (bad) bad.focus();
        return;
      }
      app.store.updateSettings({
        startBalanceCents: start,
        hourlyWageCents: wageCents,
        startDate: calc.toISODate(new Date()),
        onboarded: true
      });
      if (app.store.lastError) app.toast('Let op: opslaan op dit toestel mislukte.', 5000);
      else app.toast('Klaar! Voeg nu je eerste uitgave toe.');
      app.finishGate();
      root.scrollTo(0, 0);
    });

    el.appendChild(h('div', { className: 'gate' }, [
      h('h2', { className: 'gate-title', text: 'Je huiswerk voor een maand' }),
      h('p', { className: 'gate-lead', id: 'welcome-intro', text: 'Leg een maand lang elke uitgave vast, met waarom. Daarna kijken we samen terug.' }),
      h('p', { className: 'gate-lead', text: 'Begin met hoeveel geld je nu hebt; daarmee rekent Geldboek je saldo uit.' }),
      f
    ]));
  }

  G.app.registerGate('install', { show: renderInstall });
  G.app.registerGate('welcome', { show: renderWelcome });
})(window);
