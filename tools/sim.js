#!/usr/bin/env node
// Simulatore da riga di comando.
//   node tools/sim.js --games 200 --players 4 --a hard --b medium --out report.md
//   node tools/sim.js --games 100 --players 4 --a medium --experiment hp=8,10,12
//   node tools/sim.js --games 60 --players 3 --a hard --b easy --json out.json --csv out.csv
const AE = require('../tests/_load.js');
const fs = require('fs');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
if (arg('help', false)) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 6).join('\n')); process.exit(0); }
const games = Number(arg('games', 100)), n = Number(arg('players', 4)), seed0 = Number(arg('seed', 1));
const profiles = [{ label: arg('a', 'medium'), level: arg('a', 'medium') }];
if (arg('b', null)) profiles.push({ label: arg('b'), level: arg('b') });
if (arg('c', null)) profiles.push({ label: arg('c'), level: arg('c') });
const run = (rules, title) => { const t0 = Date.now(); const t = AE.Sim.tournament({ games, n, profiles, seed0, rules }); t.secs = (Date.now() - t0) / 1000; return t; };
const out = [];
const exp = arg('experiment', null);
const eff = arg('effects', null);
if (eff) {
  const G = Number(eff) || 60, level = arg('a', 'medium');
  const ids = [];
  for (const k in AE.SKILLS) ids.push('sk:' + k);
  for (const k of ['vantaggio', 'zaino', 'sfera']) ids.push('sp:' + k);
  for (const k in AE.WEAPONS) if (AE.WEAPONS[k].deck === 'proj') ids.push('eq:w:' + k);
  for (const k in AE.ARMORS) ids.push('eq:ar:' + k);
  for (const k of ['mat:medikit', 'mat:food']) ids.push(k);
  const rows = AE.Sim.forced({ ids, games: G, n, level, seed0 });
  out.push(`# Carte forzate (livello ${level}, ${n} giocatori, ${G} partite per carta)`, '', 'Il giocatore di prova parte con la carta (Skill in mano, armi/armature già equipaggiate). Atteso senza regali: ' + (100 / n).toFixed(1) + '%.', '', '| carta | vittorie | % | IC 95% | differenza dal riferimento |', '|---|---|---|---|---|');
  const base = rows[0].wins / rows[0].tot;
  for (const r of rows) { const [p, lo, hi] = AE.Sim.wilson(r.wins, r.tot); out.push(`| ${r.id.startsWith('(') ? r.id : AE.cardName(r.id.replace(/^eq:/, ''))} | ${r.wins}/${r.tot} | ${(100 * p).toFixed(1)}% | ${(100 * lo).toFixed(0)}–${(100 * hi).toFixed(0)}% | ${r === rows[0] ? '—' : ((100 * (p - base)) >= 0 ? '+' : '') + (100 * (p - base)).toFixed(1) + ' pt'} |`); }
} else
if (exp) {
  const [key, vals] = exp.split('='); const list = vals.split(',').map((v) => (isNaN(Number(v)) ? v : Number(v)));
  out.push(`# Esperimento: ${key} = ${list.join(' / ')}`, '', `${games} partite per valore, ${n} giocatori, profili: ${profiles.map((p) => p.label).join(' vs ')}`, '', '| valore | round medi (mediana) | primo posto % | ' + profiles.map((p) => p.label + ' %').join(' | ') + ' |', '|---|---|---|' + profiles.map(() => '---|').join(''));
  for (const v of list) {
    const t = run({ [key]: v }); const f = (x) => (100 * x).toFixed(1);
    out.push(`| ${v} | ${AE.Sim.mean(t.rounds).toFixed(1)} (${AE.Sim.quantile(t.rounds, 0.5)}) | ${f(t.seatWins[0] / t.games)} | ` + t.profiles.map((p) => f(p.wins / Math.max(1, p.games)) + ' [' + AE.Sim.wilson(p.wins, p.games).slice(1).map((x) => f(x)).join('–') + ']').join(' | ') + ' |');
  }
} else {
  const t = run(undefined); out.push(AE.Sim.report(t, `Simulazione ${profiles.map((p) => p.label).join(' vs ')}`), '', `_Tempo: ${t.secs.toFixed(1)} s_`);
  if (arg('json', null)) fs.writeFileSync(arg('json'), JSON.stringify(t, null, 1));
  if (arg('csv', null)) fs.writeFileSync(arg('csv'), 'posto,vittorie,partite\n' + t.seatWins.map((w, s) => `${s + 1},${w},${t.seatGames[s]}`).join('\n') + '\n');
}
const text = out.join('\n');
if (arg('out', null)) fs.writeFileSync(arg('out'), text + '\n'); else console.log(text);
