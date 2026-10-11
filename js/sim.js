/* ARENA EXTINCTIO — simulatore: partite AI contro AI in blocco, statistiche con intervalli di confidenza, esperimenti sulle regole. */
(function (root) {
  'use strict';
  const AE = root.AE;
  const Sim = (AE.Sim = {});

  // Wilson 95%
  Sim.wilson = (k, n) => {
    if (!n) return [0, 0, 0];
    const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
    return [p, (c - m) / d, (c + m) / d];
  };
  Sim.mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  Sim.quantile = (a, q) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

  // Gioca una partita completa. opts: { seed, players:[{level, char, name}], rules, stats:true, log:false, maxDecisions }
  Sim.playGame = function (opts) {
    const players = opts.players.map((p, i) => ({ name: p.name || `P${i + 1}`, kind: 'ai', level: p.level, char: p.char }));
    const g = new AE.Game({ seed: opts.seed, players, rules: opts.rules, give: opts.give, log: !!opts.log, stats: opts.stats !== false });
    const ais = players.map((p, i) => AE.AI.create(p.level || 'medium', `${opts.seed}:${i}`, opts.params && opts.params[i]));
    const gen = g.run();
    let r = gen.next(), n = 0;
    const lim = opts.maxDecisions || 60000;
    while (!r.done) {
      const d = r.value;
      if (d.type === 'beat') { r = gen.next(); continue; }
      if (++n > lim) { g._finish(null, 'troppe decisioni'); break; }
      r = gen.next(ais[d.pid].decide(g, d));
    }
    return g;
  };

  // tutte le disposizioni distinte dei profili sui posti (per un disegno bilanciato: ogni profilo prova ogni posto e ogni ordine di turno)
  Sim.arrangements = function (n, k) {
    const base = []; for (let s = 0; s < n; s++) base.push(s % k);
    const seen = new Set(), out = [];
    const rec = (arr, rest) => { if (!rest.length) { const key = arr.join(','); if (!seen.has(key)) { seen.add(key); out.push(arr.slice()); } return; } const used = new Set(); rest.forEach((v, i) => { if (used.has(v)) return; used.add(v); rec(arr.concat(v), rest.slice(0, i).concat(rest.slice(i + 1))); }); };
    if (n <= 5) rec([], base); 
    return out;
  };

  // Torneo: `games` partite con N giocatori; `profiles` = array di livelli/parametri, assegnati ai posti a rotazione.
  // opts: { games, n, profiles:[{label, level, params}], seed0, rules, onGame }
  Sim.tournament = function (opts) {
    const N = opts.n || 4, G = opts.games || 100, seed0 = opts.seed0 == null ? 1 : opts.seed0;
    const profs = opts.profiles || [{ label: 'media', level: 'medium' }];
    const out = { n: N, games: 0, profiles: profs.map((p) => ({ label: p.label || p.level, wins: 0, games: 0, kills: 0, damage: 0, hp: 0, rank: [] })), seatWins: Array(N).fill(0), seatGames: Array(N).fill(0), draws: 0, rounds: [], turns: [], why: {}, stats: {}, firstWins: 0, byChar: {}, durations: [] };
    const arr = Sim.arrangements(N, profs.length);
    const shuf = AE.makeRng('tour' + seed0);
    for (let i = 0; i < G; i++) {
      // disegno bilanciato: si scorrono tutte le disposizioni distinte (per 6 giocatori, disposizioni casuali)
      let assign;
      if (arr.length) assign = arr[(i + (opts.offset || 0)) % arr.length];
      else { assign = [...Array(N)].map((_, s) => s % profs.length); for (let a = N - 1; a > 0; a--) { const b = Math.floor(shuf() * (a + 1)); [assign[a], assign[b]] = [assign[b], assign[a]]; } }
      const players = assign.map((a, s) => ({ level: profs[a].level, char: undefined }));
      const g = Sim.playGame({ seed: seed0 + i, players, rules: opts.rules, params: assign.map((a) => profs[a].params), stats: true });
      const res = g.result || { winner: null, why: 'interrotta', rounds: g.s.round, turns: g.s.turnNo };
      out.games++;
      out.rounds.push(res.rounds); out.turns.push(res.turns);
      out.why[res.why] = (out.why[res.why] || 0) + 1;
      for (let s = 0; s < N; s++) { out.seatGames[s]++; out.profiles[assign[s]].games++; out.profiles[assign[s]].kills += (g.s.players[s].kills || 0); }
      if (res.winner != null) { out.seatWins[res.winner]++; out.profiles[assign[res.winner]].wins++; if (res.winner === g.s.start) out.firstWins++; const ch = g.s.players[res.winner].char; (out.byChar[ch] = out.byChar[ch] || { wins: 0, games: 0 }).wins++; }
      else out.draws++;
      for (const p of g.s.players) { (out.byChar[p.char] = out.byChar[p.char] || { wins: 0, games: 0 }).games++; }
      for (const p of g.stats.p) for (const k in p) out.stats[k] = (out.stats[k] || 0) + p[k];
      for (const k in g.stats.g) out.stats[k] = (out.stats[k] || 0) + g.stats.g[k];
      if (opts.onGame) opts.onGame(i, g);
    }
    return out;
  };

  // Analisi "carta forzata": il giocatore di prova parte con la carta in più; si misura quanto cambia la sua percentuale di vittoria
  // rispetto alla media (1/N), tutti gli altri senza regali. Il posto del giocatore di prova ruota. ids: ['sk:colpo', 'eq:w:tua', …]
  Sim.forced = function (opts) {
    const N = opts.n || 3, G = opts.games || 60, level = opts.level || 'medium', seed0 = opts.seed0 || 1;
    const run = (ids) => { let wins = 0, tot = 0; for (let i = 0; i < G; i++) { const seat = i % N; const g = Sim.playGame({ seed: seed0 + i, players: [...Array(N)].map(() => ({ level })), rules: opts.rules, give: ids && ids.length ? { [seat]: ids } : undefined, stats: false }); tot++; if (g.result && g.result.winner === seat) wins++; } return { wins, tot }; };
    const base = run(null), out = [{ id: '(nessuna: riferimento)', wins: base.wins, tot: base.tot }];
    for (const id of opts.ids) { const r = run([id]); out.push({ id, wins: r.wins, tot: r.tot }); if (opts.onStep) opts.onStep(id, r); }
    return out;
  };

  // Report in Markdown
  Sim.report = function (t, title) {
    const f = (x, d) => (100 * x).toFixed(d == null ? 1 : d) + '%';
    const L = [];
    L.push(`# ${title || 'Simulazione'}`, '', `${t.games} partite · ${t.n} giocatori · ${t.draws} senza vincitore`, '');
    L.push('## Vittorie per profilo', '', '| profilo | partite | vittorie | % | IC 95% |', '|---|---|---|---|---|');
    for (const p of t.profiles) { const [w, lo, hi] = Sim.wilson(p.wins, p.games); L.push(`| ${p.label} | ${p.games} | ${p.wins} | ${f(w)} | ${f(lo)} – ${f(hi)} |`); }
    L.push('', '## Vittorie per posto di turno', '', '| posto | % vittorie | IC 95% |', '|---|---|---|');
    t.seatWins.forEach((w, s) => { const [p, lo, hi] = Sim.wilson(w, t.seatGames[s]); L.push(`| ${s + 1}${s === 0 ? ' (inizia)' : ''} | ${f(p)} | ${f(lo)} – ${f(hi)} |`); });
    L.push('', `Atteso con posti equivalenti: ${f(1 / t.n)} per posto.`);
    const q = (a, x) => Sim.quantile(a, x);
    L.push('', '## Durata', '', `- Round: media ${Sim.mean(t.rounds).toFixed(1)} · mediana ${q(t.rounds, 0.5)} · 10° percentile ${q(t.rounds, 0.1)} · 90° percentile ${q(t.rounds, 0.9)} · max ${Math.max(...t.rounds)}`);
    L.push(`- Turni complessivi: media ${Sim.mean(t.turns).toFixed(0)}`);
    L.push('- Fine partita: ' + Object.entries(t.why).map(([k, v]) => `${k} ${v}`).join(', '));
    L.push('', '## Per personaggio (casuale)', '', '| personaggio | partite | vittorie % |', '|---|---|---|');
    for (const [ch, v] of Object.entries(t.byChar).sort((a, b) => b[1].wins / b[1].games - a[1].wins / a[1].games)) { const [p, lo, hi] = Sim.wilson(v.wins, v.games); L.push(`| ${AE.CHARS[AE.CHAR_IDX[ch]].n} | ${v.games} | ${f(p)} (${f(lo, 0)}–${f(hi, 0)}) |`); }
    L.push('', '## Eventi medi per partita', '');
    const per = (k) => ((t.stats[k] || 0) / t.games).toFixed(2);
    for (const k of Object.keys(t.stats).sort()) L.push(`- ${k}: ${per(k)}`);
    return L.join('\n');
  };
})(typeof window !== 'undefined' ? window : globalThis);
