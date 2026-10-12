/* ARENA EXTINCTIO — motore di gioco (parte 1: struttura, mappa, movimento, turno, cambio giornata).
   - Nessuna UI: tutto lo stato è in `game.s` (JSON puro, clonabile).
   - La partita è un generatore: `game.run()` fa `yield` di "decisioni" ({type:'move'|'action'|'choose'}) e riceve la risposta
     (un indice nell'array `options`). Con `cfg.beats` emette anche {type:'beat'} dopo ogni evento (per i messaggi a schermo).
   - RNG con seed → partite riproducibili. Le risposte date sono registrate in `game.history` e si possono rigiocare con `cfg.replay`.
   - La cima dei mazzi è l'ULTIMO elemento dell'array (`pop`).
   Le parti successive del motore estendono `AE.Game.prototype`: combat.js (danni, attacchi, eliminazioni, Ulti) e cards.js (carte, crafting, mercato, Skill).
   Le interpretazioni delle regole sono elencate in docs/REGOLAMENTO.md */
(function (root) {
  'use strict';
  const AE = (root.AE = root.AE || {});
  const { DIRS } = AE;

  AE.hashSeed = function (x) {
    if (typeof x === 'number') return x | 0;
    let h = 2166136261;
    const s = String(x);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h | 0;
  };
  // mulberry32 con stato esterno (usato da AI e test)
  AE.makeRng = function (seed) {
    let a = AE.hashSeed(seed);
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ───────────── geometria statica della mappa (61 celle) ─────────────
  const CELLS = [], CIDX = {};
  for (let r = -AE.RADIUS; r <= AE.RADIUS; r++) for (let q = -AE.RADIUS; q <= AE.RADIUS; q++) {
    if (Math.abs(q + r) > AE.RADIUS) continue;
    CIDX[q + ',' + r] = CELLS.length; CELLS.push({ q, r, level: AE.levelOf({ q, r }) });
  }
  const NB = CELLS.map((c) => DIRS.map((d) => { const k = (c.q + d[0]) + ',' + (c.r + d[1]); return k in CIDX ? CIDX[k] : -1; }));
  AE.CELLS = CELLS; AE.NB = NB; AE.cellIndex = (q, r) => { const k = q + ',' + r; return k in CIDX ? CIDX[k] : -1; };
  AE.cellDist = (a, b) => AE.hexDist(CELLS[a], CELLS[b]);

  // mazzi
  AE.buildDecks = function () {
    const rep = (id, n, a) => { for (let i = 0; i < n; i++) a.push(id); };
    const mat = [], skill = [], proj = [], base = [];
    for (const k in AE.MATERIALS) rep('mat:' + k, AE.MATERIALS[k].copies, mat);
    for (const k in AE.SKILLS) rep('sk:' + k, AE.SKILLS[k].copies, skill);
    for (const k in AE.SPECIALS) rep('sp:' + k, AE.SPECIALS[k].copies, skill);
    for (const k in AE.WEAPONS) { const w = AE.WEAPONS[k]; rep('w:' + k, w.copies, w.deck === 'base' ? base : proj); }
    for (const k in AE.ARMORS) rep('ar:' + k, AE.ARMORS[k].copies, proj);
    for (const k in AE.MODS) rep('mod:' + k, AE.MODS[k].copies, proj);
    return { mat, skill, proj, base };
  };
  AE.slotOfProject = (id) => { const [k, x] = id.split(':'); return k === 'w' ? AE.WEAPONS[x].slot : k === 'ar' ? 'armor' : k === 'mod' ? 'mod' : null; };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const sumCubes = (c) => (c.V | 0) + (c.U | 0) + (c.M | 0);

  class Game {
    /* cfg: { seed, rules, players:[{name,kind:'human'|'ai',level,char}], beats, log, stats, replay } */
    constructor(cfg) {
      cfg = cfg || {};
      this.cfg = cfg;
      this.rules = Object.assign({}, AE.DEFAULT_RULES, cfg.rules || {});
      // negli esperimenti: cambiando i PV iniziali o il mana, il massimo segue (salvo indicazione esplicita)
      if (cfg.rules && cfg.rules.hp != null && cfg.rules.healthCap == null) this.rules.healthCap = cfg.rules.hp;
      if (cfg.rules && cfg.rules.mana != null && cfg.rules.manaSfera == null) this.rules.manaSfera = cfg.rules.mana + 1;
      this.logOn = cfg.log !== false;
      this.statsOn = cfg.stats !== false;
      this.beats = !!cfg.beats;
      this.events = [];
      this.history = [];
      this.replay = (cfg.replay || []).slice();
      this.stats = { p: [], g: {} };
      this.result = null;
      this.onEvent = null;
      if (cfg.resume) {            // ripresa da un'istantanea a inizio turno (salvataggi fatti con una versione precedente delle regole)
        this.s = JSON.parse(cfg.resume.s); this.events = cfg.resume.events || []; this.stats = cfg.resume.stats || this.stats;
        this._resumeK = cfg.resume.k; this.replay = [];
      } else this.s = this._setup(cfg);
      this.keepSnaps = !!cfg.keepSnaps;
    }

    clone() {
      const g = Object.create(Game.prototype);
      g.cfg = {}; g.rules = this.rules; g.logOn = false; g.statsOn = false; g.beats = false;
      g.events = []; g.history = []; g.replay = []; g.stats = { p: [], g: {} }; g.result = null; g.onEvent = null;
      g.s = clone(this.s);
      return g;
    }

    // ───────────────────────── setup ─────────────────────────
    _setup(cfg) {
      const R = this.rules;
      const s = { rng: AE.hashSeed(cfg.seed == null ? Date.now() : cfg.seed) };
      this.s = s;
      const pl = cfg.players || [{}, {}];
      const N = pl.length;
      if (N < 2 || N > 6) throw new Error('Servono da 2 a 6 giocatori');
      s.n = N;
      // tessere sulle celle (tutto casuale), i muri hanno anche una rotazione casuale
      const ids = cfg.layout ? cfg.layout.slice() : this._shuffle(AE.TILES.map((t) => t.id));   // cfg.layout: disposizione fissa (test)
      s.cells = CELLS.map((c, i) => { const id = ids[i]; const t = AE.tile(id); return { tile: id, rot: cfg.layout ? ((cfg.rot && cfg.rot[i]) || 0) : (t.type === 'muro' ? this.randInt(6) : 0) }; });
      s.removedTiles = [];            // tessere uscite dal gioco (per il Sindaco)
      s.removedLevels = 0;
      const decks = AE.buildDecks();
      s.decks = { mat: this._shuffle(decks.mat), skill: this._shuffle(decks.skill), proj: this._shuffle(decks.proj), base: this._shuffle(decks.base) };
      s.discard = { mat: [], skill: [], proj: [], base: [] };
      s.display = { mat: this._refill('mat'), skill: this._refill('skill'), proj: this._refill('proj') };
      // personaggi: assegnati a caso e senza ripetizioni se non indicati
      const free = this._shuffle(AE.CHARS.map((c) => c.id));
      const used = new Set(pl.map((p) => p && p.char).filter(Boolean));
      const pool = free.filter((c) => !used.has(c));
      const re = R.reentries[N] || { each: 0, tokens: 0, max: 0 };
      s.players = pl.map((p, i) => {
        p = p || {};
        const ch = p.char || pool.shift();
        const homeTile = i + 1;   // Luogo numerato come il giocatore
        return {
          id: i, name: p.name || `Giocatore ${i + 1}`, kind: p.kind || 'ai', level: p.level || null, char: ch,
          status: 'alive',   // alive | pending (in attesa di rientrare) | ghost (Fastidio) | out
          hp: R.hp, mana: R.mana, coins: R.startCoins, at: homeTile, reentries: re.each || 0, reentryMax: re.max || 0,
          cubes: { V: 0, U: 0, M: 0 }, heal: [], skills: [], specials: [], projects: [],
          weapons: { primary: null, secondary: null, melee: null }, armor: null,
          ultiHeld: false, ultiUsed: false,
          temp: {},      // effetti a tempo (scudo, mira, svantaggio…)
          turn: null,
          kills: 0,
        };
      });
      // carte regalate a inizio partita (analisi "carta forzata" del simulatore): cfg.give = { posto: [id, …] }
      s.rngSetupDone = true;
      // risorse "cratere" sulle tessere Ulti dei giocatori presenti; tessere Ulti senza proprietario restano inerti
      s.crater = {}; for (let i = 0; i < N; i++) s.crater[7 + i] = true;
      s.traps = [];        // {id, kind:'trap'|'turret', tile, owner, hp, marks:[tileId]}
      s.loot = [];         // {tile, owner, items:[...]}
      s.tokens = [];       // segnalini rientro sulle tessere Luogo
      s.blocks = {};       // tessere bloccate dai Fastidio: tileId -> ghost pid
      s.followers = null;  // Kone: {pid, sun, moon}
      s.cloud = null;      // Sejhnam: {pid, tiles, until}
      s.tempests = [];     // [{at, owner}]
      s.freeze = 0;        // God_Nocy: cambi giorno/notte saltati
      if (re.tokens) {
        const spots = this._shuffle([...Array(N)].map((_, i) => i + 1));
        for (let i = 0; i < re.tokens; i++) s.tokens.push({ tile: spots[i] });
      }
      s.round = 1; s.periodIdx = 0; s.period = 'day';
      s.nextRemoval = R.levelDays[0] * R.periodsPerDay;   // tra quanti cambi giornata si toglie il prossimo livello
      s.turnNo = 0; s.cur = 0; s.start = 0; s.over = false; s.winner = null; s.phase = 'setup';
      s.trapSeq = 1; s.limbo = []; s.lastDmgRound = 1;
      for (let i = 0; i < N; i++) this.stats.p.push({});
      if (cfg.give) for (const k in cfg.give) for (const id of cfg.give[k]) this._giveStart(+k, id);
      return s;
    }

    _giveStart(pid, id) {
      const s = this.s, p = s.players[pid];
      const cid = id.startsWith('eq:') ? id.slice(3) : id;
      const dk = this.deckOfCard(cid), i = s.decks[dk].indexOf(cid);
      if (i >= 0) s.decks[dk].splice(i, 1);
      const [k, x] = cid.split(':');
      if (id.startsWith('eq:')) {
        if (k === 'w') { const w = AE.WEAPONS[x]; p.weapons[w.slot] = { id: x, ammo: 0, mod: null }; p.weapons[w.slot].ammo = this.weaponStats(pid, w.slot).cap; }
        else if (k === 'ar') p.armor = { id: x, dur: AE.ARMORS[x].dur };
        return;
      }
      if (k === 'sk') p.skills.push(cid); else if (k === 'sp') p.specials.push(cid); else if (k === 'mat') p.heal.push(cid); else p.projects.push(cid);
    }

    // ───────────────────────── utilità ─────────────────────────
    rand() {
      const s = this.s;
      const a = (s.rng + 0x6D2B79F5) | 0; s.rng = a;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    randInt(n) { return Math.floor(this.rand() * n); }
    d6() { return 1 + this.randInt(6); }
    _shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = this.randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    pick(arr) { return arr[this.randInt(arr.length)]; }
    pl(pid) { return this.s.players[pid]; }
    charOf(pid) { return AE.CHARS[AE.CHAR_IDX[this.s.players[pid].char]]; }
    hasChar(pid, id) { return this.s.players[pid].char === id; }
    pn(pid) { return `${this.s.players[pid].name} (${this.charOf(pid).n})`; }
    isDay() { return this.s.period === 'day'; }
    dn(day, night) { return this.s.period === 'day' ? day : night; }
    maxMana(pid) { return this.rules.mana + (this.pl(pid).specials.includes('sp:sfera') ? 1 : 0) * (this.rules.manaSfera - this.rules.mana); }
    maxHp() { return this.rules.healthCap; }
    stat(name, pid, n) {
      if (!this.statsOn) return;
      n = n == null ? 1 : n;
      if (pid == null || pid < 0) this.stats.g[name] = (this.stats.g[name] || 0) + n;
      else this.stats.p[pid][name] = (this.stats.p[pid][name] || 0) + n;
    }
    emit(k, text, p, data) {
      if (!this.logOn) return null;
      const ev = { i: this.events.length, t: this.s.turnNo, r: this.s.round, per: this.s.period, k, p: p == null ? -1 : p, text, d: data };
      this.events.push(ev);
      if (this.onEvent) this.onEvent(ev);
      return ev;
    }
    say(k, text, p, data) { const ev = this.emit(k, text, p, data); return this.beats && ev ? { type: 'beat', ev } : null; }

    // ───────────────────────── mappa ─────────────────────────
    cellOfTile(id) { const c = this.s.cells; for (let i = 0; i < c.length; i++) if (c[i].tile === id) return i; return -1; }
    tileAt(ci) { const t = this.s.cells[ci].tile; return t ? AE.tile(t) : null; }
    typeAt(ci) { const t = this.tileAt(ci); return t ? t.type : null; }
    cellOfPlayer(pid) { const p = this.s.players[pid]; return p.at ? this.cellOfTile(p.at) : -1; }
    onMap(pid) { const p = this.s.players[pid]; return (p.status === 'alive' || p.status === 'ghost') && !!p.at; }
    alivePlayers() { return this.s.players.filter((p) => p.status === 'alive'); }
    // lato bloccato da un muro tra la cella a e la sua vicina nella direzione d
    wallBetween(a, d) {
      const b = NB[a][d]; if (b < 0) return false;
      return this._wallAt(a, d) || this._wallAt(b, (d + 3) % 6);
    }
    _wallAt(ci, d) {
      const cell = this.s.cells[ci]; if (!cell.tile) return false;
      const t = AE.tile(cell.tile); if (t.type !== 'muro') return false;
      return t.walls.some((w) => (w + cell.rot) % 6 === d);
    }
    // si può camminare sulla cella? (esiste, non è insormontabile, non è bloccata da un Fastidio o da un seguace di Kone)
    walkable(ci, pid, ghost) {
      const cell = this.s.cells[ci]; if (!cell.tile) return false;
      const t = AE.tile(cell.tile); if (t.type === 'insorm') return false;
      if (ghost) return true;
      if (this.s.blocks[cell.tile] != null) return false;
      const f = this.s.followers;
      if (f && f.pid !== pid && (this.isDay() ? f.sun : f.moon) === cell.tile) return false;
      return true;
    }
    // un colpo/proiettile attraversa la cella? (insormontabili e rimosse no; i corpi sono controllati a parte)
    shootable(ci) { const cell = this.s.cells[ci]; return !!cell.tile && AE.tile(cell.tile).type !== 'insorm'; }
    adjacentCells(ci) { return NB[ci].filter((x) => x >= 0 && this.s.cells[x].tile); }
    levelsLeft() { return 5 - this.s.removedLevels; }
    mapDice() { return this.levelsLeft() >= 3 ? 2 : 1; }

    // ───────────────────────── mazzi ─────────────────────────
    _refill(deck) {
      const s = this.s;
      if (!s.decks[deck].length) this._reshuffle(deck);
      return s.decks[deck].pop() || null;
    }
    _reshuffle(deck) {
      const s = this.s;
      if (s.decks[deck].length || !s.discard[deck].length) return;
      s.decks[deck] = this._shuffle(s.discard[deck].splice(0));
    }
    drawCard(deck) {
      const s = this.s;
      if (!s.decks[deck].length) this._reshuffle(deck);
      return s.decks[deck].pop() || null;
    }
    discardCard(deck, id) { if (id) this.s.discard[deck].push(id); }
    deckOfCard(id) {
      const k = id.split(':')[0];
      if (k === 'mat') return 'mat';
      if (k === 'sk' || k === 'sp') return 'skill';
      if (id === 'w:xas' || id === 'w:foolshift') return 'base';
      return 'proj';
    }
    refillDisplay(deck) { const s = this.s; if (!s.display[deck]) s.display[deck] = this._refill(deck); }

    // il bottino che sparisce (tessera rimossa o sostituita) torna negli scarti
    dropLootWhere(fn) {
      const s = this.s;
      for (const l of s.loot) if (fn(l)) for (const it of l.items) { if (it.startsWith('cube:')) continue; const id = it.startsWith('eq:') ? it.slice(3) : it; this.discardCard(this.deckOfCard(id), id); }
      s.loot = s.loot.filter((l) => !fn(l));
    }

    // ───────────────────────── decisioni ─────────────────────────
    // Chiede una decisione al controller (o dalla coda di replay) e registra la risposta.
    *ask(dec) {
      let ans;
      if (this.replay.length) ans = this.replay.shift();
      else ans = yield dec;
      if (ans == null || (dec.options && (ans < 0 || ans >= dec.options.length))) ans = 0;
      this.history.push(ans);
      return ans;
    }
    // Scelta generica fra opzioni {label, ...}. Con una sola opzione risponde da sola (salvo `force`).
    *choose(pid, what, prompt, options, extra) {
      if (!options.length) return null;
      if (options.length === 1 && !(extra && extra.force)) return options[0];
      const dec = Object.assign({ type: 'choose', pid, what, prompt, options }, extra || {});
      const i = yield* this.ask(dec);
      return options[i];
    }

    // ───────────────────────── partita ─────────────────────────
    *run() {
      const s = this.s;
      s.phase = 'play';
      if (this._resumeK == null) {
        const b0 = this.say('start', `🎲 Si comincia: ${s.n} giocatori, mappa a ${s.cells.length} tessere, è GIORNO.`);
        if (b0) yield b0;
      }
      let k0 = this._resumeK || 0; this._resumeK = null;
      while (!s.over) {
        const order = [];
        for (let k = 0; k < s.n; k++) order.push((s.start + k) % s.n);
        for (let k = k0; k < order.length; k++) {
          const pid = order[k];
          if (s.over) break;
          if (this.keepSnaps) this.snap = { k, s: JSON.stringify(s), events: this.events.slice(-300), stats: JSON.parse(JSON.stringify(this.stats)) };
          yield* this.turn(pid);
        }
        k0 = 0;
        if (s.over) break;
        yield* this.periodChange();
        if (s.round > this.rules.maxRounds) { this._finish(null, 'tempo massimo'); break; }
      }
      return this.result;
    }

    _finish(winner, why) {
      const s = this.s;
      s.over = true; s.winner = winner;
      this.result = { winner, why: why || '', rounds: s.round, turns: s.turnNo, hp: s.players.map((p) => p.hp), kills: s.players.map((p) => p.kills) };
      this.emit('end', winner == null ? `🏁 Partita finita senza vincitore (${why || 'pareggio'}).` : `🏆 ${this.pn(winner)} vince la partita!`, winner == null ? -1 : winner);
    }
    // ultimo rimasto? (vivo o in attesa di rientrare)
    checkOver() {
      const s = this.s; if (s.over) return true;
      const inGame = s.players.filter((p) => p.status === 'alive' || p.status === 'pending');
      if (inGame.length <= 1) { this._finish(inGame.length ? inGame[0].id : null, inGame.length ? 'ultimo in vita' : 'tutti eliminati insieme'); return true; }
      return false;
    }

    // ───────────────────────── turno ─────────────────────────
    *turn(pid) {
      const s = this.s, p = s.players[pid];
      if (p.status === 'out') return;
      s.cur = pid; s.turnNo++;
      if (p.status === 'ghost') { yield* this.ghostTurn(pid); return; }
      let again = true;
      while (again && !s.over) {
        again = false;
        if (p.status === 'pending') { const b0 = yield* this.respawn(pid, { why: 'rientro' }); if (b0) yield b0; }
        if (p.status !== 'alive') return;
        p.turn = { atk: {}, slowed: false, moved: false, fabbro: 0, extra: false, moveOnly: false, skipped: false };
        if (p.temp.skipTurn) { delete p.temp.skipTurn; p.turn.skipped = true; const b = this.say('skip', `😴 ${this.pn(pid)} salta il turno (Ulti di Soshito).`, pid); if (b) yield b; return; }
        if (p.temp.moveOnly) { delete p.temp.moveOnly; p.turn.moveOnly = true; this.emit('info', `${this.pn(pid)} può soltanto muoversi in questo turno (Ulti di Soshito).`, pid); }
        let b = this.say('turn', `▶ Turno di ${this.pn(pid)} — ${this.isDay() ? '☀ giorno' : '🌙 notte'} · ${p.hp} PV · ${p.mana} mana`, pid);
        if (b) yield b;
        yield* this.movement(pid);
        if (s.over || p.status !== 'alive') return;
        yield* this.activate(pid);
        if (s.over || p.status !== 'alive') return;
        if (!p.turn.moveOnly) yield* this.actions(pid);
        if (s.over || p.status !== 'alive') return;
        this.endOfTurn(pid);
        if (p.turn.extra) { again = true; this.emit('info', `🔁 ${this.pn(pid)} effettua un altro turno completo (Repeat).`, pid); }
      }
    }
    endOfTurn(pid) {
      const p = this.pl(pid);
      p.shelterRun = this.inShelter(pid) ? (p.shelterRun || 0) + 1 : 0;
      delete p.temp.mira; delete p.temp.vantaggio;   // effetti "prossimo attacco" non usati: restano? (vedi regolamento) → Mira resta, Vantaggio no
      p.temp.fabbro = 0;
      if (p.temp.ultiTurn) delete p.temp.ultiTurn;   // Ulti di Karou: fino a fine turno
    }

    // ───────────────────────── movimento ─────────────────────────
    portalExits(ci, from) {
      // portale A -> altro A o doppio ; B -> altro B o doppio ; doppio -> qualsiasi altro portale
      const t = this.tileAt(ci), res = [];
      if (!t || t.type !== 'tele') return res;
      this.s.cells.forEach((c, i) => {
        if (i === ci || !c.tile) return;
        const u = AE.tile(c.tile); if (u.type !== 'tele') return;
        if (t.portal === 'D' || u.portal === 'D' || u.portal === t.portal) res.push(i);
      });
      return res;
    }
    // cella con un segnalino "rallenta" o "torretta" o nuvola → pericolo
    hazardAt(ci, pid) {
      const tid = this.s.cells[ci].tile; if (!tid) return null;
      let k = null;
      for (const tr of this.s.traps) if (tr.marks.includes(tid) && tr.owner !== pid) { if (tr.kind === 'trap') return 'trap'; k = tr.kind; }
      if (k) return k;
      const c = this.s.cloud; if (c && c.tiles.includes(tid) && c.pid !== pid && this.s.periodIdx < c.until) return 'cloud';
      return null;
    }
    // Calcola le tessere di arrivo possibili con esattamente `n` passi (o fino a un segnalino che ferma).
    // Ritorna { ends: [{cell, path:[celle...], stop:bool}], short:false } oppure con short:true (passi mancanti) se non si riesce a consumarli tutti.
    movementOptions(pid, n, opts) {
      opts = opts || {};
      const s = this.s, ghost = !!opts.ghost;
      const start = opts.from != null ? opts.from : this.cellOfPlayer(pid);
      const immune = !ghost && this.hasChar(pid, 'nganga');
      const hasPortals = !ghost && s.cells.some((c) => c.tile && AE.tile(c.tile).type === 'tele');
      const stopOn = (ci) => !ghost && !immune && this.hazardAt(ci, pid) === 'trap';
      const canStep = (a, d) => { const b = NB[a][d]; return b >= 0 && this.walkable(b, pid, ghost) && !this.wallBetween(a, d); };
      const exitsOf = (b) => (!ghost && this.typeAt(b) === 'tele') ? this.portalExits(b, null).filter((e) => this.walkable(e, pid, ghost)) : null;
      // 1) sopra-insieme: raggiungibili con esattamente k passi come cammini (ignorando il divieto di ripassare)
      const layers = [new Set([start])];
      const stops = new Map();   // celle-segnalino toccate entro n passi
      for (let k = 1; k <= n; k++) {
        const nxt = new Set();
        for (const a of layers[k - 1]) for (let d = 0; d < 6; d++) {
          if (!canStep(a, d)) continue;
          const b = NB[a][d];
          if (stopOn(b)) { if (!stops.has(b)) stops.set(b, k); continue; }
          const ex = exitsOf(b);
          if (ex) { for (const e of ex) nxt.add(e); } else nxt.add(b);
        }
        layers.push(nxt);
      }
      const cand = new Set(layers[n]); for (const b of stops.keys()) cand.add(b);
      cand.delete(start);
      const out = [];
      // 2) verifica con ricerca di un cammino che non ripassa due volte sulla stessa tessera
      const budgetMax = 25000;
      for (const target of cand) {
        const isStop = stops.has(target) && !layers[n].has(target);
        const path = this._findPath(pid, start, target, n, { ghost, canStep, exitsOf, stopOn, immune, hasPortals, avoid: true, budget: budgetMax, isStop });
        const p2 = path || this._findPath(pid, start, target, n, { ghost, canStep, exitsOf, stopOn, immune, hasPortals, avoid: false, budget: budgetMax, isStop });
        if (p2) out.push({ cell: target, path: p2, stop: isStop });
      }
      if (out.length || n <= 1 || opts._noShort) return { ends: out, short: false, steps: n };
      // 3) impossibile consumare tutti i passi: il massimo raggiungibile
      for (let k = n - 1; k >= 1; k--) {
        const r = this.movementOptions(pid, k, Object.assign({}, opts, { _noShort: true }));
        if (r.ends.length) return { ends: r.ends, short: true, steps: k };
      }
      return { ends: [], short: true, steps: 0 };
    }
    _findPath(pid, start, target, n, o) {
      const visited = new Set([start]);
      let nodes = 0;
      const path = [];
      const dfs = (cur, rem) => {
        if (++nodes > o.budget) return false;
        for (let d = 0; d < 6; d++) {
          if (!o.canStep(cur, d)) continue;
          const b = NB[cur][d];
          if (visited.has(b)) continue;
          if (o.avoid && b !== target && !o.ghost && !o.immune && this.hazardAt(b, pid)) continue;
          if (o.stopOn(b)) {      // un segnalino rallentante ferma subito
            if (b === target && o.isStop) { path.push(b); return true; }
            continue;
          }
          const ex = o.exitsOf(b);
          if (ex) {
            visited.add(b);
            for (const e of ex) {
              if (visited.has(e)) continue;
              visited.add(e); path.push(b, e);
              if (rem - 1 === 0) { if (e === target) return true; }
              else if (dfs(e, rem - 1)) return true;
              path.pop(); path.pop(); visited.delete(e);
            }
            visited.delete(b);
            continue;
          }
          if (rem - 1 === 0) { if (b === target && !o.isStop) { path.push(b); return true; } continue; }
          if (!o.hasPortals && AE.cellDist(b, target) > rem - 1) continue;
          visited.add(b); path.push(b);
          if (dfs(b, rem - 1)) return true;
          path.pop(); visited.delete(b);
        }
        return false;
      };
      return dfs(start, n) ? path.slice() : null;
    }

    *movement(pid) {
      const s = this.s, p = s.players[pid];
      const nd = this.mapDice();
      const rolls = []; for (let i = 0; i < nd; i++) rolls.push(this.d6());
      const n = rolls.reduce((a, b) => a + b, 0);
      p.turn.roll = rolls;
      let b = this.say('roll', `🎲 ${this.pn(pid)} tira ${nd}D6: ${rolls.join(' + ')} = ${n} passi.`, pid, { rolls });
      if (b) yield b;
      const mo = this.movementOptions(pid, n);
      if (mo.short) {
        if (!mo.ends.length) {
          b = this.say('stuck', `⛔ ${this.pn(pid)} non può muoversi: subisce 1 danno.`, pid);
          if (b) yield b;
          yield* this.damage(pid, 1, { src: null, bypass: true, reason: 'movimento impossibile' });
          return;
        }
        b = this.say('short', `⚠ ${this.pn(pid)} non riesce a consumare tutti i passi: ne usa ${mo.steps} e subisce 1 danno.`, pid);
        if (b) yield b;
        yield* this.damage(pid, 1, { src: null, bypass: true, reason: 'passi non consumati' });
        if (s.over || p.status !== 'alive') return;
      }
      if (!mo.ends.length) return;
      if (this.rules.shelterLimit > 0 && (p.shelterRun || 0) >= this.rules.shelterLimit) {   // variante: dopo N turni di fila in un rifugio devi uscire
        const out2 = mo.ends.filter((e) => this.typeAt(e.cell) !== 'rifugio');
        if (out2.length) mo.ends = out2;
      }
      const options = mo.ends.map((e) => ({ cell: e.cell, tile: s.cells[e.cell].tile, path: e.path, stop: e.stop, label: `${AE.tile(s.cells[e.cell].tile).name} (#${s.cells[e.cell].tile})` }));
      const opt = yield* this.choose(pid, 'move', `Hai ${mo.steps} passi: dove ti fermi?`, options, { roll: n, steps: mo.steps });
      yield* this.walk(pid, opt.path, opt.cell);
    }
    // percorre il cammino scelto applicando gli effetti toccati lungo la strada (segnalini, torrette, nuvola)
    *walk(pid, path, dest) {
      const s = this.s, p = s.players[pid];
      p.turn.path = [this.cellOfPlayer(pid)].concat(path);
      for (const ci of path) {
        const tid = s.cells[ci].tile; if (!tid) break;
        p.at = tid;
        const h = this._touch(pid, ci);
        if (h) yield* h;
        if (s.over || p.status !== 'alive') return;
      }
      const b = this.say('arrive', `📍 ${this.pn(pid)} si ferma su ${AE.tile(p.at).name} (#${p.at}).`, pid, { tile: p.at, path: p.turn.path.slice() });
      if (b) yield b;
    }
    // effetti di una tessera appena toccata (generator o null)
    _touch(pid, ci) {
      const self = this;
      const tid = this.s.cells[ci].tile;
      const p = this.s.players[pid];
      const traps = this.s.traps.filter((t) => t.marks.includes(tid) && t.owner !== pid);   // le proprie trappole e torrette non fanno nulla
      const cloud = this.s.cloud && this.s.cloud.tiles.includes(tid) && this.s.cloud.pid !== pid && this.s.periodIdx < this.s.cloud.until;
      if (!traps.length && !cloud) return null;
      return (function* () {
        const immune = self.hasChar(pid, 'nganga');
        for (const tr of traps) {
          if (immune) { self.emit('info', `🛡 ${self.pn(pid)} è immune a trappole e torrette.`, pid); continue; }
          if (tr.kind === 'trap') {
            self.s.traps.forEach((t) => { if (t === tr) t.marks = t.marks.filter((m) => m !== tid); });
            p.turn.slowed = true; p.turn.stoppedAt = tid;
            self.emit('trap', `🕸 ${self.pn(pid)} tocca un segnalino della Trappola Rallentante: si ferma e non potrà attaccare.`, pid);
            self.stat('trapStops', pid);
          } else {
            self.s.traps.forEach((t) => { if (t === tr) t.marks = t.marks.filter((m) => m !== tid); });
            self.emit('turret', `🔫 ${self.pn(pid)} tocca un segnalino della Torretta: subisce ${self.rules.turretDmg} danni.`, pid);
            yield* self.damage(pid, self.rules.turretDmg, { src: tr.owner, bypass: false, reason: 'torretta', area: true });
          }
        }
        if (cloud && !immune) {
          self.emit('cloud', `☣ ${self.pn(pid)} entra nella nuvola tossica: 2 danni.`, pid);
          yield* self.damage(pid, 2, { src: self.s.cloud.pid, bypass: false, reason: 'nuvola tossica', area: true });
        }
        return null;
      })();
    }

    // attivazione della tessera su cui ci si è fermati (gratis)
    *activate(pid) {
      const s = this.s, p = s.players[pid];
      const ci = this.cellOfPlayer(pid), t = this.tileAt(ci);
      if (!t) return;
      let b;
      switch (t.type) {
        case 'equip': yield* this.activateEquip(pid, t); break;
        case 'carte': yield* this.activateCards(pid); break;
        case 'ulti':
          if (t.owner === pid && s.crater[t.id] && !p.ultiHeld) {
            s.crater[t.id] = false; p.ultiHeld = true; p.ultiUsed = false;
            b = this.say('ulti', `⚡ ${this.pn(pid)} raccoglie la propria Ulti.`, pid); if (b) yield b;
          }
          break;
        case 'luogo': {
          const tk = s.tokens.findIndex((x) => x.tile === t.id);
          if (tk >= 0 && (!p.reentryMax || p.reentries < p.reentryMax)) {
            s.tokens.splice(tk, 1); p.reentries++;
            b = this.say('reentry', `↩ ${this.pn(pid)} raccoglie un rientro su ${t.name}.`, pid); if (b) yield b;
          }
          break;
        }
        default: break;
      }
      // eventuale bottino
      yield* this.lootPickup(pid);
    }

    // ───────────────────────── cambio giornata ─────────────────────────
    *periodChange() {
      const s = this.s, R = this.rules;
      s.periodIdx++;
      if (s.freeze > 0) s.freeze--; else s.period = s.period === 'day' ? 'night' : 'day';
      s.round++;
      s.start = s.start;   // l'ordine di turno è fisso per posto
      let b = this.say('period', `🔔 Cambio giornata: ora è ${s.period === 'day' ? '☀ GIORNO' : '🌙 NOTTE'} (round ${s.round}).`);
      if (b) yield b;
      // monete (Luogo, Rifugio) e mana
      for (const p of s.players) {
        if (p.status !== 'alive') continue;
        const t = AE.tile(p.at);
        if (t.type === 'luogo' && R.luogoCoins) { this._addCoins(p.id, R.luogoCoins); }
        if (t.type === 'rifugio' && R.rifugioCoins) { this._addCoins(p.id, R.rifugioCoins); }
        p.mana = this.maxMana(p.id);
        if (p.temp.excess) { p.hp = Math.min(p.hp, R.healthCap); delete p.temp.excess; }
      }
      // Tempesta Imminente
      const due = s.tempests.filter((t) => s.periodIdx >= t.at);
      s.tempests = s.tempests.filter((t) => s.periodIdx < t.at);
      for (const t of due) {
        b = this.say('tempest', `⛈ La Tempesta Imminente di ${this.pn(t.owner)} si abbatte: 3 danni a chi non è in un rifugio!`, t.owner); if (b) yield b;
        for (const p of s.players) {
          if (p.status !== 'alive' || s.over) continue;
          if (AE.tile(p.at).type === 'rifugio') continue;
          yield* this.damage(p.id, 3, { src: t.owner, bypass: true, reason: 'tempesta', area: true });
        }
      }
      // nuvola tossica che scade
      if (s.cloud && s.periodIdx >= s.cloud.until) s.cloud = null;
      // rimozione livello
      if (s.periodIdx >= s.nextRemoval && s.removedLevels < 3) yield* this.removeLevel();
      this.checkOver();
    }
    _addCoins(pid, n) {
      const p = this.s.players[pid];
      p.coins = Math.min(this.rules.coinsMax, p.coins + n);
    }
    *removeLevel() {
      const s = this.s, R = this.rules;
      const lvl = 5 - s.removedLevels;
      s.removedLevels++;
      const gone = [], goneCells = [];
      s.cells.forEach((c, i) => { if (c.tile && AE.CELLS[i].level === lvl) { gone.push(c.tile); goneCells.push(i); s.removedTiles.push(c.tile); c.tile = null; } });
      const next = R.levelDays[s.removedLevels];
      s.nextRemoval = next ? s.periodIdx + next * R.periodsPerDay : 1e9;
      let b = this.say('level', `⬛ Il livello ${lvl} della mappa viene rimosso (${gone.length} tessere).`, null, { tiles: gone.slice(), cells: goneCells, lvl });
      if (b) yield b;
      // gli effetti legati alle tessere rimosse
      s.traps = s.traps.filter((t) => !gone.includes(t.tile)); s.traps.forEach((t) => { t.marks = t.marks.filter((m) => !gone.includes(m)); });
      this.dropLootWhere((l) => gone.includes(l.tile));
      s.tokens = s.tokens.filter((t) => !gone.includes(t.tile));
      for (const g of gone) { delete s.blocks[g]; if (s.crater[g]) s.crater[g] = false; }
      if (s.followers && (gone.includes(s.followers.sun) || gone.includes(s.followers.moon))) {
        if (gone.includes(s.followers.sun)) s.followers.sun = null;
        if (gone.includes(s.followers.moon)) s.followers.moon = null;
      }
      // i giocatori sulle tessere rimosse rientrano subito senza perdere il rientro e senza bottino; i Fastidio escono
      for (const p of s.players) {
        if (!p.at || !gone.includes(p.at)) continue;
        if (p.status === 'ghost') { p.status = 'out'; p.at = null; this.emit('info', `👻 ${this.pn(p.id)} (Fastidio) esce dal gioco con la mappa.`, p.id); continue; }
        if (p.status === 'alive') {
          b = this.say('level', `${this.pn(p.id)} era sulla tessera rimossa: rientra senza bottino né perdere il rientro.`, p.id); if (b) yield b;
          p.at = null;
          const b2 = yield* this.respawn(p.id, { why: 'tessera rimossa', keepGear: true, noCost: true });
          if (b2) yield b2;
        }
      }
      // God_Nocy
      for (const p of s.players) {
        if (p.char === 'godnocy' && p.status === 'alive') {
          const before = p.hp;
          p.hp += 2;
          if (R.godNocyTemp) { if (p.hp > R.healthCap) p.temp.excess = true; } else p.hp = Math.min(R.healthCap, p.hp);
          this.emit('heal', `✨ ${this.pn(p.id)} guadagna 2 PV per la rimozione del livello (${before} → ${p.hp}).`, p.id);
        }
      }
    }

    // ───────────────────────── rientro ─────────────────────────
    // sceglie la tessera di rientro secondo la priorità: Luogo → Rifugio → Vuote → qualsiasi (libere da altri giocatori)
    respawnTile(opts) {
      const s = this.s;
      const occupied = new Set(s.players.filter((p) => this.onMap(p.id)).map((p) => p.at));
      const tiles = s.cells.map((c) => c.tile).filter((t) => t && AE.tile(t).type !== 'insorm' && !occupied.has(t));
      for (const type of ['luogo', 'rifugio', 'vuota']) {
        const c = tiles.filter((t) => AE.tile(t).type === type);
        if (c.length) return c;
      }
      return tiles.length ? tiles : s.cells.map((c) => c.tile).filter((t) => t && AE.tile(t).type !== 'insorm');
    }
    *respawn(pid, o) {
      o = o || {};
      const s = this.s, p = s.players[pid];
      const cands = this.respawnTile(o);
      let tile;
      if (o.choose) {
        const opt = yield* this.choose(pid, 'respawn', 'Scegli la tessera di rientro', cands.map((t) => ({ tile: t, label: `${AE.tile(t).name} (#${t})` })), { force: false });
        tile = opt.tile;
      } else tile = cands[this.randInt(cands.length)];
      p.at = tile; p.status = 'alive'; p.hp = this.rules.hp; p.mana = this.maxMana(pid);
      p.temp = {}; p.shelterRun = 0;
      const b = this.say('respawn', `↩ ${this.pn(pid)} rientra in gioco su ${AE.tile(tile).name} (#${tile}) con ${p.hp} PV e ${p.mana} mana.`, pid, { tile });
      if (p.returned && p.returned.length) {     // il bottino che gli hanno rivenduto
        this.emit('info', `🎒 ${this.pn(pid)} riprende ${p.returned.length} oggetti rivenduti.`, pid);
        while (p.returned.length) yield* this.gainLoot(pid, p.returned.shift());
      }
      return b;
    }
  }
  AE.Game = Game;
  AE.sumCubes = sumCubes;
})(typeof window !== 'undefined' ? window : globalThis);
