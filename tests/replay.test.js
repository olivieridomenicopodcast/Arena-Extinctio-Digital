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
  assert.ok(checks >= 20, 'controlli eseguiti: ' + checks);
});
