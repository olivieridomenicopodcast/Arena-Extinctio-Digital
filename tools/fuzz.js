const { playRandom } = require('./randombot.js');
const { check } = require('../tests/_inv.js');
const N = Number(process.argv[2] || 100), t0 = Date.now();
let bad = 0, rounds = [], winners = {};
for (let i = 1; i <= N; i++) {
  const n = 2 + (i % 5);
  try {
    const g = playRandom(i, n, { bias: true, log: false, check: (g) => { const e = check(g); if (e.length) throw new Error(e.slice(0, 3).join('; ')); } });
    rounds.push(g.result.rounds); winners[g.result.why] = (winners[g.result.why] || 0) + 1;
  } catch (e) { bad++; if (bad <= 8) console.log('seed', i, 'giocatori', n, '→', e.message.slice(0, 200), (e.stack || '').split('\n')[1]); }
}
console.log(`${N} partite, errori ${bad}, round medi ${(rounds.reduce((a, b) => a + b, 0) / rounds.length).toFixed(1)}, ${((Date.now() - t0) / 1000).toFixed(1)}s`, winners);
