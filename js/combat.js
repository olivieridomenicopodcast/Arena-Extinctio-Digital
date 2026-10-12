/* ARENA EXTINCTIO — motore (parte 2): armi, bersagli, attacchi, danni, eliminazioni, bottino, Ulti, Giocatore Fastidio. */
(function (root) {
  'use strict';
  const AE = root.AE;
  const G = AE.Game.prototype;
  const NB = AE.NB;

  // ───────────── armi ─────────────
  const FIST = { id: 'fist', n: 'Pugno', slot: 'fist', tier: 'base', git: 0, dan: 1, mun: 99, fal: 1, cost: {} };
  AE.FIST = FIST;
  // statistiche effettive dell'arma nello slot (con mod, passive e Ulti)
  G.weaponStats = function (pid, slot) {
    const p = this.pl(pid);
    if (slot === 'fist') { const st = Object.assign({ slot: 'fist', ammo: 99, cap: 99, name: 'Pugno', tier: 'base' }, FIST); st.dan = this.rules.punchDamage; st.fal = this.rules.punchFail; if (p.temp.ultiTurn && p.temp.ultiTurn.gitInf) st.git = 99; return st; }
    const w = p.weapons[slot]; if (!w) return null;
    const b = AE.WEAPONS[w.id];
    const light = b.tier === 'base' || b.tier === 'std';
    const st = { slot, id: w.id, name: b.n, tier: b.tier, kind: b.kind, ammo: w.ammo, mod: w.mod, pierce: !!b.pierce };
    st.git = b.git + (w.mod === 'git' ? 1 : 0) + (p.char === 'karou' && light && slot !== 'melee' ? 1 : 0);
    if (p.temp.ultiTurn && p.temp.ultiTurn.gitInf && slot !== 'melee') st.git = 99;
    st.dan = b.dan + (w.mod === 'dan' ? 1 : 0) + (p.char === 'hatci' && light ? 1 : 0);
    st.cap = b.mun + (w.mod === 'mun' ? 1 : 0) + (p.char === 'miaika' && light ? 1 : 0);
    st.fal = b.fal + (p.char === 'hatci' && slot === 'melee' ? 1 : 0);
    st.light = light;
    return st;
  };
  G.refillAmmo = function (pid, only) {      // `only` = slot dell'unica arma da ricaricare (omesso = tutte)
    const p = this.pl(pid); let n = 0;
    for (const slot of only ? [only] : ['primary', 'secondary', 'melee']) {
      const w = p.weapons[slot]; if (!w) continue;
      const cap = this.weaponStats(pid, slot).cap;
      if (w.ammo < cap) { n += cap - w.ammo; w.ammo = cap; }
    }
    return n;
  };
  G.attackCost = function (pid, st) {
    const p = this.pl(pid);
    const n = (p.turn.atk[st.slot] || 0) + 1;
    let c = AE.attackManaCost(st.slot === 'fist' ? 'base' : st.tier, st.slot === 'fist' ? 1 : n, this.rules);
    if (st.slot === 'fist') c = 0;
    const u = p.temp.ultiTurn;
    if (u && u.mana1 && st.slot !== 'melee' && st.slot !== 'fist') c = Math.max(0, c - 1);
    return c;
  };

  // ───────────── linea di tiro ─────────────
  // Bersagli raggiungibili da `ci` con gittata `git` (6 direzioni, i corpi e i muri bloccano).
  // ritorna [{kind:'player', pid, dist, dir}|{kind:'trap', id, dist}]; stessa tessera = dist 0
  G.targetsFrom = function (pid, git) {
    const s = this.s, out = [], ci = this.cellOfPlayer(pid);
    if (ci < 0) return out;
    const here = this.pl(pid);
    for (const q of s.players) {
      if (q.id === pid || q.status !== 'alive') continue;
      if (q.at === here.at) out.push({ kind: 'player', pid: q.id, dist: 0, dir: -1, cell: ci });
    }
    for (const t of s.traps) if (t.tile === here.at && t.owner !== pid) out.push({ kind: 'trap', id: t.id, dist: 0, dir: -1, cell: ci });
    if (git < 1) return out;
    for (let d = 0; d < 6; d++) {
      let cur = ci;
      for (let k = 1; k <= git; k++) {
        if (this.wallBetween(cur, d)) break;
        const nx = NB[cur][d];
        if (nx < 0 || !this.shootable(nx)) break;
        cur = nx;
        const tid = s.cells[cur].tile;
        let blocked = false;
        for (const q of s.players) {
          if (q.id === pid || q.status !== 'alive' || q.at !== tid) continue;
          out.push({ kind: 'player', pid: q.id, dist: k, dir: d, cell: cur }); blocked = true;
        }
        for (const t of s.traps) if (t.tile === tid && t.owner !== pid) { out.push({ kind: 'trap', id: t.id, dist: k, dir: d, cell: cur }); }
        if (blocked) break;     // un corpo ferma il colpo
      }
    }
    return out.filter((t) => t.kind === 'trap' || !this.inShelter(t.pid));
  };
  G.inShelter = function (pid) { const p = this.pl(pid); return !!p.at && AE.tile(p.at).type === 'rifugio'; };

  // opzioni di attacco disponibili ora
  G.attackOptions = function (pid) {
    const p = this.pl(pid), out = [];
    if (this.inShelter(pid) || p.turn.slowed || p.turn.moveOnly) return out;
    const slots = ['primary', 'secondary', 'melee', 'fist'];
    for (const slot of slots) {
      const st = this.weaponStats(pid, slot); if (!st) continue;
      if (st.ammo < 1) continue;
      if (slot === 'fist' && this.rules.punchMax > 0 && (p.turn.atk.fist || 0) >= this.rules.punchMax) continue;
      const cost = this.attackCost(pid, st);
      if (cost > p.mana) continue;
      for (const t of this.targetsFrom(pid, st.git)) {
        const tn = t.kind === 'trap' ? (this.s.traps.find((x) => x.id === t.id) || {}).kind === 'turret' ? 'la Torretta' : 'la Trappola' : this.pl(t.pid).name;
        const base = { kind: 'attack', slot, target: t, cost, weapon: st.name, label: `Attacca ${tn} con ${st.name}${t.dist === 0 ? ' (stessa tessera)' : ` (a ${t.dist})`} · ${cost} mana` };
        out.push(Object.assign({}, base, { vant: false }));
        if (p.specials.includes('sp:vantaggio')) out.push(Object.assign({}, base, { vant: true, label: base.label + ' + Vantaggio' }));
      }
    }
    return out;
  };

  // ───────────── dadi ─────────────
  G.rollChallenge = function (adv, dis) {
    if (adv && dis) { adv = false; dis = false; }
    const r = adv || dis ? [this.d6(), this.d6(), this.d6()] : [this.d6(), this.d6()];
    let used = r.slice();
    if (adv) used = r.slice().sort((a, b) => b - a).slice(0, 2);
    else if (dis) used = r.slice().sort((a, b) => a - b).slice(0, 2);
    return { dice: r, sum: used[0] + used[1], mode: adv ? 'vantaggio' : dis ? 'svantaggio' : 'normale' };
  };
  const dtxt = (r) => (r.dice.length === 3 ? `3D6 (${r.dice.join(',')}) migliori/peggiori → ${r.sum}` : `${r.dice.join('+')} = ${r.sum}`);

  // ───────────── attacco ─────────────
  G.consumeStatus = function (pid, key) { const p = this.pl(pid); const v = p.temp[key]; delete p.temp[key]; return v; };
  G.attack = function* (pid, opt) {
    const s = this.s, p = this.pl(pid);
    const st = this.weaponStats(pid, opt.slot);
    p.mana -= opt.cost;
    p.turn.atk[opt.slot] = (p.turn.atk[opt.slot] || 0) + 1;
    if (opt.slot !== 'fist') p.weapons[opt.slot].ammo--;
    this.stat('attacks', pid);
    const t = opt.target;
    const light = st.slot !== 'fist' && st.light;
    let b;
    if (t.kind === 'trap') {
      const tr = s.traps.find((x) => x.id === t.id); if (!tr) return;
      tr.hp -= st.dan;
      b = this.say('attack', `💥 ${this.pn(pid)} colpisce ${tr.kind === 'trap' ? 'la Trappola' : 'la Torretta'} con ${st.name} (${st.dan} danni): ${Math.max(0, tr.hp)} PV rimasti.`, pid);
      if (b) yield b;
      if (tr.hp <= 0) { s.traps = s.traps.filter((x) => x !== tr); this.emit('trap', `${tr.kind === 'trap' ? 'La Trappola' : 'La Torretta'} è distrutta: i segnalini spariscono.`, pid); }
      return;
    }
    const q = this.pl(t.pid);
    const sameTile = t.dist === 0 && st.git >= 1;
    let adv = false, dis = false;
    if (opt.vant) { adv = true; p.specials.splice(p.specials.indexOf('sp:vantaggio'), 1); this.discardCard('skill', 'sp:vantaggio'); }
    if (p.char === 'lasep' && light) adv = true;
    if (p.temp.ultiTurn && p.temp.ultiTurn.adv && st.slot !== 'melee' && st.slot !== 'fist') adv = true;
    if (p.temp.svantaggio) { dis = true; delete p.temp.svantaggio; }
    if (sameTile) dis = true;
    let dadv = false, ddis = false;
    if (q.char === 'soshito' && light) dadv = true;
    if (sameTile) dadv = true;
    const mira = p.temp.mira; if (mira) delete p.temp.mira;
    let win, ra = null, rd = null;
    if (mira) { win = true; }
    else {
      if (q.temp.svantaggio) { ddis = true; delete q.temp.svantaggio; }
      ra = this.rollChallenge(adv, dis); rd = this.rollChallenge(dadv, ddis);
      win = ra.sum >= rd.sum;
    }
    const dist = t.dist === 0 ? 'stessa tessera' : `a ${t.dist} tessere`;
    if (mira) b = this.say('attack', `🎯 ${this.pn(pid)} attacca ${this.pn(q.id)} con ${st.name} (${dist}): Mira Perfetta, colpo infallibile.`, pid, { tgt: q.id, dist: t.dist, win: true, mira: true });
    else b = this.say('attack', `⚔ ${this.pn(pid)} attacca ${this.pn(q.id)} con ${st.name} (${dist}). Attaccante ${dtxt(ra)}${ra.mode !== 'normale' ? ' [' + ra.mode + ']' : ''} · difensore ${dtxt(rd)}${rd.mode !== 'normale' ? ' [' + rd.mode + ']' : ''}. ${win ? 'Colpito!' : 'Mancato.'}`, pid, { ra, rd, win, tgt: q.id, dist: t.dist });
    if (b) yield b;
    if (win) {
      let dmg = st.dan;
      if (mira) dmg = Math.max(0, dmg - mira);
      this.stat('hits', pid);
      yield* this.hit(pid, q.id, dmg, { st, ra, rd, mira });
      if (st.pierce && !s.over) yield* this.pierce(pid, t, st, ra, dmg);
    } else {
      this.stat('misses', pid);
      if (st.fal > 0 && p.status === 'alive') {
        this.emit('fail', `${this.pn(pid)} ha fallito e subisce ${st.fal} ${st.fal === 1 ? 'danno' : 'danni'}.`, pid);
        yield* this.damage(pid, st.fal, { src: null, bypass: true, reason: 'attacco fallito' });
      }
    }
  };
  // Shape Liar: secondo bersaglio sulla stessa linea con danno dimezzato (stesso tiro dell'attaccante, dadi separati del difensore)
  G.pierce = function* (pid, t, st, ra, dmg) {
    if (t.dir < 0) return;
    const s = this.s;
    let cur = t.cell;
    for (let k = t.dist + 1; k <= st.git; k++) {
      if (this.wallBetween(cur, t.dir)) return;
      const nx = NB[cur][t.dir]; if (nx < 0 || !this.shootable(nx)) return;
      cur = nx;
      const tid = s.cells[cur].tile;
      const q = s.players.find((x) => x.id !== pid && x.status === 'alive' && x.at === tid && !this.inShelter(x.id));
      if (!q) continue;
      const rd = this.rollChallenge(q.char === 'soshito' && st.light, false);
      const win = ra.sum >= rd.sum;
      const b = this.say('attack', `➡ Il colpo trapassa fino a ${this.pn(q.id)}: dadi ${dtxt(rd)} contro ${ra.sum}. ${win ? 'Colpito (danno dimezzato)!' : 'Mancato.'}`, pid);
      if (b) yield b;
      if (win) yield* this.hit(pid, q.id, Math.floor(dmg / 2), { st, ra, rd });
      return;
    }
  };
  // un colpo è andato a segno: difese reattive ('Nganga), poi danno
  G.hit = function* (pid, qid, dmg, info) {
    const q = this.pl(qid);
    if (q.char === 'nganga' && q.ultiHeld && q.mana >= this.rules.ultiMana && dmg >= 1 && q.status === 'alive') {
      const opt = yield* this.choose(qid, 'yesno', `Attivare la difesa reattiva (3 mana) contro ${dmg} danni?`, [{ label: 'Sì, difendi', yes: true }, { label: 'No', yes: false }], { force: true, dmg, from: pid });
      if (opt.yes) {
        q.mana -= this.rules.ultiMana; q.ultiHeld = false; q.ultiUsed = true;
        const ra = this.rollChallenge(false, false), rd = this.rollChallenge(false, false);
        const win = ra.sum >= rd.sum;
        const cap = this.dn(5, 3);
        let b = this.say('ulti', `🛡 ${this.pn(qid)} attiva la difesa reattiva: dadi ${ra.sum} contro ${rd.sum} → ${win ? 'riesce' : 'fallisce'}.`, qid);
        if (b) yield b;
        if (win) { dmg = Math.max(0, dmg - cap); this.emit('info', `Assorbe fino a ${cap} danni: ne restano ${dmg}.`, qid); }
        else if (this.isDay()) { yield* this.damage(pid, 2, { src: qid, bypass: false, reason: 'difesa reattiva' }); }
      }
    }
    const done = yield* this.damage(qid, dmg, { src: pid, bypass: false, hit: true, reason: 'attacco', st: info && info.st });
    if (q.char === 'kone' && done >= 4 && this.pl(pid).status === 'alive') {
      this.emit('info', `🔁 ${this.pn(qid)} riflette 1 danno su ${this.pn(pid)}.`, qid);
      yield* this.damage(pid, 1, { src: qid, bypass: true, reason: 'riflesso' });
    }
  };

  // ───────────── danni ─────────────
  // opts: { src, bypass (salta scudo e armatura), hit (colpo di un attacco: l'armatura si consuma), reason, area, ignoreShelter }
  // ritorna i danni effettivamente subiti (PV persi)
  G.damage = function* (pid, amt, opts) {
    opts = opts || {};
    const s = this.s, p = this.pl(pid);
    if (p.status !== 'alive' || amt <= 0) return 0;
    if (this.inShelter(pid) && opts.src != null && opts.src !== pid && !opts.ignoreShelter) { this.emit('info', `🏠 ${this.pn(pid)} è al riparo in un rifugio: nessun danno.`, pid); return 0; }
    let rem = amt, note = [];
    if (!opts.bypass) {
      if (p.temp.shield && rem > 0) {
        const ab = Math.min(p.temp.shield, rem); rem -= ab; note.push(`Scudo Solare −${ab}`); delete p.temp.shield;
      }
      if (p.armor && (opts.hit || opts.area)) {
        const a = AE.ARMORS[p.armor.id]; const ab = Math.min(a.dif, rem); rem -= ab;
        p.armor.dur--; note.push(`armatura −${ab}`);
        if (p.armor.dur <= 0) { note.push('armatura esaurita'); this.discardCard('proj', 'ar:' + p.armor.id); p.armor = null; }
      }
    }
    p.hp -= rem;
    if (rem > 0) s.lastDmgRound = s.round;
    this.stat('damageTaken', pid, rem);
    if (opts.src != null && opts.src !== pid) this.stat('damageDealt', opts.src, rem);
    const b = this.say('damage', `💔 ${this.pn(pid)} subisce ${rem} ${rem === 1 ? 'danno' : 'danni'}${note.length ? ' (' + note.join(', ') + ')' : ''} → ${Math.max(0, p.hp)} PV.`, pid, { amt: rem, reason: opts.reason, src: opts.src });
    if (b) yield b;
    if (p.hp <= 0) yield* this.eliminate(pid, opts.src);
    return rem;
  };
  G.heal = function (pid, n, cap) {
    const p = this.pl(pid), max = cap == null ? this.rules.healthCap : cap;
    const before = p.hp; p.hp = Math.min(max, Math.max(p.hp, p.hp + n)); if (p.hp > max) p.hp = max;
    return p.hp - before;
  };

  // ───────────── eliminazione ─────────────
  G.gearItems = function (pid) {
    const p = this.pl(pid), items = [];
    for (const slot of ['primary', 'secondary', 'melee']) if (p.weapons[slot]) items.push('eq:w:' + p.weapons[slot].id);
    if (p.armor) items.push('eq:ar:' + p.armor.id);
    for (const k of AE.RES_KEYS) for (let i = 0; i < p.cubes[k]; i++) items.push('cube:' + k);
    return items.concat(p.heal, p.skills, p.specials, p.projects);
  };
  G.stripGear = function (pid) {
    const p = this.pl(pid);
    p.weapons = { primary: null, secondary: null, melee: null }; p.armor = null; p.cubes = { V: 0, U: 0, M: 0 };
    p.heal = []; p.skills = []; p.specials = []; p.projects = [];
  };
  G.eliminate = function* (pid, killer) {
    const s = this.s, p = this.pl(pid), R = this.rules;
    if (p.status !== 'alive') return;
    p.hp = 0;
    // Mia Ika: rientro immediato con tutto l'equipaggiamento
    if (p.char === 'miaika' && p.ultiHeld && p.mana >= R.ultiMana) {
      const opt = yield* this.choose(pid, 'yesno', 'Sei stata eliminata: usare l’Ulti per rientrare con tutto l’equipaggiamento?', [{ label: 'Sì, rientra', yes: true }, { label: 'No', yes: false }], { force: true });
      if (opt.yes) {
        p.mana -= R.ultiMana; p.ultiHeld = false; p.ultiUsed = true;
        if (p.reentries > 0) p.reentries--;
        p.at = null; p.status = 'pending';
        const b = yield* this.respawn(pid, { why: 'Ulti di Mia Ika', choose: !this.isDay() });
        if (b) yield b;
        this.stat('miaikaRevives', pid);
        return;
      }
    }
    const tile = p.at;
    this.stat('eliminated', pid);
    let b = this.say('kill', `☠ ${this.pn(pid)} è eliminato${killer != null && killer !== pid ? ' da ' + this.pn(killer) : ''}!`, pid, { killer });
    if (b) yield b;
    const items = this.gearItems(pid);
    for (const slot of ['primary', 'secondary', 'melee']) { const w = p.weapons[slot]; if (w && w.mod) this.discardCard('proj', 'mod:' + w.mod); }
    this.stripGear(pid);
    if (p.coins < R.killMinCoins) p.coins = R.killMinCoins;
    p.temp = {};
    if (tile && items.length) s.loot.push({ tile, owner: pid, items: items.slice() });
    if (p.reentries > 0) { p.reentries--; p.status = 'pending'; p.at = null; this.emit('info', `↩ ${this.pn(pid)} potrà rientrare (restano ${p.reentries} rientri).`, pid); }
    else { p.status = 'ghost'; this.emit('info', `👻 ${this.pn(pid)} diventa Giocatore Fastidio.`, pid); }
    if (killer != null && killer !== pid && this.pl(killer).status === 'alive') {
      const k = this.pl(killer);
      k.kills++; this.stat('kills', killer);
      this._addCoins(killer, R.killCoins);
      b = this.say('coins', `💰 ${this.pn(killer)} guadagna ${R.killCoins} monete.`, killer, { n: R.killCoins }); if (b) yield b;
      const lt = s.loot.find((l) => l.tile === tile && l.owner === pid);
      if (lt && lt.items.length) {
        const opt = yield* this.choose(killer, 'steal', `Prendi 1 carta dal bottino di ${p.name}`, lt.items.map((it) => ({ item: it, label: this.lootName(it) })).concat([{ item: null, label: 'Niente' }]), { force: true, victim: pid });
        if (opt.item) { lt.items.splice(lt.items.indexOf(opt.item), 1); yield* this.gainLoot(killer, opt.item); }
        if (!lt.items.length) s.loot = s.loot.filter((l) => l !== lt);
      }
    }
    if (this.checkOver()) return;
  };
  G.lootName = function (it) {
    if (it.startsWith('cube:')) return `Cubetto ${AE.RES[it.slice(5)].s}`;
    if (it.startsWith('eq:')) return AE.cardName(it.slice(3)) + ' (equipaggiata)';
    return AE.cardName(it);
  };

  // ───────────── Giocatore Fastidio ─────────────
  G.ghostTurn = function* (pid) {
    const s = this.s, p = this.pl(pid);
    if (this.cellOfPlayer(pid) < 0) { p.status = 'out'; return; }
    p.turn = { atk: {}, slowed: false, ghost: true };
    const d1 = this.d6(), d2 = this.d6();
    let b = this.say('ghost', `👻 Turno di ${this.pn(pid)} (Fastidio): dadi ${d1} e ${d2}.`, pid);
    if (b) yield b;
    const mo = this.movementOptions(pid, d1, { ghost: true });
    if (mo.ends.length) {
      const options = mo.ends.map((e) => ({ cell: e.cell, tile: s.cells[e.cell].tile, path: e.path, label: `${AE.tile(s.cells[e.cell].tile).name} (#${s.cells[e.cell].tile})` }));
      const opt = yield* this.choose(pid, 'move', `Fastidio: muoviti di ${mo.steps} tessere`, options, { roll: d1, steps: mo.steps, ghost: true });
      p.at = opt.tile;
      b = this.say('ghost', `👻 ${this.pn(pid)} si sposta su ${AE.tile(p.at).name} (#${p.at}).`, pid); if (b) yield b;
    }
    if (d2 <= 2) {
      for (const k of Object.keys(s.blocks)) if (s.blocks[k] === pid) delete s.blocks[k];
      s.blocks[p.at] = pid;
      b = this.say('ghost', `🚧 ${this.pn(pid)} blocca la tessera ${AE.tile(p.at).name} (#${p.at}): nessuno può attraversarla.`, pid); if (b) yield b;
    } else if (d2 <= 4) {
      const alive = []; for (let k = 1; k <= s.n; k++) { const q = s.players[(pid + k) % s.n]; if (q.status === 'alive') alive.push(q.id); }
      if (alive.length) {
        const roll = this.d6(), v = alive[(roll - 1) % alive.length];
        const q = this.pl(v), have = AE.RES_KEYS.filter((k) => q.cubes[k] > 0);
        b = this.say('ghost', `👻 ${this.pn(pid)} tira ${roll}: la vittima è ${this.pn(v)}.`, pid); if (b) yield b;
        if (have.length) { const k = this.pick(have); q.cubes[k]--; b = this.say('ghost', `👻 ${this.pn(pid)} ruba 1 cubetto di ${AE.RES[k].s} a ${this.pn(v)}.`, pid); if (b) yield b; }
        else { b = this.say('ghost', `${this.pn(v)} non ha risorse da rubare.`, pid); if (b) yield b; }
      }
    } else {
      const occ = new Set(s.players.filter((x) => x.status === 'alive' && x.at).map((x) => x.at));
      const free = []; s.cells.forEach((c, i) => { if (c.tile && !occ.has(c.tile)) free.push(i); });
      const o1 = yield* this.choose(pid, 'swap1', 'Scambia due tessere: scegli la prima', free.map((i) => ({ cell: i, label: `${AE.tile(s.cells[i].tile).name} (#${s.cells[i].tile})` })), { force: true });
      const o2 = yield* this.choose(pid, 'swap2', 'Scegli la seconda tessera', free.filter((i) => i !== o1.cell).map((i) => ({ cell: i, label: `${AE.tile(s.cells[i].tile).name} (#${s.cells[i].tile})` })), { force: true, first: o1.cell });
      if (o2) {
        const a = s.cells[o1.cell], c = s.cells[o2.cell];
        [a.tile, c.tile] = [c.tile, a.tile]; [a.rot, c.rot] = [c.rot, a.rot];
        b = this.say('ghost', `🔀 ${this.pn(pid)} scambia le tessere #${a.tile} e #${c.tile}.`, pid); if (b) yield b;
      }
    }
  };

  // ───────────── Ulti ─────────────
  // Missile di Hatci: va in linea retta nelle 6 direzioni senza limite di gittata, i muri NON lo fermano,
  // lo fermano le tessere Insormontabili e il primo corpo incontrato (come un proiettile); stessa tessera compresa.
  G.ultiTargets = function (pid) {
    const s = this.s, ci = this.cellOfPlayer(pid), out = [];
    if (ci < 0) return out;
    const here = this.pl(pid).at;
    for (const q of s.players) if (q.id !== pid && q.status === 'alive' && q.at === here && !this.inShelter(q.id)) out.push(q);
    for (let d = 0; d < 6; d++) {
      let cur = ci;
      for (;;) {
        const nx = NB[cur][d];
        if (nx < 0 || !this.shootable(nx)) break;
        cur = nx;
        const tid = s.cells[cur].tile;
        const hit = s.players.filter((q) => q.id !== pid && q.status === 'alive' && q.at === tid);
        if (hit.length) { hit.forEach((q) => { if (!this.inShelter(q.id) && !out.includes(q)) out.push(q); }); break; }
      }
    }
    return out;
  };
  G.canUlti = function (pid) {
    const p = this.pl(pid);
    if (!p.ultiHeld || p.mana < this.rules.ultiMana || p.turn.moveOnly) return false;
    switch (p.char) {
      case 'miaika': return false;       // si usa solo quando vieni eliminata
      case 'nganga': return false;                         // difesa reattiva
      case 'hatci': return this.ultiTargets(pid).length > 0;
      case 'ricca': return p.hp < this.rules.healthCap;
      case 'godnocy': return this.s.players.some((q) => q.id !== pid && q.status === 'alive' && AE.cellDist(this.cellOfPlayer(pid), this.cellOfPlayer(q.id)) <= this.rules.godNocyRange);
      default: return true;
    }
  };
  G.useUlti = function* (pid) {
    const s = this.s, p = this.pl(pid), R = this.rules;
    p.mana -= R.ultiMana;
    let b = this.say('ulti', `⚡ ${this.pn(pid)} usa l’ULTI (${this.charOf(pid).n}) ${this.isDay() ? '☀' : '🌙'}!`, pid);
    if (b) yield b;
    this.stat('ulti', pid);
    let spend = true;
    switch (p.char) {
      case 'godnocy': {
        const me = this.cellOfPlayer(pid);
        for (const q of s.players) {
          if (q.id === pid || q.status !== 'alive' || s.over) continue;
          const qc = this.cellOfPlayer(q.id);
          if (AE.cellDist(me, qc) > R.godNocyRange) continue;
          yield* this.damage(q.id, 2, { src: pid, bypass: true, reason: 'Onda' });
          if (q.status !== 'alive') continue;
          // spinta di 1 tessera nella direzione opposta
          let dir = this._dirAway(me, qc);
          const nx = NB[qc][dir];
          if (nx < 0 || !s.cells[nx].tile || AE.tile(s.cells[nx].tile).type === 'insorm' || this.wallBetween(qc, dir)) {
            this.emit('info', `${this.pn(q.id)} sbatte contro un ostacolo: 1 danno in più.`, q.id);
            yield* this.damage(q.id, 1, { src: pid, bypass: true, reason: 'Onda contro ostacolo' });
          } else { q.at = s.cells[nx].tile; this.emit('info', `${this.pn(q.id)} viene spinto su ${AE.tile(q.at).name} (#${q.at}).`, q.id); }
        }
        s.freeze = Math.max(s.freeze, 1);
        break;
      }
      case 'hatci': {
        const opts = this.ultiTargets(pid).map((q) => ({ pid: q.id, label: `${q.name} (${q.hp} PV)` }));
        const t = yield* this.choose(pid, 'target', 'Missile: scegli l’avversario', opts, { force: true });
        let hit = true;
        if (this.isDay()) {
          const ra = this.rollChallenge(false, false), rd = this.rollChallenge(false, false);
          hit = ra.sum >= rd.sum;
          b = this.say('ulti', `🎲 Missile di giorno: dadi ${ra.sum} contro ${rd.sum} → ${hit ? 'a segno!' : 'fuori bersaglio (l’Ulti non si perde).'}`, pid); if (b) yield b;
        }
        if (hit) yield* this.damage(t.pid, 5, { src: pid, bypass: false, reason: 'Missile', area: true });
        else spend = false;
        break;
      }
      case 'karou': {
        if (this.isDay()) p.temp.ultiTurn = { gitInf: true, adv: true, mana1: true };
        else {
          const c = yield* this.choose(pid, 'yesno', 'Di notte scegli: vantaggio oppure 1 mana in meno', [{ label: 'Vantaggio', adv: true }, { label: '1 mana in meno', adv: false }], { force: true });
          p.temp.ultiTurn = { gitInf: true, adv: c.adv, mana1: !c.adv };
        }
        break;
      }
      case 'kone': {
        const occ = new Set(s.players.filter((x) => x.at).map((x) => x.at));
        const tiles = s.cells.map((c) => c.tile).filter((t) => t && AE.tile(t).type !== 'insorm' && !occ.has(t));
        if (tiles.length < 2) { spend = false; break; }
        const sun = yield* this.choose(pid, 'tile', 'Evoca Sun su una tessera', tiles.map((t) => ({ tile: t, label: `${AE.tile(t).name} (#${t})` })), { force: true });
        const moon = yield* this.choose(pid, 'tile', 'Evoca Moon su un’altra tessera', tiles.filter((t) => t !== sun.tile).map((t) => ({ tile: t, label: `${AE.tile(t).name} (#${t})` })), { force: true });
        s.followers = { pid, sun: sun.tile, moon: moon.tile };
        break;
      }
      case 'lasep': {
        const day = this.isDay();
        for (const q of s.players) {
          if (q.id === pid || q.status !== 'alive' || s.over) continue;
          if (day && this.inShelter(q.id)) continue;
          yield* this.damage(q.id, day ? 3 : 1, { src: pid, bypass: false, area: true, ignoreShelter: !day, reason: 'Pioggia acida' });
        }
        break;
      }
      case 'ricca': {
        const miss = R.healthCap - p.hp;
        const n = this.isDay() ? Math.ceil(miss / 2) : miss;
        const got = this.heal(pid, n);
        b = this.say('heal', `💚 ${this.pn(pid)} recupera ${got} PV.`, pid, { n: got }); if (b) yield b;
        break;
      }
      case 'sejhnam': {
        const me = this.cellOfPlayer(pid);
        const tiles = [s.cells[me].tile].concat(this.adjacentCells(me).map((c) => s.cells[c].tile));
        s.cloud = { pid, tiles, until: s.periodIdx + (this.isDay() ? 2 : 1) };
        for (const q of s.players) {
          if (q.id === pid || q.status !== 'alive' || !tiles.includes(q.at) || s.over) continue;
          if (q.char === 'nganga') continue;
          yield* this.damage(q.id, 2, { src: pid, bypass: false, area: true, reason: 'Nuvola tossica' });
        }
        break;
      }
      case 'soshito': {
        for (const q of s.players) {
          if (q.id === pid || q.status !== 'alive') continue;
          if (this.isDay()) q.temp.moveOnly = true; else q.temp.skipTurn = true;
        }
        break;
      }
      default: break;
    }
    if (spend) { p.ultiHeld = false; p.ultiUsed = true; }
    else p.mana += 0;
  };
  G._dirAway = function (from, to) {
    const a = AE.CELLS[from], b = AE.CELLS[to];
    if (from === to) return this.randInt(6);
    // direzione che maximizza il prodotto scalare con il vettore da `from` a `to` (coordinate cartesiane dell'esagono)
    const px = (c) => [1.5 * c.q, Math.sqrt(3) * (c.r + c.q / 2)];
    const A = px(a), B = px(b), v = [B[0] - A[0], B[1] - A[1]];
    let best = 0, bs = -1e9;
    AE.DIRS.forEach((d, i) => { const dv = px({ q: d[0], r: d[1] }); const sc = dv[0] * v[0] + dv[1] * v[1]; if (sc > bs) { bs = sc; best = i; } });
    return best;
  };
})(typeof window !== 'undefined' ? window : globalThis);
