#!/usr/bin/env node
/*
 * Statische server voor app/ (alleen Node-ingebouwde modules).
 * Gebruik: node tests/tools/serve.js [poort]   (standaard 8765, of env PORT)
 */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..', '..', 'app');
var PORT = Number(process.argv[2] || process.env.PORT || 8765);

var TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

var server = http.createServer(function (req, res) {
  var urlPath;
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
  } catch (err) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  var file = path.resolve(ROOT, '.' + urlPath);
  if (file !== ROOT && file.indexOf(ROOT + path.sep) !== 0) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.stat(file, function (err, st) {
    if (!err && st.isDirectory()) {
      file = path.join(file, 'index.html');
    }
    fs.readFile(file, function (err2, data) {
      if (err2) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Niet gevonden');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      res.end(data);
    });
  });
});

server.listen(PORT, function () {
  console.log('Geldboek: http://localhost:' + PORT + '/');
});
