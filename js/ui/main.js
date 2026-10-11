/* ARENA EXTINCTIO — interfaccia: avvio, menu, nuova partita, navigazione, PWA. */
(function (root) {
  'use strict';
  const AE = root.AE, UI = AE.UI, { h, $, esc } = UI;
  let session = null;

  UI.startSession = function (cfg) {
    if (session) session.destroy();
    session = new UI.Session(cfg);
    session.mount();
    session.start();
  };
  UI.go = function (name) {
    if (session) { session.destroy(); session = null; }
    $('#nav').innerHTML = '';
    UI.modal.close();
    const nav = $('#nav');
    const add = (t, n) => nav.append(h('button', { class: 'btn small', onclick: () => UI.go(n) }, t));
    if (name !== 'home') add('🏠 Home', 'home');
    add('📖 Regole', 'rules'); add('📊 Simulatore', 'sim');
    ({ home: UI.homeScreen, rules: UI.rulesScreen, sim: UI.simScreen })[name]();
  };

  const LEVELS = [['easy', 'Facile'], ['medium', 'Media'], ['hard', 'Difficile']];
  const RULE_FIELDS = [
    ['hp', 'Punti vita iniziali'], ['mana', 'Slot mana'], ['coinsMax', 'Monete massime'], ['cubeMax', 'Cubetti max per tipo'], ['ultiMana', 'Costo Ulti (mana)'],
    ['killCoins', 'Monete per eliminazione'], ['luogoCoins', 'Monete su Luogo'], ['rifugioCoins', 'Monete su Rifugio'], ['trapHp', 'PV della trappola/torretta'], ['turretDmg', 'Danni della torretta'], ['punchDamage', 'Danno del pugno'],
  ];
  UI.RULE_FIELDS = RULE_FIELDS;

  UI.homeScreen = function () {
    const el = $('#screen'); el.innerHTML = '';
    const save = UI.loadSave();
    const state = { n: 3, seats: [], seed: String(Math.floor(Math.random() * 1e6)), rules: {}, levelDays: AE.DEFAULT_RULES.levelDays.slice() };
    const mkSeat = (i) => ({ kind: i === 0 ? 'human' : 'ai', level: 'medium', char: '' });
    for (let i = 0; i < 6; i++) state.seats.push(mkSeat(i));
    const seatsBox = h('div'), charsBox = h('div');
    const draw = () => {
      seatsBox.innerHTML = '';
      for (let i = 0; i < state.n; i++) {
        const st = state.seats[i];
        const kind = h('select', { onchange: (e) => { st.kind = e.target.value; draw(); } }, h('option', { value: 'human', selected: st.kind === 'human' }, '🙂 Umano'), h('option', { value: 'ai', selected: st.kind === 'ai' }, '🤖 AI'));
        const lvl = h('select', { disabled: st.kind === 'human', onchange: (e) => { st.level = e.target.value; } }, ...LEVELS.map(([v, n]) => h('option', { value: v, selected: st.level === v }, n)));
        const ch = h('select', { class: 'c3', onchange: (e) => { st.char = e.target.value; } }, h('option', { value: '' }, '🎲 Personaggio a caso'), ...AE.CHARS.map((c) => h('option', { value: c.id, selected: st.char === c.id }, `${c.n} — ${c.role}`)));
        seatsBox.append(h('div', { class: 'seat' }, h('b', { style: `color:${UI.col(i)}` }, '#' + (i + 1)), kind, lvl, ch));
      }
    };
    const nsel = h('select', { onchange: (e) => { state.n = +e.target.value; draw(); } }, ...[2, 3, 4, 5, 6].map((n) => h('option', { value: n, selected: n === state.n }, n + ' giocatori')));
    const seed = h('input', { type: 'text', value: state.seed, style: 'width:140px', oninput: (e) => { state.seed = e.target.value; } });
    const rulesBox = h('details', {}, h('summary', {}, '⚙ Parametri delle regole (per gli esperimenti)'), h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(230px,1fr));margin-top:8px' },
      ...RULE_FIELDS.map(([k, n]) => h('label', {}, h('span', { style: 'flex:1' }, n), h('input', { type: 'number', value: AE.DEFAULT_RULES[k], style: 'width:80px', oninput: (e) => { state.rules[k] = +e.target.value; } }))),
      ...[0, 1, 2].map((i) => h('label', {}, h('span', { style: 'flex:1' }, `Giornate prima di togliere il livello ${5 - i}`), h('input', { type: 'number', min: 1, value: state.levelDays[i], style: 'width:80px', oninput: (e) => { state.levelDays[i] = +e.target.value; } })))));
    const play = (preset) => {
      const seats = state.seats.slice(0, state.n).map((s, i) => Object.assign({}, s));
      if (preset === 'watch') seats.forEach((s) => { s.kind = 'ai'; });
      if (preset === 'vs') seats.forEach((s, i) => { s.kind = i === 0 ? 'human' : 'ai'; });
      const rules = Object.assign({}, state.rules); rules.levelDays = state.levelDays.slice();
      const players = seats.map((s, i) => ({ name: s.kind === 'human' ? 'Tu' : `AI ${i + 1}`, kind: s.kind, level: s.level, char: s.char || undefined }));
      // personaggi: i fissi non si ripetono
      const used = new Set(); for (const p of players) if (p.char) { if (used.has(p.char)) { UI.toast('Personaggio ripetuto: sceglierne di diversi'); return; } used.add(p.char); }
      UI.clearSave();
      UI.startSession({ seed: state.seed, players, rules, speed: preset === 'watch' ? 'normal' : 'manual' });
    };
    el.append(
      h('div', { class: 'row' }, h('img', { src: 'assets/logo.webp', style: 'height:120px;max-width:100%', alt: 'Arena Extinctio' })),
      h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fit,minmax(320px,1fr))' },
        h('div', { class: 'card' }, h('h3', {}, 'Nuova partita'), h('div', { class: 'row' }, nsel, h('label', {}, 'Seed', seed)), h('div', { class: 'small dim' }, 'Il posto #1 è l’umano (se lo imposti), gli altri sono AI. Con il seed puoi rigiocare la stessa partita.'), seatsBox, rulesBox,
          h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn primary', onclick: () => play('vs') }, '▶ Gioca contro l’AI'), h('button', { class: 'btn', onclick: () => play('watch') }, '🍿 AI contro AI (da guardare)'), h('button', { class: 'btn', onclick: () => play('custom') }, 'Parti con i posti scelti'))),
        h('div', { class: 'card' }, h('h3', {}, 'Riprendi'), save && !save.finished ? h('div', {}, h('p', {}, `Partita in corso (seed ${save.cfg.seed}, ${save.cfg.players.length} giocatori, ${save.history.length} decisioni).`), h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => UI.startSession(Object.assign({}, save.cfg, { history: save.history, notes: save.notes })) }, '⏯ Riprendi'), h('button', { class: 'btn warn', onclick: () => { UI.clearSave(); UI.homeScreen(); } }, 'Scarta il salvataggio'))) : h('p', { class: 'dim' }, 'Nessuna partita da riprendere. Il salvataggio è automatico.'),
          h('h3', { style: 'margin-top:16px' }, 'Come si gioca'), h('div', { class: 'small' }, 'Essere l’ultimo giocatore in vita. Muoviti con 2D6 (1D6 quando restano solo i livelli 1–2), fermati sulle tessere per raccogliere carte, crafta armi, attacca con la sfida dei dadi e usa Skill e Ulti. La mappa si restringe a ogni giornata.'), h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btn', onclick: () => UI.go('rules') }, '📖 Regolamento completo'), h('button', { class: 'btn', onclick: () => UI.go('sim') }, '📊 Simulatore'))),
        h('div', { class: 'card legend', html: UI.legendHtml() })));
    draw();
  };

  document.addEventListener('DOMContentLoaded', () => {
    UI.go('home');
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => { });
  });
})(typeof window !== 'undefined' ? window : globalThis);
