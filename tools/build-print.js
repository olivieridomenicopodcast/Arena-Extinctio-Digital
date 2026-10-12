#!/usr/bin/env node
/* ARENA EXTINCTIO — genera il kit "stampa e gioca" in stampa/ (tutto da script, si rigenera quando cambiano le regole):
   - carte-fronte-retro.pdf / carte-solo-fronti.pdf : tutte le carte, 9 per foglio A4 (63,5 × 88,9 mm), segni di taglio fuori dalle carte
   - tessere.pdf             : le 61 tessere esagonali (12 per foglio A4)
   - zone-di-gioco.pdf       : mazzi e scarti, display, mercato (A4 orizzontale, posti a misura di carta)
   - plancia-tempo.pdf       : Plancia Tempo (giorno/notte e rimozione dei livelli)
   - plance-giocatore.pdf    : una plancia per giocatore (6 pagine, A4 orizzontale)
   - scheda-riassuntiva.pdf, regolamento.pdf
   - index.html (istruzioni) e kit.json (conteggi, usati dai test)
   Uso: NODE_PATH=/opt/node-tools/node_modules node tools/build-print.js [--no-pdf]
   Le immagini stanno in stampa/img (tools/make-print-assets.py le crea dagli originali). */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'stampa');
for (const f of ['js/data.js', 'js/engine.js', 'js/md.js', 'js/rulebook.js']) require(path.join(root, f));
const AE = globalThis.AE, R = AE.DEFAULT_RULES;
const NOPDF = process.argv.includes('--no-pdf');

const CW = 63.5, CH = 88.9, GX = (210 - 3 * CW) / 2, GY = (297 - 3 * CH) / 2;     // griglia 3×3 centrata su A4
const SW = 66, SH = 91;                                                             // posti per le carte: un po' più grandi, per posarle senza precisione
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const mn = (n) => `<b>${n}</b>`;
const cum = []; { let t = 0; for (const d of R.levelDays) { t += d * R.periodsPerDay; cum.push(t); } }   // 10, 18, 24 cambi giornata

// ───────────── elenco carte ─────────────
const deck = AE.buildDecks();
const count = (a) => a.reduce((m, id) => { m[id] = (m[id] || 0) + 1; return m; }, {});
const imgOf = (id) => {
  const [k, x] = id.split(':');
  if (k === 'mat') return { V: 'vetro', U: 'uranio', M: 'minerale', food: 'cibo', medikit: 'medikit' }[x];
  if (k === 'mod') return 'mod_' + x;
  return x;
};
const BACK = { Materiali: 'back_materiali', Skill: 'back_skill', 'Armi e Progetti': 'back_armi', 'Armi Base': 'back_armi', Personaggi: 'back_v2', Riferimento: 'ref' };
const cards = [];
const addDeck = (ids, group) => { for (const id of ids.slice().sort()) cards.push({ f: imgOf(id), b: BACK[group], g: group, id }); };
addDeck(deck.mat, 'Materiali'); addDeck(deck.skill, 'Skill'); addDeck(deck.proj, 'Armi e Progetti'); addDeck(deck.base, 'Armi Base');
for (const c of AE.CHARS) cards.push({ f: c.id, b: BACK.Personaggi, g: 'Personaggi', id: 'ch:' + c.id });

// carte di riferimento (si tengono scoperte, riempiono gli spazi vuoti dell'ultimo foglio)
const A = (t, c) => ({ t, c });
const tbl = (rows) => `<table>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
const costs = (tier) => [1, 2, 3, 4].map((n) => { try { return AE.attackManaCost(tier, n); } catch (e) { return '–'; } });
const REFS = [
  { t: 'IL TUO TURNO', c: '#7a5cff', h: `<ol><li><b>Muovi</b>: 2D6 (1D6 se restano solo i livelli 1–2), esattamente quei passi, senza ripassare su una tessera. I portali si attraversano, obbligatori.</li><li><b>Attiva</b> la tessera dove ti fermi (gratis).</li><li><b>Azioni</b> finché hai mana: attaccare · craftare (${R.craftMana}) · Skill (${R.skillMana}) · curarti (${R.healMana}) · comprare (${R.buyMana} + monete) · Ulti (${R.ultiMana}).</li><li><b>Fine turno.</b> Quando finisce l'ultimo: <b>CAMBIO GIORNATA</b>.</li></ol>` },
  { t: 'COSTI IN MANA', c: '#35c9ff', h: `<p>Costo dell'attacco: <b>stessa arma, stesso turno</b> (+N rispetto al precedente).</p>${tbl([['', '1°', '2°', '3°', '4°'], ['Base', ...costs('base')], ['Standard', costs('std')[0], costs('std')[1], costs('std')[2], '–'], ['Avanzata', costs('adv')[0], costs('adv')[1], '–', '–'], ['Pugno', '0', '0', '0', '0']])}<p>Il 2° attacco avanzato serve la Sfera di Energia (${R.manaSfera} mana). Pugno: gratis, se perdi subisci ${R.punchFail}.</p><p>Craft ${R.craftMana} · Skill ${R.skillMana} · Cura ${R.healMana} · Compra ${R.buyMana} · Ulti ${R.ultiMana} · Vantaggio: gratis · Muoversi e attivare: gratis.</p>` },
  { t: 'COMBATTIMENTO', c: '#ff5470', h: `<p>Attaccante <b>2D6</b> contro difensore <b>2D6</b>: vince il più alto, <b>pareggio all'attaccante</b>. Se vince: danno fisso dell'arma.</p><p><b>Vantaggio</b>: 3D6, tieni i 2 migliori. <b>Svantaggio</b>: 3D6, tieni i 2 peggiori. Insieme si annullano.</p><p>Stessa tessera con arma a gittata ≥ 1: difensore con vantaggio, attaccante con svantaggio.</p><p><b>Gittata</b>: tessere in linea retta (6 direzioni). Muri, insormontabili e <b>corpi</b> fermano il colpo. Nei Rifugi non si attacca né si subisce.</p><p><b>Armatura</b>: assorbe per attacco subito e perde 1 durata.</p>` },
  { t: 'GIORNO / NOTTE', c: '#ffd23f', h: `<p>Una <b>giornata</b> = un turno di GIORNO + un turno di NOTTE per tutti.</p><p><b>Cambio giornata</b> (dopo l'ultimo giocatore): giri il segnalino Giorno/Notte · tutto il mana si ricarica · +${R.luogoCoins} monete su Luogo, +${R.rifugioCoins} su Rifugio (se ci stai sopra) · avanzi la Plancia Tempo.</p><p><b>Plancia Tempo</b>: livello 5 dopo ${R.levelDays[0]} giornate (${cum[0]} cambi), livello 4 dopo altre ${R.levelDays[1]} (${cum[1]}), livello 3 dopo altre ${R.levelDays[2]} (${cum[2]}). Chi è sulla tessera tolta rientra senza perdere il rientro.</p>` },
  { t: 'MERCATO E MONETE', c: '#ffb347', h: `${tbl([['Carta', 'Mazzo', 'Display'], ['Materiali', R.price.mat[0], R.price.mat[1]], ['Armi e Progetti', R.price.proj[0], R.price.proj[1]], ['Skill', R.price.skill[0], R.price.skill[1]]])}<p>Comprare costa ${R.buyMana} mana e si fa solo nel proprio turno.</p><p>${R.hpPrice} monete = +1 PV · ${R.ammoPrice} monete = +1 munizione (anche ${R.buyMana} mana).</p><p>Monete: +${R.killCoins} per eliminazione · +${R.luogoCoins} Luogo · +${R.rifugioCoins} Rifugio · carta scartata per inventario pieno: +${R.discardCoin} · massimo ${R.coinsMax}.</p>` },
  { t: 'ELIMINAZIONE E RIENTRI', c: '#6bff9c', h: `<p>A 0 PV: perdi l'equipaggiamento (non le monete) che resta come <b>bottino</b>. Chi ti elimina: +${R.killCoins} monete e 1 carta del bottino. Tu: monete portate a ${R.killMinCoins} se ne avevi meno.</p><p><b>Rientro</b> (se ne hai): all'inizio del tuo turno su Luogo → Rifugio → Vuote → a caso, PV e mana pieni.</p><p><b>Senza rientri</b> sei un Giocatore Fastidio: 2 dadi; il 1° = passi; il 2° = 1–2 blocca la tessera · 3–4 ruba 1 cubetto (vittima: dado, in senso orario) · 5–6 scambia 2 tessere senza giocatori.</p>` },
  { t: 'INVENTARIO MASSIMO', c: '#c77dff', h: `<ul><li>1 arma primaria · 1 secondaria · 1 corpo a corpo · 1 armatura</li><li>${R.cubeMax} cubetti per tipo (Vetro, Uranio, Minerale), +2 con lo Zaino</li><li>${R.inv.heal} Cibo/Medikit · ${R.inv.skill} Skill · ${R.inv.special} carte speciali tenute</li><li>1 progetto per tipo (primaria, secondaria, corpo a corpo, armatura, mod), +1 con lo Zaino</li><li>Max 1 Mod per arma</li></ul><p>Carta in eccesso: la scarti e prendi ${R.discardCoin} moneta.</p><p>Ogni carta Materiale (Vetro, Uranio, Minerale) ti dà <b>${R.cubesPerCard} cubetti</b>: la carta non si tiene.</p>` },
  { t: 'LE TESSERE', c: '#00ffc8', fs: '6.5pt', h: `<ul>${Object.values(AE.TILE_TYPES).map((t) => `<li><b>${t.n}</b>: ${esc(t.d)}</li>`).join('')}</ul>` },
];
const nReal = cards.length;
const refStart = cards.length;
REFS.forEach((r, i) => cards.push({ f: 'ref' + i, b: 'ref', g: 'Riferimento', ref: r }));
const sheets = []; for (let i = 0; i < cards.length; i += 9) sheets.push(cards.slice(i, i + 9));
const ns = sheets.length;

// ───────────── HTML comune ─────────────
const CSS = `
*{box-sizing:border-box}html,body{margin:0;background:#8a8a8a;font-family:"Trebuchet MS",Verdana,"DejaVu Sans",sans-serif;color:#111}
.sheet{position:relative;width:210mm;height:297mm;background:#fff;overflow:hidden;page-break-after:always;break-after:page;margin:0 auto 6mm;page:port}
.land{position:relative;width:297mm;height:210mm;background:#fff;overflow:hidden;page-break-after:always;break-after:page;margin:0 auto 6mm;page:land}
@page port{size:A4 portrait;margin:0}@page land{size:A4 landscape;margin:0}
.c{position:absolute;width:${CW}mm;height:${CH}mm;overflow:hidden}.c img{width:100%;height:100%;display:block}
.m{position:absolute;background:#000;display:block}.m.v{width:.2mm;margin-left:-.1mm}.m.h{height:.2mm;margin-top:-.1mm}
.foot{position:absolute;left:0;right:0;bottom:4mm;text-align:center;font-size:7pt;color:#444}
.rc{width:100%;height:100%;border:2.2mm solid var(--c);background:#fffdf6;padding:1.6mm 2mm;font-size:7.5pt;line-height:1.2;overflow:hidden}
.rc h4{margin:0 0 1mm;background:var(--c);color:#111;text-align:center;font-size:8.5pt;padding:.7mm 0;letter-spacing:.3pt;text-shadow:0 0 1px #fff8}
.rc p{margin:0 0 1mm}.rc ol,.rc ul{margin:0 0 1mm;padding-left:3.4mm}.rc li{margin-bottom:.5mm}
.rc table{border-collapse:collapse;width:100%;margin:0 0 1mm}.rc td{border:.2mm solid #888;padding:.2mm .8mm;text-align:center;font-size:7pt}
.rcb{width:100%;height:100%;background:#1a1040;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2.2mm solid #7a5cff;font-weight:700;text-align:center;letter-spacing:1pt}
.rcb small{font-size:6pt;font-weight:400;margin-top:2mm;letter-spacing:0}
.spot{position:absolute;width:${SW}mm;height:${SH}mm;border:.5mm dashed #333;border-radius:3mm;padding:2mm;font-size:7.5pt;color:#222;background:#fcfcfc}
.spot b.t{display:block;font-size:10pt;letter-spacing:.3pt}.spot span{display:block;color:#555;margin-top:1mm;font-size:7pt}
.hx{position:absolute;width:66mm;height:57.16mm;clip-path:polygon(0 50%,25% 0,75% 0,100% 50%,75% 100%,25% 100%)}.hx img{width:100%;height:100%;display:block}
.hxo{position:absolute;overflow:visible}
h1.t{position:absolute;left:10mm;top:6mm;margin:0;font-size:14pt}
@media print{html,body{background:none}.sheet,.land{margin:0}.noprint{display:none}}
`;
const wrap = (title, body, css) => `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}${css || ''}</style></head><body>${body}</body></html>`;

// ───────────── carte ─────────────
function cropMarks() {
  const xs = [0, 1, 2, 3].map((i) => GX + i * CW), ys = [0, 1, 2, 3].map((i) => GY + i * CH), L = 4, G = 1.2;
  let h = '';
  for (const x of xs) h += `<i class="m v" style="left:${x}mm;top:${GY - G - L}mm;height:${L}mm"></i><i class="m v" style="left:${x}mm;top:${GY + 3 * CH + G}mm;height:${L}mm"></i>`;
  for (const y of ys) h += `<i class="m h" style="top:${y}mm;left:${GX - G - L}mm;width:${L}mm"></i><i class="m h" style="top:${y}mm;left:${GX + 3 * CW + G}mm;width:${L}mm"></i>`;
  return h;
}
function face(c, side) {
  if (c.ref) return side === 'f' ? `<div class="rc" style="--c:${c.ref.c}${c.ref.fs ? ';font-size:' + c.ref.fs : ''}"><h4>${esc(c.ref.t)}</h4>${c.ref.h}</div>` : `<div class="rcb"><div>ARENA EXTINCTIO</div><small>carta di riferimento<br>(si tiene scoperta, fuori dal mazzo)</small></div>`;
  const nm = side === 'f' ? c.f : c.b;
  return `<img src="img/cards/${nm}.jpg" alt="">`;
}
function sheetPage(cs, idx, side) {
  // il retro si stampa ribaltando sul lato lungo: le colonne si specchiano
  const cells = cs.map((c, i) => { const r = Math.floor(i / 3), col = i % 3, cc = side === 'b' ? 2 - col : col; return `<div class="c" style="left:${GX + cc * CW}mm;top:${GY + r * CH}mm">${face(c, side)}</div>`; }).join('');
  const groups = [...new Set(cs.map((c) => c.g))].join(' · ');
  return `<section class="sheet">${cropMarks()}${cells}<div class="foot">Arena Extinctio · foglio ${idx + 1}/${ns} · ${side === 'b' ? '<b>RETRO</b> (ribalta sul lato lungo)' : 'FRONTE'} · ${esc(groups)}</div></section>`;
}
const both = []; sheets.forEach((cs, i) => { both.push(sheetPage(cs, i, 'f')); both.push(sheetPage(cs, i, 'b')); });
fs.writeFileSync(path.join(out, 'carte-fronte-retro.html'), wrap('Arena Extinctio — carte (fronte/retro)', both.join('')));
fs.writeFileSync(path.join(out, 'carte-solo-fronti.html'), wrap('Arena Extinctio — carte (solo fronti)', sheets.map((cs, i) => sheetPage(cs, i, 'f')).join('')));

// ───────────── tessere ─────────────
const HW = 66, HH = HW * Math.sqrt(3) / 2, GAP = 1.4;
const tilePos = []; { const stepX = HW * 0.75 + GAP, stepY = HH + GAP, x0 = (210 - (HW + 2 * stepX)) / 2, y0 = (297 - (4 * stepY + stepY / 2)) / 2;
  for (let col = 0; col < 3; col++) for (let r = 0; r < 4; r++) tilePos.push([x0 + col * stepX, y0 + r * stepY + (col % 2 ? stepY / 2 : 0)]); }
const perTile = tilePos.length, nTiles = AE.TILES.length, nTileSheets = Math.ceil(nTiles / perTile);
let tilePages = '';
for (let s = 0; s < nTileSheets; s++) {
  let h = '';
  AE.TILES.slice(s * perTile, (s + 1) * perTile).forEach((t, i) => {
    const [x, y] = tilePos[i];
    h += `<div class="hx" style="left:${x.toFixed(2)}mm;top:${y.toFixed(2)}mm"><img src="img/tiles/t${String(t.id).padStart(2, '0')}.jpg" alt=""></div>`;
    const pts = [[0, HH / 2], [HW / 4, 0], [HW * 3 / 4, 0], [HW, HH / 2], [HW * 3 / 4, HH], [HW / 4, HH]].map((p) => p.map((v) => v.toFixed(2)).join(',')).join(' ');
    h += `<svg class="hxo" style="left:${x.toFixed(2)}mm;top:${y.toFixed(2)}mm" width="${HW}mm" height="${HH.toFixed(2)}mm" viewBox="0 0 ${HW} ${HH.toFixed(2)}"><polygon points="${pts}" fill="none" stroke="#000" stroke-width=".25"/></svg>`;
  });
  tilePages += `<section class="sheet">${h}<div class="foot">Arena Extinctio · tessere ${s * perTile + 1}–${Math.min(nTiles, (s + 1) * perTile)} · foglio ${s + 1}/${nTileSheets} · taglia lungo il contorno dell'esagono</div></section>`;
}
fs.writeFileSync(path.join(out, 'tessere.html'), wrap('Arena Extinctio — tessere', tilePages));

// ───────────── zone di gioco (A4 orizzontale) ─────────────
const spot = (x, y, title, sub, extra, cls) => `<div class="spot ${cls || ''}" style="left:${x}mm;top:${y}mm"><b class="t">${title}</b><span>${sub || ''}</span>${extra || ''}</div>`;
const rowX = (n, i) => { const gap = 5, total = n * SW + (n - 1) * gap; return (297 - total) / 2 + i * (SW + gap); };
const Y1 = 8, Y2 = Y1 + SH + 5;
const zoneMazzi = `<section class="land">${[
  ['MATERIALI', 'mazzo a faccia in giù: ogni carta Vetro/Uranio/Minerale ti dà 2 cubetti, Cibo +1 PV, Medikit +3 PV'],
  ['SKILL', 'mazzo a faccia in giù (anche Vantaggio, Svantaggio, Mina, Zaino, Sfera)'],
  ['ARMI E PROGETTI', 'mazzo a faccia in giù (progetti di armi e armature, Mod)'],
  ['ARMI BASE', `mazzo a faccia in giù: ${deck.base.length} carte, si prendono solo dalle tessere Equipaggiamento`],
].map(([t, s], i) => spot(rowX(4, i), Y1, t, s)).join('')}${[
  ['SCARTI MATERIALI', 'se il mazzo finisce si rimescolano gli scarti [interpretazione]'],
  ['SCARTI SKILL', 'Skill usate, Vantaggio, Svantaggio e Mina pescati'],
  ['SCARTI ARMI E PROGETTI', 'armi sostituite, progetti craftati vanno in gioco: qui solo gli scarti'],
  ['SCARTI ARMI BASE', 'armi base sostituite'],
].map(([t, s], i) => spot(rowX(4, i), Y2, t, s)).join('')}<div class="foot">Arena Extinctio · zone dei mazzi · A4 orizzontale</div></section>`;
const priceTbl = `<table style="border-collapse:collapse;font-size:8.5pt;margin-top:1mm"><tr><th></th><th>dal mazzo</th><th>dal display</th></tr><tr><td>Materiali</td><td>${R.price.mat[0]}</td><td>${R.price.mat[1]}</td></tr><tr><td>Armi e Progetti</td><td>${R.price.proj[0]}</td><td>${R.price.proj[1]}</td></tr><tr><td>Skill</td><td>${R.price.skill[0]}</td><td>${R.price.skill[1]}</td></tr></table>`;
const zoneDisplay = `<section class="land">${[['DISPLAY MATERIALI', 'una carta scoperta'], ['DISPLAY SKILL', 'una carta scoperta'], ['DISPLAY ARMI E PROGETTI', 'una carta scoperta']].map(([t, s], i) => spot(8 + i * (SW + 5), Y1, t, s + '<br>quando la prendi si rimpiazza dal mazzo')).join('')}
<div class="spot" style="left:${8 + 3 * (SW + 5)}mm;top:${Y1}mm;width:${297 - 16 - 3 * (SW + 5)}mm"><b class="t">MERCATO</b><span>Comprare costa ${R.buyMana} mana (+ monete), solo nel proprio turno.</span>${priceTbl}<span style="margin-top:2mm">Tessera Carte (gratis, niente mana): 2 carte coperte OPPURE 1 carta dal display.</span><span>${R.hpPrice} monete = +1 PV · ${R.ammoPrice} monete = +1 munizione (${R.buyMana} mana).</span></div>
<div class="spot" style="left:8mm;top:${Y2}mm;width:${297 - 16}mm;height:${SH - 8}mm"><b class="t">BOTTINO, RIENTRI E SEGNALINI</b><span>Qui puoi tenere i segnalini di riserva: cubetti (Vetro, Uranio, Minerale), monete, munizioni, PV e mana. Il bottino (LOOT) sta sulla tessera dove un giocatore è stato eliminato; i rientri su Luogo stanno sulla tessera Luogo.</span></div>
<div class="foot">Arena Extinctio · display e mercato · A4 orizzontale</div></section>`;
fs.writeFileSync(path.join(out, 'zone-di-gioco.html'), wrap('Arena Extinctio — zone di gioco', zoneMazzi + zoneDisplay));

// ───────────── Plancia Tempo ─────────────
function plancia() {
  const N = cum[cum.length - 1], per = 12, cw = 22, ch = 40, x0 = (297 - per * cw) / 2;
  let h = `<h1 class="t">PLANCIA TEMPO</h1><div style="position:absolute;left:10mm;top:15mm;right:10mm;font-size:8.5pt">Parti con il segnalino Giorno/Notte su <b>GIORNO</b> e il segnalino Plancia sulla casella <b>0</b>. A ogni <b>cambio giornata</b> (dopo l'ultimo giocatore): giri Giorno/Notte e sposti il segnalino di una casella. Quando arrivi sulla casella segnata togli l'anello indicato: chi è sulle tessere tolte rientra senza perdere il rientro.</div>`;
  for (let row = 0; row < 2; row++) {
    for (let c = 0; c < per; c++) {
      const n = row * per + c + 1; if (n > N) continue;
      const day = (n % 2 === 0), lvl = cum.indexOf(n);
      h += `<div style="position:absolute;left:${x0 + c * cw}mm;top:${40 + row * 70}mm;width:${cw}mm;height:${ch}mm;border:.5mm solid ${lvl >= 0 ? '#c00' : '#333'};background:${lvl >= 0 ? '#ffe3e3' : day ? '#fff8dd' : '#e8ecff'};text-align:center;font-size:8pt"><div style="font-size:15pt;font-weight:700;margin-top:2mm">${n}</div><div style="font-size:14pt">${day ? '☀' : '🌙'}</div><div style="font-size:6.5pt">${day ? 'GIORNO' : 'NOTTE'}</div>${lvl >= 0 ? `<div style="font-weight:700;color:#c00;margin-top:2mm;font-size:7pt">TOGLI<br>LIVELLO ${5 - lvl}</div>` : ''}</div>`;
    }
  }
  h += `<div style="position:absolute;left:8mm;top:${40 + 2 * 70 - 15}mm;font-size:8.5pt;right:8mm"><b>Casella 0 (inizio)</b> = GIORNO. Livello 5: dopo ${R.levelDays[0]} giornate (${cum[0]} cambi). Livello 4: dopo altre ${R.levelDays[1]} (${cum[1]}). Livello 3: dopo altre ${R.levelDays[2]} (${cum[2]}). Da lì restano i livelli 1–2 e si muove con <b>1D6</b>. <i>[interpretazione]: il tracciato è disegnato qui secondo i numeri 5-4-3 (parametri), la plancia originale non era tra i materiali.</i></div>`;
  return `<section class="land">${h}<div class="foot">Arena Extinctio · Plancia Tempo · A4 orizzontale</div></section>`;
}
fs.writeFileSync(path.join(out, 'plancia-tempo.html'), wrap('Arena Extinctio — Plancia Tempo', plancia()));

// ───────────── plance giocatore (6 pagine, A4 orizzontale) ─────────────
function plance() {
  const pages = [];
  const boxes = (n, label, color, size) => `<span style="display:inline-flex;gap:1.2mm;align-items:center">${[...Array(n)].map((_, i) => `<i style="display:inline-block;width:${size}mm;height:${size}mm;border:.4mm solid ${color};border-radius:50%;text-align:center;font:normal 6pt/${size}mm sans-serif;color:#777">${label === 'n' ? i + 1 : ''}</i>`).join('')}</span>`;
  for (let p = 0; p < 6; p++) {
    const col = AE.PLAYER_COLORS[p];
    const slots = [['ARMA PRIMARIA', 'ammo'], ['ARMA SECONDARIA', 'ammo'], ['CORPO A CORPO', 'ammo'], ['ARMATURA', 'dur']].map(([t, k], i) => {
      const x = 8 + i * (SW + 5);
      return `<div class="spot" style="left:${x}mm;top:80mm"><b class="t">${t}</b><span>${k === 'ammo' ? 'qui la carta dell\'arma (più 1 Mod sopra)' : 'qui la carta dell\'armatura'}</span><div style="position:absolute;left:2mm;bottom:2mm;right:2mm;font-size:7pt">${k === 'ammo' ? 'Munizioni:<br>' + boxes(5, '', '#333', 5.5) : 'Durata:<br>' + boxes(2, '', '#333', 6)}</div></div>`;
    }).join('');
    pages.push(`<section class="land"><div style="position:absolute;left:0;top:0;width:297mm;height:12mm;background:${col};color:#111;font:700 15pt/12mm 'Trebuchet MS',sans-serif;padding-left:8mm">GIOCATORE ${p + 1} <span style="font-size:9pt;font-weight:400;margin-left:6mm">Nome: ______________________ Personaggio: ______________________</span></div>
<div style="position:absolute;left:8mm;top:16mm;width:281mm;font-size:8pt;line-height:1.9">
<b>PV</b> (${R.hp}) ${boxes(R.hp, 'n', '#c33', 6)} &nbsp; <b>MANA</b> (${R.mana}, ${R.manaSfera} con la Sfera) ${boxes(R.manaSfera, 'n', '#2a8bd8', 6)}<br>
<b>MONETE</b> (max ${R.coinsMax}) ${boxes(R.coinsMax, 'n', '#b8860b', 6)} &nbsp; <b>RIENTRI</b> ${boxes(2, '', '#2a2', 6)}<br>
<b>RISERVA</b> (max ${R.cubeMax}, ${R.cubeMax + 2} con lo Zaino): &nbsp;<b>Vetro</b> ${boxes(R.cubeMax + 2, '', '#3bb', 5)} &nbsp; <b>Uranio</b> ${boxes(R.cubeMax + 2, '', '#9c0', 5)} &nbsp; <b>Minerale</b> ${boxes(R.cubeMax + 2, '', '#e80', 5)}<br>
<b>ULTI</b> ☐ raccolta &nbsp; ☐ usata &nbsp;&nbsp; <b>STATI</b> ☐ Scudo Solare &nbsp; ☐ Mira Perfetta &nbsp; ☐ Svantaggio &nbsp; ☐ Rallentato &nbsp; ☐ Sconto Fabbro
</div>
<div style="position:absolute;left:8mm;top:57mm;width:281mm;font-size:7.5pt;color:#444;border-top:.3mm solid #999;padding-top:1.5mm"><b>In mano</b> (non servono posti): Cibo/Medikit max ${R.inv.heal} · Skill max ${R.inv.skill} · carte speciali (Vantaggio, Zaino, Sfera) max ${R.inv.special} · progetti: 1 per tipo (primaria, secondaria, corpo a corpo, armatura, mod), +1 con lo Zaino. La carta del personaggio sta scoperta accanto alla plancia.</div>
<div style="position:absolute;left:8mm;top:68mm;font-size:8pt"><b>EQUIPAGGIAMENTO</b></div>${slots}
<div style="position:absolute;left:8mm;top:${80 + SH + 3}mm;width:281mm;font-size:7.2pt;line-height:1.3;border-top:.3mm solid #999;padding-top:1mm"><b>Turno:</b> 1 Muovi (2D6; 1D6 con solo livelli 1–2) · 2 Attiva la tessera (gratis) · 3 Azioni con il mana (attacco, craft ${R.craftMana}, Skill ${R.skillMana}, cura ${R.healMana}, compra ${R.buyMana}+monete, Ulti ${R.ultiMana}) · 4 Fine turno. <b>Mana attacchi (stessa arma, nel turno):</b> base 0-1-2-3 · standard ${AE.attackManaCost('std', 1)}-${AE.attackManaCost('std', 2)} · avanzata ${AE.attackManaCost('adv', 1)}-${AE.attackManaCost('adv', 2)} · pugno 0.</div>
</section>`);
  }
  return pages.join('');
}
fs.writeFileSync(path.join(out, 'plance-giocatore.html'), wrap('Arena Extinctio — plance giocatore', plance()));

// ───────────── scheda riassuntiva (A4 verticale, 2 pagine) ─────────────
function scheda() {
  const W = Object.values(AE.WEAPONS), tier = (t) => AE.TIER_NAMES[t];
  const wRows = W.map((w) => `<tr><td>${esc(w.n)}</td><td>${esc(w.kind)} ${tier(w.tier)}</td><td>${w.git}</td><td>${w.dan}</td><td>${w.mun}</td><td>${w.fal ? '−' + w.fal : '—'}</td><td>${Object.entries(w.cost).map(([r, n]) => n + AE.RES[r].i).join(' ') || '—'}</td></tr>`).join('');
  const aRows = Object.values(AE.ARMORS).map((a) => `<tr><td>${esc(a.n)}</td><td>${tier(a.tier)}</td><td>assorbe ${a.dif}</td><td>dura ${a.dur}</td><td>${Object.entries(a.cost).map(([r, n]) => n + AE.RES[r].i).join(' ')}</td></tr>`).join('');
  const chars = AE.CHARS.map((c) => `<tr><td><b>${esc(c.n)}</b><br>${esc(c.role)}</td><td>${esc(c.passive)}</td><td>${esc(c.ulti)}</td></tr>`).join('');
  const p1 = `<section class="sheet" style="padding:8mm 10mm;font-size:8pt;line-height:1.3"><h2 style="margin:0 0 2mm">ARENA EXTINCTIO — scheda riassuntiva</h2>
<p style="margin:0 0 2mm"><b>Obiettivo:</b> essere l'ultimo giocatore in vita. <b>Turno:</b> muovi (2D6 o 1D6, passi esatti) → attivi la tessera (gratis) → azioni con il mana → fine turno. Dopo l'ultimo giocatore: <b>cambio giornata</b> (giorno↔notte, mana, monete di Luogo/Rifugio, Plancia Tempo: livello 5 dopo ${cum[0]} cambi, 4 dopo ${cum[1]}, 3 dopo ${cum[2]}).</p>
<div style="display:flex;gap:4mm"><div style="flex:1"><b>Mana</b>${tbl([['Muoversi, attivare, Vantaggio', 'gratis'], ['Attacco base (1°,2°,3°,4° con la stessa arma)', costs('base').join(' · ')], ['Attacco standard (1°, 2°)', costs('std').slice(0, 2).join(' · ')], ['Attacco avanzato (1°, 2°*)', costs('adv').slice(0, 2).join(' · ')], ['Pugno', 'gratis (se perdi −' + R.punchFail + ' PV)'], ['Craft / Skill / Cura / Compra', `${R.craftMana} / ${R.skillMana} / ${R.healMana} / ${R.buyMana}`], ['Ulti', R.ultiMana]])}<small>*serve la Sfera di Energia. Mana: ${R.mana} slot (${R.manaSfera} con la Sfera).</small></div>
<div style="flex:1"><b>Sfida dei dadi</b><p style="margin:1mm 0">2D6 contro 2D6, vince il più alto, pareggio all'attaccante. Vantaggio 3D6 migliori 2, svantaggio 3D6 peggiori 2. Stessa tessera + arma gittata ≥1: difensore vantaggio, attaccante svantaggio. Gittata: linea retta (6 direzioni), fermano muri, insormontabili e corpi. Nei rifugi niente attacchi né danni dagli altri.</p><b>Monete</b><p style="margin:1mm 0">+${R.killCoins} eliminazione · +${R.luogoCoins} Luogo · +${R.rifugioCoins} Rifugio (a ogni cambio giornata) · max ${R.coinsMax}. Mercato: mazzo ${R.price.mat[0]}/${R.price.proj[0]}/${R.price.skill[0]} (Materiali/Armi/Skill), display ${R.price.mat[1]}/${R.price.proj[1]}/${R.price.skill[1]}. ${R.hpPrice} monete = +1 PV, ${R.ammoPrice} = +1 munizione.</p></div></div>
<b>Armi</b><table class="t">${'<tr><th>Arma</th><th>Tipo</th><th>Git.</th><th>Dan.</th><th>Mun.</th><th>Se perdi</th><th>Costo craft</th></tr>'}${wRows}</table>
<b>Armature</b><table class="t"><tr><th>Armatura</th><th>Tipo</th><th></th><th></th><th>Costo craft</th></tr>${aRows}</table>
<small>❄ Vetro · ☢ Uranio · ⬡ Minerale. Mod: +1 danno, +1 gittata o +1 munizione (1 per arma). Cibo +1 PV, Medikit +3 PV. Ogni carta Vetro/Uranio/Minerale = ${R.cubesPerCard} cubetti, max ${R.cubeMax} per tipo.</small>
<style>table.t{border-collapse:collapse;width:100%;margin:1mm 0 2mm}table.t td,table.t th,.sheet table td,.sheet table th{border:.2mm solid #888;padding:.5mm 1.2mm;font-size:7.6pt}</style></section>`;
  const p2 = `<section class="sheet" style="padding:8mm 10mm;font-size:7.6pt;line-height:1.28"><h2 style="margin:0 0 2mm">Personaggi</h2><table class="t"><tr><th style="width:24mm">Personaggio</th><th>Passiva</th><th>Ulti (${R.ultiMana} mana, una volta)</th></tr>${chars}</table>
<p><b>Eliminazione:</b> perdi l'equipaggiamento (resta come bottino sulla tessera; chi ti elimina prende 1 carta e +${R.killCoins} monete; chi si ferma sopra prende fino a 2 oggetti). Con un rientro torni all'inizio del tuo turno (Luogo → Rifugio → Vuote → a caso) con PV e mana pieni; senza rientri sei un <b>Giocatore Fastidio</b> (2 dadi: 1° passi, 2°: 1–2 blocca la tessera · 3–4 ruba 1 cubetto · 5–6 scambia 2 tessere).</p>
<p><b>Rientri per giocatori:</b> 2 → 2 ciascuno · 3 → 1 ciascuno · 4 → 2 segnalini su Luogo (max 1 a testa) · 5 → 1 segnalino su Luogo · 6 → nessuno. Si prendono fermandosi sulla tessera Luogo.</p>
<p><b>Ulti:</b> si raccoglie fermandosi sulla propria tessera Ulti; il Sindaco la riporta sul cratere.</p>
<style>table.t{border-collapse:collapse;width:100%;margin:1mm 0 2mm}table.t td,table.t th{border:.2mm solid #888;padding:.6mm 1.2mm;font-size:7.4pt;vertical-align:top}</style></section>`;
  return p1 + p2;
}
fs.writeFileSync(path.join(out, 'scheda-riassuntiva.html'), wrap('Arena Extinctio — scheda riassuntiva', scheda()));

// ───────────── regolamento ─────────────
const RULES_CSS = `.doc{max-width:180mm;margin:0 auto;padding:12mm 0;background:#fff;font:9.2pt/1.35 "Trebuchet MS",Verdana,"DejaVu Sans",sans-serif}.doc h1{font-size:19pt;margin:0 0 4mm}.doc h2{font-size:13pt;margin:6mm 0 2mm;border-bottom:.3mm solid #999;break-after:avoid}.doc h3{font-size:10.5pt;margin:4mm 0 1mm;break-after:avoid}.doc table{border-collapse:collapse;width:100%;margin:1.5mm 0;font-size:8.2pt;break-inside:avoid}.doc th,.doc td{border:.2mm solid #888;padding:.7mm 1.5mm;text-align:left;vertical-align:top}.doc th{background:#eee}.doc code{background:#eee;padding:0 1mm}.doc .tag{border-radius:1mm;padding:0 1mm;font-size:7pt;font-weight:700}.doc .tag.ch{background:#bfe8c9}.doc .tag.in{background:#ffe08a}@page doc{size:A4 portrait;margin:14mm 15mm}.doc{page:doc}@media print{.doc{padding:0}}`;
fs.writeFileSync(path.join(out, 'regolamento.html'), wrap('Arena Extinctio — regolamento', `<div class="doc">${AE.md(AE.RULEBOOK_MD)}</div>`, RULES_CSS));

// ───────────── conteggi (usati dai test) e pagina di istruzioni ─────────────
const byGroup = {}; cards.forEach((c) => { byGroup[c.g] = (byGroup[c.g] || 0) + 1; });
const kit = { cards: cards.length, realCards: nReal, refCards: REFS.length, byGroup, sheetsCards: ns, pagesFrontBack: ns * 2, tiles: nTiles, sheetsTiles: nTileSheets, playerBoards: 6, cardMm: [CW, CH], slotMm: [SW, SH], decks: { mat: deck.mat.length, skill: deck.skill.length, proj: deck.proj.length, base: deck.base.length, chars: AE.CHARS.length }, cum };
fs.writeFileSync(path.join(out, 'kit.json'), JSON.stringify(kit, null, 1));

const FILES = [
  ['carte-fronte-retro.pdf', `Carte fronte/retro — ${ns * 2} pagine (${ns} fogli)`, 'stampa fronte/retro, ribaltando sul lato lungo'],
  ['carte-solo-fronti.pdf', `Carte solo fronti — ${ns} pagine`, 'per bustine con una carta qualunque dietro'],
  ['tessere.pdf', `Tessere — ${nTileSheets} pagine, ${nTiles} esagoni`, 'solo fronte'],
  ['zone-di-gioco.pdf', 'Zone di gioco (mazzi, scarti, display, mercato) — 2 pagine A4 orizzontali', 'solo fronte'],
  ['plancia-tempo.pdf', 'Plancia Tempo — 1 pagina A4 orizzontale', 'solo fronte'],
  ['plance-giocatore.pdf', 'Plance giocatore — 6 pagine A4 orizzontali (una per giocatore)', 'solo fronte; stampa solo quante ne servono'],
  ['scheda-riassuntiva.pdf', 'Scheda riassuntiva — 2 pagine', 'fronte/retro o due fogli'],
  ['regolamento.pdf', 'Regolamento completo', 'come preferisci'],
];
const idx = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stampa e gioca — Arena Extinctio</title><link rel="icon" href="../icon-192.png"><style>body{margin:0;background:#07021a;color:#ece6ff;font:17px/1.4 "Rajdhani","Trebuchet MS",system-ui,sans-serif}main{max-width:900px;margin:0 auto;padding:16px}h1,h2{font-family:"Orbitron",system-ui,sans-serif;color:#00ffc8}a{color:#00ffc8}.card{background:#120a33;border:1px solid #33207a;border-radius:12px;padding:12px 16px;margin:12px 0}.dl a{display:block;padding:10px 12px;margin:6px 0;border:1px solid #33207a;border-radius:10px;background:#1a0f45;text-decoration:none}.dl small{color:#a79fcf;display:block}table{border-collapse:collapse;width:100%}td,th{border:1px solid #33207a;padding:5px 8px;text-align:left}th{background:#1a0f45}.tag{background:#fb0;color:#241a00;border-radius:6px;padding:0 6px;font-size:14px;font-weight:700}</style></head><body><main>
<h1>🖨 Stampa e gioca</h1>
<p>Tutto quello che serve per giocare con carta e forbici. I file sono generati dallo script <code>tools/build-print.js</code>: se cambiano le regole si rigenerano. <a href="../index.html">← torna all'app</a></p>
<div class="card dl"><h2>Download (PDF)</h2>${FILES.map(([f, t, n]) => `<a href="${f}">⬇ ${esc(t)}<small>${esc(n)}</small></a>`).join('')}<p>Anteprima HTML (stampabile dal browser): <a href="carte-fronte-retro.html">carte</a> · <a href="tessere.html">tessere</a> · <a href="zone-di-gioco.html">zone</a> · <a href="plancia-tempo.html">Plancia Tempo</a> · <a href="plance-giocatore.html">plance</a> · <a href="scheda-riassuntiva.html">scheda</a> · <a href="regolamento.html">regolamento</a></p></div>
<div class="card"><h2>Impostazioni di stampa</h2><ul><li>Carta <b>A4</b>, scala <b>100%</b> (NON “adatta alla pagina”), margini “nessuno/predefiniti”, grafica di sfondo attiva.</li><li>Fronte/retro: <b>ribalta sul lato lungo</b> (le colonne del retro sono già specchiate). Prova prima con 1 foglio e controlla che fronte e retro coincidano.</li><li>Le carte sono nel formato poker <b>${CW} × ${CH} mm</b>, 9 per foglio (3×3); i segni di taglio sono nei margini, fuori dalle carte. Le tessere sono esagoni di <b>${HW} mm</b> di larghezza (mappa assemblata circa 46 × 51 cm).</li></ul></div>
<div class="card"><h2>Quanto stampare e tagliare</h2><table><tr><th>Cosa</th><th>Quantità</th><th>Fogli</th></tr>
<tr><td>Carte da gioco (Materiali ${deck.mat.length}, Skill ${deck.skill.length}, Armi e Progetti ${deck.proj.length}, Armi Base ${deck.base.length}, Personaggi ${AE.CHARS.length})</td><td>${nReal}</td><td rowspan="2">${ns} fogli (${ns * 2} pagine fronte/retro)</td></tr>
<tr><td>Carte di riferimento (si tengono scoperte, fuori dai mazzi)</td><td>${REFS.length}</td></tr>
<tr><td>Tessere esagonali (da ritagliare lungo il contorno)</td><td>${nTiles}</td><td>${nTileSheets} fogli</td></tr>
<tr><td>Zone di gioco (mazzi, scarti, display, mercato)</td><td>2 pagine</td><td>2 fogli</td></tr><tr><td>Plancia Tempo</td><td>1</td><td>1 foglio</td></tr><tr><td>Plance giocatore</td><td>1 per giocatore (2–6)</td><td>fino a 6 fogli</td></tr><tr><td>Scheda riassuntiva · regolamento</td><td>—</td><td>2 + (vedi PDF)</td></tr></table>
<p><b>Mazzi e dorsi:</b> Materiali (dorso viola), Skill (arancio), Armi e Progetti e Armi Base (stesso dorso nero: tieni separate le 6 armi base), Personaggi (dorso bianco). Ogni carta ha già il suo dorso giusto. <b>Da tenere fuori dai mazzi:</b> le ${REFS.length} carte di riferimento, le carte Personaggio (una per giocatore, scoperta), le 6 Armi Base (mazzo a parte).</p><p>Le carte originali sono più strette del formato poker: ai lati ho esteso il bordo colorato, senza deformare le immagini.</p></div>
<div class="card"><h2>Preparazione del tavolo</h2><ol><li>Ritaglia le tessere e disponile <b>a caso</b> ad alveare su 5 livelli (1 + 6 + 12 + 18 + 24 = 61). I muri si girano a caso.</li><li>Appoggia le zone di gioco a lato: mazzi Materiali, Skill, Armi e Progetti, Armi Base, relativi scarti e i tre display (una carta scoperta per mazzo).</li><li>Ogni giocatore prende la sua plancia, la carta Personaggio, parte sulla tessera <b>Luogo</b> col suo numero con ${R.hp} PV e ${R.mana} mana. Sulle tessere Ulti con il numero dei giocatori presenti metti la loro risorsa Ulti sul cratere.</li><li>Rientri: 2 giocatori 2 ciascuno · 3 giocatori 1 ciascuno · 4 giocatori 2 segnalini su due tessere Luogo · 5 giocatori 1 segnalino su una tessera Luogo · 6 nessuno.</li><li>Segnalino Giorno/Notte su GIORNO, segnalino Plancia sulla casella 0.</li></ol></div>
<div class="card"><h2>Segnalini fisici da procurarti (non creati)</h2><p>Hai già i fogli dei segnalini (gocce PV, mana, munizioni, pedine con i personaggi, Giorno/Notte…) nel repo <code>Arena-Extinctio-Regolamento</code>. Quantità consigliate:</p><table><tr><th>Cosa</th><th>Quanti</th><th>Al posto di</th></tr>
<tr><td>Dadi a 6 facce</td><td>3</td><td>2D6 per muoverti e attaccare, il 3° per vantaggio/svantaggio</td></tr>
<tr><td>Pedine giocatore</td><td>6 (una per colore)</td><td>meeple, tappi, pedine di altri giochi (anche per il Fastidio)</td></tr>
<tr><td>PV</td><td>${R.hp} per giocatore (60) + qualche extra</td><td>perline rosse, dadi, segnapunti</td></tr>
<tr><td>Mana</td><td>${R.manaSfera} per giocatore (30)</td><td>perline blu, gettoni</td></tr>
<tr><td>Monete</td><td>${R.coinsMax} per giocatore (60)</td><td>monete vere, gettoni</td></tr>
<tr><td>Cubetti Vetro / Uranio / Minerale</td><td>30 + 30 + 30 (massimo teorico ${6 * (R.cubeMax + 2)} per tipo con lo Zaino)</td><td>cubetti di tre colori (es. azzurro, verde, arancio)</td></tr>
<tr><td>Munizioni</td><td>circa 40</td><td>perline gialle</td></tr>
<tr><td>Trappole / torrette</td><td>2 + 2 corpi, circa 24 segnalini “segnala tessera” (due colori)</td><td>gettoni di due colori, bottoni</td></tr>
<tr><td>Ulti (cratere)</td><td>6</td><td>gettoni stella</td></tr>
<tr><td>Rientro</td><td>2</td><td>gettoni verdi</td></tr>
<tr><td>Bottino (LOOT)</td><td>circa 6</td><td>gettone “sacco”, dado</td></tr>
<tr><td>Blocco del Fastidio · nuvola tossica · seguaci di Kone</td><td>5 · 7 · 2 (Sun e Moon)</td><td>gettoni di colori diversi</td></tr>
<tr><td>Segnalino Giorno/Notte · segnalino Plancia</td><td>1 + 1</td><td>moneta (due facce), perlina</td></tr></table></div>
<div class="card"><h2>Cosa ho verificato e cosa no</h2><ul><li>Pagine A4 e carta 63,5 × 88,9 mm controllate sui PDF (<code>npm test</code>) e guardando le pagine convertite in immagine.</li><li><b>Non posso sapere</b> come la tua stampante allinea fronte e retro: prova con un foglio.</li><li><span class="tag">[interpretazione]</span> Plancia Tempo e plance giocatore non erano nei materiali: le ho disegnate io dai numeri del regolamento (giornate 5-4-3, PV, mana, monete, cubetti). Se hai le tue, dimmelo.</li><li><span class="tag">[interpretazione]</span> “Se un mazzo finisce si rimescolano gli scarti” non è nel regolamento: è quello che fa l'app.</li><li>Non c'è un <b>foglio punti</b>: il gioco non conta punti (vince l'ultimo in vita).</li></ul></div>
</main></body></html>`;
fs.writeFileSync(path.join(out, 'index.html'), idx);
console.log(`HTML generati: ${cards.length} carte (${nReal} + ${REFS.length} di riferimento), ${ns} fogli, ${nTiles} tessere in ${nTileSheets} fogli`);

// ───────────── PDF ─────────────
if (!NOPDF) (async () => {
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  for (const f of ['carte-fronte-retro', 'carte-solo-fronti', 'tessere', 'zone-di-gioco', 'plancia-tempo', 'plance-giocatore', 'scheda-riassuntiva', 'regolamento']) {
    const p = await b.newPage();
    await p.goto('file://' + path.join(out, f + '.html'), { waitUntil: 'load' });
    await p.evaluate(() => Promise.all(Array.from(document.images).map((i) => (i.complete ? 1 : new Promise((r) => { i.onload = i.onerror = r; })))));
    await p.pdf({ path: path.join(out, f + '.pdf'), preferCSSPageSize: true, printBackground: true });
    await p.close();
    console.log('PDF', f, (fs.statSync(path.join(out, f + '.pdf')).size / 1e6).toFixed(1) + ' MB');
  }
  await b.close();
})();
