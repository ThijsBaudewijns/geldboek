/*
 * Geldboek - blok "Gegevens" in Instellingen (fase 8) en de back-upherinnering op Invoer (U18).
 * - Back-up maken (#backup-json): JSON via het deelmenu (navigator.share met bestand, U24), anders download.
 * - Exporteer CSV (#backup-csv): idem, geldboek-<datum>.csv.
 * - Back-up terugzetten (#backup-restore -> <input type="file" id="backup-file">): valideert, vraagt bevestiging,
 *   vervangt alles via store.replaceAll.
 * Een geslaagde export zet settings.lastExportAt.
 * Herinnering: #backup-reminder bovenaan #view-invoer (knop #backup-reminder-now, wegklikken #backup-reminder-close;
 * weggeklikt = settings.backupReminderDismissedOn = vandaag, dus morgen komt hij terug als er nog geen back-up is).
 */
(function (root) {
  'use strict';

  var G = root.Geldboek = root.Geldboek || {};
  var h = G.invoerForm.h;
  var B = G.backup;

  function makeFile(text, name, type) {
    var blob = new Blob([text], { type: type });
    var file = null;
    try {
      if (typeof root.File === 'function') file = new File([blob], name, { type: type, lastModified: Date.now() });
    } catch (err) {
      file = null;
    }
    return { blob: blob, file: file };
  }

  function canShareFile(file) {
    var nav = root.navigator;
    if (!file || !nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
    try {
      return !!nav.canShare({ files: [file] });
    } catch (err) {
      return false;
    }
  }

  /** Download via <a download> (pc, of als delen met bestanden niet kan). */
  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  /**
   * Geeft het bestand aan de gebruiker: deelmenu als dat met bestanden kan, anders download.
   * Promise<'shared' | 'downloaded' | 'cancelled'>. Moet direct vanuit een tik worden aangeroepen (iOS).
   */
  function deliver(text, name, type) {
    var f = makeFile(text, name, type);
    if (canShareFile(f.file)) {
      var p;
      try {
        p = root.navigator.share({ files: [f.file], title: name });
      } catch (err) {
        p = Promise.reject(err);
      }
      return Promise.resolve(p).then(function () { return 'shared'; }, function (err) {
        if (err && err.name === 'AbortError') return 'cancelled';
        download(f.blob, name); // delen mislukt om een andere reden: dan toch downloaden
        return 'downloaded';
      });
    }
    download(f.blob, name);
    return Promise.resolve('downloaded');
  }

  function markExported(app, now) {
    app.store.updateSettings({ lastExportAt: now.toISOString() });
    if (app.store.lastError) app.toast('Let op: opslaan op dit toestel mislukte.', 5000);
  }

  /** Maakt de JSON-back-up. Promise<boolean> (true = geslaagd). */
  function exportJSON(app) {
    var now = new Date();
    var text = B.toJSON(app.store.getData(), now);
    return deliver(text, B.jsonFileName(now), 'application/json').then(function (how) {
      if (how === 'cancelled') { app.toast('Back-up niet gemaakt'); return false; }
      markExported(app, now);
      app.toast(how === 'shared' ? 'Back-up gedeeld' : 'Back-up gedownload: ' + B.jsonFileName(now));
      return true;
    });
  }

  /** Maakt de CSV-export. Promise<boolean>. */
  function exportCSV(app) {
    var now = new Date();
    var text = B.toCSV(app.store.getData());
    return deliver(text, B.csvFileName(now), 'text/csv').then(function (how) {
      if (how === 'cancelled') { app.toast('Export niet gemaakt'); return false; }
      markExported(app, now);
      app.toast(how === 'shared' ? 'CSV gedeeld' : 'CSV gedownload: ' + B.csvFileName(now));
      return true;
    });
  }

  function readFileText(file) {
    return new Promise(function (resolve, reject) {
      if (typeof root.FileReader !== 'function') {
        if (file && typeof file.text === 'function') { file.text().then(resolve, reject); return; }
        reject(new Error('Bestanden lezen kan hier niet.'));
        return;
      }
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result || '')); };
      r.onerror = function () { reject(r.error || new Error('Lezen mislukt')); };
      r.readAsText(file);
    });
  }

  function describeDate(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return null;
    var d = new Date(t);
    try {
      return d.toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (err) {
      return d.toISOString().slice(0, 16).replace('T', ' ');
    }
  }

  function countLabel(n) {
    return n + (n === 1 ? ' regel' : ' regels');
  }

  /** Zet een back-upbestand terug. Promise<boolean>. */
  function restoreFile(app, file) {
    return readFileText(file).then(function (text) {
      var res = B.parseBackup(text);
      if (!res.ok) { app.toast(res.error, 5000); return false; }
      var current = app.store.listEntries().length;
      var incoming = res.data.entries.length;
      var made = res.data.settings && describeDate(res.data.settings.lastExportAt);
      var msg = 'Back-up terugzetten' + (made ? ' (gemaakt op ' + made + ')' : '') + '?\n\n' +
        'Alle gegevens op dit toestel (' + countLabel(current) + ') worden vervangen door de back-up (' + countLabel(incoming) + ').';
      if (!app.confirm(msg)) { app.toast('Niets veranderd'); return false; }
      try {
        app.store.replaceAll(res.data);
      } catch (err) {
        app.toast('Terugzetten mislukt: ' + err.message, 5000);
        return false;
      }
      if (app.store.lastError) app.toast('Teruggezet, maar opslaan op dit toestel mislukte.', 5000);
      else app.toast('Back-up teruggezet: ' + countLabel(incoming));
      return true;
    }, function (err) {
      app.toast('Bestand lezen mislukt: ' + err.message, 5000);
      return false;
    });
  }

  function renderGegevens(app, refresh) {
    var s = app.store.getSettings();
    var last = s.lastExportAt ? describeDate(s.lastExportAt) : null;
    var status = h('p', { className: 'hint', id: 'backup-status', text: last ? 'Laatste back-up of export: ' + last + '.' : 'Je hebt nog geen back-up gemaakt.' });

    var jsonBtn = h('button', { type: 'button', className: 'btn btn-primary btn-block', id: 'backup-json', text: 'Back-up maken' });
    var csvBtn = h('button', { type: 'button', className: 'btn btn-block', id: 'backup-csv', text: 'Exporteer CSV' });
    var restoreBtn = h('button', { type: 'button', className: 'btn btn-block', id: 'backup-restore', text: 'Back-up terugzetten' });
    var fileInput = h('input', { type: 'file', id: 'backup-file', className: 'visually-hidden', accept: '.json,application/json', tabindex: '-1', 'aria-hidden': 'true' });

    jsonBtn.addEventListener('click', function () {
      exportJSON(app).then(function (ok) { if (ok) refresh(); });
    });
    csvBtn.addEventListener('click', function () {
      exportCSV(app).then(function (ok) { if (ok) refresh(); });
    });
    restoreBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      restoreFile(app, file).then(function (ok) {
        fileInput.value = '';
        if (ok) refresh();
      });
    });

    return h('div', { className: 'data-block' }, [
      h('p', { className: 'hint', text: 'Je gegevens staan alleen op deze telefoon. Maak elke week een back-up en bewaar hem in Bestanden of stuur hem naar Thijs.' }),
      status,
      jsonBtn,
      h('p', { className: 'hint', text: 'Een .json-bestand met alles. Daarmee kun je later alles terugzetten.' }),
      csvBtn,
      h('p', { className: 'hint', text: 'Een .csv-bestand voor Excel of Numbers, één regel per uitgave of inkomst.' }),
      restoreBtn,
      h('p', { className: 'hint', text: 'Kies een eerder gemaakte back-up (.json). Alles op dit toestel wordt dan vervangen.' }),
      fileInput
    ]);
  }

  // ---- back-upherinnering op Invoer (U18) ----

  function renderReminder(el, app) {
    var old = document.getElementById('backup-reminder');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (!el || !app || !app.store) return;
    var s = app.store.getSettings();
    var entries = app.store.listEntries();
    var now = new Date();
    if (!B.reminderDue(s, entries, now)) return;
    var days = B.daysSinceExport(s, entries, now);
    var text = s.lastExportAt
      ? 'Je laatste back-up is ' + days + ' dagen oud.'
      : 'Je hebt nog geen back-up gemaakt.';
    var now2 = h('button', { type: 'button', className: 'btn btn-primary btn-small', id: 'backup-reminder-now', text: 'Nu back-up maken' });
    var close = h('button', { type: 'button', className: 'reminder-close', id: 'backup-reminder-close', 'aria-label': 'Herinnering wegklikken', text: '×' });
    var bar = h('div', { className: 'reminder', id: 'backup-reminder', role: 'status' }, [
      h('p', { className: 'reminder-text', text: text }),
      now2,
      close
    ]);
    now2.addEventListener('click', function () {
      exportJSON(app).then(function (ok) { if (ok) renderReminder(el, app); });
    });
    close.addEventListener('click', function () {
      app.store.updateSettings({ backupReminderDismissedOn: B.fileDate(new Date()) });
      renderReminder(el, app);
    });
    el.insertBefore(bar, el.firstChild);
  }

  G.gegevens = {
    deliver: deliver,
    exportJSON: exportJSON,
    exportCSV: exportCSV,
    restoreFile: restoreFile,
    renderReminder: renderReminder,
    render: renderGegevens
  };

  G.instellingen.blocks.push({ id: 'gegevens', title: 'Gegevens', render: renderGegevens });
})(window);
