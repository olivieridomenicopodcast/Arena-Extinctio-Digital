const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const AE = require('./_load.js');
const out = path.join(__dirname, '../stampa');
const kit = JSON.parse(fs.readFileSync(path.join(out, 'kit.json'), 'utf8'));
const pdfinfo = (f) => { const t = cp.execFileSync('pdfinfo', [path.join(out, f)], { encoding: 'utf8' }); const pages = +/Pages:\s+(\d+)/.exec(t)[1]; const m = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(t); return { pages, w: +m[1] * 25.4 / 72, h: +m[2] * 25.4 / 72 }; };
const hasPdftoppm = (() => { try { cp.execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' }); return true; } catch (e) { return false; } })();

test('kit stampabile: conteggi delle carte per mazzo come nel regolamento', () => {
  const d = AE.buildDecks();
  assert.strictEqual(kit.byGroup.Materiali, d.mat.length); assert.strictEqual(kit.byGroup.Skill, d.skill.length);
  assert.strictEqual(kit.byGroup['Armi e Progetti'], d.proj.length); assert.strictEqual(kit.byGroup['Armi Base'], d.base.length);
  assert.strictEqual(kit.byGroup.Personaggi, AE.CHARS.length);
  assert.strictEqual(kit.realCards, d.mat.length + d.skill.length + d.proj.length + d.base.length + AE.CHARS.length);
  assert.strictEqual(kit.cards, kit.realCards + kit.refCards);
  assert.strictEqual(kit.sheetsCards, Math.ceil(kit.cards / 9));
  assert.strictEqual(kit.tiles, 61); assert.strictEqual(kit.sheetsTiles, Math.ceil(61 / 12));
});
test('kit stampabile: i PDF sono A4 e hanno il numero di pagine atteso', () => {
  const A4 = (p, land) => { const [a, b] = land ? [297, 210] : [210, 297]; assert.ok(Math.abs(p.w - a) < 0.6 && Math.abs(p.h - b) < 0.6, `${p.w.toFixed(1)}×${p.h.toFixed(1)}`); };
  const fr = pdfinfo('carte-fronte-retro.pdf'); A4(fr); assert.strictEqual(fr.pages, kit.sheetsCards * 2);
  const sf = pdfinfo('carte-solo-fronti.pdf'); A4(sf); assert.strictEqual(sf.pages, kit.sheetsCards);
  const t = pdfinfo('tessere.pdf'); A4(t); assert.strictEqual(t.pages, kit.sheetsTiles);
  const z = pdfinfo('zone-di-gioco.pdf'); A4(z, true); assert.strictEqual(z.pages, 2);
  const pt = pdfinfo('plancia-tempo.pdf'); A4(pt, true); assert.strictEqual(pt.pages, 1);
  const pl = pdfinfo('plance-giocatore.pdf'); A4(pl, true); assert.strictEqual(pl.pages, kit.playerBoards);
  A4(pdfinfo('scheda-riassuntiva.pdf')); A4(pdfinfo('regolamento.pdf'));
});
test('kit stampabile: nessun "undefined" o "NaN" nei file generati; le immagini citate esistono', () => {
  for (const f of fs.readdirSync(out).filter((x) => x.endsWith('.html'))) {
    const t = fs.readFileSync(path.join(out, f), 'utf8');
    assert.ok(!/undefined|NaN|\[object/.test(t), f);
    for (const m of t.matchAll(/src="(img\/[^"]+)"/g)) assert.ok(fs.existsSync(path.join(out, m[1])), m[1]);
  }
  assert.ok(!/undefined|NaN/.test(fs.readFileSync(path.join(out, 'kit.json'), 'utf8')));
});
test('kit stampabile: formato carta 63,5 × 88,9 mm, 9 per foglio, rapporto delle grafiche uguale a quello della carta', () => {
  assert.deepStrictEqual(kit.cardMm, [63.5, 88.9]);
  const html = fs.readFileSync(path.join(out, 'carte-solo-fronti.html'), 'utf8');
  assert.match(html, /width:63\.5mm;height:88\.9mm/);
  assert.strictEqual((html.match(/<section class="sheet">/g) || []).length, kit.sheetsCards);
  assert.strictEqual((html.match(/class="c"/g) || []).length, kit.cards);
  // le immagini delle carte hanno il rapporto 750:1050 = 63,5:88,9
  const sizeOf = (f) => { const b = fs.readFileSync(f); let i = 2; while (i < b.length) { if (b[i] !== 0xFF) { i++; continue; } const m = b[i + 1]; if (m >= 0xC0 && m <= 0xC3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; i += 2 + b.readUInt16BE(i + 2); } };
  for (const f of ['vetro', 'ourban', 'colpo', 'godnocy', 'back_skill']) { const [w, h] = sizeOf(path.join(out, 'img/cards', f + '.jpg')); assert.ok(Math.abs(w / h - 63.5 / 88.9) < 0.002, f + ' ' + w + '×' + h); }
});
test('kit stampabile: scala reale — i segni di taglio distano 63,5 mm in orizzontale e 88,9 mm in verticale', { skip: !hasPdftoppm }, () => {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ae-'));
  cp.execFileSync('pdftoppm', ['-r', '254', '-f', '1', '-l', '1', '-gray', path.join(out, 'carte-solo-fronti.pdf'), path.join(tmp, 'p')]);
  const f = fs.readdirSync(tmp).find((x) => x.endsWith('.pgm')); const b = fs.readFileSync(path.join(tmp, f));
  // PGM binario: "P5\nW H\n255\n"
  let pos = 0; const tok = []; while (tok.length < 4) { while (b[pos] <= 32) pos++; let s = pos; while (b[pos] > 32) pos++; tok.push(b.toString('ascii', s, pos)); } pos++;
  const W = +tok[1], H = +tok[2], px = (x, y) => b[pos + y * W + x];
  const mm = 10;   // 254 dpi = 10 px/mm
  const GX = (210 - 3 * 63.5) / 2, GY = (297 - 3 * 88.9) / 2;
  // segni verticali sopra la griglia: riga a (GY - 3) mm
  const row = Math.round((GY - 3) * mm); const xs = []; for (let x = 0; x < W; x++) if (px(x, row) < 128) xs.push(x);
  const groups = []; for (const x of xs) { if (groups.length && x - groups[groups.length - 1][1] <= 1) groups[groups.length - 1][1] = x; else groups.push([x, x]); }
  const centers = groups.map((g) => (g[0] + g[1]) / 2 / mm);
  assert.strictEqual(centers.length, 4, 'quattro segni verticali');
  for (let i = 1; i < 4; i++) assert.ok(Math.abs(centers[i] - centers[i - 1] - 63.5) < 0.25, `distanza ${centers[i] - centers[i - 1]}`);
  const col = Math.round((GX - 3) * mm); const ys = []; for (let y = 0; y < H; y++) if (px(col, y) < 128) ys.push(y);
  const gy = []; for (const y of ys) { if (gy.length && y - gy[gy.length - 1][1] <= 1) gy[gy.length - 1][1] = y; else gy.push([y, y]); }
  const cy = gy.map((g) => (g[0] + g[1]) / 2 / mm);
  assert.strictEqual(cy.length, 4, 'quattro segni orizzontali');
  for (let i = 1; i < 4; i++) assert.ok(Math.abs(cy[i] - cy[i - 1] - 88.9) < 0.25, `distanza ${cy[i] - cy[i - 1]}`);
  fs.rmSync(tmp, { recursive: true, force: true });
});
test('kit stampabile: il retro è specchiato (flip sul lato lungo) e ogni carta ha il dorso del suo mazzo', () => {
  const html = fs.readFileSync(path.join(out, 'carte-fronte-retro.html'), 'utf8');
  const secs = html.split('<section class="sheet">').slice(1);
  assert.strictEqual(secs.length, kit.sheetsCards * 2);
  const imgs = (s) => [...s.matchAll(/left:([\d.]+)mm;top:([\d.]+)mm"><img src="img\/cards\/([^"]+)\.jpg/g)].map((m) => ({ x: +m[1], y: +m[2], n: m[3] }));
  const f0 = imgs(secs[0]), b0 = imgs(secs[1]);
  assert.strictEqual(f0.length, 9); assert.strictEqual(b0.length, 9);
  const GX = (210 - 3 * 63.5) / 2;
  // la prima carta (in alto a sinistra) sul fronte deve stare in alto a DESTRA sul retro
  const first = f0.find((c) => Math.abs(c.x - GX) < 0.1 && Math.abs(c.y - (297 - 3 * 88.9) / 2) < 0.1);
  assert.ok(first && b0.some((c) => Math.abs(c.x - (GX + 2 * 63.5)) < 0.1 && Math.abs(c.y - first.y) < 0.1 && c.n === 'back_materiali'));
  assert.ok(html.includes('back_skill') && html.includes('back_armi') && html.includes('back_v2') && html.includes('back_materiali'));
});
