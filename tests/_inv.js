// Controlli di coerenza dello stato (usati dai test e dal fuzz).
const AE = require('./_load.js');
const TOTAL = (() => { const d = AE.buildDecks(); const all = {}; for (const k in d) for (const c of d[k]) all[c] = (all[c] || 0) + 1; return all; })();
function census(g) {
  const s = g.s, cnt = {};
  const add = (c) => { cnt[c] = (cnt[c] || 0) + 1; };
  for (const d of ['mat', 'skill', 'proj', 'base']) { s.decks[d].forEach(add); s.discard[d].forEach(add); }
  for (const d of ['mat', 'skill', 'proj']) if (s.display[d]) add(s.display[d]);
  for (const p of s.players) {
    [p.heal, p.skills, p.specials, p.projects].forEach((l) => l.forEach(add));
    for (const k of ['primary', 'secondary', 'melee']) { const w = p.weapons[k]; if (w) { add('w:' + w.id); if (w.mod) add('mod:' + w.mod); } }
    if (p.armor) add('ar:' + p.armor.id);
    for (const it of p.returned || []) { if (!it.startsWith('cube:')) add(it.startsWith('eq:') ? it.slice(3) : it); }
  }
  (s.limbo || []).forEach(add);
  for (const l of s.loot) for (const it of l.items) { if (it.startsWith('cube:')) continue; add(it.startsWith('eq:') ? it.slice(3) : it); }
  return cnt;
}
function check(g) {
  const s = g.s, errs = [];
  const cnt = census(g);
  for (const id in TOTAL) if ((cnt[id] || 0) !== TOTAL[id]) errs.push(`carta ${id}: ${cnt[id] || 0} invece di ${TOTAL[id]}`);
  for (const id in cnt) if (!(id in TOTAL)) errs.push('carta sconosciuta ' + id);
  const tiles = s.cells.map((c) => c.tile).filter(Boolean).concat(s.removedTiles);
  if (new Set(tiles).size !== 61 || tiles.length !== 61) errs.push('tessere non 61 uniche: ' + tiles.length);
  for (const p of s.players) {
    if (p.hp > g.rules.healthCap + 2) errs.push(`${p.name} hp ${p.hp}`);   // +2: God_Nocy può superare il massimo in modo temporaneo
    if (p.mana < 0 || p.mana > g.rules.manaSfera) errs.push(`${p.name} mana ${p.mana}`);
    if (p.coins < 0 || p.coins > g.rules.coinsMax) errs.push(`${p.name} monete ${p.coins}`);
    for (const k of AE.RES_KEYS) if (p.cubes[k] < 0 || p.cubes[k] > g.capCubes(p.id)) errs.push(`${p.name} cubetti ${k} ${p.cubes[k]}`);
    if (p.heal.length > g.rules.inv.heal) errs.push(`${p.name} troppi heal`);
    if (p.skills.length > g.rules.inv.skill) errs.push(`${p.name} troppe skill`);
    if (p.specials.length > g.rules.inv.special) errs.push(`${p.name} troppe speciali ${p.specials}`);
    for (const sl of ['primary', 'secondary', 'melee']) { const w = p.weapons[sl]; if (w) { if (AE.WEAPONS[w.id].slot !== sl) errs.push('arma nello slot sbagliato'); if (w.ammo < 0 || w.ammo > g.weaponStats(p.id, sl).cap + 1) errs.push(`${p.name} munizioni ${w.ammo}`); } }
    for (const sl of ['primary', 'secondary', 'melee', 'armor', 'mod']) if (g.projCount(p.id, sl) > g.capProj(p.id)) errs.push(`${p.name} troppi progetti ${sl}`);
    if (p.status === 'alive' || p.status === 'ghost') { if (g.cellOfTile(p.at) < 0) errs.push(`${p.name} su tessera inesistente ${p.at}`); }
    if (p.armor && (p.armor.dur <= 0)) errs.push('armatura a durata 0');
  }
  const alive = s.players.filter((p) => p.status === 'alive' && p.at);
  return errs;
}
module.exports = { check, census, TOTAL };
