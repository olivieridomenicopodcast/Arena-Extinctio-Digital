/* ARENA EXTINCTIO — motore (parte 3): inventario, carte, crafting, mercato, Skill, bottino e menu delle azioni. */
(function (root) {
  'use strict';
  const AE = root.AE;
  const G = AE.Game.prototype;
  const NB = AE.NB;

  // ───────────── limiti dell'inventario ─────────────
  G.hasZaino = function (pid) { return this.pl(pid).specials.includes('sp:zaino'); };
  G.capCubes = function (pid) { return this.rules.cubeMax + (this.hasZaino(pid) ? 2 : 0); };
  G.capProj = function (pid) { return this.rules.inv.project + (this.hasZaino(pid) ? 1 : 0); };
  G.projCount = function (pid, slot) { return this.pl(pid).projects.filter((c) => AE.slotOfProject(c) === slot).length; };

  // elenco (e nome) della "lista" in cui va una carta e se c'è posto
  G._bucket = function (pid, id) {
    const p = this.pl(pid), [k, x] = id.split(':');
    if (k === 'mat') return { list: p.heal, cap: this.rules.inv.heal };
    if (k === 'sk') return { list: p.skills, cap: this.rules.inv.skill };
    if (k === 'sp') return { list: p.specials, cap: this.rules.inv.special };
    const slot = AE.slotOfProject(id);
    return { list: p.projects, cap: this.capProj(pid), slot };
  };
  G._countIn = function (pid, bk) { return bk.slot ? this.projCount(pid, bk.slot) : bk.list.length; };

  G._dropCard = function (pid, id) {
    const p = this.pl(pid);
    const lists = [p.heal, p.skills, p.specials, p.projects];
    for (const l of lists) { const i = l.indexOf(id); if (i >= 0) { l.splice(i, 1); break; } }
    this.discardCard(this.deckOfCard(id), id);
    const mx = this.maxMana(pid); if (p.mana > mx) p.mana = mx;
  };

  // La carta `id` è appena stata guadagnata da `pid`. Gestisce tutti i tipi, inclusi i malus e l'inventario pieno.
  G.gain = function* (pid, id, ctx) {
    const s = this.s, p = this.pl(pid), [k, x] = id.split(':');
    let b;
    if (k === 'mat' && (x === 'V' || x === 'U' || x === 'M')) {
      const room = Math.max(0, this.capCubes(pid) - p.cubes[x]);
      const n = Math.min(room, this.rules.cubesPerCard);
      p.cubes[x] += n;
      this.discardCard('mat', id);
      b = this.say('gain', `🧊 ${this.pn(pid)} pesca ${AE.cardName(id)}: prende ${n} cubetti di ${AE.RES[x].s} ${AE.RES[x].i}${n < this.rules.cubesPerCard ? ' (riserva piena: il resto va perso)' : ''}.`, pid, { card: id, n });
      if (b) yield b;
      return;
    }
    if (id === 'sp:mina') {
      this.discardCard('skill', id);
      b = this.say('mina', `💣 ${this.pn(pid)} pesca una Mina Esplosiva: 2 danni!`, pid, { card: id }); if (b) yield b;
      this.stat('mine', pid);
      yield* this.damage(pid, 2, { src: null, bypass: true, reason: 'mina' });
      return;
    }
    if (id === 'sp:svantaggio') {
      this.discardCard('skill', id);
      p.temp.svantaggio = true;
      b = this.say('malus', `🎲 ${this.pn(pid)} pesca Svantaggio: nel prossimo combattimento tirerà con svantaggio.`, pid, { card: id }); if (b) yield b;
      this.stat('svantaggio', pid);
      return;
    }
    const bk = this._bucket(pid, id);
    if (this._countIn(pid, bk) < bk.cap) {
      bk.list.push(id);
      b = this.say('gain', `🃏 ${this.pn(pid)} ottiene ${AE.cardName(id)}.`, pid, { card: id }); if (b) yield b;
      return;
    }
    // inventario pieno: scarta una carta (nuova o già posseduta) e prende 1 moneta
    const same = bk.list.filter((c) => (bk.slot ? AE.slotOfProject(c) === bk.slot : true));
    const opts = [{ drop: id, label: `Scarta ${AE.cardName(id)} (nuova)` }].concat(same.map((c) => ({ drop: c, label: `Scarta ${AE.cardName(c)} e tieni ${AE.cardName(id)}` })));
    s.limbo = [id];
    const o = yield* this.choose(pid, 'overflow', `Inventario pieno: cosa scarti?`, opts, { force: true, card: id });
    s.limbo = [];
    if (o.drop === id) { this.discardCard(this.deckOfCard(id), id); }
    else { this._dropCard(pid, o.drop); bk.list.push(id); }
    if (p.coins < this.rules.coinsMax) p.coins = Math.min(this.rules.coinsMax, p.coins + this.rules.discardCoin);
    b = this.say('gain', `${this.pn(pid)} scarta ${AE.cardName(o.drop)} per ${this.rules.discardCoin} moneta.`, pid); if (b) yield b;
  };
  G.gainLoot = function* (pid, it) {
    const p = this.pl(pid);
    if (it.startsWith('cube:')) {
      const x = it.slice(5);
      if (p.cubes[x] < this.capCubes(pid)) p.cubes[x]++;
      return;
    }
    if (it.startsWith('eq:')) {
      const id = it.slice(3), [k, x] = id.split(':');
      this.s.limbo = [id];
      try { yield* this._gainEq(pid, id, k, x); } finally { this.s.limbo = []; }
      return;
    }
    yield* this.gain(pid, it);
  };
  G._gainEq = function* (pid, id, k, x) {
    const p = this.pl(pid);
    {
      if (k === 'w') {
        const w = AE.WEAPONS[x];
        const cur = p.weapons[w.slot];
        if (cur) {
          const o = yield* this.choose(pid, 'yesno', `Sostituire ${AE.WEAPONS[cur.id].n} con ${w.n}?`, [{ label: 'Sì, sostituisci', yes: true }, { label: 'No, lascia', yes: false }], { force: true });
          if (!o.yes) { this.discardCard(this.deckOfCard('w:' + x), 'w:' + x); return; }
          this.discardWeapon(cur);
        }
        p.weapons[w.slot] = { id: x, ammo: 0, mod: null }; p.weapons[w.slot].ammo = this.weaponStats(pid, w.slot).cap;
      } else {
        const cur = p.armor;
        if (cur) {
          const o = yield* this.choose(pid, 'yesno', `Sostituire l’armatura con ${AE.ARMORS[x].n}?`, [{ label: 'Sì', yes: true }, { label: 'No', yes: false }], { force: true });
          if (!o.yes) { this.discardCard('proj', 'ar:' + x); return; }
          this.discardCard('proj', 'ar:' + cur.id);
        }
        p.armor = { id: x, dur: AE.ARMORS[x].dur };
      }
    }
  };

  // prende dal display (e lo rimpiazza)
  G.takeDisplay = function* (pid, deck) {
    const s = this.s, id = s.display[deck];
    if (!id) return null;
    s.display[deck] = this._refill(deck);
    yield* this.gain(pid, id);
    return id;
  };
  G.drawInto = function* (pid, deck) {
    const id = this.drawCard(deck);
    if (!id) return null;
    yield* this.gain(pid, id);
    return id;
  };

  G.discardWeapon = function (w) {
    this.discardCard(this.deckOfCard('w:' + w.id), 'w:' + w.id);
    if (w.mod) this.discardCard('proj', 'mod:' + w.mod);
  };

  // ───────────── tessere con effetto ─────────────
  G.activateEquip = function* (pid, t) {
    const s = this.s, p = this.pl(pid);
    let b;
    // Su una tessera Equipaggiamento si fa UNA sola cosa: prendere un'arma base, oppure ricaricare, oppure curarsi col medikit.
    const wanted = t.weapon === 'both' ? ['w:foolshift', 'w:xas'] : t.weapon === 'mitra' ? ['w:foolshift'] : t.weapon === 'pistola' ? ['w:xas'] : [];
    const opts = [];
    for (const id of wanted) {
      if (s.decks.base.indexOf(id) < 0) { this.emit('info', `L’arma base ${AE.cardName(id)} è finita.`, pid); continue; }
      const w = AE.WEAPONS[id.slice(2)], cur = p.weapons[w.slot];
      if (cur && cur.id === id.slice(2)) continue;
      opts.push({ act: 'weapon', id, slot: w.slot, label: `Prendere l’arma base ${w.n}${cur ? ` (al posto di ${AE.WEAPONS[cur.id].n})` : ''}` });
    }
    if (t.ammo) for (const sl of ['primary', 'secondary', 'melee']) {
      const w = p.weapons[sl]; if (!w) continue;
      const miss = this.weaponStats(pid, sl).cap - w.ammo;
      if (miss > 0) opts.push({ act: 'ammo', slot: sl, id: 'w:' + w.id, n: miss, label: `Ricaricare ${AE.WEAPONS[w.id].n} al massimo (+${miss})` });
    }
    if (t.heal && p.hp < this.rules.healthCap) opts.push({ act: 'heal', label: `Usare il medikit (+${Math.min(2, this.rules.healthCap - p.hp)} PV)` });
    if (!opts.length) return;
    const o = yield* this.choose(pid, 'equip', 'Tessera Equipaggiamento: puoi fare UNA sola cosa', opts, { force: true });
    if (o.act === 'weapon') {
      const w = AE.WEAPONS[o.id.slice(2)], cur = p.weapons[w.slot];
      if (cur) this.discardWeapon(cur);
      s.decks.base.splice(s.decks.base.indexOf(o.id), 1);
      p.weapons[w.slot] = { id: o.id.slice(2), ammo: 0, mod: null }; p.weapons[w.slot].ammo = this.weaponStats(pid, w.slot).cap;
      b = this.say('gain', `🔫 ${this.pn(pid)} prende l’arma base ${w.n}.`, pid); if (b) yield b;
    } else if (o.act === 'ammo') {
      const n = this.refillAmmo(pid, o.slot);
      if (n) { b = this.say('gain', `🔋 ${this.pn(pid)} ricarica ${AE.WEAPONS[p.weapons[o.slot].id].n}: +${n} munizioni.`, pid); if (b) yield b; }
    } else if (o.act === 'heal') {
      const n = this.heal(pid, 2);
      if (n) { b = this.say('heal', `💚 ${this.pn(pid)} recupera ${n} PV.`, pid, { n }); if (b) yield b; }
    }
  };
  G.activateCards = function* (pid) {
    const s = this.s;
    const decks = ['mat', 'skill', 'proj'];
    const names = { mat: 'Materiali', skill: 'Skill', proj: 'Armi e Progetti' };
    const opts = [{ mode: 'draw', label: 'Pescare 2 carte coperte (a scelta di mazzo)' }];
    for (const d of decks) if (s.display[d]) opts.push({ mode: 'disp', deck: d, label: `Prendere dal display: ${AE.cardName(s.display[d])}`, card: s.display[d] });
    const o = yield* this.choose(pid, 'cards', 'Tessera Carte: cosa prendi?', opts, { force: true });
    if (o.mode === 'disp') { const id = yield* this.takeDisplay(pid, o.deck); return; }
    for (let i = 0; i < 2; i++) {
      const d = yield* this.choose(pid, 'deck', `Pesca ${i + 1}/2: da quale mazzo?`, decks.filter((x) => s.decks[x].length || s.discard[x].length).map((x) => ({ deck: x, label: names[x] })), { force: true });
      if (d) yield* this.drawInto(pid, d.deck);
      if (s.over || this.pl(pid).status !== 'alive') return;
    }
  };
  // bottino sulla tessera: fino a 2 oggetti gratis a chi si ferma lì; se il proprietario è in attesa di rientrare si può anche
  // RIVENDERGLIELO: tutto il bottino per 5 monete, oppure presi i 2 oggetti il resto per 2 monete [interpretazione]
  G.lootPickup = function* (pid) {
    const s = this.s, p = this.pl(pid), R = this.rules;
    for (const lt of s.loot.filter((l) => l.tile === p.at)) {
      const owner = this.pl(lt.owner);
      const canSell = () => owner.status === 'pending' && lt.items.length > 0;
      let taken = 0;
      while (taken < 2 && lt.items.length) {
        const opts = lt.items.map((it) => ({ item: it, label: this.lootName(it) }));
        if (taken === 0 && canSell()) opts.push({ sell: 'all', coins: R.lootSellAll, label: `Rivendi tutto il bottino a ${owner.name} (+${R.lootSellAll} monete)` });
        if (taken > 0 && canSell()) opts.push({ sell: 'rest', coins: R.lootSellRest, label: `Rivendi il resto a ${owner.name} (+${R.lootSellRest} monete)` });
        opts.push({ item: null, label: 'Basta così' });
        const o = yield* this.choose(pid, 'steal', `Bottino di ${owner.name}: prendi un oggetto (${taken + 1}/2) o rivendilo`, opts, { force: true, victim: lt.owner });
        if (o.sell) { yield* this.sellLoot(pid, lt, o); break; }
        if (!o.item) break;
        lt.items.splice(lt.items.indexOf(o.item), 1); taken++;
        yield* this.gainLoot(pid, o.item);
      }
      if (taken === 2 && canSell()) {
        const o = yield* this.choose(pid, 'steal', `Rivendere il resto del bottino di ${owner.name}?`, [{ sell: 'rest', coins: R.lootSellRest, label: `Sì, +${R.lootSellRest} monete` }, { item: null, label: 'No, lascia lì' }], { force: true, victim: lt.owner });
        if (o.sell) yield* this.sellLoot(pid, lt, o);
      }
      if (!lt.items.length) s.loot = s.loot.filter((l) => l !== lt);
    }
  };
  G.sellLoot = function* (pid, lt, o) {
    const owner = this.pl(lt.owner);
    this._addCoins(pid, o.coins);
    owner.returned = (owner.returned || []).concat(lt.items); lt.items = [];
    this.stat('lootSold', pid);
    const b = this.say('coins', `💰 ${this.pn(pid)} rivende il bottino a ${this.pn(lt.owner)} per ${o.coins} monete: gli tornerà quando rientra.`, pid);
    if (b) yield b;
  };

  // ───────────── crafting ─────────────
  G.craftCost = function (pid, id) {
    const p = this.pl(pid), [k, x] = id.split(':');
    const base = k === 'w' ? AE.WEAPONS[x].cost : k === 'ar' ? AE.ARMORS[x].cost : {};
    const cost = { V: base.V | 0, U: base.U | 0, M: base.M | 0 };
    const discounts = [];
    if (p.char === 'sejhnam') discounts.push('VU');
    if (p.temp.fabbro) discounts.push(p.temp.fabbro);
    for (const allowed of discounts) {
      // sconta la risorsa che manca di più tra quelle consentite
      let best = null, bs = -1;
      for (const r of allowed) { if (cost[r] <= 0) continue; const miss = cost[r] - p.cubes[r]; const sc = miss * 10 + (r === 'M' ? 1 : 0); if (sc > bs) { bs = sc; best = r; } }
      if (best) cost[best]--;
    }
    return cost;
  };
  G.canPay = function (pid, cost) { const p = this.pl(pid); return AE.RES_KEYS.every((r) => p.cubes[r] >= cost[r]); };
  G.craftOptions = function (pid) {
    const p = this.pl(pid), out = [];
    if (p.mana < this.rules.craftMana) return out;
    for (const id of new Set(p.projects)) {
      const [k, x] = id.split(':');
      if (k === 'mod') {
        for (const slot of ['primary', 'secondary', 'melee']) {
          const w = p.weapons[slot];
          if (w && !w.mod) out.push({ kind: 'craft', proj: id, slot, cost: { V: 0, U: 0, M: 0 }, label: `Applica ${AE.cardName(id)} a ${AE.WEAPONS[w.id].n}` });
        }
        continue;
      }
      const cost = this.craftCost(pid, id);
      if (!this.canPay(pid, cost)) continue;
      const slot = AE.slotOfProject(id);
      out.push({ kind: 'craft', proj: id, slot, cost, label: `Crafta ${AE.cardName(id)}` });
    }
    return out;
  };
  G.doCraft = function* (pid, o) {
    const p = this.pl(pid);
    p.mana -= this.rules.craftMana;
    for (const r of AE.RES_KEYS) p.cubes[r] -= o.cost[r];
    p.projects.splice(p.projects.indexOf(o.proj), 1);   // la carta resta in gioco come equipaggiamento
    const [k, x] = o.proj.split(':');
    let b;
    const paid = AE.RES_KEYS.filter((r) => o.cost[r] > 0).map((r) => `${o.cost[r]} ${AE.RES[r].s}`).join(' + ');
    const pay = ` (spende ${paid || 'nessun cubetto'}${p.char === 'sejhnam' || p.temp.fabbro ? ', sconto incluso' : ''})`;
    if (k === 'w') {
      const old = p.weapons[o.slot];
      if (old) this.discardWeapon(old);
      p.weapons[o.slot] = { id: x, ammo: 0, mod: null }; p.weapons[o.slot].ammo = this.weaponStats(pid, o.slot).cap;
      b = this.say('craft', `⚒ ${this.pn(pid)} crafta ${AE.WEAPONS[x].n} (${AE.TIER_NAMES[AE.WEAPONS[x].tier]})${pay}${old ? ` e scarta ${AE.WEAPONS[old.id].n}` : ''}.`, pid);
    } else if (k === 'ar') {
      if (p.armor) this.discardCard('proj', 'ar:' + p.armor.id);
      p.armor = { id: x, dur: AE.ARMORS[x].dur };
      b = this.say('craft', `⚒ ${this.pn(pid)} crafta l’armatura ${AE.ARMORS[x].n}${pay}.`, pid);
    } else {
      p.weapons[o.slot].mod = x;
      p.weapons[o.slot].ammo += x === 'mun' ? 1 : 0;
      b = this.say('craft', `⚒ ${this.pn(pid)} monta ${AE.MODS[x].t} su ${AE.WEAPONS[p.weapons[o.slot].id].n}.`, pid);
    }
    this.stat('crafts', pid);
    if (p.temp.fabbro) p.temp.fabbro = 0;
    if (b) yield b;
  };

  // ───────────── mercato ─────────────
  G.buyOptions = function (pid) {
    const p = this.pl(pid), R = this.rules, s = this.s, out = [];
    const canBuy = p.mana >= R.buyMana;
    const names = { mat: 'Materiali', skill: 'Skill', proj: 'Armi e Progetti' };
    for (const d of canBuy ? ['mat', 'skill', 'proj'] : []) {
      const [pd, pi] = R.price[d];
      if (p.coins >= pd && (s.decks[d].length || s.discard[d].length)) out.push({ kind: 'buy', deck: d, from: 'deck', price: pd, label: `Compra dal mazzo ${names[d]} (${pd} 🪙)` });
      if (s.display[d] && p.coins >= pi) out.push({ kind: 'buy', deck: d, from: 'display', price: pi, card: s.display[d], label: `Compra dal display: ${AE.cardName(s.display[d])} (${pi} 🪙)` });
    }
    if (canBuy && p.hp < R.healthCap && p.coins >= R.hpPrice) out.push({ kind: 'buyhp', price: R.hpPrice, label: `Compra 1 PV (${R.hpPrice} 🪙)` });
    if (canBuy && p.coins >= R.ammoPrice) for (const slot of ['primary', 'secondary', 'melee']) {
      const w = p.weapons[slot]; if (!w) continue;
      if (w.ammo < this.weaponStats(pid, slot).cap) out.push({ kind: 'buyammo', slot, price: R.ammoPrice, label: `Compra 1 munizione per ${AE.WEAPONS[w.id].n} (${R.ammoPrice} 🪙)` });
    }
    // vendita: i materiali (cubetti) e le carte da craftare (progetti) si rivendono al mercato a 1 moneta l'uno, senza mana [interpretazione sul mana]
    if (p.coins < R.coinsMax) {
      for (const x of AE.RES_KEYS) if (p.cubes[x] > 0) out.push({ kind: 'sell', what: 'cube', res: x, price: R.sellPrice, label: `Vendi 1 cubetto di ${AE.RES[x].s} (+${R.sellPrice} 🪙)` });
      for (const c of new Set(p.projects)) out.push({ kind: 'sell', what: 'proj', card: c, price: R.sellPrice, label: `Vendi ${AE.cardName(c)} (+${R.sellPrice} 🪙)` });
    }
    return out;
  };
  G.doSell = function* (pid, o) {
    const p = this.pl(pid), R = this.rules;
    if (o.what === 'cube') p.cubes[o.res]--; else this._dropCard(pid, o.card);
    p.coins = Math.min(R.coinsMax, p.coins + o.price);
    this.stat('sells', pid);
    const b = this.say('buy', `💰 ${this.pn(pid)} vende ${o.what === 'cube' ? `1 cubetto di ${AE.RES[o.res].s}` : AE.cardName(o.card)} per ${o.price} moneta (${p.coins} 🪙).`, pid);
    if (b) yield b;
  };
  G.doBuy = function* (pid, o) {
    const p = this.pl(pid), R = this.rules;
    p.mana -= R.buyMana; p.coins -= o.price;
    this.stat('buys', pid);
    let b;
    if (o.kind === 'buy') {
      b = this.say('buy', `🛒 ${this.pn(pid)} compra ${o.from === 'display' ? AE.cardName(o.card) : 'una carta coperta'} per ${o.price} monete.`, pid); if (b) yield b;
      if (o.from === 'display') yield* this.takeDisplay(pid, o.deck); else yield* this.drawInto(pid, o.deck);
    } else if (o.kind === 'buyhp') {
      this.heal(pid, 1); b = this.say('buy', `🛒 ${this.pn(pid)} compra 1 PV (${p.hp} PV).`, pid); if (b) yield b;
    } else {
      p.weapons[o.slot].ammo++; b = this.say('buy', `🛒 ${this.pn(pid)} compra 1 munizione per ${AE.WEAPONS[p.weapons[o.slot].id].n}.`, pid); if (b) yield b;
    }
  };

  // ───────────── uso di carte ─────────────
  G.useOptions = function (pid) {
    const p = this.pl(pid), R = this.rules, out = [];
    if (p.mana >= R.healMana && p.hp < R.healthCap) for (const id of new Set(p.heal)) out.push({ kind: 'heal', card: id, label: `Usa ${AE.cardName(id)} (+${AE.MATERIALS[id.slice(4)].heal} PV)` });
    return out;
  };
  G.doHeal = function* (pid, o) {
    const p = this.pl(pid), R = this.rules;
    p.mana -= R.healMana;
    p.heal.splice(p.heal.indexOf(o.card), 1); this.discardCard('mat', o.card);
    let n = AE.MATERIALS[o.card.slice(4)].heal;
    if (p.char === 'ricca' && o.card === 'mat:medikit') { n += Math.min(1, Math.max(0, R.healthCap - p.hp - n)); }
    const got = this.heal(pid, n);
    const b = this.say('heal', `💚 ${this.pn(pid)} usa ${AE.cardName(o.card)} e recupera ${got} PV (${p.hp}).`, pid, { n: got }); if (b) yield b;
  };

  // ───────────── Skill ─────────────
  G.skillOptions = function (pid) {
    const p = this.pl(pid), R = this.rules, s = this.s, out = [];
    if (p.mana < R.skillMana || p.turn.moveOnly) return out;
    const me = this.cellOfPlayer(pid);
    for (const id of new Set(p.skills)) {
      const k = id.slice(3), sk = AE.SKILLS[k], base = { kind: 'skill', card: id, skill: k, label: `Skill: ${sk.n}` };
      switch (k) {
        case 'teletrasporto': {
          const r = this.dn(2, 3);
          const cells = []; s.cells.forEach((c, i) => { if (c.tile && i !== me && AE.cellDist(me, i) <= r && AE.tile(c.tile).type !== 'insorm') cells.push(i); });
          if (cells.length) out.push(Object.assign({}, base, { cells }));
          break;
        }
        case 'repeat': if (!p.turn.extra) out.push(base); break;
        case 'tempo': out.push(Object.assign({}, base, { dir: 1, label: 'Skill: Manipolazione del Tempo (avanti)' }), Object.assign({}, base, { dir: -1, label: 'Skill: Manipolazione del Tempo (indietro)' })); break;
        case 'scudo': if (!p.temp.shield) out.push(base); break;
        case 'mira': if (!p.temp.mira) out.push(base); break;
        case 'trappola': case 'torretta': out.push(base); break;
        case 'colpo': out.push(base); break;
        case 'tempesta': out.push(base); break;
        case 'munizioni': if (s.players.some((q) => q.id !== pid && q.status === 'alive')) out.push(base); break;
        case 'sindaco': {
          const restorable = s.players.filter((q) => q.status !== 'out' && !q.ultiHeld && !s.crater[7 + q.id] && s.cells.some((c) => c.tile === 7 + q.id)).map((q) => q.id);
          if (restorable.length || s.removedTiles.length) out.push(Object.assign({}, base, { restorable }));
          break;
        }
        case 'fabbro': if (!p.temp.fabbro && p.projects.some((c) => c.startsWith('w:') || c.startsWith('ar:'))) out.push(base); break;
        case 'ladro': {
          const vict = s.players.filter((q) => q.id !== pid && q.status === 'alive' && !this.inShelter(q.id));
          const types = this.dn('VU', 'VUM');
          const os = [];
          for (const q of vict) for (const r of types) if (q.cubes[r] > 0 && p.cubes[r] < this.capCubes(pid)) os.push({ victim: q.id, res: r });
          if (os.length) out.push(Object.assign({}, base, { steals: os }));
          break;
        }
        case 'risucchio': if (s.players.some((q) => q.id !== pid && q.status === 'alive' && q.mana > 0)) out.push(base); break;
        default: break;
      }
    }
    return out;
  };
  G.doSkill = function* (pid, o) {
    const s = this.s, p = this.pl(pid), R = this.rules;
    p.mana -= R.skillMana;
    p.skills.splice(p.skills.indexOf(o.card), 1); this.discardCard('skill', o.card);
    this.stat('skills', pid);
    const sk = AE.SKILLS[o.skill];
    let b = this.say('skill', `🃏 ${this.pn(pid)} usa ${sk.n}.`, pid); if (b) yield b;
    const me = this.cellOfPlayer(pid);
    switch (o.skill) {
      case 'teletrasporto': {
        const c = yield* this.choose(pid, 'cell', 'Teletrasporto Corto: dove vai?', o.cells.map((i) => ({ cell: i, label: `${AE.tile(s.cells[i].tile).name} (#${s.cells[i].tile})` })), { force: true });
        p.at = s.cells[c.cell].tile;
        b = this.say('skill', `✨ ${this.pn(pid)} si teletrasporta su ${AE.tile(p.at).name} (#${p.at}).`, pid, { tile: p.at }); if (b) yield b;
        const h = this._touch(pid, c.cell); if (h) yield* h;
        if (p.status === 'alive' && !s.over) yield* this.activate(pid);
        break;
      }
      case 'repeat': p.turn.extra = true; break;
      case 'tempo': {
        s.periodIdx += 0;
        s.period = s.period === 'day' ? 'night' : 'day';
        // avanti/indietro sulla Plancia Tempo: il contatore si sposta di un periodo
        s.periodIdx += o.dir;
        if (s.periodIdx < 0) s.periodIdx = 0;
        b = this.say('skill', `⏳ Il periodo cambia: ora è ${s.period === 'day' ? '☀ GIORNO' : '🌙 NOTTE'}${o.dir > 0 ? ' (la Plancia avanza)' : ' (la Plancia torna indietro)'}.`, pid); if (b) yield b;
        if (o.dir > 0 && s.periodIdx >= s.nextRemoval && s.removedLevels < 3) yield* this.removeLevel();
        break;
      }
      case 'scudo': p.temp.shield = this.dn(3, 2); break;
      case 'mira': p.temp.mira = this.dn(2, 1); break;
      case 'trappola': case 'torretta': {
        const kind = o.skill === 'trappola' ? 'trap' : 'turret';
        const marks = this.adjacentCells(me).map((c) => s.cells[c].tile);
        s.traps.push({ id: s.trapSeq++, kind, tile: p.at, owner: pid, hp: R.trapHp, marks });
        b = this.say('skill', `${kind === 'trap' ? '🕸' : '🔫'} ${this.pn(pid)} piazza ${kind === 'trap' ? 'una Trappola Rallentante' : 'una Torretta di Sorveglianza'} su ${AE.tile(p.at).name} (#${p.at}): ${marks.length} tessere segnalate.`, pid); if (b) yield b;
        break;
      }
      case 'colpo': {
        const cells = []; s.cells.forEach((c, i) => { if (c.tile && AE.cellDist(me, i) <= 3 && AE.tile(c.tile).type !== 'insorm') cells.push(i); });
        const c = yield* this.choose(pid, 'cell', 'Colpo Distruttivo: scegli la tessera centrale', cells.map((i) => ({ cell: i, label: `${AE.tile(s.cells[i].tile).name} (#${s.cells[i].tile})` })), { force: true });
        const targets = new Set([c.cell]);
        for (let n = 0; n < 2; n++) {
          const adj = this.adjacentCells(c.cell).filter((x) => !targets.has(x));
          const a = yield* this.choose(pid, 'cell', `Colpo Distruttivo: tessera adiacente ${n + 1}/2`, adj.map((i) => ({ cell: i, label: `${AE.tile(s.cells[i].tile).name} (#${s.cells[i].tile})` })).concat([{ cell: -1, label: 'Nessun’altra' }]), { force: true });
          if (a.cell < 0) break;
          targets.add(a.cell);
        }
        const bypass = this.isDay();
        for (const ci of targets) {
          const tid = s.cells[ci].tile;
          for (const q of s.players) {
            if (q.status !== 'alive' || q.at !== tid || s.over) continue;
            yield* this.damage(q.id, 2, { src: pid, bypass, area: true, reason: 'Colpo Distruttivo' });
          }
        }
        break;
      }
      case 'tempesta': s.tempests.push({ at: s.periodIdx + 2, owner: pid }); break;
      case 'munizioni':
        for (const q of s.players) {
          if (q.id === pid || q.status !== 'alive') continue;
          const w = q.weapons.primary || q.weapons.secondary;
          if (w && w.ammo > 0) { w.ammo--; this.emit('info', `${this.pn(q.id)} perde 1 munizione.`, q.id); }
        }
        break;
      case 'sindaco': {
        const times = this.dn(1, 2);
        for (let t = 0; t < times; t++) {
          const opts = [];
          for (const q of s.players) if (q.status !== 'out' && !q.ultiHeld && !s.crater[7 + q.id] && s.cells.some((c) => c.tile === 7 + q.id)) opts.push({ mode: 'ulti', pid: q.id, label: `Ripristina l’Ulti di ${q.name}` });
          if (s.removedTiles.length) {
            const occ = new Set(s.players.filter((x) => this.onMap(x.id)).map((x) => x.at));
            const targets = s.cells.filter((c) => c.tile && !occ.has(c.tile) && AE.tile(c.tile).type !== 'insorm');
            if (targets.length) opts.push({ mode: 'swap', label: 'Sostituisci una tessera con una di un livello eliminato' });
          }
          if (!opts.length) break;
          const c = yield* this.choose(pid, 'sindaco', 'Sindaco: cosa fai?', opts, { force: true });
          if (c.mode === 'ulti') { s.crater[7 + c.pid] = true; b = this.say('skill', `⚡ L’Ulti di ${this.pl(c.pid).name} è di nuovo sul cratere.`, pid); if (b) yield b; }
          else {
            const occ = new Set(s.players.filter((x) => this.onMap(x.id)).map((x) => x.at));
            const cand = []; s.cells.forEach((cc, i) => { if (cc.tile && !occ.has(cc.tile) && AE.tile(cc.tile).type !== 'insorm') cand.push(i); });
            const cell = yield* this.choose(pid, 'cell', 'Quale tessera sostituisci?', cand.map((i) => ({ cell: i, label: `${AE.tile(s.cells[i].tile).name} (#${s.cells[i].tile})` })), { force: true });
            const nt = yield* this.choose(pid, 'tile', 'Con quale tessera eliminata?', s.removedTiles.map((t) => ({ tile: t, label: `${AE.tile(t).name} (#${t})` })), { force: true });
            const old = s.cells[cell.cell].tile;
            s.cells[cell.cell].tile = nt.tile; s.cells[cell.cell].rot = AE.tile(nt.tile).type === 'muro' ? this.randInt(6) : 0;
            s.removedTiles.splice(s.removedTiles.indexOf(nt.tile), 1); s.removedTiles.push(old);
            this.dropLootWhere((l) => l.tile === old); s.traps = s.traps.filter((t) => t.tile !== old);
            if (AE.tile(nt.tile).type === 'ulti' && AE.tile(nt.tile).owner < s.n && !this.pl(AE.tile(nt.tile).owner).ultiHeld) s.crater[nt.tile] = true;
            b = this.say('skill', `🔁 Il Sindaco sostituisce #${old} con #${nt.tile}.`, pid); if (b) yield b;
          }
        }
        break;
      }
      case 'fabbro': p.temp.fabbro = this.dn('VUM', 'VU'); break;
      case 'ladro': {
        const c = yield* this.choose(pid, 'steal', 'Ladro di Periferia: cosa rubi?', o.steals.map((x) => ({ victim: x.victim, res: x.res, label: `${AE.RES[x.res].s} a ${this.pl(x.victim).name}` })), { force: true });
        this.pl(c.victim).cubes[c.res]--; p.cubes[c.res]++;
        b = this.say('skill', `🥷 ${this.pn(pid)} ruba 1 cubetto di ${AE.RES[c.res].s} a ${this.pn(c.victim)}.`, pid); if (b) yield b;
        break;
      }
      case 'risucchio': {
        const n = this.dn(2, 1);
        for (const q of s.players) if (q.id !== pid && q.status === 'alive') q.mana = Math.max(0, q.mana - n);
        b = this.say('skill', `🔋 Tutti gli avversari consumano ${n} mana.`, pid); if (b) yield b;
        break;
      }
      default: break;
    }
  };

  // ───────────── menu delle azioni del turno ─────────────
  G.actionOptions = function (pid) {
    const p = this.pl(pid), out = [];
    for (const o of this.attackOptions(pid)) out.push(o);
    for (const o of this.craftOptions(pid)) out.push(o);
    for (const o of this.skillOptions(pid)) out.push(o);
    for (const o of this.useOptions(pid)) out.push(o);
    for (const o of this.buyOptions(pid)) out.push(o);
    if (!p.turn.moveOnly && this.canUlti(pid)) out.push({ kind: 'ulti', label: `ULTI di ${this.charOf(pid).n} (${this.rules.ultiMana} mana)` });
    return out;
  };
  G.actions = function* (pid) {
    const s = this.s, p = this.pl(pid);
    for (let guard = 0; guard < 60; guard++) {
      if (s.over || p.status !== 'alive') return;
      const opts = this.actionOptions(pid);
      opts.push({ kind: 'end', label: 'Fine turno' });
      const o = yield* this.choose(pid, 'action', 'Cosa fai?', opts, { force: true });
      if (o.kind === 'end') return;
      yield* this.doAction(pid, o);
    }
  };
  // Tutte le azioni, anche quelle non disponibili (con il motivo), per mostrarle grigie nell'interfaccia
  G.actionCatalog = function (pid) {
    const p = this.pl(pid), R = this.rules, s = this.s;
    const enabled = this.actionOptions(pid), disabled = [];
    const no = (kind, label, reason, extra) => disabled.push(Object.assign({ kind, label, reason }, extra || {}));
    // attacchi
    for (const slot of ['primary', 'secondary', 'melee', 'fist']) {
      const st = this.weaponStats(pid, slot); if (!st) continue;
      if (enabled.some((o) => o.kind === 'attack' && o.slot === slot)) continue;
      let why;
      if (this.inShelter(pid)) why = 'Nei rifugi non si attacca';
      else if (p.turn.slowed) why = 'Rallentato dalla trappola: niente attacchi in questo turno';
      else if (p.turn.moveOnly) why = 'Soshito: puoi solo muoverti in questo turno';
      else if (st.ammo < 1) why = 'Senza munizioni';
      else if (slot === 'fist' && R.punchMax > 0 && (p.turn.atk.fist || 0) >= R.punchMax) why = `Limite di ${R.punchMax} pugni per turno raggiunto`;
      else if (this.attackCost(pid, st) > p.mana) why = `Serve ${this.attackCost(pid, st)} mana (ne hai ${p.mana})`;
      else why = st.git === 0 ? 'Nessun avversario nella tua tessera' : 'Nessun avversario a tiro in linea retta (o coperto da un corpo/muro)';
      no('attack', `Attacca con ${st.name}`, why, { slot });
    }
    // crafting
    for (const id of new Set(p.projects)) {
      if (enabled.some((o) => o.kind === 'craft' && o.proj === id)) continue;
      const [k] = id.split(':');
      let why;
      if (p.mana < R.craftMana) why = `Serve ${R.craftMana} mana`;
      else if (k === 'mod') why = 'Ti serve un’arma senza mod';
      else { const c = this.craftCost(pid, id); why = 'Mancano: ' + AE.RES_KEYS.filter((r) => p.cubes[r] < c[r]).map((r) => `${c[r] - p.cubes[r]} ${AE.RES[r].s}`).join(', '); }
      no('craft', `Crafta ${AE.cardName(id)}`, why, { card: id });
    }
    // skill
    for (const id of new Set(p.skills)) {
      if (enabled.some((o) => o.kind === 'skill' && o.card === id)) continue;
      no('skill', `Skill: ${AE.cardName(id)}`, p.mana < R.skillMana ? `Serve ${R.skillMana} mana` : p.turn.moveOnly ? 'Soshito: puoi solo muoverti' : 'Ora non ha effetto utile o non ci sono bersagli', { card: id });
    }
    // ulti
    if (!enabled.some((o) => o.kind === 'ulti')) {
      const ch = this.charOf(pid);
      let why;
      if (p.char === 'miaika') why = 'Si usa da sola quando vieni eliminata';
      else if (p.char === 'nganga') why = 'Si usa da sola quando subisci un colpo';
      else if (!p.ultiHeld) why = p.ultiUsed ? 'Già usata: la ripristina solo il Sindaco' : 'Non l’hai ancora raccolta: fermati sulla tua tessera Ulti';
      else if (p.mana < R.ultiMana) why = `Serve ${R.ultiMana} mana`;
      else why = 'Nessun bersaglio utile';
      no('ulti', `ULTI di ${ch.n}`, why);
    }
    // mercato
    if (p.mana < R.buyMana) no('buy', 'Mercato', `Comprare costa ${R.buyMana} mana`);
    else {
      const mx = Math.min(R.price.mat[0], R.price.proj[0]);
      if (p.coins < mx) no('buy', 'Mercato', `Servono almeno ${mx} monete (ne hai ${p.coins})`);
      if (p.hp >= R.healthCap) no('buyhp', 'Compra 1 PV', 'PV già al massimo'); else if (p.coins < R.hpPrice) no('buyhp', 'Compra 1 PV', `Servono ${R.hpPrice} monete`);
    }
    for (const id of new Set(p.heal)) if (!enabled.some((o) => o.kind === 'heal' && o.card === id)) no('heal', `Usa ${AE.cardName(id)}`, p.hp >= R.healthCap ? 'PV già al massimo' : `Serve ${R.healMana} mana`, { card: id });
    return { enabled, disabled };
  };
  G.doAction = function* (pid, o) {
    switch (o.kind) {
      case 'attack': yield* this.attack(pid, o); break;
      case 'craft': yield* this.doCraft(pid, o); break;
      case 'skill': yield* this.doSkill(pid, o); break;
      case 'heal': yield* this.doHeal(pid, o); break;
      case 'buy': case 'buyhp': case 'buyammo': yield* this.doBuy(pid, o); break;
      case 'sell': yield* this.doSell(pid, o); break;
      case 'ulti': yield* this.useUlti(pid); break;
      default: break;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
