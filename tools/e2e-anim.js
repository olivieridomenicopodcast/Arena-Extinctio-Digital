// Prova delle animazioni nel browser: AI contro AI a velocità lenta, screenshot a metà animazione, nessun errore JS.
//   NODE_PATH=/opt/node-tools/node_modules node tools/e2e-anim.js [cartella]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), http = require('http');
const out = process.argv[2] || '/tmp/e2e-anim'; fs.mkdirSync(out, { recursive: true });
const root = path.join(__dirname, '..');
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } const t = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream'; res.writeHead(200, { 'Content-Type': t }); fs.createReadStream(f).pipe(res); });
(async () => {
  await new Promise((r) => server.listen(0, r)); const url = 'http://localhost:' + server.address().port + '/';
  const b = await chromium.launch(); const errs = [];
  const p = await b.newPage({ viewport: { width: 1300, height: 950 } });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(url + '?v=' + Date.now()); await p.waitForTimeout(300);
  await p.click('text=AI contro AI'); await p.selectOption('#nav select', 'slow');
  const want = { roll: /tira \d+D6/, attack: /attacca/, arrive: /si ferma su/, damage: /subisce/, heal: /recupera/, kill: /eliminato/ };
  const got = {}; const t0 = Date.now(); let last = '';
  while (Date.now() - t0 < 150000 && Object.keys(got).length < 6) {
    const vis = await p.locator('#banner:visible').count();
    if (vis) {
      const t = await p.locator('#banner .msg').innerText().catch(() => '');
      if (t !== last) {
        last = t;
        for (const k in want) if (!got[k] && want[k].test(t)) { got[k] = 1; await p.waitForTimeout(k === 'attack' ? 1500 : k === 'arrive' ? 350 : 450); await p.screenshot({ path: `${out}/${k}.png` }); console.log('shot', k, '—', t.slice(0, 70)); }
      }
    }
    await p.waitForTimeout(80);
  }
  console.log('viste:', Object.keys(got).join(','), '· errori JS:', errs.length); errs.slice(0, 5).forEach((e) => console.log(e));
  await b.close(); server.close();
  process.exit(errs.length ? 1 : 0);
})();
