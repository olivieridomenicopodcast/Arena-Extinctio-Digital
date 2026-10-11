// Prova nel browser (Chromium + Playwright): gioca partite complete con un "bot umano" che clicca l'interfaccia, fa screenshot e controlla gli errori.
//   NODE_PATH=/opt/node-tools/node_modules node tools/e2e.js [--mode vs|watch|review] [--mobile] [--steps 600] [--out cartella]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), http = require('http');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const mode = arg('mode', 'vs'), mobile = !!arg('mobile', false), steps = Number(arg('steps', 600)), out = arg('out', '/tmp/e2e');
fs.mkdirSync(out, { recursive: true });
const root = path.join(__dirname, '..');
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } const t = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream'; res.writeHead(200, { 'Content-Type': t }); fs.createReadStream(f).pipe(res); });
(async () => {
  await new Promise((r) => server.listen(0, r)); const url = 'http://localhost:' + server.address().port + '/';
  const b = await chromium.launch(); const errs = [];
  const p = await b.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1500, height: 950 } });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(url + '?v=' + Date.now()); await p.waitForTimeout(300);
  const tag = (mobile ? 'm-' : 'd-') + mode;
  if (mode === 'watch') { await p.click('text=AI contro AI'); await p.selectOption('#nav select', 'instant'); }
  else await p.click('text=Gioca contro l’AI');
  const seen = {}; let n = 0, shots = 0;
  const shot = async (name) => { if (shots < 14) { await p.screenshot({ path: `${out}/${tag}-${name}.png`, fullPage: mobile }); shots++; } };
  while (n++ < steps) {
    if (await p.locator('#modal h2').count() && (await p.locator('#modal h2').innerText()).match(/Vince|Nessun/)) { await shot('fine'); console.log('PARTITA FINITA:', (await p.locator('#modal h2').innerText()), '— passi:', n); break; }
    if (await p.locator('#modalBg:visible .btn.primary').count() && !(await p.locator('#modal h2').innerText().catch(() => '')).match(/Vince|Nessun/)) { await p.locator('#modalBg:visible .btn.primary').first().click(); continue; }
    if (await p.locator('#banner:visible').count()) { const t = await p.locator('#banner .msg').innerText(); if (!seen.banner) { seen.banner = 1; await shot('banner'); } await p.keyboard.press('Space'); await p.waitForTimeout(15); continue; }
    const hex = p.locator('#board .hex.sel, #board .hex.sel2');
    if (await hex.count()) { if (!seen.move) { seen.move = 1; await shot('scelta-tessera'); } const k = Math.floor(Math.random() * await hex.count()); await hex.nth(k).dispatchEvent('click'); await p.waitForTimeout(15); continue; }
    const acts = p.locator('#actionPanel .act:not([disabled])');
    if (await acts.count()) {
      if (!seen.act) { seen.act = 1; await shot('azioni'); }
      const cnt = await acts.count();
      // preferisce azioni non "fine turno"; con probabilità 25% finisce il turno
      const all = await acts.all(); const end = all[all.length - 1];
      const pick = Math.random() < 0.25 || cnt === 1 ? end : all[Math.floor(Math.random() * (cnt - 1))];
      await pick.click(); await p.waitForTimeout(15); continue;
    }
    const opts = p.locator('#actionPanel .opt:not([disabled])');
    if (await opts.count()) { if (!seen.list) { seen.list = 1; await shot('lista'); } await opts.nth(Math.floor(Math.random() * await opts.count())).click(); await p.waitForTimeout(15); continue; }
    await p.waitForTimeout(40);
  }
  if (n >= steps) { console.log('FERMATO a', steps, 'passi (partita non finita)'); await shot('stop'); }
  console.log(errs.length ? 'ERRORI:\n' + errs.slice(0, 10).join('\n') : 'nessun errore JS');
  await b.close(); server.close();
})();
