// Rete e salvataggio del tavolo: messaggi piccoli e JSON puro, ripresa da seed + risposte.
const test = require('node:test'), assert = require('node:assert');
const AE = require('./_load');
const fs = require('fs'), path = require('path'), vm = require('vm');
AE.UI = AE.UI || {};
const netPath = path.join(__dirname, '..', 'js', 'ui', 'net.js');
vm.runInThisContext(fs.readFileSync(netPath, 'utf8'), { filename: netPath });
const NC = AE.NetCore, net = AE.UI.net;

const mkPlayers = (n) => [...Array(n)].map((_, i) => ({ name: 'P' + (i + 1), kind: 'human' }));
// gioca `n` decisioni con le AI (tutti i posti rispondono come farebbe l'AI); ritorna il generatore fermo su una scelta
function playTo(game, ais, n) {
  const gen = game.run(); let r = gen.next(), k = 0;
  while (!r.done) {
    if (r.value.type === 'beat') { r = gen.next(); continue; }
    if (k >= n) return { gen, r };
    r = gen.next(ais[r.value.pid].decide(game, r.value)); k++;
  }
  return { gen, r };
}
const mkAis = (n, tag) => [...Array(n)].map((_, i) => AE.AI.create('medium', tag + i));

test('rete: un messaggio grande si spezza in parti piccole e si ricompone identico', () => {
  const big = { t: 'start', s: { x: 'a'.repeat(40000), y: [1, 2, 3] }, evs: [{ i: 1, text: 'è così' }] };
  const wire = NC.encode(big);
  assert.ok(wire.length > 3);
  for (const w of wire) assert.ok(JSON.stringify(w).length < NC.LIMIT, 'parte troppo grande');
  const asm = new NC.Assembler(); let out = null;
  for (const w of JSON.parse(JSON.stringify(wire))) { const r = asm.push(w); if (r) out = r; }
  assert.deepStrictEqual(out, big);
  assert.deepStrictEqual(NC.encode({ t: 'ping' }), [{ t: 'ping' }], 'i messaggi piccoli passano così come sono');
});

test('rete: a partita avanzata nessun messaggio sul filo supera ~12 KB (start, log, beat, decide) e restano JSON puro', () => {
  const players = mkPlayers(6), ais = mkAis(6, 'size');
  const g = new AE.Game({ seed: 'rete-size', players, beats: true });
  const { r } = playTo(g, ais, 250);
  assert.ok(g.events.length > 250 && !g.s.over, 'serve una partita avanzata (' + g.events.length + ' eventi)');
  const wire = [], mkConn = () => ({ send: (m) => wire.push(JSON.parse(JSON.stringify(m))) });
  const host = new net.Host(); host.started = true; host.meta = { seed: 'rete-size', players, rules: g.rules, code: 'ABCD' };
  host.snapshot = (full) => ({ s: g.s, evs: full ? [] : g.events.slice(-60) }); host.logSource = () => g.events.slice(-300);
  const guest = { name: 'Ospite', online: true, conn: mkConn(), seen: Date.now() };
  host.guests.push(guest); host.pidGuest[1] = guest;
  const d = r.value;
  host._sendStart(guest, 1);
  host.broadcast({ t: 'beat', ev: g.events[g.events.length - 1] });
  host.pending[1] = { id: 1, d, resolve() {} }; host._sendDecide(1);
  host.close();
  assert.ok(wire.length >= 4);
  for (const m of wire) { assert.ok(JSON.stringify(m).length < NC.LIMIT, 'messaggio troppo grande per PeerJS: ' + m.t + ' ' + JSON.stringify(m).length); assert.ok(NC.isPure(m), 'non JSON puro: ' + m.t); }
  // ricomposti, il guest ritrova stato, log e scelta
  const asm = new NC.Assembler(), full = [];
  for (const w of wire) { const m = asm.push(w); if (m) full.push(m); }
  const start = full.find((m) => m.t === 'start'), logs = full.filter((m) => m.t === 'log'), dec = full.find((m) => m.t === 'decide');
  assert.strictEqual(JSON.stringify(start.s), JSON.stringify(g.s));
  assert.strictEqual(logs.reduce((n, m) => n + m.evs.length, 0), Math.min(300, g.events.length));
  assert.ok(logs.every((m) => m.evs.length <= 25));
  assert.strictEqual(JSON.stringify(dec.d), JSON.stringify(d));
});

test('rete: salvataggio e ripresa — da seed e risposte si ritrova lo stesso stato e la stessa scelta pendente, e la partita finisce', () => {
  for (const [n, N] of [[3, 60], [4, 220], [6, 400]]) {
    const players = mkPlayers(n), ais = mkAis(n, 'sv' + n);
    const A = new AE.Game({ seed: 'rete-save-' + n, players, beats: true });
    const { r } = playTo(A, ais, N);
    assert.ok(!r.done, 'serve una partita a metà (' + n + ' giocatori)');
    const stateA = JSON.stringify(A.s), decA = JSON.stringify(r.value), hist = JSON.parse(JSON.stringify(A.history));   // come in localStorage
    // "il tavolo chiude l'app": si ricostruisce da seed + giocatori + risposte
    const B = new AE.Game({ seed: 'rete-save-' + n, players: JSON.parse(JSON.stringify(players)), beats: true, replay: hist });
    const gen = B.run(); let q = gen.next();
    while (!q.done && q.value.type === 'beat') q = gen.next();       // durante la ripresa i messaggi delle mosse già fatte non servono
    assert.ok(!q.done);
    assert.strictEqual(B.replay.length, 0, 'tutte le risposte sono state riusate');
    assert.strictEqual(JSON.stringify(B.s), stateA, 'stesso stato di prima (' + n + ' giocatori)');
    assert.strictEqual(JSON.stringify(q.value), decA, 'stessa scelta pendente');
    assert.strictEqual(B.events.length, A.events.length, 'stesso log');
    // e la partita riparte e finisce
    let k = 0;
    while (!q.done && k++ < 20000) q = q.value.type === 'beat' ? gen.next() : gen.next(ais[q.value.pid].decide(B, q.value));
    assert.ok(B.s.over, 'la partita ripresa finisce (' + n + ' giocatori)');
  }
});

test('rete: la ripresa con un nome non salvato viene rifiutata dal tavolo', () => {
  const host = new net.Host(); host.allowed = ['Erika'];
  const sent = []; let rejected = null; host.onRejected = (nm) => { rejected = nm; };
  const conn = { send: (m) => sent.push(m), on() {} };
  host._data(conn, { t: 'hello', name: 'Sconosciuto' });
  host._data(conn, { t: 'hello', name: 'Erika' });
  host.close();
  assert.strictEqual(rejected, 'Sconosciuto');
  assert.ok(sent.some((m) => m.t === 'reject' && /Erika/.test(m.why)));
  assert.strictEqual(host.guests.length, 1);
});

test('rete: il guest segnala la caduta una volta sola anche se arrivano più segnali', () => {
  const g = new net.Guest(); let n = 0; g.onLost = () => n++;
  g._lost(); g._lost(); g._lost();
  assert.strictEqual(n, 1);
});
