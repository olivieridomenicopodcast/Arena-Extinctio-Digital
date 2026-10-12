/* ARENA EXTINCTIO — intelligenza artificiale.
   Tre livelli:
   - easy   : euristiche semplici con molte scelte a caso, non pianifica
   - medium : valuta ogni mossa con un punteggio (valore di tessere, attacchi, crafting, mercato), un po' di rumore
   - hard   : come medium + guarda avanti col motore stesso (simula le mosse migliori su cloni "determinizzati": mani e mazzi
              avversari ricampionati, dadi non noti) e pesa meglio rischio, economia e posizione
   Informazione nascosta: l'AI NON legge Skill, progetti, Medikit e Cibo in mano agli avversari, né l'ordine dei mazzi, né i dadi futuri.
   Un test controlla che la decisione non cambi se si rimescola ciò che non può sapere. */
(function (root) {
  'use strict';
  const AE = root.AE;
  const AI = (AE.AI = {});
  const NB = AE.NB;
  const dq = (g, ci, q) => { const c = g.cellOfPlayer(q.id); return c < 0 || ci < 0 ? 99 : AE.cellDist(ci, c); };

  AI.PARAMS = {
    easy: { random: 0.55, noise: 2.5, samples: 0, plan: 0, thr: 0.8, aggr: 0.7, shelter: 0.3, hunt: 0 },
    medium: { random: 0.08, noise: 0.9, samples: 0, plan: 1, thr: 0.1, aggr: 1.0, shelter: 0.8, hunt: 0.5 },
    hard: { random: 0, noise: 0.15, samples: 3, plan: 2, thr: 0.05, aggr: 1.1, shelter: 1.0, hunt: 1.0 },
    // profili "estremi" per le prove: strategie sbagliate di proposito, devono perdere
    pacifist: { random: 0.05, noise: 0.5, samples: 0, plan: 1, thr: 0.3, aggr: 1.0, shelter: 0.8, noAttack: true },
    camper: { random: 0.05, noise: 0.5, samples: 0, plan: 1, thr: 0.3, aggr: 0.6, shelter: 0.8, camp: true },
    rusher: { random: 0, noise: 0.5, samples: 0, plan: 1, thr: -9, aggr: 3.0, shelter: 0, rush: true },
    random: { random: 1, noise: 5, samples: 0, plan: 0, thr: 0.8, aggr: 1.0, shelter: 0 },
  };

  // probabilità che la somma dell'attaccante sia ≥ a quella del difensore (pareggio all'attaccante) con i vari modi di tiro
  const SUMDIST = (() => {
    const norm = [0]; for (let i = 0; i <= 12; i++) norm.push(0);
    const dist = (mode) => { const d = Array(13).fill(0); const n = mode === 'n' ? 2 : 3; const tot = Math.pow(6, n); const rec = (arr) => { if (arr.length === n) { let u = arr.slice(); if (mode === 'a') u.sort((a, b) => b - a); else if (mode === 'd') u.sort((a, b) => a - b); d[u[0] + u[1]] += 1 / tot; return; } for (let k = 1; k <= 6; k++) rec(arr.concat(k)); }; rec([]); return d; };
    const D = { n: dist('n'), a: dist('a'), d: dist('d') };
    const P = {};
    for (const x of ['n', 'a', 'd']) for (const y of ['n', 'a', 'd']) { let p = 0; for (let i = 2; i <= 12; i++) for (let j = 2; j <= 12; j++) if (i >= j) p += D[x][i] * D[y][j]; P[x + y] = p; }
    return P;
  })();
  AI.pWin = (advA, disA, advD, disD) => { const a = advA && !disA ? 'a' : disA && !advA ? 'd' : 'n'; const d = advD && !disD ? 'a' : disD && !advD ? 'd' : 'n'; return SUMDIST[a + d]; };

  // ───────────── valutazioni ─────────────
  const wv = (id, mod) => {   // valore di un'arma (danno atteso pesato su munizioni, gittata)
    const w = AE.WEAPONS[id]; if (!w) return 0;
    const dan = w.dan + (mod === 'dan' ? 1 : 0), git = w.git + (mod === 'git' ? 1 : 0), mun = w.mun + (mod === 'mun' ? 1 : 0);
    const costPen = w.tier === 'adv' ? 0.6 : w.tier === 'std' ? 0.3 : 0;
    return dan * (0.55 + 0.17 * Math.min(mun, 3)) + 0.35 * Math.min(git, 5) - costPen + (w.pierce ? 1 : 0);
  };
  AI.weaponValue = wv;
  const armorV = (a) => (a ? AE.ARMORS[a.id].dif * a.dur * 0.9 : 0);
  const cardValue = (id) => {
    const [k, x] = id.split(':');
    if (k === 'w') return wv(x) * 0.8;
    if (k === 'ar') return AE.ARMORS[x].dif * AE.ARMORS[x].dur * 0.9;
    if (k === 'mod') return 1.4;
    if (k === 'mat') return x === 'medikit' ? 2.2 : x === 'food' ? 1.2 : 1.1;
    if (k === 'sk') return ({ colpo: 2.4, scudo: 1.8, mira: 1.2, teletrasporto: 2, ladro: 1.6, fabbro: 1.4, trappola: 1.1, torretta: 1.4, tempesta: 1.0, munizioni: 0.9, risucchio: 1.1, sindaco: 1.3, tempo: 1.0, repeat: 2.2 })[x] || 1;
    if (k === 'sp') return ({ vantaggio: 1.8, zaino: 1.5, sfera: 2.3 })[x] || 0;
    return 0.5;
  };
  AI.cardValue = cardValue;

  // quanto vale una tessera per `pid` (cosa si può ottenere fermandocisi), solo informazioni pubbliche
  AI.tileValue = function (g, pid, tid) {
    const t = AE.tile(tid), p = g.pl(pid), s = g.s, R = g.rules;
    let v = 0;
    switch (t.type) {
      case 'carte': v = 2.2 + (p.skills.length >= R.inv.skill ? -0.6 : 0.4) + (p.projects.length >= g.capProj(pid) ? -0.5 : 0.3); break;
      case 'equip': {
        const noW = !p.weapons.primary && !p.weapons.secondary;
        const lowAmmo = ['primary', 'secondary', 'melee'].some((sl) => p.weapons[sl] && p.weapons[sl].ammo < g.weaponStats(pid, sl).cap);
        v = (noW ? 3.5 : (t.weapon && !p.weapons.primary && t.weapon !== 'pistola' ? 2 : 0.6)) + (lowAmmo ? 1.8 : 0) + (t.heal ? Math.min(2, R.healthCap - p.hp) * 0.7 : 0);
        if (t.weapon === 'pistola' && !p.weapons.secondary) v += 1.4;
        if (t.weapon === 'mitra' && !p.weapons.primary) v += 1.6;
        break;
      }
      case 'ulti': v = t.owner === pid && s.crater[t.id] && !p.ultiHeld ? 3.2 : 0; break;
      case 'rifugio': v = (p.hp >= 8 ? 0.05 : p.hp >= 6 ? 0.6 : 2.2) * ((s.round - (s.lastDmgRound || 1)) > 20 ? 0.2 : 1); break;
      case 'luogo': v = (p.at === t.id ? 0 : 0.3) + (t.owner === pid ? 0.5 : 0.3); break;
      default: v = 0;
    }
    const tk = s.tokens.find((x) => x.tile === tid);
    if (tk && (!p.reentryMax || p.reentries < p.reentryMax)) v += 2.5;
    for (const l of s.loot) if (l.tile === tid) v += Math.min(4, l.items.reduce((a, it) => a + (it.startsWith('cube:') ? 0.4 : it.startsWith('eq:') ? 1.6 : cardValue(it) * 0.7), 0));
    return v;
  };

  // pericolo atteso (danni) se `pid` finisce su `ci`: avversari che potrebbero colpirlo al loro turno (arma visibile e munizioni)
  AI.threatAt = function (g, pid, ci) {
    const s = g.s; let th = 0;
    const tid = s.cells[ci].tile;
    if (AE.tile(tid).type === 'rifugio') return 0;
    for (const q of s.players) {
      if (q.id === pid || q.status !== 'alive' || !q.at) continue;
      const qc = g.cellOfPlayer(q.id); if (qc < 0) continue;
      const d = AE.cellDist(qc, ci);
      // l'avversario si muove (circa 7 passi con 2D6, 3.5 con 1D6) e poi spara
      const reach = g.mapDice() === 2 ? 7 : 3.5;
      let best = 0;
      for (const slot of ['primary', 'secondary', 'melee']) {
        const w = q.weapons[slot]; if (!w || w.ammo < 1) continue;
        const st = g.weaponStats(q.id, slot);
        const dmg = st.dan * (st.tier === 'adv' ? 0.9 : 1);
        // distanza minima che l'avversario deve coprire per trovarsi a gittata
        const need = Math.max(0, d - Math.min(st.git, 8));
        if (need <= reach) best = Math.max(best, dmg * (need <= reach - 2 ? 0.55 : 0.3));
      }
      if (q.weapons.primary == null && q.weapons.secondary == null && q.weapons.melee == null && d <= reach) best = Math.max(best, 0.3);
      if (q.ultiHeld && q.mana >= 3) best += 0.6;
      th += best;
    }
    // pazienza: se da tanto nessuno si fa male (stallo), il timore cala e si esce allo scoperto
    const idle = s.round - (s.lastDmgRound || 1);
    return th * (idle > 12 ? Math.max(0.1, 1 - (idle - 12) / 25) : 1);
  };
  // livello rimosso a breve?
  AI.levelRisk = function (g, ci) {
    const s = g.s; if (s.removedLevels >= 3) return 0;
    const lvl = AE.CELLS[ci].level, next = 5 - s.removedLevels;
    if (lvl < next) return 0;
    const left = s.nextRemoval - s.periodIdx;
    return left <= 1 ? 6 : left <= 2 ? 3 : left <= 4 ? 1 : 0.2;
  };

  // valutazione della posizione di `pid` (più alto = meglio). Solo informazioni visibili sugli avversari.
  AI.evalState = function (g, pid) {
    const p = g.pl(pid), s = g.s, R = g.rules;
    if (p.status === 'pending') return -6 + p.reentries * 0.3;
    if (p.status !== 'alive') return -40;
    let v = Math.min(p.hp, R.healthCap) * 1.35 + p.mana * 0.12 + p.coins * 0.32 + p.kills * 1.2;
    for (const sl of ['primary', 'secondary', 'melee']) { const w = p.weapons[sl]; if (w) v += wv(w.id, w.mod) * 0.9 * (w.ammo > 0 ? 1 : 0.3) + Math.min(w.ammo, 3) * 0.2; }
    v += armorV(p.armor);
    for (const r of AE.RES_KEYS) v += p.cubes[r] * (r === 'M' ? 0.55 : 0.4);
    for (const id of p.heal) v += cardValue(id) * 0.8;
    for (const id of p.skills) v += cardValue(id) * 0.7;
    for (const id of p.specials) v += cardValue(id) * 0.7;
    for (const id of p.projects) v += cardValue(id) * 0.5;
    if (p.ultiHeld) v += 2.2;
    v += p.reentries * 1.2;
    if (p.temp.shield) v += p.temp.shield * 0.5;
    const ci = g.cellOfPlayer(pid);
    if (ci >= 0) v -= AI.threatAt(g, pid, ci) * 1.1 + AI.levelRisk(g, ci);
    // avversari: meno sono forti, meglio è
    for (const q of s.players) {
      if (q.id === pid || q.status === 'out' || q.status === 'ghost') continue;
      if (q.status === 'pending') { v += 1.2; continue; }
      let ow = 0; for (const sl of ['primary', 'secondary', 'melee']) { const w = q.weapons[sl]; if (w) ow += wv(w.id, w.mod) * 0.3; }
      v -= q.hp * 0.55 + ow + armorV(q.armor) * 0.4 + q.reentries * 0.6;
    }
    return v;
  };

  // ───────────── informazione nascosta ─────────────
  // clone dal punto di vista di `pid`: mani avversarie, mazzi e dadi ricampionati
  AI.determinize = function (game, pid, rng) {
    const g = game.clone(), s = g.s;
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    // carte conosciute: le mie, gli scarti, il display, le armi/armature equipaggiate (visibili), il bottino
    const known = {};
    const add = (c) => { known[c] = (known[c] || 0) + 1; };
    const me = s.players[pid];
    for (const l of [me.heal, me.skills, me.specials, me.projects]) l.forEach(add);
    for (const d of ['mat', 'skill', 'proj', 'base']) s.discard[d].forEach(add);
    for (const d of ['mat', 'skill', 'proj']) if (s.display[d]) add(s.display[d]);
    for (const q of s.players) { for (const sl of ['primary', 'secondary', 'melee']) { const w = q.weapons[sl]; if (w) { add('w:' + w.id); if (w.mod) add('mod:' + w.mod); } } if (q.armor) add('ar:' + q.armor.id); }
    for (const l of s.loot) for (const it of l.items) { if (!it.startsWith('cube:')) add(it.startsWith('eq:') ? it.slice(3) : it); }
    const all = AE.buildDecks();
    const unknown = { mat: [], skill: [], proj: [], base: [] };
    for (const d in all) { const k2 = Object.assign({}, known); for (const c of all[d]) { if (k2[c] > 0) k2[c]--; else unknown[d].push(c); } }
    const pool = [].concat(unknown.mat, unknown.skill, unknown.proj);   // il mazzo base non si mescola con gli altri
    // mani avversarie nascoste
    const holders = [];
    for (const q of s.players) { if (q.id === pid) continue; const n = { heal: q.heal.length, skills: q.skills.length, specials: q.specials.length, projects: q.projects.length }; holders.push([q, n]); }
    for (const d of ['mat', 'skill', 'proj']) shuffle(unknown[d]);
    for (const [q, n] of holders) {
      q.heal = unknown.mat.filter((c) => c === 'mat:food' || c === 'mat:medikit').slice(0, n.heal); q.heal.forEach((c) => unknown.mat.splice(unknown.mat.indexOf(c), 1));
      q.skills = unknown.skill.filter((c) => c.startsWith('sk:')).slice(0, n.skills); q.skills.forEach((c) => unknown.skill.splice(unknown.skill.indexOf(c), 1));
      q.specials = unknown.skill.filter((c) => c === 'sp:vantaggio' || c === 'sp:zaino' || c === 'sp:sfera').slice(0, n.specials); q.specials.forEach((c) => unknown.skill.splice(unknown.skill.indexOf(c), 1));
      q.projects = unknown.proj.slice(0, n.projects); unknown.proj.splice(0, n.projects);
    }
    for (const d of ['mat', 'skill', 'proj']) s.decks[d] = shuffle(unknown[d].slice());
    s.decks.base = shuffle(unknown.base.slice());
    s.rng = Math.floor(rng() * 2147483647) | 0;     // i dadi veri non si conoscono
    return g;
  };

  // ───────────── controller ─────────────
  AI.create = function (level, seed, params) {
    const P = Object.assign({}, AI.PARAMS[level] || AI.PARAMS.medium, params || {});
    const rng = AE.makeRng(seed == null ? Math.random() : seed);
    const noise = () => (rng() - 0.5) * 2 * P.noise;
    const ai = { level, P, rng };

    // ── movimento ──
    function scoreMove(g, pid, o) {
      const p = g.pl(pid), s = g.s;
      const tid = s.cells[o.cell].tile;
      let v = AI.tileValue(g, pid, tid);
      if (P.camp && AE.tile(tid).type === 'rifugio') v += 6;
      if (P.rush) { let near = 99; for (const q of s.players) if (q.id !== pid && q.status === 'alive') near = Math.min(near, dq(g, o.cell, q)); v += (8 - near) * 0.8; }
      v -= AI.threatAt(g, pid, o.cell) * (P.rush ? 0 : level === 'easy' ? 0.3 : 1.2);
      v -= AI.levelRisk(g, o.cell) * (level === 'easy' ? 0.5 : 1);
      // hazard del percorso già evitati dal motore; ma una tessera segnalata ferma
      if (o.stop) v -= 1.2;
      // opportunità di attacco dopo la mossa
      const saved = p.at; p.at = tid;
      let opp = 0;
      for (const slot of ['primary', 'secondary', 'melee']) {
        const w = p.weapons[slot]; if (!w || w.ammo < 1) continue;
        const st = g.weaponStats(pid, slot);
        const ts = g.targetsFrom(pid, st.git).filter((t) => t.kind === 'player');
        for (const t of ts) { const q = g.pl(t.pid); const pw = AI.pWin(false, t.dist === 0 && st.git >= 1, t.dist === 0 && st.git >= 1, false); opp = Math.max(opp, st.dan * pw * (q.hp <= st.dan ? 1.8 : 1) * (t.dist === 0 && st.git >= 1 ? 0.7 : 1)); }
      }
      // pugno sullo stesso piano: solo se nient'altro
      if (!opp && p.mana >= 0 && g.punchAllowed()) { for (const q of s.players) if (q.id !== pid && q.status === 'alive' && q.at === tid && !g.inShelter(q.id)) opp = Math.max(opp, 0.4); }
      p.at = saved;
      v += opp * P.aggr * 0.9;
      if (P.hunt) {   // caccia: avvicinarsi ai bersagli esposti, soprattutto se feriti (se si ha un'arma)
        const armed = ['primary', 'secondary', 'melee'].some((sl) => p.weapons[sl] && p.weapons[sl].ammo > 0);
        for (const q of s.players) { if (q.id === pid || q.status !== 'alive' || g.inShelter(q.id)) continue; const dd = dq(g, o.cell, q); if (dd <= 7) v += P.hunt * ((8 - dd) / 8) * (q.hp <= 5 ? 1.4 : 1) * (armed ? 1 : g.punchAllowed() ? 0.3 : 0.05); }
      }
      // restare vicino al centro quando i livelli esterni stanno per sparire, avvicinarsi agli avversari quando si è forti
      const lvl = AE.CELLS[o.cell].level;
      v += (6 - lvl) * 0.05 * (6 - g.levelsLeft() * 0 );
      if (g.levelsLeft() <= 3) v += (3 - lvl) * 0.25;
      return v;
    }
    function decideMove(g, dec) {
      const pid = dec.pid;
      if (dec.ghost) {   // Fastidio: si avvicina al giocatore più forte
        const targets = g.s.players.filter((q) => q.status === 'alive' && q.at).map((q) => g.cellOfPlayer(q.id));
        let best = 0, bs = 1e9;
        dec.options.forEach((o, i) => { const d = targets.reduce((a, c) => Math.min(a, AE.cellDist(o.cell, c)), 99) + rng() * 0.5; if (d < bs) { bs = d; best = i; } });
        return best;
      }
      let best = 0, bs = -1e9;
      dec.options.forEach((o, i) => { const sc = scoreMove(g, pid, o) + noise(); if (sc > bs) { bs = sc; best = i; } });
      if (rng() < P.random) return Math.floor(rng() * dec.options.length);
      return best;
    }

    // ── azioni ──
    function needScore(g, pid) {   // quanto manca ai progetti in mano per craftare
      const p = g.pl(pid); let best = 0;
      for (const id of p.projects) { if (id.startsWith('mod:')) continue; const c = g.craftCost(pid, id); let miss = 0; for (const r of AE.RES_KEYS) miss += Math.max(0, c[r] - p.cubes[r]); best = Math.max(best, miss === 0 ? 0 : 1 / miss); }
      return best;
    }
    function scoreAction(g, pid, o) {
      const p = g.pl(pid), s = g.s, R = g.rules;
      switch (o.kind) {
        case 'attack': {
          const st = g.weaponStats(pid, o.slot);
          const t = o.target;
          if (t.kind === 'trap') { const tr = s.traps.find((x) => x.id === t.id); if (!tr) return -9; return (tr.owner === pid ? -5 : (tr.hp <= st.dan ? 1.2 : 0.4)) - o.cost * 0.4; }
          const q = g.pl(t.pid);
          const same = t.dist === 0 && st.git >= 1;
          const light = o.slot !== 'fist' && st.light;
          const advA = o.vant || (p.char === 'lasep' && light) || (p.temp.ultiTurn && p.temp.ultiTurn.adv && o.slot !== 'melee' && o.slot !== 'fist');
          const disA = same || !!p.temp.svantaggio;
          const advD = (q.char === 'soshito' && light) || same;
          const disD = !!q.temp.svantaggio;
          const pw = p.temp.mira ? 1 : AI.pWin(advA, disA, advD, disD);
          let dmg = st.dan - (p.temp.mira || 0);
          const armorAbs = q.armor ? AE.ARMORS[q.armor.id].dif : 0; dmg = Math.max(0, dmg - (q.temp.shield ? Math.min(q.temp.shield, dmg) : 0) - armorAbs * 0.8);
          let gain = dmg * pw;
          if (st.dan >= q.hp && dmg >= q.hp) gain += pw * (5 + R.killCoins * 0.4);    // eliminazione
          // contraccolpo se perdi: più pesante quando i PV sono pochi; se può ucciderti è quasi un suicidio
          const failDmg = st.fal || 0, hpFactor = 1 + Math.max(0, 5 - p.hp) * 0.5;
          let loss = (1 - pw) * failDmg * 1.1 * hpFactor;
          if (failDmg >= p.hp) loss += (1 - pw) * 12;
          const cost = o.cost * 0.15 + (o.slot === 'fist' ? 0 : 0.2) + (o.vant ? 0.9 : 0);
          // se è una sfida contro un avversario forte è meglio scegliere il bersaglio più debole
          return (gain - loss) * P.aggr - cost + (q.hp <= 3 ? 0.5 : 0);
        }
        case 'craft': {
          const [k, x] = o.proj.split(':');
          if (k === 'mod') { const w = p.weapons[o.slot]; return wv(w.id, x) - wv(w.id, null) + 0.6 - 0.35; }
          if (k === 'w') { const w = AE.WEAPONS[x], cur = p.weapons[w.slot]; const nv = wv(x), ov = cur ? wv(cur.id, cur.mod) : 0; return nv - ov + (cur ? 0 : 1.2) - 0.3; }
          const cur = p.armor ? armorV(p.armor) : 0; return armorV({ id: x, dur: AE.ARMORS[x].dur }) - cur + 0.5 - 0.3;
        }
        case 'heal': { const n = AE.MATERIALS[o.card.slice(4)].heal; const miss = R.healthCap - p.hp; if (miss < Math.min(n, 2)) return -1; return Math.min(n, miss) * 0.9 - 0.4 + (p.hp <= 4 ? 1.5 : 0); }
        case 'sell': return -3;      // l'AI non rivende mai
        case 'buyhp': return (p.hp <= 5 ? 2.6 : p.hp <= 7 ? 1.2 : 0.2) - o.price * 0.2 - 0.3;
        case 'buyammo': { const w = p.weapons[o.slot]; const st = g.weaponStats(pid, o.slot); return (w.ammo === 0 ? 2.4 : w.ammo === 1 ? 0.9 : 0.1) * Math.min(1.5, wv(w.id, w.mod) / 3) - o.price * 0.15 - 0.2; }
        case 'buy': {
          const need = needScore(g, pid);
          let v = 0;
          if (o.deck === 'mat') v = 1.1 + need * 1.8 + (p.hp <= 6 ? 0.6 : 0);
          else if (o.deck === 'proj') v = (p.projects.length >= g.capProj(pid) * 3 ? -2 : 1.4) + (Object.values(p.weapons).some(Boolean) ? 0 : 0.6);
          else v = (p.skills.length >= R.inv.skill ? -1.5 : 1.1 + (p.skills.length === 0 ? 0.5 : 0.15));
          if (o.from === 'display') { const cv = cardValue(o.card); v = v * 0.5 + cv * 0.6 - ((o.card === 'sp:mina' || o.card === 'sp:svantaggio') ? 6 : 0); if (o.card === 'sp:mina' || o.card === 'sp:svantaggio') return -9; }
          return v - o.price * 0.35 - 0.3 + (p.coins - o.price >= 6 ? 0.4 : 0);
        }
        case 'ulti': return ultiScore(g, pid);
        case 'skill': return skillScore(g, pid, o);
        default: return -1;
      }
    }
    function ultiScore(g, pid) {
      const p = g.pl(pid), s = g.s;
      const en = s.players.filter((q) => q.id !== pid && q.status === 'alive');
      const me = g.cellOfPlayer(pid);
      const near = (r) => en.filter((q) => dq(g, me, q) <= r);
      switch (p.char) {
        case 'godnocy': { const n = near(g.rules.godNocyRange).filter((q) => !g.inShelter(q.id)); return n.reduce((a, q) => a + 2.4 + (q.hp <= 3 ? 3 : 0), 0) - 2.2; }
        case 'hatci': { const n = g.ultiTargets(pid); if (!n.length) return -9; const tg = n.reduce((a, q) => (q.hp < a.hp ? q : a)); return (g.isDay() ? 0.5 : 1) * 5 * (g.isDay() ? 0.58 : 1) + (tg.hp <= 5 ? 4 : 0) - 3; }
        case 'karou': { const w = p.weapons.primary || p.weapons.secondary; if (!w || w.ammo < 1) return -3; const far = en.filter((q) => { const d = dq(g, me, q); return d >= 3 && d <= 8 && !g.inShelter(q.id); }); return far.length ? 1.6 + far.length * 0.5 : -1; }
        case 'kone': return near(4).length ? (p.hp <= 6 ? 1.4 : 0.5) : -1;
        case 'lasep': { const day = g.isDay(); const n = en.filter((q) => !(day && g.inShelter(q.id))); const dmg = day ? 3 : 1; let v = n.reduce((a, q) => a + dmg + (q.hp <= dmg ? 3 : 0), 0) - 3.2; if (p.hp <= 3 && false) v -= 2; return v; }
        case 'ricca': { const miss = g.rules.healthCap - p.hp; const heal = g.isDay() ? Math.ceil(miss / 2) : miss; return heal * 1.0 - 2.6; }
        case 'sejhnam': { const n = near(1).filter((q) => !g.inShelter(q.id)); return n.length * 2.2 - 2.4; }
        case 'soshito': { const n = near(6).filter((q) => !g.inShelter(q.id)); return (g.isDay() ? n.length * 1.3 : n.length * 1.9) - 2.2; }
        default: return -1;
      }
    }
    function skillScore(g, pid, o) {
      const p = g.pl(pid), s = g.s, R = g.rules;
      const en = s.players.filter((q) => q.id !== pid && q.status === 'alive');
      const me = g.cellOfPlayer(pid);
      const near = (r) => en.filter((q) => dq(g, me, q) <= r && !g.inShelter(q.id));
      const cost = 0.45;
      const hasAttack = Object.values(p.weapons).some((w) => w && w.ammo > 0);
      switch (o.skill) {
        case 'teletrasporto': {
          let best = -9; for (const c of o.cells) { const tid = s.cells[c].tile; const sc = AI.tileValue(g, pid, tid) - AI.threatAt(g, pid, c) - AI.levelRisk(g, c); if (sc > best) best = sc; }
          const cur = AI.tileValue(g, pid, p.at) + 0.3 - AI.threatAt(g, pid, me) - AI.levelRisk(g, me);
          return best - cur - cost - 1.0;
        }
        case 'repeat': return p.mana >= 3 ? 1.3 : p.mana >= 2 ? 0.5 : -1;
        case 'tempo': { const risk = AI.levelRisk(g, me); if (o.dir > 0) return risk > 1 ? -2 : (g.isDay() ? -0.5 : 0.1) - cost; return risk > 1 ? 2 : (p.ultiHeld && !g.isDay() ? 1 : -0.5) - cost; }
        case 'scudo': return (near(7).length ? 1.2 : 0.2) - cost;
        case 'mira': return (hasAttack && near(5).length ? 0.3 : -2) - cost;
        case 'trappola': return (near(7).length ? 0.9 : 0.1) - cost;
        case 'torretta': return (near(7).length ? 1.3 : 0.2) - cost;
        case 'colpo': {
          let v = 0; const bypass = g.isDay();
          for (const q of en) { const d = dq(g, me, q); if (d <= 3 && !g.inShelter(q.id)) v += 2 * (bypass ? 1 : 0.7) + (q.hp <= 2 ? 3 : 0); }
          return v - 1.2 - cost;
        }
        case 'tempesta': { const sh = g.inShelter(pid); const exposed = en.filter((q) => !g.inShelter(q.id)).length; return (sh ? exposed * 1.8 : exposed * 1.2 - 3) - 0.8 - cost; }
        case 'munizioni': { let v = 0; for (const q of en) { const w = q.weapons.primary || q.weapons.secondary; if (w && w.ammo > 0) v += 0.8 + (w.ammo === 1 ? 0.8 : 0); } return v - cost - 0.3; }
        case 'sindaco': { const mine = s.players[pid]; const restore = o.restorable.includes(pid); return restore ? 3.4 - cost : (o.restorable.length ? 0.2 : -1) - cost; }
        case 'fabbro': return (p.projects.some((c) => { const cc = g.craftCost(pid, c); return !g.canPay(pid, cc); }) && p.projects.some((c) => { if (c.startsWith('mod:')) return false; const base = (c.startsWith('w:') ? AE.WEAPONS[c.slice(2)].cost : AE.ARMORS[c.slice(3)].cost); const need = ['V', 'U', 'M'].reduce((a, r) => a + Math.max(0, (base[r] | 0) - p.cubes[r]), 0); return need === 1; }) ? 2 : -1) - cost;
        case 'ladro': { return 1.2 + (needScore(g, pid) > 0 ? 0.8 : 0) - cost; }
        case 'risucchio': { let v = 0; for (const q of en) v += Math.min(q.mana, g.dn(2, 1)) * 0.45; return v - cost - 0.4; }
        default: return -1;
      }
    }

    function decideAction(g, dec) {
      const pid = dec.pid, p = g.pl(pid);
      const sc = dec.options.map((o, i) => (o.kind === 'end' ? P.thr : (P.noAttack && (o.kind === 'attack' || o.kind === 'ulti') ? -9 : scoreAction(g, pid, o) + noise())));
      let best = -1, bs = -1e9;
      sc.forEach((v, i) => { if (v > bs) { bs = v; best = i; } });
      if (dec.options[best].kind === 'end') return best;
      if (rng() < P.random) {   // distrazione: finisce il turno o sceglie a caso
        return rng() < 0.5 ? dec.options.length - 1 : Math.floor(rng() * dec.options.length);
      }
      // hard: verifica gli attacchi e i movimenti più promettenti simulando
      if (P.samples > 0 && dec.options[best].kind === 'attack') return refineByLookahead(g, pid, dec, sc);
      return best;
    }

    // guarda avanti: per i migliori candidati simula su cloni determinizzati e confronta lo stato valutato
    function simulateChoice(g0, pid, dec, idx) {
      const sub = AE.makeRng(Math.floor(rng() * 1e9));
      const g = AI.determinize(g0, pid, sub);
      const gen = g.doAction ? g.doAction(pid, dec.options[idx]) : null;
      let r = gen.next(), n = 0;
      while (!r.done && n++ < 40) { const d = r.value; r = gen.next(d.type === 'beat' ? undefined : quickChoice(g, d)); }
      return AI.evalState(g, pid);
    }
    function refineByLookahead(g, pid, dec, sc) {
      const idxs = sc.map((v, i) => [v, i]).filter(([v, i]) => dec.options[i].kind !== 'end').sort((a, b) => b[0] - a[0]).slice(0, 4).map((x) => x[1]);
      const base = (() => { let tot = 0; for (let k = 0; k < P.samples; k++) { const g2 = AI.determinize(g, pid, AE.makeRng(Math.floor(rng() * 1e9))); tot += AI.evalState(g2, pid); } return tot / P.samples; })();
      let best = idxs[0], bv = -1e9;
      for (const i of idxs) { let tot = 0; for (let k = 0; k < P.samples; k++) tot += simulateChoice(g, pid, dec, i); const v = tot / P.samples; if (v > bv) { bv = v; best = i; } }
      if (bv < base - 1.2) return dec.options.length - 1;    // nessun attacco migliora la posizione: meglio fermarsi
      return best;
    }
    // scelta rapida per le sotto-decisioni dentro le simulazioni
    function quickChoice(g, dec) { return ai.decideChoose(g, dec, true); }

    // ── altre scelte ──
    ai.decideChoose = function (g, dec, quick) {
      const pid = dec.pid, p = g.pl(pid), opts = dec.options;
      const rnd = () => Math.floor(rng() * opts.length);
      if (!quick && rng() < P.random * 0.5 && !['yesno'].includes(dec.what)) return rnd();
      const argmax = (f) => { let b = 0, bs = -1e9; opts.forEach((o, i) => { const v = f(o) + (quick ? 0 : noise() * 0.3); if (v > bs) { bs = v; b = i; } }); return b; };
      switch (dec.what) {
        case 'steal': {
          if (dec.victim != null && opts.some((o) => o.res)) return argmax((o) => (o.res ? (o.res === 'M' ? 1.2 : 1) + (needScore(g, pid) > 0 ? 0.5 : 0) : 0));
          const lt = g.s.loot.find((l) => l.tile === g.pl(pid).at && l.owner === dec.victim);
          const rest = lt ? lt.items.reduce((a, it) => a + (it.startsWith('cube:') ? 0.4 : it.startsWith('eq:') ? lootEq(g, pid, it) : cardValue(it)), 0) : 0;
          return argmax((o) => (o.sell ? o.coins * 0.32 - rest * 0.25 : o.item == null ? 0 : o.item.startsWith('cube:') ? 0.5 : o.item.startsWith('eq:') ? lootEq(g, pid, o.item) : cardValue(o.item)));
        }
        case 'overflow': return argmax((o) => { if (o.drop === dec.card) return -cardValue(dec.card); return -cardValue(o.drop) * 1.0 - 0.01; });
        case 'cards': {
          return argmax((o) => {
            if (o.mode === 'disp') return cardValue(o.card) * 0.9 - ((o.card === 'sp:mina' || o.card === 'sp:svantaggio') ? 8 : 0) + deckNeed(g, pid, o.deck);
            return 1.7 + 0.5;
          });
        }
        case 'equip': return argmax((o) => {
          const p = g.pl(pid);
          if (o.act === 'ammo') return o.n * (0.5 + wv(o.id.slice(2)) * 0.15);
          if (o.act === 'heal') return Math.min(2, g.rules.healthCap - p.hp) * (p.hp <= 5 ? 1.6 : 1) + 0.3;
          const cur = p.weapons[o.slot]; return wv(o.id.slice(2)) * 1.2 + 1 - (cur ? wv(cur.id) : 0);
        });
        case 'deck': return argmax((o) => deckNeed(g, pid, o.deck) + rng() * 0.2);
        case 'target': return argmax((o) => -g.pl(o.pid).hp + (g.pl(o.pid).armor ? -1 : 0));
        case 'respawn': return argmax((o) => { const ci = g.cellOfTile(o.tile); return AI.tileValue(g, pid, o.tile) - AI.threatAt(g, pid, ci) - AI.levelRisk(g, ci); });
        case 'cell': return decideCell(g, dec, argmax);
        case 'tile': return argmax((o) => { const ci = g.cellOfTile(o.tile); let v = 0; for (const q of g.s.players) if (q.id !== pid && q.status === 'alive') v -= dq(g, ci, q) * 0.2; return v + rng() * 0.3; });
        case 'swap1': case 'swap2': return argmax((o) => { const t = AE.tile(g.s.cells[o.cell].tile); const lvl = AE.CELLS[o.cell].level; if (dec.what === 'swap1') return ({ rifugio: 2, carte: 1.5, equip: 1.5, ulti: 1 })[t.type] * (6 - lvl) * 0.2 || 0; return (t.type === 'insorm' ? 2 : 0) + lvl * 0.2 + rng() * 0.3; });
        case 'sindaco': return argmax((o) => (o.mode === 'ulti' ? (o.pid === pid ? 5 : -1) : 0));
        case 'yesno': return decideYesNo(g, dec);
        default: return quick ? 0 : rnd();
      }
    };
    function lootEq(g, pid, it) { const id = it.slice(3); const [k, x] = id.split(':'); const p = g.pl(pid); if (k === 'w') { const w = AE.WEAPONS[x]; const cur = p.weapons[w.slot]; return Math.max(0, wv(x) - (cur ? wv(cur.id, cur.mod) : 0)) + 0.5; } return Math.max(0, armorV({ id: x, dur: AE.ARMORS[x].dur }) - armorV(p.armor)) + 0.2; }
    function deckNeed(g, pid, d) {
      const p = g.pl(pid), R = g.rules;
      if (d === 'mat') return 0.8 + needScore(g, pid) * 2 + (p.hp <= 6 ? 0.5 : 0);
      if (d === 'proj') return (p.projects.length >= g.capProj(pid) * 2 ? -1 : 1.2) + (Object.values(p.weapons).some(Boolean) ? 0 : 0.4);
      return p.skills.length >= R.inv.skill ? -0.8 : 1.0 + (p.skills.length === 0 ? 0.5 : 0.15);   // senza nessuna skill in mano il mazzo Skill vale di più
    }
    function decideCell(g, dec, argmax) {
      const pid = dec.pid, s = g.s, me = g.cellOfPlayer(pid);
      const sk = dec.skill;
      return argmax((o) => {
        if (o.cell < 0) return -0.2;
        const tid = s.cells[o.cell].tile;
        let v = 0;
        for (const q of s.players) {
          if (q.id === pid || q.status !== 'alive') continue;
          if (q.at === tid) v += 3 + (q.hp <= 2 ? 2 : 0);
        }
        if (dec.prompt && dec.prompt.indexOf('Teletrasporto') === 0) v = AI.tileValue(g, pid, tid) - AI.threatAt(g, pid, o.cell) - AI.levelRisk(g, o.cell);
        return v;
      });
    }
    function decideYesNo(g, dec) {
      const pid = dec.pid, p = g.pl(pid), opts = dec.options;
      const yes = opts.findIndex((o) => o.yes === true), no = opts.findIndex((o) => o.yes === false);
      if (yes >= 0) {
        if (/rientrare/.test(dec.prompt || '')) return yes;
        if (/Sostituire/.test(dec.prompt || '')) return yes;      // le armi base nuove si prendono solo se prima mancavano o sono migliori: vedi sotto
        if (dec.from != null) return (dec.dmg || 0) >= 3 ? yes : no;
        return yes;
      }
      // Karou di notte: vantaggio
      const a = opts.findIndex((o) => o.adv === true); if (a >= 0) return a;
      return 0;
    }
    // Il giocatore decide se sostituire un'arma: solo se la nuova vale di più
    function decideReplace(g, dec) {
      const m = /Sostituire (.+) con (.+)\?/.exec(dec.prompt || ''); if (!m) return null;
      const find = (n) => Object.keys(AE.WEAPONS).find((k) => AE.WEAPONS[k].n === n);
      const a = find(m[1]), b = find(m[2]); if (!a || !b) return null;
      const yes = dec.options.findIndex((o) => o.yes === true), no = dec.options.findIndex((o) => o.yes === false);
      return wv(b) > wv(a) + 0.3 ? yes : no;
    }

    ai.decide = function (g, dec) {
      if (dec.type === 'choose' && dec.what === 'yesno') { const r = decideReplace(g, dec); if (r != null && r >= 0) return r; }
      if (dec.what === 'move') return decideMove(g, dec);
      if (dec.what === 'action') return decideAction(g, dec);
      return ai.decideChoose(g, dec, false);
    };
    return ai;
  };
})(typeof window !== 'undefined' ? window : globalThis);
