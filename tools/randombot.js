// Gioca una partita con scelte casuali e controlla le invarianti. Uso: node tools/randombot.js [seed] [giocatori]
const AE = require('../tests/_load.js');
function playRandom(seed, n, opts) {
  opts = opts || {};
  const players = [...Array(n)].map((_, i) => ({ name: 'P' + (i + 1), kind: 'ai' }));
  const g = new AE.Game({ seed, players, log: opts.log !== false, rules: opts.rules });
  const gen = g.run(); const rng = AE.makeRng('bot' + seed);
  let r = gen.next(), steps = 0;
  while (!r.done) {
    const d = r.value;
    if (d.type === 'beat') { r = gen.next(); continue; }
    steps++; if (steps > 200000) throw new Error('troppi passi');
    let i = Math.floor(rng() * d.options.length);
    if (d.what === 'action' && opts.bias) { const nonEnd = d.options.map((o, k) => [o, k]).filter(([o]) => o.kind !== 'end'); if (nonEnd.length && rng() < 0.7) i = nonEnd[Math.floor(rng() * nonEnd.length)][1]; }
    r = gen.next(i);
    if (opts.check) opts.check(g);
  }
  return g;
}
module.exports = { playRandom };
if (require.main === module) {
  const seed = Number(process.argv[2] || 1), n = Number(process.argv[3] || 4);
  const g = playRandom(seed, n, { bias: true });
  console.log(g.result, g.events.length, 'eventi');
  if (process.argv[4]) console.log(g.events.map((e) => e.text).join('\n'));
}
