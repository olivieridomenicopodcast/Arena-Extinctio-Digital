const AE = require('./_load.js');
// Esegue un generatore del motore rispondendo con `answer(dec)` (indice) ; ritorna il valore finale.
function drive(gen, answer) {
  let r = gen.next(), n = 0;
  while (!r.done) {
    if (++n > 10000) throw new Error('loop');
    const d = r.value;
    if (d.type === 'beat') { r = gen.next(); continue; }
    r = gen.next(answer ? answer(d) : 0);
  }
  return r.value;
}
// layout di test: tutte le celle "vuote" (tessere 13..19 e poi altre non speciali), con tessere indicate in `put` {cellIndex: tileId}
// layout di test: le tessere 'pericolose' (portali, muri, insormontabili) stanno sull'anello esterno, i Luoghi sull'anello 2;
// con `put` {cellIndex: tileId} si forza una tessera in una cella.
function layout(put) {
  put = put || {};
  const used = new Set(Object.values(put));
  const out = new Array(AE.CELLS.length).fill(null);
  for (const k in put) out[k] = put[k];
  const take = (ids, level) => { const cells = AE.CELLS.map((c, i) => i).filter((i) => AE.CELLS[i].level === level && out[i] == null); for (const id of ids) { if (used.has(id)) continue; out[cells.shift()] = id; used.add(id); } };
  take(AE.TILES.filter((t) => ['tele', 'muro', 'insorm'].includes(t.type)).map((t) => t.id), 5);
  take([1, 2, 3, 4, 5, 6], 2);
  const rest = AE.TILES.map((t) => t.id).filter((id) => !used.has(id));
  for (let i = 0; i < out.length; i++) if (out[i] == null) out[i] = rest.shift();
  return out;
}
const at = (q, r) => AE.cellIndex(q, r);
function mk(n, opts) {
  opts = opts || {};
  const players = [...Array(n || 2)].map((_, i) => ({ name: 'P' + (i + 1), kind: 'ai', char: (opts.chars && opts.chars[i]) || ['kone', 'lasep', 'soshito', 'ricca', 'karou', 'hatci'][i] }));
  const g = new AE.Game({ seed: opts.seed || 1, players, layout: opts.layout, rot: opts.rot, rules: opts.rules, log: true });
  return g;
}
// pone il giocatore sulla cella e prepara il suo turno
function place(g, pid, q, r) { const ci = AE.cellIndex(q, r); g.pl(pid).at = g.s.cells[ci].tile; return ci; }
function prep(g, pid) { g.pl(pid).turn = { atk: {}, slowed: false, moved: false, fabbro: 0, extra: false, moveOnly: false }; }
// forza i prossimi tiri di dado
function dice(g, seq) { const q = seq.slice(); g.d6 = () => (q.length ? q.shift() : 1 + (g.randInt(6))); }
module.exports = { AE, drive, layout, mk, place, prep, dice, at };
