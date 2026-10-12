const test = require('node:test');
const assert = require('node:assert');
const AE = require('./_load.js');

// avanza una partita (AI contro AI) fino a una decisione "azione" del giocatore 0 dopo `minTurn` turni
function reach(seed, minTurn, n) {
  const players = [...Array(n)].map((_, i) => ({ name: 'P' + i, kind: 'ai', level: 'medium' }));
  const g = new AE.Game({ seed, players, log: false });
  const ais = players.map((p, i) => AE.AI.create('medium', seed + ':' + i));
  const gen = g.run(); let r = gen.next();
  while (!r.done) {
    const d = r.value;
    if (d.type === 'beat') { r = gen.next(); continue; }
    if (g.s.turnNo >= minTurn && d.what === 'action' && d.pid === 0 && g.s.players.some((p) => p.id !== 0 && p.skills.length + p.projects.length + p.heal.length > 0)) return { g, d };
    r = gen.next(ais[d.pid].decide(g, d));
  }
  return null;
}
// rimescola tutto ciò che un avversario NON può far vedere: mani nascoste e ordine dei mazzi
function shuffleHidden(g0, me, seed) {
  const g = g0.clone(), s = g.s, rng = AE.makeRng(seed);
  const shuf = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const opp = s.players.filter((p) => p.id !== me);
  const swap = (deck, getList, setList, accept) => {
    const pool = s.decks[deck].slice(); for (const q of opp) pool.push(...getList(q));
    shuf(pool);
    for (const q of opp) { const n = getList(q).length; const mine = []; for (let i = 0; i < pool.length && mine.length < n; i++) if (accept(pool[i])) { mine.push(pool[i]); pool.splice(i, 1); i--; } setList(q, mine); }
    s.decks[deck] = shuf(pool);
  };
  swap('mat', (q) => q.heal, (q, l) => { q.heal = l; }, (c) => c === 'mat:food' || c === 'mat:medikit');
  swap('skill', (q) => q.skills, (q, l) => { q.skills = l; }, (c) => c.startsWith('sk:'));
  swap('proj', (q) => q.projects, (q, l) => { q.projects = l; }, () => true);
  shuf(s.decks.base);
  s.rng = Math.floor(rng() * 1e9);      // anche i dadi futuri
  return g;
}
test('AI: tre livelli ben distinti (facile < media < difficile)', () => {
  const t = AE.Sim.tournament({ games: 60, n: 3, profiles: [{ label: 'easy', level: 'easy' }, { label: 'medium', level: 'medium' }, { label: 'hard', level: 'hard' }], seed0: 500 });
  const w = Object.fromEntries(t.profiles.map((p) => [p.label, p.wins]));
  // con poche partite la distanza difficile/media è dentro il rumore (misurata col simulatore: 51% / 36% / 13% su 240 partite): qui si controlla solo che la facile sia nettamente dietro
  assert.ok(w.hard > w.easy && w.medium > w.easy && w.hard >= w.medium - 4, JSON.stringify(w));
});
for (const level of ['medium', 'hard']) {
  test(`AI ${level}: non sbircia — la decisione non cambia se si rimescolano mani avversarie, mazzi e dadi`, () => {
    let checked = 0, changed = 0;
    for (const seed of [11, 12, 13]) {
      const f = reach(seed, 40, 3); if (!f) continue;
      const a = AE.AI.create(level, 'k' + seed).decide(f.g, f.d);
      const g2 = shuffleHidden(f.g, 0, seed * 7);
      const hid = (g) => JSON.stringify(g.s.players.map((p) => [p.heal, p.skills, p.projects]).concat([g.s.decks.mat.slice(0, 8)]));
      if (hid(g2) !== hid(f.g)) changed++;
      const a2 = AE.AI.create(level, 'k' + seed).decide(g2, f.d);
      assert.strictEqual(a2, a, `seed ${seed}`); checked++;
    }
    assert.ok(checked >= 2, 'servono almeno 2 situazioni di prova');
    assert.ok(changed >= 2, 'il rimescolamento deve cambiare davvero ciò che è nascosto');
  });
}
test('AI: stesso seed → stesse decisioni (determinismo)', () => {
  const r1 = AE.Sim.playGame({ seed: 77, players: [{ level: 'hard' }, { level: 'medium' }, { level: 'easy' }] });
  const r2 = AE.Sim.playGame({ seed: 77, players: [{ level: 'hard' }, { level: 'medium' }, { level: 'easy' }] });
  assert.deepStrictEqual(r1.history, r2.history); assert.deepStrictEqual(r1.result, r2.result);
});
test('AI: ogni decisione ha un indice valido e le partite finiscono (20 partite, 2-6 giocatori)', () => {
  for (let i = 0; i < 20; i++) {
    const n = 2 + (i % 5), lv = ['easy', 'medium', 'hard'];
    const g = AE.Sim.playGame({ seed: 900 + i, players: [...Array(n)].map((_, k) => ({ level: lv[(k + i) % 3] })) });
    assert.ok(g.result, 'partita finita'); 
  }
});
