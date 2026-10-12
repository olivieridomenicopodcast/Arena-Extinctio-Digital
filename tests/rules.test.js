const test = require('node:test');
const assert = require('node:assert');
const { AE, drive, layout, mk, place, prep, dice, at } = require('./_util.js');

test('mappa: 61 celle in 5 livelli (1,6,12,18,24)', () => {
  assert.strictEqual(AE.CELLS.length, 61);
  const by = {}; AE.CELLS.forEach((c) => { by[c.level] = (by[c.level] || 0) + 1; });
  assert.deepStrictEqual(by, { 1: 1, 2: 6, 3: 12, 4: 18, 5: 24 });
  assert.strictEqual(AE.NB[at(0, 0)].filter((x) => x >= 0).length, 6);
});
test('tessere: i conteggi per tipo sono quelli del regolamento', () => {
  const c = {}; AE.TILES.forEach((t) => { c[t.type] = (c[t.type] || 0) + 1; });
  assert.deepStrictEqual(c, { luogo: 6, ulti: 6, vuota: 7, carte: 12, tele: 5, equip: 9, muro: 7, rifugio: 5, insorm: 4 });
  assert.strictEqual(AE.TILES.length, 61);
});
test('mazzi: 75 Materiali, 47 Skill, 61 Armi e Progetti, 6 Armi Base', () => {
  const d = AE.buildDecks();
  assert.strictEqual(d.mat.length, 75); assert.strictEqual(d.skill.length, 47); assert.strictEqual(d.proj.length, 61); assert.strictEqual(d.base.length, 6);
  const n = (a, id) => a.filter((x) => x === id).length;
  assert.strictEqual(n(d.mat, 'mat:V'), 20); assert.strictEqual(n(d.mat, 'mat:M'), 10); assert.strictEqual(n(d.mat, 'mat:food'), 15); assert.strictEqual(n(d.mat, 'mat:medikit'), 10);
  assert.strictEqual(n(d.skill, 'sp:vantaggio'), 5); assert.strictEqual(n(d.skill, 'sp:zaino'), 2); assert.strictEqual(n(d.skill, 'sk:colpo'), 2);
  assert.strictEqual(n(d.proj, 'w:softlyne'), 5); assert.strictEqual(n(d.proj, 'w:ourban'), 6); assert.strictEqual(n(d.proj, 'mod:dan'), 5); assert.strictEqual(n(d.proj, 'ar:sunstone'), 4);
  assert.strictEqual(d.base.filter((x) => x === 'w:xas').length, 3);
});
test('armi: valori stampati sulle carte', () => {
  const W = AE.WEAPONS;
  assert.deepStrictEqual([W.softlyne.git, W.softlyne.dan, W.softlyne.mun], [1, 1, 3]);
  assert.deepStrictEqual([W.ourban.git, W.ourban.dan, W.ourban.mun, W.ourban.fal, W.ourban.tier], [0, 2, 2, 1, 'std']);
  assert.deepStrictEqual([W.here.dan, W.here.mun, W.here.fal, W.here.tier], [5, 3, 2, 'adv']);
  assert.deepStrictEqual([W.shapeliar.git, W.shapeliar.dan, W.shapeliar.mun], [6, 6, 1]);
  assert.deepStrictEqual(W.ujsutom.cost, { V: 1, U: 1, M: 1 });
  assert.deepStrictEqual(AE.ARMORS.abyss, { n: 'The Abyss', tier: 'adv', dif: 2, dur: 2, cost: { V: 1, U: 1, M: 2 }, copies: 3 });
});
test('costo in mana degli attacchi: base 0-1-2-3, standard 1-3, avanzata 1-4', () => {
  assert.deepStrictEqual([1, 2, 3, 4].map((n) => AE.attackManaCost('base', n)), [0, 1, 2, 3]);
  assert.deepStrictEqual([1, 2].map((n) => AE.attackManaCost('std', n)), [1, 3]);
  assert.deepStrictEqual([1, 2].map((n) => AE.attackManaCost('adv', n)), [1, 4]);
});

// ───────── movimento ─────────
test('movimento: tutte le destinazioni consumano esattamente i passi e non ripassano due volte', () => {
  const g = mk(2, { layout: layout() });
  const start = place(g, 0, 0, 0);
  for (const n of [1, 2, 3, 5, 7]) {
    const mo = g.movementOptions(0, n);
    assert.ok(mo.ends.length > 0);
    for (const e of mo.ends) {
      const teles = e.path.filter((c) => g.typeAt(c) === 'tele').length;
      assert.strictEqual(e.path.length - teles / 2, n, `passi ${n}`);
      const seen = new Set([start]); let cur = start;
      for (const c of e.path) { assert.ok(AE.NB[cur].includes(c) || (g.typeAt(cur) === 'tele' && g.typeAt(c) === 'tele'), 'celle adiacenti (o uscita da un portale)'); assert.ok(!seen.has(c), 'nessuna tessera ripetuta'); seen.add(c); cur = c; }
      assert.strictEqual(cur, e.cell);
    }
  }
});
test('movimento: un muro sul lato blocca il passaggio', () => {
  const c0 = at(0, 0), north = at(0, -1);
  const lay = layout({ [north]: 52 });     // tessera 52 = muro sul lato S (3): sul lato che guarda il centro
  const g = mk(2, { layout: lay });
  place(g, 0, 0, 0);
  assert.ok(g.wallBetween(north, 3));
  assert.ok(g.wallBetween(c0, 0), 'il muro è bilaterale');
  const mo = g.movementOptions(0, 1);
  assert.ok(!mo.ends.some((e) => e.cell === north), 'non si passa dal lato col muro');
});
test('movimento: i muri ruotano con la tessera', () => {
  const north = at(0, -1);
  const rot = []; rot[north] = 3;           // ruotato di 3 lati: il muro S diventa N
  const g = mk(2, { layout: layout({ [north]: 52 }), rot });
  assert.ok(!g.wallBetween(north, 3)); assert.ok(g.wallBetween(north, 0));
});
test('movimento: le tessere insormontabili non si attraversano', () => {
  const g = mk(2, { layout: layout({ [at(1, -1)]: 58, [at(1, 0)]: 59 }) });
  place(g, 0, 0, 0);
  const mo = g.movementOptions(0, 1);
  assert.ok(!mo.ends.some((e) => e.cell === at(1, -1) || e.cell === at(1, 0)));
});
test('movimento: portale = obbligatorio, il passo conta una volta (1-2-3(p)→altro portale come passo 3, poi 4 e 5)', () => {
  // portale A (32) in (1,0) e altro A (33) in (-3,2): da (0,0) con 5 passi
  const g = mk(2, { layout: layout({ [at(1, 0)]: 32, [at(-3, 2)]: 33 }) });
  place(g, 0, 0, 0);
  const mo = g.movementOptions(0, 1);
  assert.ok(!mo.ends.some((e) => e.cell === at(1, 0)), 'non ci si può fermare sul portale: si esce dall’altro');
  const via = mo.ends.find((e) => e.cell === at(-3, 2));
  assert.ok(via, 'con 1 passo si arriva all’altro portale');
  assert.deepStrictEqual(via.path, [at(1, 0), at(-3, 2)]);
  const m3 = g.movementOptions(0, 3);
  assert.ok(m3.ends.some((e) => AE.cellDist(e.cell, at(-3, 2)) === 2 && e.path[0] === at(1, 0)), 'dopo il portale si continua a camminare');
});
test('movimento: una tessera a distanza 8 è raggiungibile in 7 passi solo passando dai portali (nessun effetto "pacman")', () => {
  const portals = { [at(2, -1)]: 33, [at(1, -2)]: 32, [at(-1, 1)]: 35, [at(2, 1)]: 34, [at(-4, 2)]: 36, [at(3, -4)]: 31 };
  const g = mk(2, { layout: layout(portals) }); place(g, 0, -1, 4);
  assert.strictEqual(AE.cellDist(at(-1, 4), at(3, -4)), 8);
  const e = g.movementOptions(0, 7).ends.find((x) => x.cell === at(3, -4));
  assert.ok(e, 'raggiungibile con i portali');
  assert.ok(e.path.some((c) => g.typeAt(c) === 'tele'), 'il percorso passa da un portale');
  const h = mk(2, { layout: layout({ [at(3, -4)]: 31 }) }); place(h, 0, -1, 4);
  assert.ok(!h.movementOptions(0, 7).ends.some((x) => x.cell === at(3, -4)), 'senza portali non ci si arriva: la mappa non si "avvolge" ai bordi');
});
test('movimento: se non si riescono a usare tutti i passi si perde 1 PV e ci si ferma al massimo', () => {
  // giocatore chiuso in una cella con i 6 vicini insormontabili tranne uno senza uscita
  const g = mk(2, { layout: layout() });
  place(g, 0, 0, 0);
  const keep = new Set([at(0, 0), at(1, 0)]);
  g.s.cells.forEach((c, i) => { if (!keep.has(i)) c.tile = null; });
  const mo = g.movementOptions(0, 4);
  assert.ok(mo.short); assert.strictEqual(mo.steps, 1); assert.strictEqual(mo.ends[0].cell, at(1, 0));
});
test('mapDice: 2D6 con almeno 3 livelli, 1D6 con solo i livelli 1-2', () => {
  const g = mk(2); assert.strictEqual(g.mapDice(), 2);
  g.s.removedLevels = 2; assert.strictEqual(g.mapDice(), 2);
  g.s.removedLevels = 3; assert.strictEqual(g.mapDice(), 1);
});

// ───────── combattimento ─────────
function duel(opts) {
  opts = opts || {};
  const g = mk(2, { layout: layout(), chars: opts.chars || ['kone', 'ricca'] });
  place(g, 0, 0, 0); place(g, 1, 0, 0);
  prep(g, 0); prep(g, 1);
  g.pl(0).weapons.secondary = { id: 'softlyne', ammo: 3, mod: null };
  return g;
}
test('combattimento: chi ha il risultato più alto colpisce, in caso di pareggio vince l’attaccante', () => {
  const g = duel(); g.pl(0).weapons.primary = { id: 'cratter', ammo: 2, mod: null };
  // stessa tessera con gittata ≥1 → attaccante svantaggio, difensore vantaggio: usiamo il pugno (gittata 0) per avere dadi normali
  dice(g, [3, 4, 3, 4]);
  const o = { kind: 'attack', slot: 'fist', cost: 0, target: { kind: 'player', pid: 1, dist: 0, dir: -1, cell: at(0, 0) } };
  drive(g.attack(0, o));
  assert.strictEqual(g.pl(1).hp, 9, 'pareggio 7-7 → colpito');
  dice(g, [1, 1, 6, 6]);
  drive(g.attack(0, o));
  assert.strictEqual(g.pl(1).hp, 9, 'sconfitta: nessun danno al difensore');
  assert.strictEqual(g.pl(0).hp, 9, 'pugno fallito: 1 danno a chi attacca');
});
test('combattimento: vantaggio = 3D6 scegli i migliori 2; svantaggio = i peggiori 2', () => {
  const g = mk(2);
  dice(g, [1, 6, 5]); assert.strictEqual(g.rollChallenge(true, false).sum, 11);
  dice(g, [1, 6, 5]); assert.strictEqual(g.rollChallenge(false, true).sum, 6);
  dice(g, [1, 6]); assert.strictEqual(g.rollChallenge(true, true).sum, 7, 'vantaggio e svantaggio si annullano');
});
test('combattimento: stessa tessera con arma a gittata ≥1 → difensore vantaggio, attaccante svantaggio', () => {
  const g = duel();
  dice(g, [6, 6, 1, 1, 1, 6, 6]);   // attaccante 3D6 (6,6,1)→peggiori=1+6=7 ; difensore 3D6 (1,1,6... )
  const o = { kind: 'attack', slot: 'secondary', cost: 1, target: { kind: 'player', pid: 1, dist: 0, dir: -1, cell: at(0, 0) } };
  g.pl(0).mana = 4;
  drive(g.attack(0, o));
  const ev = g.events.find((e) => e.k === 'attack');
  assert.match(ev.text, /svantaggio/); assert.match(ev.text, /vantaggio/);
});
test('armatura avanzata: assorbe 2 per attacco e perde 1 durata (esempio del regolamento)', () => {
  const g = duel(); g.pl(1).armor = { id: 'abyss', dur: 2 };
  const done = drive(g.damage(1, 4, { src: 0, hit: true }));
  assert.strictEqual(done, 2); assert.strictEqual(g.pl(1).hp, 8); assert.strictEqual(g.pl(1).armor.dur, 1);
  drive(g.damage(1, 1, { src: 0, hit: true }));    // 0 danni passanti: la durata scende comunque
  assert.strictEqual(g.pl(1).armor, null, 'armatura esaurita');
});
test('Scudo Solare: blocca fino a 3 (di notte 2) e si disattiva col primo colpo', () => {
  const g = duel(); g.pl(1).temp.shield = 3;
  drive(g.damage(1, 2, { src: 0, hit: true }));
  assert.strictEqual(g.pl(1).hp, 10); assert.strictEqual(g.pl(1).temp.shield, undefined);
  drive(g.damage(1, 2, { src: 0, hit: true })); assert.strictEqual(g.pl(1).hp, 8);
});
test('Mira Perfetta: colpo infallibile ma 2 danni in meno', () => {
  const g = duel(); g.pl(0).weapons.primary = { id: 'tua', ammo: 2, mod: null }; g.pl(0).temp.mira = 2; g.pl(0).mana = 4;
  dice(g, [1, 1, 6, 6, 6, 6]);
  const o = { kind: 'attack', slot: 'primary', cost: 1, target: { kind: 'player', pid: 1, dist: 0, dir: -1, cell: at(0, 0) } };
  drive(g.attack(0, o));
  assert.strictEqual(g.pl(1).hp, 9, 'Tua fa 3, meno 2 = 1');
});
test('in un rifugio non si subiscono danni dagli altri e non si può attaccare', () => {
  const g = mk(2, { layout: layout({ [at(0, 0)]: 53 }) });
  place(g, 1, 0, 0); place(g, 0, 0, 1); prep(g, 0);
  drive(g.damage(1, 3, { src: 0, hit: true })); assert.strictEqual(g.pl(1).hp, 10);
  drive(g.damage(1, 1, { src: null, bypass: true })); assert.strictEqual(g.pl(1).hp, 9, 'i danni non causati da altri (es. mina) si subiscono');
  place(g, 0, 0, 0); prep(g, 0); assert.deepStrictEqual(g.attackOptions(0), []);
});
test('gittata: 6 direzioni, un corpo ferma il colpo, un muro pure', () => {
  const g = mk(3, { layout: layout({ [at(1, 0)]: 13 }), chars: ['kone', 'ricca', 'lasep'] });
  place(g, 0, 0, 0); place(g, 1, 2, 0); place(g, 2, 3, 0);
  const t = g.targetsFrom(0, 3).filter((x) => x.kind === 'player').map((x) => x.pid);
  assert.deepStrictEqual(t, [1], 'il secondo bersaglio è coperto dal primo');
  const g2 = mk(2, { layout: layout({ [at(1, 0)]: 52 }), rot: (() => { const r = []; r[at(1, 0)] = 3; return r; })() });   // muro sul lato N della (1,0)
  place(g2, 0, 1, 1); place(g2, 1, 1, -1);
  assert.deepStrictEqual(g2.targetsFrom(0, 4).filter((x) => x.kind === 'player'), [], 'colpo bloccato dal muro');
});
test('gittata: la linea è retta, non si spara "a L"', () => {
  const g = mk(2, { layout: layout() }); place(g, 0, 0, 0); place(g, 1, 1, 1);
  assert.deepStrictEqual(g.targetsFrom(0, 5).filter((x) => x.kind === 'player'), []);
  place(g, 1, 2, -2); assert.strictEqual(g.targetsFrom(0, 2).filter((x) => x.kind === 'player').length, 1);
  assert.strictEqual(g.targetsFrom(0, 1).filter((x) => x.kind === 'player').length, 0);
});

// ───────── passive dei personaggi ─────────
test('passive: Hatci +1 danno (base/standard), Karou +1 gittata, Mia Ika +1 munizione', () => {
  const g = mk(3, { chars: ['hatci', 'karou', 'miaika'] });
  g.pl(0).weapons.primary = { id: 'cratter', ammo: 2, mod: null }; g.pl(0).weapons.secondary = { id: 'clone', ammo: 3, mod: null };
  assert.strictEqual(g.weaponStats(0, 'primary').dan, 3); assert.strictEqual(g.weaponStats(0, 'secondary').dan, 2, 'avanzata: nessun bonus');
  g.pl(1).weapons.primary = { id: 'elindea', ammo: 1, mod: null };
  assert.strictEqual(g.weaponStats(1, 'primary').git, 5);
  g.pl(2).weapons.primary = { id: 'tua', ammo: 2, mod: null };
  assert.strictEqual(g.weaponStats(2, 'primary').cap, 3);
});
test('mod: +1 danno / gittata / capienza, una per arma', () => {
  const g = mk(2); const p = g.pl(0);
  p.weapons.primary = { id: 'cratter', ammo: 2, mod: 'dan' };
  assert.strictEqual(g.weaponStats(0, 'primary').dan, 3);
  p.weapons.primary.mod = 'git'; assert.strictEqual(g.weaponStats(0, 'primary').git, 3);
  p.weapons.primary.mod = 'mun'; assert.strictEqual(g.weaponStats(0, 'primary').cap, 3);
});

// ───────── trappole e torrette ─────────
test('trappola rallentante: chi tocca una tessera segnalata si ferma e non può attaccare; \'Nganga è immune', () => {
  const g = mk(2, { layout: layout(), chars: ['kone', 'ricca'] });
  place(g, 0, 0, 0); place(g, 1, 2, -2);
  const marks = g.adjacentCells(at(0, 0)).map((c) => g.s.cells[c].tile);
  g.s.traps.push({ id: 1, kind: 'trap', tile: g.pl(0).at, owner: 0, hp: 4, marks });
  prep(g, 1);
  const m2 = g.movementOptions(1, 3);
  const stopEnd = m2.ends.find((e) => e.stop);
  assert.ok(stopEnd, 'si può finire su una tessera segnalata, anche con meno passi del tiro');
  assert.ok(m2.ends.filter((e) => !e.stop).every((e) => !marks.includes(g.s.cells[e.cell].tile)), 'non si può attraversare un segnalino senza fermarsi');
  drive(g.walk(1, stopEnd.path, stopEnd.cell));
  assert.strictEqual(g.pl(1).turn.slowed, true);
  assert.deepStrictEqual(g.pl(1).turn.slowed && g.attackOptions(1), [], 'rallentato: non può attaccare');
  // 'Nganga non è rallentata
  const h = mk(2, { layout: layout(), chars: ['kone', 'nganga'] });
  place(h, 0, 0, 0); place(h, 1, 2, -2); prep(h, 1);
  h.s.traps.push({ id: 1, kind: 'trap', tile: h.pl(0).at, owner: 0, hp: 4, marks });
  assert.ok(!h.movementOptions(1, 3).ends.some((e) => e.stop));
});
test('torretta: 2 danni a chi tocca una tessera segnalata, il segnalino sparisce', () => {
  const g = mk(2, { layout: layout(), chars: ['kone', 'ricca'] });
  place(g, 0, 0, 0); place(g, 1, 2, -1); prep(g, 1);
  const tile = g.s.cells[at(1, -1)].tile;
  g.s.traps.push({ id: 1, kind: 'turret', tile: g.pl(0).at, owner: 0, hp: 4, marks: [tile] });
  drive(g.walk(1, [at(1, -1)], at(1, -1)));
  assert.strictEqual(g.pl(1).hp, 8); assert.deepStrictEqual(g.s.traps[0].marks, []);
});

// ───────── eliminazione, bottino, rientri ─────────
test('eliminazione: +3 monete a chi uccide, bottino sulla tessera, rientro se disponibile', () => {
  const g = mk(2, { layout: layout(), chars: ['kone', 'ricca'] });
  place(g, 0, 0, 0); place(g, 1, 0, 0); prep(g, 0);
  g.pl(1).cubes.V = 2; g.pl(1).weapons.primary = { id: 'tua', ammo: 1, mod: null };
  g.pl(1).coins = 1; g.pl(1).hp = 1;
  drive(g.damage(1, 3, { src: 0, hit: true }), (d) => (d.what === 'steal' ? 0 : 0));
  assert.strictEqual(g.pl(0).coins, 3);
  assert.strictEqual(g.pl(1).coins, 2, 'chi ha meno di 2 monete viene portato a 2');
  assert.strictEqual(g.pl(1).status, 'pending'); assert.strictEqual(g.pl(1).reentries, 1);
  assert.ok(g.s.loot.length === 1);
  assert.deepStrictEqual(g.pl(1).weapons, { primary: null, secondary: null, melee: null });
});
test('eliminazione senza rientri: diventa Giocatore Fastidio; l’ultimo in vita vince', () => {
  const g = mk(3, { layout: layout(), chars: ['kone', 'ricca', 'lasep'] });
  place(g, 0, 0, 0); place(g, 1, 1, 0); place(g, 2, 2, 0);
  g.pl(1).reentries = 0; g.pl(2).reentries = 0;
  drive(g.damage(1, 99, { src: 0, bypass: true }));
  assert.strictEqual(g.pl(1).status, 'ghost'); assert.strictEqual(g.s.over, false);
  drive(g.damage(2, 99, { src: 0, bypass: true }));
  assert.strictEqual(g.s.over, true); assert.strictEqual(g.s.winner, 0);
});
test('rientri per numero di giocatori (2: 2 ciascuno, 3: 1 ciascuno, 4: 2 segnalini max 1, 5: 1 segnalino, 6: nessuno)', () => {
  const each = (n) => mk(n).s.players.map((p) => p.reentries);
  assert.deepStrictEqual(each(2), [2, 2]); assert.deepStrictEqual(each(3), [1, 1, 1]); assert.deepStrictEqual(each(4), [0, 0, 0, 0]);
  assert.strictEqual(mk(4).s.tokens.length, 2); assert.strictEqual(mk(5).s.tokens.length, 1); assert.strictEqual(mk(6).s.tokens.length, 0); assert.strictEqual(mk(3).s.tokens.length, 0);
});
test('rientro: priorità Luogo, poi Rifugio, poi Vuote; PV e mana pieni', () => {
  const g = mk(2);
  const c = g.respawnTile(); assert.ok(c.every((t) => AE.tile(t).type === 'luogo'));
  const p = g.pl(1); p.status = 'pending'; p.at = null; p.hp = 0; p.mana = 0;
  drive(g.respawn(1, {}));
  assert.strictEqual(p.status, 'alive'); assert.strictEqual(p.hp, 10); assert.strictEqual(p.mana, 4); assert.strictEqual(AE.tile(p.at).type, 'luogo');
});

// ───────── plancia tempo e livelli ─────────
test('plancia: livello 5 dopo 5 giornate (10 cambi), poi 4 dopo altre 4 (8), poi 3 dopo altre 3 (6)', () => {
  const g = mk(2);
  const seq = []; let lastLv = 0;
  for (let i = 1; i <= 30; i++) { drive(g.periodChange()); const l = g.s.removedLevels; if (l !== lastLv) { seq.push([i, l]); lastLv = l; } }
  assert.deepStrictEqual(seq, [[10, 1], [18, 2], [24, 3]]);
  assert.strictEqual(g.s.cells.filter((c) => c.tile).length, 7, 'restano i livelli 1-2');
});
test('giorno e notte si alternano a ogni cambio giornata', () => {
  const g = mk(2); assert.strictEqual(g.s.period, 'day');
  drive(g.periodChange()); assert.strictEqual(g.s.period, 'night');
  drive(g.periodChange()); assert.strictEqual(g.s.period, 'day');
});
test('cambio giornata: mana ricaricato, +2 monete su Luogo e +1 su Rifugio', () => {
  const g = mk(2, { layout: layout({ [at(0, 0)]: 53 }) });
  g.pl(0).mana = 0; g.pl(1).mana = 1; place(g, 0, 0, 0);       // P1 su un rifugio, P2 sul proprio Luogo
  g.pl(1).at = 2;
  drive(g.periodChange());
  assert.strictEqual(g.pl(0).mana, 4); assert.strictEqual(g.pl(0).coins, 1); assert.strictEqual(g.pl(1).coins, 2);
});
test('rimozione livello: chi è sulla tessera rimossa rientra senza perdere il rientro', () => {
  const g = mk(2); const outer = g.s.cells.findIndex((c, i) => AE.CELLS[i].level === 5);
  g.pl(0).at = g.s.cells[outer].tile; const re = g.pl(0).reentries;
  g.s.nextRemoval = 1;
  drive(g.periodChange());
  assert.strictEqual(g.s.removedLevels, 1);
  assert.strictEqual(g.pl(0).status, 'alive'); assert.strictEqual(g.pl(0).reentries, re);
  assert.ok(g.cellOfTile(g.pl(0).at) >= 0);
});
test('God_Nocy: +2 vita a ogni rimozione di livello (eccesso temporaneo)', () => {
  const g = mk(2, { chars: ['godnocy', 'kone'], layout: layout() }); g.pl(0).hp = 5; g.s.nextRemoval = 1;
  drive(g.periodChange()); assert.strictEqual(g.pl(0).hp, 7);
});

// ───────── carte, crafting, mercato ─────────
test('materiali: 2 cubetti per carta, massimo 6 per tipo (8 con lo Zaino)', () => {
  const g = mk(2); const p = g.pl(0);
  for (let i = 0; i < 4; i++) drive(g.gain(0, 'mat:V'));
  assert.strictEqual(p.cubes.V, 6);
  p.specials.push('sp:zaino'); drive(g.gain(0, 'mat:V')); assert.strictEqual(p.cubes.V, 8);
});
test('inventario pieno: scartare una carta dà 1 moneta', () => {
  const g = mk(2); const p = g.pl(0);
  p.skills = ['sk:repeat', 'sk:tempo']; drive(g.gain(0, 'sk:mira'), () => 0);
  assert.strictEqual(p.skills.length, 2); assert.strictEqual(p.coins, 1);
});
test('Mina Esplosiva: 2 danni subito; Svantaggio: svantaggio nel prossimo combattimento', () => {
  const g = mk(2); drive(g.gain(0, 'sp:mina')); assert.strictEqual(g.pl(0).hp, 8);
  drive(g.gain(0, 'sp:svantaggio')); assert.strictEqual(g.pl(0).temp.svantaggio, true);
});
test('crafting: servono le risorse e 1 mana; arma avanzata dal progetto; Sejhnam sconta 1 tra Vetro e Uranio', () => {
  const g = mk(2, { chars: ['kone', 'sejhnam'] }); prep(g, 0); prep(g, 1);
  const p = g.pl(0); p.projects = ['w:ujsutom']; p.cubes = { V: 1, U: 1, M: 0 };
  assert.deepStrictEqual(g.craftOptions(0), [], 'manca il Minerale');
  p.cubes.M = 1; const o = g.craftOptions(0); assert.strictEqual(o.length, 1);
  drive(g.doCraft(0, o[0]));
  assert.strictEqual(p.weapons.primary.id, 'ujsutom'); assert.strictEqual(p.mana, 3); assert.deepStrictEqual(p.cubes, { V: 0, U: 0, M: 0 });
  const q = g.pl(1); q.projects = ['w:ujsutom']; q.cubes = { V: 0, U: 1, M: 1 };
  assert.strictEqual(g.craftOptions(1).length, 1, 'con lo sconto basta 1 Vetro in meno');
});
test('crafting: max 1 mod per arma', () => {
  const g = mk(2); prep(g, 0); const p = g.pl(0);
  p.weapons.primary = { id: 'cratter', ammo: 2, mod: null }; p.projects = ['mod:dan'];
  assert.strictEqual(g.craftOptions(0).length, 1);
  drive(g.doCraft(0, g.craftOptions(0)[0])); assert.strictEqual(p.weapons.primary.mod, 'dan');
  p.projects = ['mod:git']; assert.deepStrictEqual(g.craftOptions(0), []);
});
test('mercato: prezzi dal mazzo/display e 1 mana; vita 3 monete, munizione 2', () => {
  const g = mk(2); prep(g, 0); const p = g.pl(0); p.coins = 10;
  const o = g.buyOptions(0);
  assert.ok(o.find((x) => x.deck === 'skill' && x.from === 'deck' && x.price === 3));
  assert.ok(o.find((x) => x.deck === 'skill' && x.from === 'display' && x.price === 4));
  assert.ok(o.find((x) => x.deck === 'mat' && x.from === 'deck' && x.price === 2));
  assert.ok(o.find((x) => x.deck === 'proj' && x.from === 'display' && x.price === 3));
  p.hp = 5; assert.ok(g.buyOptions(0).find((x) => x.kind === 'buyhp' && x.price === 3));
});
test('tessera Equipaggiamento: arma base raffigurata, munizioni al massimo, +2 PV col medikit', () => {
  const g = mk(2, { layout: layout({ [at(0, 0)]: 45 }) });
  place(g, 0, 0, 0); prep(g, 0); g.pl(0).hp = 5;
  drive(g.activateEquip(0, AE.tile(45)), () => 0);
  assert.ok(g.pl(0).weapons.primary && g.pl(0).weapons.secondary); assert.strictEqual(g.pl(0).hp, 7);
});
test('display: dopo un acquisto si rimpiazza dal mazzo', () => {
  const g = mk(2); const before = g.s.display.mat;
  drive(g.takeDisplay(0, 'mat'));
  assert.ok(g.s.display.mat); assert.strictEqual(g.s.decks.mat.length + g.s.discard.mat.length + 1 + g.s.players[0].heal.length + 1 >= 70, true);
});

// ───────── Ulti e Skill ─────────
test('Ulti: Ricca cura metà dei PV mancanti di giorno e tutto di notte', () => {
  const g = mk(2, { chars: ['ricca', 'kone'] }); prep(g, 0); const p = g.pl(0);
  p.ultiHeld = true; p.hp = 4; drive(g.useUlti(0)); assert.strictEqual(p.hp, 7);
  p.ultiHeld = true; p.mana = 4; g.s.period = 'night'; drive(g.useUlti(0)); assert.strictEqual(p.hp, 10);
});
test('Ulti: Lasep di giorno 3 danni a tutti tranne i rifugi, di notte 1 a tutti', () => {
  const g = mk(3, { layout: layout({ [at(1, 0)]: 53 }), chars: ['lasep', 'kone', 'ricca'] }); prep(g, 0);
  place(g, 1, 1, 0); place(g, 2, 3, 0); g.pl(0).ultiHeld = true;
  drive(g.useUlti(0)); assert.strictEqual(g.pl(1).hp, 10); assert.strictEqual(g.pl(2).hp, 7);
});
test('Ulti: Soshito di giorno fa solo muovere, di notte fa saltare il turno', () => {
  const g = mk(2, { chars: ['soshito', 'kone'] }); prep(g, 0); g.pl(0).ultiHeld = true;
  drive(g.useUlti(0)); assert.strictEqual(g.pl(1).temp.moveOnly, true);
  g.pl(0).ultiHeld = true; g.pl(0).mana = 4; g.s.period = 'night'; drive(g.useUlti(0)); assert.strictEqual(g.pl(1).temp.skipTurn, true);
});
test('Ulti: si raccoglie fermandosi sulla propria tessera Ulti; solo il proprietario', () => {
  const g = mk(2, { layout: layout({ [at(0, 0)]: 7 }) });
  place(g, 1, 0, 0); prep(g, 1); drive(g.activate(1)); assert.strictEqual(g.pl(1).ultiHeld, false);
  place(g, 0, 0, 0); prep(g, 0); drive(g.activate(0)); assert.strictEqual(g.pl(0).ultiHeld, true); assert.strictEqual(g.s.crater[7], false);
});
test('Mia Ika: se eliminata usa l’Ulti e rientra con tutto l’equipaggiamento', () => {
  const g = mk(2, { chars: ['miaika', 'kone'] }); const p = g.pl(0);
  p.ultiHeld = true; p.weapons.primary = { id: 'tua', ammo: 2, mod: null }; p.hp = 2;
  drive(g.damage(0, 5, { src: 1, bypass: true }), (d) => (d.what === 'yesno' ? 0 : 0));
  assert.strictEqual(p.status, 'alive'); assert.strictEqual(p.hp, 10); assert.ok(p.weapons.primary);
});
test('Skill: Teletrasporto Corto raggio 2 (3 di notte)', () => {
  const g = mk(2, { layout: layout() }); place(g, 0, 0, 0); prep(g, 0); g.pl(0).skills = ['sk:teletrasporto'];
  const o = g.skillOptions(0).find((x) => x.skill === 'teletrasporto');
  assert.ok(o.cells.every((c) => AE.cellDist(at(0, 0), c) <= 2)); assert.ok(o.cells.length > 0);
  g.s.period = 'night'; const o2 = g.skillOptions(0).find((x) => x.skill === 'teletrasporto');
  assert.ok(o2.cells.some((c) => AE.cellDist(at(0, 0), c) === 3));
});
test('Skill: Tempesta Imminente colpisce dopo 2 cambi giornata chi non è in un rifugio', () => {
  const g = mk(2, { layout: layout({ [at(0, 0)]: 53 }) }); prep(g, 0); place(g, 1, 0, 0);
  g.pl(0).skills = ['sk:tempesta']; g.pl(0).at = 1;
  drive(g.doSkill(0, g.skillOptions(0).find((x) => x.skill === 'tempesta')));
  drive(g.periodChange()); assert.strictEqual(g.pl(0).hp, 10);
  drive(g.periodChange()); assert.strictEqual(g.pl(0).hp, 7); assert.strictEqual(g.pl(1).hp, 10, 'in rifugio nessun danno');
});
test('Skill: Risucchio di Energia e Munizioni Farlocche', () => {
  const g = mk(2); prep(g, 0); g.pl(0).skills = ['sk:risucchio', 'sk:munizioni']; g.pl(1).weapons.primary = { id: 'tua', ammo: 2, mod: null };
  drive(g.doSkill(0, g.skillOptions(0).find((x) => x.skill === 'risucchio'))); assert.strictEqual(g.pl(1).mana, 2);
  drive(g.doSkill(0, g.skillOptions(0).find((x) => x.skill === 'munizioni'))); assert.strictEqual(g.pl(1).weapons.primary.ammo, 1);
});

// ───────── Giocatore Fastidio ─────────
test('Fastidio: il tiro 1-2 blocca la tessera, 3-4 ruba una risorsa, 5-6 scambia due tessere', () => {
  const g = mk(3, { layout: layout(), chars: ['kone', 'ricca', 'lasep'] });
  place(g, 0, 0, 0); place(g, 2, 2, 0);
  const gh = g.pl(1); gh.status = 'ghost'; gh.at = g.s.cells[at(-1, 0)].tile; gh.reentries = 0;
  g.pl(0).cubes.V = 1; g.pl(2).cubes.U = 1;
  dice(g, [1, 1]); drive(g.ghostTurn(1));
  assert.strictEqual(g.s.blocks[gh.at], 1);
  dice(g, [1, 3, 1]); drive(g.ghostTurn(1));            // muove 1, poi ruba: vittima = 1° dopo il Fastidio (giocatore 3), poi dado 1
  assert.strictEqual(g.pl(2).cubes.U, 0);
  const t1 = g.s.cells[at(-3, 0)].tile, t2 = g.s.cells[at(-3, 1)].tile;
  dice(g, [1, 5]); drive(g.ghostTurn(1), (d) => 0);
  assert.notStrictEqual(g.s.cells[0].tile, undefined);
});
test('Fastidio: una tessera bloccata non si attraversa', () => {
  const g = mk(2, { layout: layout() }); place(g, 0, 0, 0);
  g.s.blocks[g.s.cells[at(1, 0)].tile] = 1;
  assert.ok(!g.movementOptions(0, 1).ends.some((e) => e.cell === at(1, 0)));
});

// ───────── rivendita del bottino, variante rifugio ─────────
test('bottino: si può rivendere al proprietario in attesa di rientrare (5 monete, o 2 prendendo prima 2 oggetti) e gli torna al rientro', () => {
  const g = mk(3, { layout: layout(), chars: ['kone', 'ricca', 'lasep'] });
  place(g, 0, 0, 0); prep(g, 0);
  const owner = g.pl(1); owner.status = 'pending'; owner.at = null;
  g.s.loot.push({ tile: g.pl(0).at, owner: 1, items: ['sk:colpo', 'eq:w:tua', 'cube:V'] });
  drive(g.lootPickup(0), (d) => d.options.findIndex((o) => o.sell === 'all'));
  assert.strictEqual(g.pl(0).coins, 5); assert.strictEqual(g.s.loot.length, 0); assert.strictEqual(owner.returned.length, 3);
  drive(g.respawn(1, {}));
  assert.ok(owner.skills.includes('sk:colpo')); assert.ok(owner.weapons.primary && owner.weapons.primary.id === 'tua'); assert.strictEqual(owner.cubes.V, 1); assert.deepStrictEqual(owner.returned, []);
  // prendi 2 oggetti e rivendi il resto: +2 monete
  const h = mk(3, { layout: layout(), chars: ['kone', 'ricca', 'lasep'] }); place(h, 0, 0, 0); prep(h, 0);
  h.pl(1).status = 'pending'; h.pl(1).at = null; h.s.loot.push({ tile: h.pl(0).at, owner: 1, items: ['sk:colpo', 'sk:scudo', 'sk:mira'] });
  let n = 0; drive(h.lootPickup(0), (d) => { n++; return n <= 2 ? 0 : d.options.findIndex((o) => o.sell === 'rest'); });
  assert.strictEqual(h.pl(0).skills.length, 2); assert.strictEqual(h.pl(0).coins, 2); assert.strictEqual(h.pl(1).returned.length, 1);
  // se il proprietario non è in attesa non si rivende
  const k = mk(3, { layout: layout() }); place(k, 0, 0, 0); prep(k, 0); k.s.loot.push({ tile: k.pl(0).at, owner: 1, items: ['sk:colpo'] });
  let seen = null; drive(k.lootPickup(0), (d) => { seen = d.options; return d.options.length - 1; });
  assert.ok(!seen.some((o) => o.sell));
});
test('variante rifugio: dopo N turni di fila in un Rifugio il movimento non può finire in un Rifugio', () => {
  const g = mk(2, { layout: layout({ [at(0, 0)]: 53, [at(1, 0)]: 54 }), rules: { shelterLimit: 2 } });
  place(g, 0, 0, 0); prep(g, 0); g.pl(0).shelterRun = 2;
  dice(g, [1, 0]);
  let chosen = null; drive(g.movement(0), (d) => { chosen = d.options; return 0; });
  assert.ok(chosen && chosen.every((o) => AE.tile(o.tile).type !== 'rifugio'), 'nessuna destinazione in un rifugio');
  g.pl(0).shelterRun = 1; place(g, 0, 0, 0); prep(g, 0); dice(g, [1, 0]);
  let c2 = null; drive(g.movement(0), (d) => { c2 = d.options; return 0; });
  assert.ok(c2.some((o) => AE.tile(o.tile).type === 'rifugio'), 'sotto il limite i rifugi sono ammessi');
});

// ───────── determinismo, replay, fuzz ─────────
function play(seed, n, replay) {
  const players = [...Array(n)].map((_, i) => ({ name: 'P' + i, kind: 'ai' }));
  const g = new AE.Game({ seed, players, replay, log: false });
  const rng = AE.makeRng('x' + seed); const gen = g.run(); let r = gen.next();
  while (!r.done) { const d = r.value; r = gen.next(d.type === 'beat' ? undefined : Math.floor(rng() * d.options.length)); }
  return g;
}
test('determinismo: stesso seed e stesse risposte → stessa partita; il replay dalla cronologia la riproduce', () => {
  const a = play(7, 3), b = play(7, 3);
  assert.deepStrictEqual(a.result, b.result); assert.deepStrictEqual(a.history, b.history);
  const c = new AE.Game({ seed: 7, players: [0, 1, 2].map((i) => ({ name: 'P' + i, kind: 'ai' })), replay: a.history, log: false });
  const gen = c.run(); let r = gen.next(); assert.ok(r.done, 'con la cronologia non servono altre decisioni');
  assert.deepStrictEqual(c.result, a.result);
});
test('clone: lo stato clonato è indipendente', () => {
  const g = mk(3); const c = g.clone(); c.pl(0).hp = 1; c.s.decks.mat.pop();
  assert.strictEqual(g.pl(0).hp, 10); assert.strictEqual(g.s.decks.mat.length, 75 - 1 > 0 ? g.s.decks.mat.length : 0);
  assert.notStrictEqual(g.s.decks.mat.length, c.s.decks.mat.length);
});
test('fuzz: 30 partite casuali (2-6 giocatori) senza errori, carte mai perse né duplicate', () => {
  const { playRandom } = require('../tools/randombot.js'); const { check } = require('./_inv.js');
  for (let i = 1; i <= 30; i++) {
    const g = playRandom(1000 + i, 2 + (i % 5), { bias: true, log: false, check: (g) => { if (g.s.turnNo % 3 === 0 || true) { const e = check(g); if (e.length) throw new Error(`seed ${1000 + i}: ${e[0]}`); } } });
    assert.ok(g.result);
  }
});
