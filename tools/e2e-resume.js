// Prova nel browser: salvataggio automatico e ripresa; schermate Regole e Simulatore; "Rivedi".
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), http = require('http');
const out = process.argv[2] || '/tmp/e2e';
fs.mkdirSync(out, { recursive: true });
const root = path.join(__dirname, '..');
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } const t = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream'; res.writeHead(200, { 'Content-Type': t }); fs.createReadStream(f).pipe(res); });
(async () => {
  await new Promise((r) => server.listen(0, r)); const url = 'http://localhost:' + server.address().port + '/';
  const b = await chromium.launch(); const errs = []; let ok = true;
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } }); const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (c, msg) => { console.log((c ? 'OK   ' : 'FAIL ') + msg); if (!c) ok = false; };
  await p.goto(url); await p.click('text=Gioca contro l’AI');
  // gioca un po' (bot umano)
  for (let n = 0; n < 300; n++) {
    if (await p.locator('#modalBg:visible .btn.primary').count()) { await p.locator('#modalBg:visible .btn.primary').first().click(); continue; }
    if (await p.locator('#banner:visible').count()) { await p.keyboard.press('Space'); await p.waitForTimeout(10); continue; }
    const hex = p.locator('#board .hex.sel, #board .hex.selw, #board .hex.selp, #board .hex.sel2'); if (await hex.count()) { await hex.nth(0).dispatchEvent('click'); await p.waitForTimeout(10); continue; }
    const acts = p.locator('#actionPanel .act:not([disabled])'); if (await acts.count()) { await acts.last().click(); await p.waitForTimeout(10); continue; }
    const opts = p.locator('#actionPanel .opt:not([disabled])'); if (await opts.count()) { await opts.first().click(); continue; }
    await p.waitForTimeout(20);
    const m = (await p.locator('#status').innerText()).match(/Round\s+(\d+)/); if (m && +m[1] >= 4 && await p.locator('#actionPanel .act').count() && await p.evaluate(() => !!AE.UI.session.choiceResolve && !document.querySelector('#banner').offsetParent === false || (!!AE.UI.session.choiceResolve && getComputedStyle(document.querySelector('#banner')).display === 'none'))) break;
  }
  const before = { status: await p.locator('#status').innerText(), players: await p.locator('#pane').innerText(), state: await p.evaluate(() => JSON.stringify(AE.UI.session.game.s)) };
  const save = await p.evaluate(() => localStorage.getItem('ae-save-v1'));
  check(!!save && JSON.parse(save).history.length > 10, 'salvataggio automatico presente (' + (save ? JSON.parse(save).history.length : 0) + ' decisioni)');
  await p.reload(); await p.waitForTimeout(300);
  check((await p.locator('body').innerText()).includes('Partita in corso'), 'la home propone di riprendere');
  await p.click('button:has-text("Riprendi")'); await p.waitForTimeout(800);
  for (let n = 0; n < 5 && await p.locator('#banner:visible').count(); n++) { await p.keyboard.press('Space'); await p.waitForTimeout(30); }
  const after = { status: await p.locator('#status').innerText(), players: await p.locator('#pane').innerText(), state: await p.evaluate(() => JSON.stringify(AE.UI.session.game.s)) };
  const r1 = before.status.match(/Round\s+(\d+)/)[1], r2 = after.status.match(/Round\s+(\d+)/)[1];
  check(r1 === r2, `stesso round dopo la ripresa (${r1} → ${r2})`);
  const same = before.players.replace(/\s+/g, ' ') === after.players.replace(/\s+/g, ' ');
  check(same, 'stessi PV, mana, monete e armi di tutti dopo la ripresa');
  if (!same) { const A = JSON.parse(before.state), B = JSON.parse(after.state); for (const k in A) if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) console.log('   stato diverso in', k, k === 'players' ? A[k].map((x, i) => JSON.stringify(x) === JSON.stringify(B[k][i]) ? '=' : 'DIVERSO ' + i).join(' ') : ''); fs.writeFileSync(out + '/fail-save.json', save); fs.writeFileSync(out + '/fail-before.json', before.state); fs.writeFileSync(out + '/fail-after.json', after.state); const a = before.players.split('\n'), c = after.players.split('\n'); for (let i = 0; i < Math.max(a.length, c.length); i++) if (a[i] !== c[i]) console.log('   prima:', a[i], '| dopo:', c[i]); }
  await p.screenshot({ path: out + '/ripresa.png' });
  // regole
  await p.click('button:has-text("Menu")'); await p.click('#nav >> text=Regole'); await p.waitForTimeout(200);
  check((await p.locator('.rules').innerText()).includes('Regolamento (versione digitale)') || (await p.locator('.rules h1').first().innerText()).includes('Arena Extinctio'), 'schermata Regole mostra il regolamento');
  await p.screenshot({ path: out + '/regole.png' });
  await p.fill('input[placeholder^="Cerca"]', 'Fastidio'); await p.waitForTimeout(100);
  check((await p.locator('.rules > *:visible').count()) < (await p.locator('.rules > *').count()), 'la ricerca nel regolamento filtra');
  // simulatore
  await p.click('#nav >> text=Simulatore'); await p.waitForTimeout(200);
  await p.locator('input[type=number]').nth(0).fill('6');
  await p.click('text=Avvia'); await p.waitForSelector('.rules table', { timeout: 120000 });
  check((await p.locator('.rules').last().innerText()).includes('Vittorie per profilo'), 'il simulatore produce il report');
  await p.screenshot({ path: out + '/simulatore.png' });
  console.log(errs.length ? 'ERRORI JS:\n' + errs.join('\n') : 'nessun errore JS');
  await b.close(); server.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
