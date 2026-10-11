// Rigenera sw.js (elenco dei file in cache). Incrementa VERSION a ogni modifica ai file in cache.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const VERSION = Number(process.argv[2] || (fs.existsSync(path.join(root, 'sw.js')) ? (/ae-v(\d+)/.exec(fs.readFileSync(path.join(root, 'sw.js'), 'utf8')) || [0, 0])[1] : 0)) + (process.argv[2] ? 0 : 1);
const walk = (d) => fs.readdirSync(path.join(root, d)).flatMap((f) => { const p = d + '/' + f; return fs.statSync(path.join(root, p)).isDirectory() ? walk(p) : [p]; });
const files = ['index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'].concat(walk('css'), walk('js'), walk('assets')).map((f) => './' + f);
fs.writeFileSync(path.join(root, 'sw.js'), `/* Service worker: l'app funziona offline. GENERATO da tools/build-sw.js — aumenta la versione a ogni modifica ai file in cache. */
const CACHE = 'ae-v${VERSION}';
const FILES = ${JSON.stringify(['./'].concat(files), null, 0)};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(e.request);
    const net = fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
`);
console.log('sw.js v' + VERSION + ' con ' + (files.length + 1) + ' file');
