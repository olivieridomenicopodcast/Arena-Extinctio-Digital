// Prova nel browser della partita in rete: un host e due amici (contesti separati di Chromium) + 1 AI giocano insieme.
//   NODE_PATH=/opt/node-tools/node_modules node tools/e2e-net.js [cartella] [--resume]     (serve prima: tools/peer-server.js, vedi l'intestazione)
//   --resume: il tavolo chiude l'app a metà partita (salvataggio con storageState), la riapre dalla home con «Riapri la stanza»,
//             gli amici premono «Riconnetti» e la partita riprende dallo stesso punto e finisce con lo stesso esito su tutti gli schermi; il salvataggio si cancella.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), http = require('http');
const RESUME = process.argv.includes('--resume');
const out = process.argv.slice(2).find((a) => !a.startsWith('--')) || '/tmp/e2e-net'; fs.mkdirSync(out, { recursive: true });
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
  // posti: io, amico, amico (+ un'AI senza --resume: più veloce da finire con tre soli giocatori)
  await host.selectOption('#screen select >> nth=0', RESUME ? '3' : '4');
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
  const playUntilEnd = async (n, p, ms, cnt) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try {
        if (await p.locator('#modalBg:visible .btn.primary').count()) { const h2 = await p.locator('#modal h2').count() ? await p.locator('#modal h2').innerText() : ''; if (/Vince|Nessun/.test(h2)) return 'fine'; await p.locator('#modalBg:visible .btn.primary').first().click(); continue; }
        if (await p.locator('#banner:visible').count()) { await p.keyboard.press('Space'); await p.waitForTimeout(15); continue; }
        const hex = p.locator('#board .hex.sel, #board .hex.selw, #board .hex.selp, #board .hex.sel2');
        if (await hex.count()) { await hex.nth(Math.floor(Math.random() * await hex.count())).dispatchEvent('click'); cnt[n]++; await p.waitForTimeout(30); continue; }
        const acts = p.locator('#actionPanel .act:not([disabled])');
        if (await acts.count()) { const na = await acts.count(); await acts.nth(Math.random() < 0.7 ? 0 : Math.floor(Math.random() * na)).click(); cnt[n]++; await p.waitForTimeout(30); continue; }
        const opts = p.locator('#actionPanel .opt:not([disabled])');
        if (await opts.count()) { await opts.first().click(); cnt[n]++; continue; }
      } catch (e) { /* elemento sparito durante il clic */ }
      await p.waitForTimeout(40);
    }
    return 'tempo';
  };
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
  if (RESUME) {
    // ───── fase 1: si gioca un po', poi si ferma il gioco sulle scelte (si fanno avanzare solo i messaggi)
    const fast = async (p) => { await p.selectOption('#nav select', 'instant').catch(() => {}); };
    await Promise.all(pages.map(([n, p]) => fast(p)));
    await Promise.all(pages.map(([n, p]) => play(n, p, 25000)));
    const drain = async (p) => { for (let i = 0; i < 60; i++) { if (await p.locator('#banner:visible').count()) { await p.keyboard.press('Space'); await p.waitForTimeout(40); i = 0; } else await p.waitForTimeout(60); } };
    await Promise.all(pages.map(([n, p]) => drain(p)));
    await host.waitForFunction(() => { const S = AE.UI.session; return S && ((S.net && Object.keys(S.net.pending).length > 0) || S.choiceResolve) && !document.querySelector('#banner').offsetParent; }, null, { timeout: 30000 });
    await host.waitForTimeout(1500);
    const stateOf = (p) => p.evaluate(() => JSON.stringify(AE.UI.session.game.s));
    const before = await stateOf(host);
    const sv = await host.evaluate(() => JSON.parse(localStorage.getItem('ae-netsave-v1')));
    check(!!sv && sv.history.length > 10 && sv.code === code, 'il tavolo ha salvato la partita (' + (sv ? sv.history.length : 0) + ' risposte, codice ' + (sv && sv.code) + ')');
    const roundBefore = JSON.parse(before).round;
    console.log('prima della chiusura: round', roundBefore, 'turno di', JSON.parse(before).cur);
    // ───── il tavolo chiude l'app
    const storage = await host.context().storageState();
    await host.context().close();
    console.log('  … il tavolo ha chiuso l\'app');
    // ───── e la riapre: la home propone la partita in sospeso
    const ctxH = await b.newContext({ viewport: { width: 1300, height: 950 }, storageState: storage });
    const host2 = await ctxH.newPage(); host2.on('pageerror', (e) => errs.push('tavolo2: ' + e.message));
    host2.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('tavolo2 console: ' + m.text()); });
    await host2.goto(base + '?' + q);
    check(/partita in rete in sospeso/i.test(await host2.locator('body').innerText()), 'la home mostra «Partita in rete in sospeso»');
    await host2.click('button:has-text("Riapri la stanza")');
    await host2.waitForFunction(() => /^[A-Z0-9]{4}$/.test((document.querySelector('#screen .card div[style*="letter-spacing"]') || {}).textContent || ''), null, { timeout: 60000 });
    const code2 = await host2.locator('#screen .card div[style*="letter-spacing"]').first().innerText();
    check(code2 === code, 'la stanza è stata riaperta con lo stesso codice (' + code2 + ')');
    // gli amici vedono «Collegamento perso» e premono «Riconnetti»
    for (const [n, p] of [['amico1', g1], ['amico2', g2]]) {
      await p.waitForSelector('#modal:has-text("Collegamento perso")', { timeout: 40000 });
      await p.click('button:has-text("Riconnetti")');
    }
    await host2.waitForFunction(() => /Amici attesi: 2 su 2/.test(document.body.innerText), null, { timeout: 40000 });
    check(true, 'i due amici sono rientrati con lo stesso nome');
    // un nome sconosciuto non può entrare
    const ctxX = await b.newContext({ viewport: { width: 800, height: 700 } }); const px = await ctxX.newPage();
    await px.goto(base + '?join=' + code + '&' + q); await px.fill('input[placeholder="Il tuo nome"]', 'Intruso'); await px.click('button:has-text("Entra")');
    await host2.waitForFunction(() => /Ha provato a entrare “Intruso”/.test(document.body.innerText), null, { timeout: 30000 });
    check(true, 'il tavolo segnala chi entra con un nome non presente nel salvataggio');
    await ctxX.close();
    await host2.click('button:has-text("Riprendi la partita")');
    try { await Promise.all([host2.waitForFunction(() => window.AE && AE.UI.session && AE.UI.session.readyFired, null, { timeout: 30000 }), g1.waitForSelector('#board', { timeout: 30000 }), g2.waitForSelector('#board', { timeout: 30000 })]); }
    catch (e) { await host2.screenshot({ path: out + '/dbg-host2.png' }); await g1.screenshot({ path: out + '/dbg-g1.png' }); console.log('ATTESA FALLITA:', e.message.split('\n')[0], '| errori:', errs.slice(0, 4).join(' ; ')); process.exit(1); }
    const after = await stateOf(host2);
    if (after !== before) { const A = JSON.parse(before), B = JSON.parse(after); const diff = Object.keys(A).filter((k) => JSON.stringify(A[k]) !== JSON.stringify(B[k])); console.log('chiavi diverse:', diff.join(','), diff.includes('players') ? A.players.map((p, i) => JSON.stringify(p) === JSON.stringify(B.players[i]) ? '=' : Object.keys(p).filter((k) => JSON.stringify(p[k]) !== JSON.stringify(B.players[i][k])).join('/')).join(' ') : ''); }
    check(after === before, 'stesso stato di prima della chiusura (round ' + JSON.parse(after).round + ', turno di ' + JSON.parse(after).cur + ')');
    const lg = await g1.evaluate(() => AE.UI.session.game.events.filter(Boolean).length), lh = await host2.evaluate(() => Math.min(300, AE.UI.session.game.events.length));
    check(lg >= lh && lg > 5, 'l\'amico ha ritrovato il log (' + lg + ' eventi, il tavolo ne ha ' + lh + ')');
    const guestState = await stateOf(g1);
    check(JSON.parse(guestState).round === roundBefore, 'l\'amico ritrova lo stesso round');
    // ───── la partita riprende e finisce
    const pages2 = [['tavolo', host2], ['amico1', g1], ['amico2', g2]];
    await Promise.all(pages2.map(([n, p]) => fast(p)));
    const dec2 = { tavolo: 0, amico1: 0, amico2: 0 };
    // i bot a caso si fanno poco male: dopo 25 s di partita ripresa il tavolo la chiude (stessa funzione di fine partita del motore) per provare la schermata finale
    setTimeout(() => { host2.evaluate(() => AE.UI.session.game._finish(AE.UI.session.game.s.cur, 'prova')).catch(() => {}); }, 25000);
    const res2 = await Promise.all(pages2.map(async ([n, p]) => { const r = await playUntilEnd(n, p, 120000, dec2); return r; }));
    console.log('dopo la ripresa: decisioni', JSON.stringify(dec2), 'esiti', res2.join(','));
    check(Object.values(dec2).every((v) => v > 0), 'la partita è ripresa e tutti hanno giocato');
    for (const [n, p] of pages2) console.log('  stato', n, '|', (await p.locator('#status').innerText().catch(() => '')).replace(/\n/g, ' ').slice(0, 90), '|', (await p.locator('#actionPanel').innerText().catch(() => '')).replace(/\n/g, ' ').slice(0, 110));
    const ends = await Promise.all(pages2.map(async ([n, p]) => (await p.locator('#modal h2').first().innerText().catch(() => '')).trim()));
    console.log('schermate finali:', ends.join(' | '));
    check(ends.every((e) => /Vince|Nessun/.test(e)) && new Set(ends).size === 1, 'la partita finisce con lo stesso esito su tutti gli schermi');
    check((await host2.evaluate(() => localStorage.getItem('ae-netsave-v1'))) === null, 'il salvataggio è stato cancellato a fine partita');
    await host2.screenshot({ path: out + '/tavolo-fine.png' });
    console.log('errori JS:', errs.length); errs.slice(0, 6).forEach((e) => console.log(e));
    await b.close(); server.close();
    process.exit(ok && !errs.length ? 0 : 1);
  }
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
