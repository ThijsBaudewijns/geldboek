/*
 * Geldboek - service worker (U26). Alleen geregistreerd via http(s) (U3), nooit vanaf file://.
 * Cache-first voor alle bestanden van de app; data zit in localStorage/IndexedDB, niet in deze cache.
 *
 * BIJ ELKE WIJZIGING IN app/ : VERSION ophogen (v1 -> v2 ...). Dan installeert de browser deze worker
 * opnieuw, toont de app de balk "Nieuwe versie, tik om te verversen" en ruimt activate de oude cache op.
 * Nieuw bestand in app/? Ook toevoegen aan FILES.
 */
'use strict';

const VERSION = 'v2';
var CACHE_PREFIX = 'geldboek-';
var CACHE = CACHE_PREFIX + VERSION;
var FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/store.js',
  './js/calc.js',
  './js/backup.js',
  './js/app.js',
  './js/ui-invoer.js',
  './js/ui-overzicht.js',
  './js/ui-instellingen.js',
  './js/ui-terugkijken.js',
  './js/ui-reflectie.js',
  './js/ui-gegevens.js',
  './js/ui-welkom.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  // Geen skipWaiting hier: een nieuwe versie wacht tot de gebruiker op de balk tikt.
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(FILES.map(function (f) { return new Request(f, { cache: 'reload' }); }));
  }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) {
      if (k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE) return caches.delete(k);
      return null;
    }));
  }).then(function () {
    return self.clients.claim();
  }));
});

self.addEventListener('message', function (event) {
  var d = event.data;
  if (d === 'skipWaiting' || (d && d.type === 'skipWaiting')) self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  var isPage = req.mode === 'navigate';
  event.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (resp) {
        if (resp && resp.ok && resp.type === 'basic') cache.put(req, resp.clone());
        return resp;
      }, function (err) {
        // Offline en niet in de cache: voor een pagina de app zelf teruggeven.
        if (isPage) {
          return cache.match('./index.html').then(function (page) {
            if (page) return page;
            throw err;
          });
        }
        throw err;
      });
    });
  }));
});
