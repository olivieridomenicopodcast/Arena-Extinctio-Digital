// Prova nel browser della partita in rete: un host e due amici (contesti separati di Chromium) + 1 AI giocano insieme.
//   NODE_PATH=/opt/node-tools/node_modules node tools/e2e-net.js [cartella]      (serve prima: tools/peer-server.js, vedi l'intestazione)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), http = require('http');
const out = process.argv[2] || '/tmp/e2e-net'; fs.mkdirSync(out, { recursive: true });
const root = path.join(__dirname, '..');
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } const t = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream'; res.writeHead(200, { 'Content-Type': t }); fs.createReadStream(f).pipe(res); });
(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/';
  const q = 'peerhost=localhost&peerport=9000';
  const b = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const errs = []; let ok = true;
  const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) ok = false; };
  const mkPage = async (name) => { const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } }); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(name + ': ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(name + ' console: ' + m.text()); }); return p; };
  const host = await mkPage('host'), g1 = await mkPage('amico1'), g2 = await mkPage('amico2');
  await host.goto(base + '?' + q); await host.click('text=Crea una stanza');
  await host.waitForFunction(() => /^[A-Z0-9]{4}$/.test((document.querySelector('#screen .card div[style*="letter-spacing"]') || {}).textContent || ''), null, { timeout: 20000 });
  const code = await host.locator('#screen .card div[style*="letter-spacing"]').first().innerText();
  check(code.length === 4, 'stanza aperta, codice ' + code);
  // 4 posti: io, amico, amico, AI
  await host.selectOption('#screen select >> nth=0', '4');
  const kinds = host.locator('.seat select:nth-child(2)');
  await kinds.nth(2).selectOption('friend');
  await g1.goto(base + '?join=' + code + '&' + q); await g1.fill('input[placeholder="Il tuo nome"]', 'Erika'); await g1.click('button:has-text("Entra")');
  await g2.goto(base + '?join=' + code + '&' + q); await g2.fill('input[placeholder="Il tuo nome"]', 'Rodolfo'); await g2.click('button:has-text("Entra")');
  await host.waitForFunction(() => /Amici collegati: 2 su 2/.test(document.body.innerText), null, { timeout: 30000 });
  check(true, 'i due amici si sono collegati');
  await host.click('button:has-text("Inizia la partita")');
  const pages = [['host', host], ['amico1', g1], ['amico2', g2]];
  await Promise.all(pages.map(([n, p]) => p.waitForSelector('#board', { timeout: 20000 })));
  check(true, 'partita partita su tutti e tre i dispositivi');
  const decisions = { host: 0, amico1: 0, amico2: 0 };
  const play = async (n, p, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try {
        if (await p.locator('#modalBg:visible .btn.primary').count()) { const h2 = await p.locator('#modal h2').count() ? await p.locator('#modal h2').innerText() : ''; if (/Vince|Nessun/.test(h2)) return 'fine'; await p.locator('#modalBg:visible .btn.primary').first().click(); continue; }
        if (await p.locator('#banner:visible').count()) { await p.keyboard.press('Space'); await p.waitForTimeout(15); continue; }
        const hex = p.locator('#board .hex.sel, #board .hex.selw, #board .hex.selp, #board .hex.sel2');
        if (await hex.count()) { await hex.nth(Math.floor(Math.random() * await hex.count())).dispatchEvent('click'); decisions[n]++; await p.waitForTimeout(30); continue; }
        const acts = p.locator('#actionPanel .act:not([disabled])');
        if (await acts.count()) { await acts.last().click(); decisions[n]++; await p.waitForTimeout(30); continue; }
        const opts = p.locator('#actionPanel .opt:not([disabled])');
        if (await opts.count()) { await opts.first().click(); decisions[n]++; continue; }
      } catch (e) { /* elemento sparito durante il clic */ }
      await p.waitForTimeout(40);
    }
    return 'tempo';
  };
  const res = await Promise.all(pages.map(([n, p]) => play(n, p, 90000)));
  console.log('decisioni:', JSON.stringify(decisions), 'esiti:', res.join(','));
  check(decisions.host > 3 && decisions.amico1 > 3 && decisions.amico2 > 3, 'ognuno ha preso decisioni sul proprio dispositivo');
  const rounds = await Promise.all(pages.map(async ([n, p]) => { const m = (await p.locator('#status').innerText().catch(() => '')).match(/Round\s+(\d+)/); return m ? +m[1] : null; }));
  console.log('round visti:', rounds.join(','));
  check(rounds.every((r) => r != null) && Math.max(...rounds) - Math.min(...rounds) <= 1, 'i tre dispositivi mostrano lo stesso round');
  await host.screenshot({ path: out + '/host.png' }); await g1.screenshot({ path: out + '/amico1.png' });
  console.log('errori JS:', errs.length); errs.slice(0, 6).forEach((e) => console.log(e));
  await b.close(); server.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
