/* ARENA EXTINCTIO — dati di gioco (carte, tessere, personaggi, parametri di regola).
   Nessuna logica: solo tabelle. Tutto ciò che si può cambiare per fare esperimenti sta in AE.DEFAULT_RULES. */
(function (root) {
  'use strict';
  const AE = (root.AE = root.AE || {});

  // ───────────── geometria esagonale (esagoni "a piatto in alto": vertici a sinistra e a destra) ─────────────
  // direzioni: 0=N 1=NE 2=SE 3=S 4=SW 5=NW ; coordinate assiali (q, r)
  AE.DIRS = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
  AE.DIR_NAMES = ['N', 'NE', 'SE', 'S', 'SW', 'NO'];
  AE.RADIUS = 4;                                   // 61 caselle: 1+6+12+18+24
  AE.hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  AE.levelOf = (c) => Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r)) + 1;   // 1 = centro … 5 = anello esterno

  // ───────────── risorse ─────────────
  AE.RES = { V: { n: 'Vetro Cristallizzato', s: 'Vetro', i: '❄' }, U: { n: 'Uranio Impoverito', s: 'Uranio', i: '☢' }, M: { n: 'Minerale Nucleare', s: 'Minerale', i: '⬡' } };
  AE.RES_KEYS = ['V', 'U', 'M'];

  // ───────────── tessere (numeri stampati sulle immagini) ─────────────
  // tipo: luogo ulti vuota carte tele equip muro rifugio insorm
  AE.TILE_TYPES = {
    luogo: { n: 'Luogo', i: '🏁', d: 'Partenza e rientro. +2 monete a ogni cambio giornata se ci stai sopra.' },
    rifugio: { n: 'Rifugio', i: '🏠', d: 'Nessun attacco né danno dagli altri. +1 moneta a ogni cambio giornata se ci stai sopra.' },
    equip: { n: 'Equipaggiamento', i: '⚙', d: 'Fermandoti: arma base raffigurata, munizioni al massimo, +2 PV se c’è il medikit.' },
    carte: { n: 'Carte', i: '🃏', d: 'Fermandoti (gratis): peschi 2 carte coperte a scelta di mazzo OPPURE 1 carta dal display.' },
    ulti: { n: 'Ulti', i: '⚡', d: 'Solo il proprietario ci raccoglie la sua Ulti (fermandosi).' },
    tele: { n: 'Teletrasporto', i: '🌀', d: 'Passandoci ti teletrasporti (obbligatorio) su un portale compatibile; il passo conta una volta sola.' },
    muro: { n: 'Muro', i: '🧱', d: 'Muri sui lati: non si passa né si tira attraverso.' },
    vuota: { n: 'Vuota', i: '🌿', d: 'Nessuna interazione.' },
    insorm: { n: 'Insormontabile', i: '🏔️', d: 'Non si può attraversare né da personaggi né da proiettili.' },
  };
  // muri: lati (0=N 1=NE 2=SE 3=S 4=SO 5=NO) nella posizione stampata
  const WALLS = { 46: [1, 2, 3], 47: [1, 2, 3], 48: [1, 2, 3], 49: [1, 2], 50: [5, 1], 51: [5, 3], 52: [3] };
  // tessere Equipaggiamento: arma base raffigurata, munizioni, medikit
  const EQUIP = { 37: ['mitra', 1, 0], 38: ['mitra', 1, 0], 39: ['mitra', 1, 0], 40: ['pistola', 1, 0], 41: ['pistola', 1, 0], 42: [null, 1, 1], 43: [null, 1, 1], 44: [null, 1, 1], 45: ['both', 1, 1] };
  const PLACES = { 1: 'Parco Miralfiore, Pesaro', 2: 'Collina Mishennaya, Petropavlovsk', 3: 'Karijini Park, Australia', 4: 'Orono Bog, Maine', 5: 'Jang Bogo, Antartide', 6: 'Monte Luvili, Angola' };
  const SHELTER = { 53: 'Container', 54: 'Tenda a cupola', 55: 'Scuolabus', 56: 'Aereo', 57: 'Tenda' };
  const WILD = { 58: 'Mare', 59: 'Montagna', 60: 'Fiume', 61: 'Deserto' };
  AE.TILES = [];
  for (let id = 1; id <= 61; id++) {
    const t = { id, img: `assets/tiles/t${String(id).padStart(2, '0')}.webp` };
    if (id <= 6) { t.type = 'luogo'; t.owner = id - 1; t.name = PLACES[id]; }
    else if (id <= 12) { t.type = 'ulti'; t.owner = id - 7; t.name = `Ulti ${id - 6}`; }
    else if (id <= 19) { t.type = 'vuota'; t.name = 'Vuota'; }
    else if (id <= 31) { t.type = 'carte'; t.name = 'Carte'; }
    else if (id <= 36) { t.type = 'tele'; t.portal = id <= 33 ? 'A' : id <= 35 ? 'B' : 'D'; t.name = t.portal === 'D' ? 'Portale doppio' : `Portale ${t.portal}`; }
    else if (id <= 45) { t.type = 'equip'; const e = EQUIP[id]; t.weapon = e[0]; t.ammo = !!e[1]; t.heal = !!e[2]; t.name = 'Equipaggiamento'; }
    else if (id <= 52) { t.type = 'muro'; t.walls = WALLS[id]; t.name = 'Muro'; }
    else if (id <= 57) { t.type = 'rifugio'; t.name = SHELTER[id]; }
    else { t.type = 'insorm'; t.name = WILD[id]; }
    AE.TILES.push(t);
  }
  AE.tile = (id) => AE.TILES[id - 1];

  // ───────────── armi, armature, mod ─────────────
  // slot: primary | secondary | melee ; tier: base | std | adv ; cost = risorse per il crafting (come stampato sulle carte)
  AE.WEAPONS = {
    xas: { n: 'Xas', slot: 'secondary', tier: 'base', kind: 'Pistola', git: 1, dan: 1, mun: 1, fal: 0, cost: {}, copies: 3, deck: 'base' },
    foolshift: { n: 'Foolshift', slot: 'primary', tier: 'base', kind: 'Mitra', git: 2, dan: 1, mun: 2, fal: 0, cost: {}, copies: 3, deck: 'base' },
    ourban: { n: 'Ourban', slot: 'melee', tier: 'std', kind: 'Corpo a corpo', git: 0, dan: 2, mun: 2, fal: 1, cost: { V: 2 }, copies: 6, deck: 'proj' },
    softlyne: { n: 'Softlyne', slot: 'secondary', tier: 'std', kind: 'Pistola', git: 1, dan: 1, mun: 3, fal: 0, cost: { U: 1 }, copies: 5, deck: 'proj' },
    cratter: { n: 'Cratter', slot: 'primary', tier: 'std', kind: 'Mitra', git: 2, dan: 2, mun: 2, fal: 0, cost: { V: 1, U: 1 }, copies: 4, deck: 'proj' },
    tua: { n: 'Tua', slot: 'primary', tier: 'std', kind: 'Fucile a pompa', git: 1, dan: 3, mun: 2, fal: 0, cost: { V: 1, M: 1 }, copies: 3, deck: 'proj' },
    elindea: { n: 'Elindea', slot: 'primary', tier: 'std', kind: 'Cecchino', git: 4, dan: 4, mun: 1, fal: 0, cost: { U: 1, M: 1 }, copies: 3, deck: 'proj' },
    here: { n: 'Here', slot: 'melee', tier: 'adv', kind: 'Corpo a corpo', git: 0, dan: 5, mun: 3, fal: 2, cost: { V: 2, U: 1 }, copies: 4, deck: 'proj' },
    clone: { n: 'Clone Y-O', slot: 'secondary', tier: 'adv', kind: 'Pistola', git: 1, dan: 2, mun: 3, fal: 0, cost: { U: 2 }, copies: 5, deck: 'proj' },
    ujsutom: { n: 'U-J Sutom', slot: 'primary', tier: 'adv', kind: 'Fucile a pompa', git: 1, dan: 5, mun: 2, fal: 0, cost: { V: 1, U: 1, M: 1 }, copies: 3, deck: 'proj' },
    freemind: { n: 'Freemind', slot: 'primary', tier: 'adv', kind: 'Mitra', git: 3, dan: 3, mun: 3, fal: 0, cost: { U: 1, M: 1 }, copies: 4, deck: 'proj' },
    shapeliar: { n: 'Shape Liar', slot: 'primary', tier: 'adv', kind: 'Cecchino', git: 6, dan: 6, mun: 1, fal: 0, cost: { V: 1, U: 1, M: 2 }, copies: 2, deck: 'proj', pierce: true },
  };
  AE.ARMORS = {
    sunstone: { n: 'Sun Stone', tier: 'std', dif: 1, dur: 2, cost: { V: 1, M: 1 }, copies: 4 },
    abyss: { n: 'The Abyss', tier: 'adv', dif: 2, dur: 2, cost: { V: 1, U: 1, M: 2 }, copies: 3 },
  };
  AE.MODS = {
    mun: { n: 'Mod. Arma +1 munizioni', copies: 5, t: '+1 capienza' },
    dan: { n: 'Mod. Arma +1 danno', copies: 5, t: '+1 danno' },
    git: { n: 'Mod. Arma +1 gittata', copies: 5, t: '+1 gittata' },
  };
  AE.TIER_NAMES = { base: 'Base', std: 'Standard', adv: 'Avanzata' };
  // costo in mana dell'N-esimo attacco di un turno con la STESSA arma (N = 1, 2, 3…)
  AE.attackManaCost = (tier, n, rules) => {
    const r = rules || AE.DEFAULT_RULES;
    const t = r.attackCost[tier];
    return t[0] + t[1] * (n - 1);
  };

  // ───────────── materiali e skill ─────────────
  AE.SKILLS = {
    teletrasporto: { n: 'Teletrasporto Corto', copies: 2, dn: true, t: 'Ti sposti su una tessera a tua scelta entro 2 tessere (di notte 3).' },
    repeat: { n: 'Repeat', copies: 2, dn: false, t: 'Effettui nuovamente un turno completo.' },
    tempo: { n: 'Manipolazione del Tempo', copies: 2, dn: false, t: 'Cambi il periodo: da giorno a notte o viceversa (avanti o indietro sulla Plancia Tempo).' },
    scudo: { n: 'Scudo Solare', copies: 2, dn: true, t: 'Scudo che blocca fino a 3 danni (di notte 2) del primo attacco subito; poi si disattiva.' },
    mira: { n: 'Mira Perfetta', copies: 2, dn: true, t: 'Il prossimo attacco non può essere evitato ma infligge 2 danni in meno (di notte 1).' },
    trappola: { n: 'Trappola Rallentante', copies: 2, dn: false, t: 'La piazzi sulla tua tessera: chi tocca una tessera adiacente si ferma e non può attaccare.' },
    torretta: { n: 'Torretta di Sorveglianza', copies: 2, dn: false, t: 'La piazzi sulla tua tessera: chi tocca una tessera adiacente subisce 2 danni.' },
    colpo: { n: 'Colpo Distruttivo', copies: 2, dn: true, t: 'Granata entro 3 tessere: 2 danni infallibili a chi è su quella tessera e su 2 adiacenti a scelta. Di giorno elude ogni difesa.' },
    tempesta: { n: 'Tempesta Imminente', copies: 2, dn: false, t: 'Entro un giorno (2 cambi giornata) chi non è in un rifugio subisce 3 danni (ogni difesa bypassata).' },
    munizioni: { n: 'Munizioni Farlocche', copies: 2, dn: false, t: 'Tutti gli altri perdono 1 munizione dell’arma principale (o secondaria in sua assenza).' },
    sindaco: { n: 'Sindaco', copies: 2, dn: true, t: 'Sostituisci una tessera con una di un livello eliminato, oppure ripristini un’Ulti. Di notte puoi farlo due volte.' },
    fabbro: { n: 'Fabbro Amico', copies: 2, dn: true, t: 'Sconto di 1 risorsa tra Vetro e Uranio nel prossimo crafting. Di giorno anche il Minerale.' },
    ladro: { n: 'Ladro di Periferia', copies: 2, dn: true, t: 'Rubi a un avversario 1 cubetto di Vetro o Uranio. Di notte una qualsiasi risorsa di crafting.' },
    risucchio: { n: 'Risucchio di Energia', copies: 2, dn: true, t: 'Di giorno ogni avversario consuma 2 mana; di notte 1.' },
  };
  // carte speciali (colore Skill)
  AE.SPECIALS = {
    vantaggio: { n: 'Vantaggio', copies: 5, free: true, t: 'Attacchi con vantaggio in un combattimento a scelta. Gratis.' },
    svantaggio: { n: 'Svantaggio', copies: 5, malus: true, t: 'MALUS: ti difendi (o attacchi) con svantaggio nel prossimo combattimento.' },
    mina: { n: 'Mina Esplosiva', copies: 5, malus: true, t: 'MALUS: calpesti una mina e subisci subito 2 danni.' },
    zaino: { n: 'Zaino', copies: 2, perm: true, t: '+2 slot per ogni risorsa e +1 slot per i progetti di ogni tipo di arma, finché lo possiedi.' },
    sfera: { n: 'Sfera di Energia', copies: 2, perm: true, t: '+1 slot mana (massimo 5) finché la possiedi.' },
  };
  AE.MATERIALS = {
    V: { n: 'Vetro Cristallizzato', copies: 20, t: 'Ti dà 2 cubetti di Vetro Cristallizzato.' },
    U: { n: 'Uranio Impoverito', copies: 20, t: 'Ti dà 2 cubetti di Uranio Impoverito.' },
    M: { n: 'Minerale Nucleare', copies: 10, t: 'Ti dà 2 cubetti di Minerale Nucleare.' },
    food: { n: 'Cibo', copies: 15, heal: 1, t: '+1 PV.' },
    medikit: { n: 'Medikit', copies: 10, heal: 3, t: '+3 PV.' },
  };
  // id carta → file immagine
  AE.CARD_IMG = (id) => {
    const m = { 'mat:V': 'vetro', 'mat:U': 'uranio', 'mat:M': 'minerale', 'mat:food': 'cibo', 'mat:medikit': 'medikit' };
    if (m[id]) return `assets/cards/${m[id]}.webp`;
    const [k, x] = id.split(':');
    if (k === 'sk' || k === 'sp') return `assets/cards/${x}.webp`;
    if (k === 'w') return `assets/cards/${x}.webp`;
    if (k === 'ar') return `assets/cards/${x}.webp`;
    if (k === 'mod') return `assets/cards/mod_${x}.webp`;
    return `assets/cards/${x}.webp`;
  };
  AE.CARD_BACK = { mat: 'assets/cards/back_materiali.webp', skill: 'assets/cards/back_skill.webp', proj: 'assets/cards/back_armi.webp', base: 'assets/cards/back_armi.webp', char: 'assets/cards/back_v2.webp' };
  AE.cardName = (id) => {
    const [k, x] = id.split(':');
    if (k === 'mat') return AE.MATERIALS[x].n;
    if (k === 'sk') return AE.SKILLS[x].n;
    if (k === 'sp') return AE.SPECIALS[x].n;
    if (k === 'w') return AE.WEAPONS[x].n;
    if (k === 'ar') return AE.ARMORS[x].n;
    if (k === 'mod') return AE.MODS[x].n;
    return id;
  };
  AE.cardText = (id) => {
    const [k, x] = id.split(':');
    if (k === 'mat') return AE.MATERIALS[x].t;
    if (k === 'sk') return AE.SKILLS[x].t;
    if (k === 'sp') return AE.SPECIALS[x].t;
    if (k === 'mod') return AE.MODS[x].t;
    if (k === 'w') { const w = AE.WEAPONS[x]; return `${w.kind} ${AE.TIER_NAMES[w.tier]} · gittata ${w.git} · danno ${w.dan} · munizioni ${w.mun}` + (w.fal ? ` · se perdi subisci ${w.fal}` : ''); }
    if (k === 'ar') { const a = AE.ARMORS[x]; return `Armatura ${AE.TIER_NAMES[a.tier]} · assorbe ${a.dif} · dura ${a.dur} attacchi`; }
    return '';
  };

  // ───────────── personaggi ─────────────
  AE.CHARS = [
    { id: 'godnocy', n: 'God_Nocy', role: 'Guerriero', passive: 'Guadagna 2 vita a ogni rimozione di livello (anche in eccesso, non permanente).', ulti: 'Onda: 2 danni infallibili agli avversari vicini e li spinge indietro; chi finisce contro un muro/bordo subisce 1 danno in più. Blocca il periodo giorno/notte anche per il turno successivo.' },
    { id: 'hatci', n: 'Hatci', role: 'Demolitore', passive: 'Armi base e standard +1 danno. Se il corpo a corpo fallisce subisci 1 danno in più.', ulti: 'Missile: di notte 5 danni sicuri all’avversario. Di giorno devi vincere la sfida dei dadi: se fallisci non perdi l’Ulti ma consumi comunque i mana.' },
    { id: 'karou', n: 'Karou', role: 'Cecchino', passive: 'Armi base e standard (no corpo a corpo) +1 gittata.', ulti: 'Di giorno gittata infinita + vantaggio + 1 mana in meno su ogni arma non corpo a corpo; di notte gittata infinita e a scelta vantaggio OPPURE 1 mana in meno. Fino a fine turno.' },
    { id: 'kone', n: 'Kone', role: 'Evocatore', passive: 'Se subisce un colpo da 4 o più danni, ne riflette 1 sull’attaccante.', ulti: 'Evoca Sun e Moon su due tessere a scelta: gli altri non le possono attraversare. Di giorno è attivo Sun, di notte Moon.' },
    { id: 'lasep', n: 'Lasep', role: 'Assassina', passive: 'Con armi base o standard attacca sempre con vantaggio.', ulti: 'Pioggia acida: di giorno 3 danni a tutti tranne a chi è in un rifugio; di notte 1 danno a tutti.' },
    { id: 'miaika', n: 'Mia Ika', role: 'Costruttrice', passive: 'Ogni arma base e standard ha 1 munizione in più.', ulti: 'Rientro in gioco con tutto l’equipaggiamento. Di giorno su una tessera di respawn casuale, di notte la scegli. Recupera sempre il loot. Se ha un rientro lo consuma, altrimenti rientra comunque.' },
    { id: 'nganga', n: '’Nganga', role: 'Difensore', passive: 'Non subisce danni né rallentamenti da trappole e torrette.', ulti: 'Difesa reattiva: di giorno, se vinci la sfida ti difendi fino a 5 danni, se la perdi l’avversario subisce 2 danni; di notte, se vinci ti difendi fino a 3 danni.' },
    { id: 'ricca', n: 'Ricca Gigaduca', role: 'Guaritore', passive: 'Quando recupera vita con un medikit guadagna 1 PV extra (senza eccesso).', ulti: 'Di giorno cura metà dei PV mancanti, di notte li cura completamente.' },
    { id: 'sejhnam', n: 'Sejhnam', role: 'Mago', passive: 'Sconto di 1 risorsa tra Vetro Cristallizzato e Uranio Impoverito nel crafting.', ulti: 'Nuvola tossica: 2 danni a chiunque sia dentro. Se attivata di giorno rimane anche di notte.' },
    { id: 'soshito', n: 'Soshito', role: 'Infiltratore', passive: 'Si difende sempre con vantaggio contro armi base o standard.', ulti: 'Di giorno, nel prossimo turno degli avversari possono solo muoversi. Di notte tutti gli avversari saltano un turno.' },
  ];
  AE.CHAR_IDX = {}; AE.CHARS.forEach((c, i) => { AE.CHAR_IDX[c.id] = i; });
  AE.PLAYER_COLORS = ['#ff4d6d', '#35c9ff', '#ffd23f', '#8cff66', '#c77dff', '#ff9a3c'];

  // ───────────── parametri di regola (tutti modificabili per gli esperimenti) ─────────────
  AE.DEFAULT_RULES = {
    hp: 10, mana: 4, manaSfera: 5, coinsMax: 10, cubeMax: 6, cubesPerCard: 2,
    startCoins: 0,
    healthCap: 10,
    // Plancia Tempo: giornate (= 2 turni di tutti: giorno + notte) prima di togliere l'anello 5, poi 4, poi 3
    levelDays: [5, 4, 3], periodsPerDay: 2,
    // rientri in base al numero di giocatori: [per giocatore (di diritto), totali sulla mappa (da raccogliere), max a giocatore]
    reentries: { 2: { each: 2, tokens: 0 }, 3: { each: 1, tokens: 0 }, 4: { each: 0, tokens: 2, max: 1 }, 5: { each: 0, tokens: 1, max: 1 }, 6: { each: 0, tokens: 0, max: 0 } },
    // mana per l'N-esimo attacco con la stessa arma nel turno: [primo, incremento]
    attackCost: { base: [0, 1], std: [1, 2], adv: [1, 3] },
    ultiMana: 3, craftMana: 1, skillMana: 1, buyMana: 1, healMana: 1,
    price: { mat: [2, 3], proj: [2, 3], skill: [3, 4] },   // [dal mazzo coperto, dal display]
    ammoPrice: 2, hpPrice: 3,
    killCoins: 3, killMinCoins: 2, luogoCoins: 2, rifugioCoins: 1, discardCoin: 1,
    trapHp: 4, turretDmg: 2,
    inv: { skill: 2, special: 2, heal: 2, project: 1 },
    skillStealOnKill: 1,
    punchDamage: 1, punchFail: 1,
    maxRounds: 400,
    // interpretazioni (vedi docs/REGOLAMENTO.md)
    godNocyTemp: true, godNocyRange: 2,
  };
  AE.AI_LEVELS = ['easy', 'medium', 'hard'];
  AE.LEVEL_NAMES = { easy: 'Facile', medium: 'Media', hard: 'Difficile' };
})(typeof window !== 'undefined' ? window : globalThis);
