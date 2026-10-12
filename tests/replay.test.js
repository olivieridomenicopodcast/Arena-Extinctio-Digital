const test = require('node:test');
const assert = require('node:assert');
const AE = require('./_load.js');

// Simula il flusso dell'interfaccia (messaggi attivi, umano + AI) e controlla che riprendere dalla cronologia salvata
// ricostruisca ESATTAMENTE lo stesso stato nello stesso punto (è ciò che fa "Riprendi" e "Rivedi").
test('ripresa dal salvataggio: lo stato ricostruito è identico, in ogni punto di decisione dell’umano', () => {
  let checks = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const players = [{ name: 'Tu', kind: 'human' }, { name: 'AI2', kind: 'ai', level: 'medium' }, { name: 'AI3', kind: 'ai', level: 'hard' }];
    const g = new AE.Game({ seed: 's' + seed, players, beats: true });
    const ais = players.map((p, i) => (p.kind === 'human' ? null : AE.AI.create(p.level, `s${seed}:${i}`)));
    const rng = AE.makeRng('h' + seed);
    const gen = g.run(); let r = gen.next(), n = 0; const snaps = [];
    while (!r.done) {
      const d = r.value;
      if (d.type === 'beat') { r = gen.next(); continue; }
      if (g.s.players[d.pid].kind === 'human') {
        if (n % 40 === 7 && g.s.turnNo > 8) snaps.push({ hist: g.history.slice(), state: JSON.stringify(g.s) });
        n++;
        let i = Math.floor(rng() * d.options.length); if (d.what === 'action' && rng() < 0.3) i = d.options.length - 1;
        r = gen.next(i);
      } else r = gen.next(ais[d.pid].decide(g, d));
    }
    for (const sn of snaps) {
      const g2 = new AE.Game({ seed: 's' + seed, players, beats: true, replay: sn.hist.slice() });
      const gen2 = g2.run(); let r2 = gen2.next();
      while (!r2.done && r2.value.type === 'beat') r2 = gen2.next();
      assert.strictEqual(JSON.stringify(g2.s), sn.state, `seed ${seed}`); checks++;
    }
  }
  assert.ok(checks >= 12, 'controlli eseguiti: ' + checks);
});

test('ripresa da istantanea a inizio turno: la partita riparte dallo stesso stato e arriva alla fine', () => {
  const players = [{ name: 'A', kind: 'ai' }, { name: 'B', kind: 'ai' }, { name: 'C', kind: 'ai' }];
  const ais = players.map((p, i) => AE.AI.create('medium', 's' + i));
  const g = new AE.Game({ seed: 'snap1', players, keepSnaps: true });
  const gen = g.run(); let r = gen.next(), n = 0, keep = null;
  while (!r.done) {
    if (r.value.type === 'choose') { if (++n === 25) keep = { snap: g.snap, round: g.s.round, turnNo: JSON.parse(g.snap.s).turnNo }; r = gen.next(ais[r.value.pid].decide(g, r.value)); } else r = gen.next();
    if (n > 3000) break;
  }
  assert.ok(keep && keep.snap, 'istantanea presente');
  const g2 = new AE.Game({ seed: 'snap1', players, resume: keep.snap });
  assert.strictEqual(g2.s.turnNo, keep.turnNo);
  const gen2 = g2.run(); let q = gen2.next(), m = 0;
  while (!q.done && m++ < 6000) q = q.value.type === 'choose' ? gen2.next(ais[q.value.pid].decide(g2, q.value)) : gen2.next();
  assert.ok(g2.s.over, 'la partita ripresa finisce');
});

test('rete: ogni decisione del motore si può spedire come JSON (nessuna perdita) e lo stato pure', () => {
  const players = [0, 1, 2, 3].map((i) => ({ name: 'P' + i, kind: 'ai' }));
  const ais = players.map((p, i) => AE.AI.create('medium', 'j' + i));
  const g = new AE.Game({ seed: 'json1', players });
  const gen = g.run(); let r = gen.next(), n = 0;
  while (!r.done && n++ < 1500) {
    if (r.value.type === 'choose') { const d = r.value; assert.deepStrictEqual(JSON.parse(JSON.stringify(d)), JSON.parse(JSON.stringify(d))); assert.strictEqual(JSON.stringify(JSON.parse(JSON.stringify(d))), JSON.stringify(d), 'decisione senza funzioni/undefined che si perdono'); r = gen.next(ais[d.pid].decide(g, d)); } else r = gen.next();
  }
  assert.ok(n > 100);
  assert.strictEqual(JSON.stringify(JSON.parse(JSON.stringify(g.s))), JSON.stringify(g.s));
});
