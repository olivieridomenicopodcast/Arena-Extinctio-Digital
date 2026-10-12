/* ARENA EXTINCTIO — interfaccia: sessione di gioco (contro l'AI, AI contro AI, riprendi, rivedi). */
(function (root) {
  'use strict';
  const AE = root.AE, UI = AE.UI;
  const { h, $, esc, icon } = UI;
  const SAVE_KEY = 'ae-save-v1';
  const ALWAYS_CLICK = ['turn', 'period', 'level', 'start', 'end', 'kill', 'respawn'];
  const SPEEDS = { manual: 0, slow: 1200, normal: 500, fast: 100, instant: -1 };
  const SPEED_NAMES = { manual: 'Manuale (clic)', slow: 'Lento', normal: 'Normale', fast: 'Veloce', instant: 'Istantaneo' };
  UI.SPEED_NAMES = SPEED_NAMES;

  UI.loadSave = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } };
  UI.clearSave = () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } };
  // partita in rete: il tavolo salva da sé (chiave a parte: la ripresa locale non cambia)
  const NET_SAVE_KEY = 'ae-netsave-v1';
  UI.loadNetSave = () => { try { const s = JSON.parse(localStorage.getItem(NET_SAVE_KEY)); return s && s.players ? s : null; } catch (e) { return null; } };
  UI.clearNetSave = () => { try { localStorage.removeItem(NET_SAVE_KEY); } catch (e) { } };

  // ─────────────────────────────────────────────────────────────
  class Session {
    // cfg: { seed, players:[{name,kind,level,char}], rules, speed, review, history, notes }
    constructor(cfg) {
      this.cfg = cfg;
      this.mode = cfg.players.some((p) => p.kind === 'human') ? 'play' : 'watch';
      this.speed = cfg.speed || (this.mode === 'play' ? 'manual' : 'normal');
      this.notes = (cfg.notes || []).slice();
      this.skipping = false; this.tab = 'players'; this.view = Math.max(0, cfg.players.findIndex((p) => p.kind === 'human'));
      this.aborted = false; this.tick = 0; this.hintOn = false; this.sel = null; this.path = null; this.hintCell = null;
      const replay = cfg.history ? cfg.history.slice() : [];
      this.net = cfg.net || null;                         // partita in rete: { role: 'host'|'guest', ... } (vedi js/ui/net.js)
      this.isGuest = !!(this.net && this.net.role === 'guest');
      this.game = new AE.Game({ seed: cfg.seed, players: cfg.players, rules: cfg.rules, beats: true, replay, resume: cfg.resume, keepSnaps: !cfg.review && !this.isGuest });
      if (this.isGuest) { this.mode = 'play'; this.view = cfg.mySeat; this.speed = cfg.speed || 'normal'; this.evSeen = 0; }
      else if (this.net) { this.view = cfg.mySeat; this.aiTakeover = {}; }
      this.game.onEvent = (ev) => this.onEvent(ev);
      this.ais = cfg.players.map((p, i) => (p.kind === 'human' ? null : AE.AI.create(p.level || 'medium', `${cfg.seed}:${i}`)));
      if (this.net && !this.isGuest) this.setupHostNet();
      this.hintAI = AE.AI.create('hard', 'hint:' + cfg.seed);
      this.keyHandler = (e) => { if ((e.key === ' ' || e.key === 'Enter') && this.beatResolve && !UI.$('#modalBg').style.display.includes('flex')) { e.preventDefault(); this.advance(); } };
    }

    mount() {
      const el = $('#screen'); el.innerHTML = '';
      el.append(h('div', { id: 'game' },
        h('aside', { id: 'legendCol', class: 'card legend', html: UI.legendHtml() }),
        h('section', { id: 'center' },
          h('div', { id: 'status', class: 'card' }),
          h('div', { id: 'bannerSlot' }, h('div', { id: 'banner' })),
          h('div', { id: 'boardWrap' }, (() => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.id = 'board'; return s; })())),
        h('aside', { id: 'sidebar' }, h('div', { id: 'actionPanel', class: 'card' }), h('div', { class: 'tabs', id: 'tabs' }), h('div', { class: 'pane', id: 'pane' }))));
      this.renderTabs();
      document.addEventListener('keydown', this.keyHandler);
      $('#banner').addEventListener('click', () => this.advance());
      $('#board').addEventListener('click', (e) => { const g = e.target.closest('[data-ci]'); if (g && this.onCell) this.onCell(+g.dataset.ci); });
      $('#board').addEventListener('mousemove', (e) => { const g = e.target.closest('[data-ci]'); if (g && this.onHover) this.onHover(+g.dataset.ci); });
      this.renderNav();
      this.refresh();
    }
    destroy() { this.aborted = true; if (this.net) { UI.net.releaseAwake(); this.net.close(); } document.removeEventListener('keydown', this.keyHandler); if (this.beatResolve) this.advance(); if (this.choiceResolve) this.choiceResolve(0); }

    renderNav() {
      const nav = $('#nav'); nav.innerHTML = '';
      const add = (t, fn, cls) => nav.append(h('button', { class: 'btn small ' + (cls || ''), onclick: fn }, t));
      add('☰ Menu', () => UI.go('home'));
      if (this.mode === 'play' && !this.cfg.review) add('⏭ Salta fino alla mia mossa', () => { this.skipping = true; if (this.beatResolve) this.advance(); });
      const sel = h('select', { title: 'Velocità dei messaggi', onchange: (e) => { this.speed = e.target.value; if (this.beatResolve && this.speed === 'instant') this.advance(); } });
      for (const k in SPEED_NAMES) sel.append(h('option', { value: k, selected: k === this.speed }, '⏱ ' + SPEED_NAMES[k]));
      nav.append(sel);
      if (this.net) { const on = this.isGuest ? '' : ' · ' + (Object.keys(this.net.pidGuest).filter((k) => this.net.isOnline(+k)).length) + '/' + Object.keys(this.net.pidGuest).length + ' amici online'; nav.append(h('span', { class: 'pill', title: 'Codice della stanza' }, '🌐 ' + this.net.code + on)); }
      if (this.net && !this.isGuest && !this.cfg.review) add('🚪 Abbandona la partita', () => this.abandonDialog());
      add('📖 Regole', () => UI.rulesModal());
      add('💾 Esporta cronaca', () => this.exportLog());
    }

    // ───────────── log ─────────────
    onEvent(ev) { this.lastEv = ev; if (this.tab === 'log') this.appendLogLine(ev); }
    appendLogLine(ev) { const pane = $('#pane'); const box = $('.log', pane); if (!box) return; box.append(this.logLine(ev)); box.parentElement.scrollTop = box.parentElement.scrollHeight; }
    logLine(ev) { const d = h('div', { class: 't-' + ev.k }, `[${ev.r}${ev.per === 'day' ? '☀' : '🌙'}] ${ev.text}`); return d; }
    exportLog() {
      const g = this.game;
      const txt = g.events.map((e) => `[round ${e.r} ${e.per === 'day' ? 'giorno' : 'notte'}] ${e.text}`).join('\n') + (this.notes.length ? '\n\n--- Note di playtest ---\n' + this.notes.map((n) => `[round ${n.r}] ${n.text}`).join('\n') : '');
      UI.download(`arena-extinctio-${this.cfg.seed}.txt`, txt);
      UI.download(`arena-extinctio-${this.cfg.seed}.json`, JSON.stringify({ seed: this.cfg.seed, players: this.cfg.players, rules: this.cfg.rules, history: g.history, result: g.result, notes: this.notes, events: g.events }, null, 1), 'application/json');
    }

    // ───────────── salvataggio ─────────────
    save(finished) {
      if (this.cfg.review) return;
      if (this.net) {            // in rete salva solo il tavolo
        if (this.isGuest) return;
        const g = this.game;
        if (finished || g.s.over) return UI.clearNetSave();
        try { localStorage.setItem(NET_SAVE_KEY, JSON.stringify({ v: 1, build: AE.BUILD, seed: this.cfg.seed, players: this.cfg.players, rules: this.cfg.rules || {}, history: g.history, snap: g.snap || null, mySeat: this.cfg.mySeat, seats: this.cfg.netSeats, code: this.net.code, round: g.s.round, ts: Date.now() })); } catch (e) { /* spazio finito o salvataggio non disponibile */ }
        return;
      }
      try { localStorage.setItem(SAVE_KEY, JSON.stringify({ cfg: { seed: this.cfg.seed, players: this.cfg.players, rules: this.cfg.rules, speed: this.speed }, history: this.game.history, build: AE.BUILD, snap: this.game.snap || null, notes: this.notes, finished: !!finished, ts: Date.now() })); } catch (e) { }
    }

    // ───────────── ciclo principale ─────────────
    async start() {
      if (this.isGuest) return this.guestLoop();
      const g = this.game, gen = g.run();
      let r = gen.next();
      while (!r.done) {
        if (this.aborted) return;
        if (!this.readyFired && !g.replay.length) { this.readyFired = true; if (this.cfg.onReady) this.cfg.onReady(this); }   // la ripresa è arrivata al punto salvato
        const d = r.value;
        if (d.type === 'beat') { await this.showBeat(d.ev); r = gen.next(); continue; }
        const p = g.s.players[d.pid];
        let ans;
        if (p.kind === 'human' && !g.replay.length && this.net && this.net.isRemote(d.pid) && !this.aiTakeover[d.pid]) {   // un amico su un altro dispositivo
          this.refresh(); ans = await this.net.ask(d.pid, d);
          if (ans == null) ans = this.ais[d.pid] ? this.ais[d.pid].decide(g, d) : 0;
        }
        else if (p.kind === 'human' && !g.replay.length && !this.aiTakeover?.[d.pid]) { this.skipping = false; this.refresh(d); ans = await this.humanDecision(d); }
        else { if (this.speed !== 'instant' && !g.replay.length) { this.refresh(); await UI.sleep(this.speed === 'fast' ? 40 : 120); } ans = this.ais[d.pid] ? this.ais[d.pid].decide(g, d) : 0; }
        if (this.aborted) return;
        this.hintCell = null;
        r = gen.next(ans);
        if (!g.replay.length) this.save(false);
        if (this.speed === 'instant' && ++this.tick % 150 === 0) await UI.sleep(0);
      }
      this.refresh();
      this.save(true);
      if (this.net) this.net.broadcast({ t: 'end' });
      this.endScreen();
    }

    async showBeat(ev) {
      const g = this.game, A = UI.anim;
      const skip = () => { A.takeMoves(); };
      if (this.net && !this.isGuest && !g.replay.length) this.net.broadcast({ t: 'beat', ev });   // durante la ripresa non si mandano le mosse già fatte
      if (this.isGuest && this.net.q.length && ev.k !== 'end') return skip();        // sono indietro: salto i messaggi
      if (g.replay.length && !this.cfg.review) return skip();           // ripresa: niente messaggi
      const always = ALWAYS_CLICK.includes(ev.k);
      if (this.skipping && !(ev.k === 'end')) { if (this.mode === 'play') return skip(); }
      if (this.speed === 'instant' && !always) return skip();
      if (this.speed === 'instant' && this.mode === 'watch' && ev.k !== 'end') return skip();
      A.speed = this.speed;
      this.refresh(null, ev);
      const st = A.takeMoves();
      const b = $('#banner'), d = ev.d || {};
      b.className = ev.per === 'night' ? 'night' : 'day'; if (['period', 'level', 'end', 'kill'].includes(ev.k)) b.classList.add('big');
      b.innerHTML = `<div class="msg">${esc(ev.text)}</div><div class="hint"><span>${ev.k === 'turn' || ev.k === 'period' || ev.k === 'level' ? 'Cambio di turno/fase: serve il tuo clic.' : ''}</span><span><button class="btn small primary">Avanti ▶</button> <span class="kbd">Spazio</span> <span class="kbd">Invio</span></span></div>`;
      const groups = this.diceGroups(ev);
      if (groups.length) {
        const box = h('div', { class: 'dicebox' }); box._groups = groups; groups.forEach((x) => box.append(x.el));
        if (ev.k === 'attack' && d.ra) box.append(h('div', { class: 'verdict ' + (d.win ? 'hit' : 'miss') }, d.win ? '💥 COLPITO!' : '🛡 MANCATO'));
        b.querySelector('.msg').after(box);
      }
      if (['gain', 'mina', 'malus'].includes(ev.k) && d.card && !String(d.card).startsWith('cube:')) { const im = UI.cardImg(String(d.card)); if (im && im.tagName === 'IMG') { im.classList.add('gaincard'); im.dataset.back = AE.CARD_BACK[g.deckOfCard(d.card)] || ''; b.querySelector('.msg').after(im); } }
      b.style.display = 'block';
      // sul telefono la pagina può essere scrollata sul pannello azioni: riporta in vista il messaggio di quello che è appena successo
      try { const r = b.getBoundingClientRect(); if (r.top < 0 || r.bottom > (window.innerHeight || 0)) b.scrollIntoView({ block: 'center', behavior: this.speed === 'instant' ? 'auto' : 'smooth' }); } catch (e) { /* ok */ }
      const ap = A.playBeat($('#board'), ev, st, b);
      const auto = SPEEDS[this.speed];
      await new Promise((res) => {
        this.beatResolve = res;
        ap.then(() => {
          if (this.beatResolve !== res) return;
          if (auto > 0 && !always) this.beatTimer = setTimeout(() => this.advance(), auto);
          else if (auto > 0 && always && this.mode === 'watch') this.beatTimer = setTimeout(() => this.advance(), auto * 1.2);
        });
      });
      b.style.display = 'none';
    }
    // gruppi di dadi da mostrare per un messaggio (tiro di movimento o sfida di attacco)
    diceGroups(ev) {
      const d = ev.d || {}, g = this.game, A = UI.anim;
      const dropOf = (r) => { if (!r || r.dice.length < 3) return -1; const v = r.mode === 'vantaggio' ? Math.min(...r.dice) : Math.max(...r.dice); return r.dice.indexOf(v); };
      if (ev.k === 'roll' && d.rolls) return [A.diceGroup(g.pn(ev.p) + ' · movimento', d.rolls, -1, d.rolls.reduce((a, c) => a + c, 0))];
      if (ev.k === 'attack' && d.ra && d.rd) return [A.diceGroup('⚔ ' + g.pn(ev.p), d.ra.dice, dropOf(d.ra), d.ra.sum, d.ra.mode), A.diceGroup('🛡 ' + g.pn(d.tgt), d.rd.dice, dropOf(d.rd), d.rd.sum, d.rd.mode)];
      return [];
    }
    advance() { UI.anim.finishAll(); clearTimeout(this.beatTimer); const r = this.beatResolve; this.beatResolve = null; if (r) r(); }

    // ───────────── partita in rete ─────────────
    setupHostNet() {
      const net = this.net, g = this.game;
      net.snapshot = (full) => ({ s: g.s, evs: full ? [] : g.events.slice(-60) });
      net.logSource = () => g.events.slice(-300);
      net.onOffline = (pid, guest) => this.offlineDialog(pid, guest);
      net.onBack = (pid) => { this.offlineOpen = false; UI.toast(`${this.game.s.players[pid].name} è tornato in partita`); UI.modal.close(); this.refresh(); };
      net.onLobby = () => this.renderNav();
      UI.net.keepAwake();
    }
    abandonDialog() {
      UI.modal.open(h('div', {}, h('h3', {}, '🚪 Abbandonare la partita?'), h('p', {}, 'La partita in rete finisce per tutti e il salvataggio viene cancellato. Per uscire senza perderla usa “Menu”: potrai riaprire la stanza dalla home.'),
        h('div', { class: 'row' }, h('button', { class: 'btn warn', onclick: () => { UI.modal.close(); UI.clearNetSave(); UI.go('home'); } }, 'Sì, abbandona e cancella'), h('button', { class: 'btn', onclick: () => UI.modal.close() }, 'Annulla'))));
    }
    offlineDialog(pid, guest) {
      const name = this.game.s.players[pid].name;
      UI.toast(`${name} si è disconnesso`);
      if (this.offlineOpen) return;
      this.offlineOpen = true;
      const close = () => { this.offlineOpen = false; UI.modal.close(); };
      UI.modal.open(h('div', {}, h('h3', {}, `📴 ${name} non è più collegato`), h('p', {}, 'Può rientrare dallo stesso link con lo stesso nome e la partita riprende da dove era. Intanto puoi aspettare, oppure far giocare l’AI al suo posto da ora in poi.'),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: close }, 'Aspetto che torni'), h('button', { class: 'btn warn', onclick: () => { this.aiTakeover[pid] = true; this.ais[pid] = AE.AI.create('medium', `${this.cfg.seed}:${pid}:t`); this.net.cancel(pid); close(); } }, `🤖 L’AI gioca al posto di ${name}`))), { lock: true });
    }
    async guestLoop() {
      const net = this.net, g = this.game;
      net.onLost = () => { if (!this.aborted) this.lostDialog(); };
      UI.net.keepAwake();
      this.refresh();
      while (!this.aborted) {
        const m = await net.next();
        if (this.aborted) return;
        this.applyRemote(m);
        if (m.t === 'beat') { await this.showBeat(m.ev); }
        else if (m.t === 'decide') {
          this.skipping = false; this.refresh(m.d);
          const i = await this.humanDecision(m.d);
          if (this.aborted) return;
          net.send({ t: 'ans', id: m.id, i });
        } else if (m.t === 'end') { this.refresh(); this.endScreen(); return; }
        else if (m.t !== 'log') this.refresh();
      }
    }
    applyRemote(m) {
      const g = this.game;
      if (m.s) g.s = m.s;
      for (const ev of (m.evs || [])) if (ev.i >= g.events.length) { g.events[ev.i] = ev; this.onEvent(ev); }
      if (m.s) g.result = m.s.over ? { winner: m.s.winner, why: '', rounds: m.s.round, turns: m.s.turnNo } : null;
    }
    lostDialog() {
      if (this.lostOpen) return; this.lostOpen = true;
      UI.modal.open(h('div', {}, h('h3', {}, '📴 Collegamento perso'), h('p', {}, 'Il collegamento con il tavolo si è interrotto. Se il tavolo è ancora aperto puoi riconnetterti con lo stesso nome: la partita riprende da dove era.'),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { this.lostOpen = false; UI.modal.close(); UI.rejoin(this.net.code, this.net.name); } }, '🔄 Riconnetti'), h('button', { class: 'btn', onclick: () => { this.lostOpen = false; UI.modal.close(); UI.go('home'); } }, 'Esci'))), { lock: true });
    }

    // ───────────── rendering ─────────────
    refresh(dec, ev) {
      const g = this.game, svg = $('#board'); if (!svg) return;
      const cur = g.s.cur;
      const sel = {};
      if (this.sel) for (const ci in this.sel) sel[ci] = this.sel[ci];
      UI.renderBoard(svg, g, { sel, hint: this.hintCell, cur, path: this.path });
      this.renderStatus();
      this.renderPane();
      if (!this.choiceResolve) $('#actionPanel').innerHTML = this.idleHtml();
    }
    idleHtml() {
      const g = this.game;
      if (this.cfg.review) return '<b>Rivedi la partita:</b> avanza con i messaggi (clic, Spazio o Invio).';
      const cp = g.s.players[g.s.cur];
      if (g.s.over) return '<b>Partita finita.</b>';
      if (this.net && cp && cp.kind === 'human') return `<span class="dim">Tocca a <b>${esc(cp.name)}</b>${cp.id === this.view ? '' : ' (altro dispositivo): aspetta…'}</span>`;
      return '<span class="dim">Sta giocando l’AI… ' + (cp ? esc(cp.name) : '') + '</span>';
    }
    renderStatus() {
      const g = this.game, s = g.s, st = $('#status'); if (!st) return;
      const day = s.period === 'day';
      const bw = $('#boardWrap'); if (bw) { bw.classList.toggle('isday', day); bw.classList.toggle('isnight', !day); }
      const left = s.removedLevels >= 3 ? null : Math.max(0, s.nextRemoval - s.periodIdx);
      const cur = s.players[s.cur];
      st.innerHTML = '';
      [
        h('span', { class: 'pill ' + (day ? 'day' : 'night'), html: `${icon(day ? 'sun' : 'moon', 22)} <b>${day ? 'GIORNO' : 'NOTTE'}</b>` }),
        h('span', { class: 'pill', html: `${icon('time', 20)} Round <b>${s.round}</b>` }),
        h('span', { class: 'pill', title: 'Plancia Tempo', html: left == null ? '⬛ Restano i livelli 1–2 · 1D6' : `⬛ Livello ${5 - s.removedLevels} sparisce tra <b>${left}</b> cambi giornata` }),
        h('span', { class: 'pill', html: `${icon('carte', 20)} Mappa: ${s.cells.filter((c) => c.tile).length} tessere · ${g.mapDice()}D6` }),
        cur && !s.over ? h('span', { class: 'pill', style: `border-color:${UI.col(cur.id)}` }, `Turno: ${cur.name}`) : null,
        s.freeze > 0 ? h('span', { class: 'pill', html: '⏸ Periodo bloccato (God_Nocy)' }) : null,
        ...s.tempests.map((t) => h('span', { class: 'pill', style: 'border-color:#ff9a3c', title: 'Tempesta Imminente: 3 danni a chi non è in un rifugio', html: `⛈ Tempesta di ${esc(s.players[t.owner].name)} tra <b>${Math.max(0, t.at - s.periodIdx)}</b> cambi` })),
        s.cloud && s.periodIdx < s.cloud.until ? h('span', { class: 'pill', style: 'border-color:#8cff66', html: `${icon('cloud', 18)} Nuvola tossica ancora per ${s.cloud.until - s.periodIdx} cambi` }) : null,
        !s.over ? h('span', { class: 'pill', title: 'Il cambio giornata scatta quando finisce il turno dell’ultimo giocatore', html: `🔔 Cambio giornata dopo ${esc(s.players[(s.start + s.n - 1) % s.n].name)}` }) : null].forEach((e) => { if (e) st.append(e); });
    }
    renderTabs() {
      const t = $('#tabs'); t.innerHTML = '';
      for (const [k, n] of [['players', '👥 Giocatori'], ['hand', '🃏 Mano'], ['log', '📜 Cronaca'], ['legend', '❓ Legenda'], ['notes', '📝 Note']]) t.append(h('button', { class: 'tab ' + (this.tab === k ? 'on' : ''), onclick: () => { this.tab = k; this.renderTabs(); this.renderPane(); } }, n));
    }
    renderPane() {
      const pane = $('#pane'); if (!pane) return;
      const g = this.game;
      pane.innerHTML = '';
      if (this.tab === 'players') for (const p of g.s.players) pane.append(this.playerCard(p));
      else if (this.tab === 'hand') pane.append(this.handView());
      else if (this.tab === 'log') { const box = h('div', { class: 'log' }); g.events.slice(-400).forEach((e) => box.append(this.logLine(e))); pane.append(box); pane.scrollTop = pane.scrollHeight; }
      else if (this.tab === 'legend') pane.append(h('div', { class: 'legend', html: UI.legendHtml() }));
      else if (this.tab === 'notes') {
        const ta = h('textarea', { rows: 3, placeholder: 'Scrivi una nota di playtest (finisce nel log esportato)…', style: 'width:100%' });
        pane.append(ta, h('div', { class: 'row', style: 'margin-top:6px' }, h('button', { class: 'btn small', onclick: () => { const v = ta.value.trim(); if (!v) return; this.notes.push({ r: g.s.round, text: v }); g.events.push({ i: g.events.length, t: g.s.turnNo, r: g.s.round, per: g.s.period, k: 'note', p: -1, text: '📝 Nota: ' + v }); ta.value = ''; this.save(false); this.renderPane(); UI.toast('Nota salvata'); } }, 'Aggiungi nota')), h('div', { class: 'small dim', style: 'margin-top:8px' }, this.notes.map((n) => h('div', {}, `[round ${n.r}] ${n.text}`))));
      }
    }
    playerCard(p) {
      const g = this.game, s = g.s, ch = AE.CHARS[AE.CHAR_IDX[p.char]];
      const maxM = g.maxMana(p.id);
      const pips = [...Array(maxM)].map((_, i) => `<i class="pip ${i < p.mana ? '' : 'off'}"></i>`).join('');
      const vis = this.mode === 'watch' || p.id === this.view || this.cfg.review;
      const wp = ['primary', 'secondary', 'melee'].map((sl) => p.weapons[sl] ? `${icon('gun', 16)} ${AE.WEAPONS[p.weapons[sl].id].n} <b>${p.weapons[sl].ammo}</b>${icon('ammo', 14)}${p.weapons[sl].mod ? ' +' + p.weapons[sl].mod : ''}` : '').filter(Boolean).join(' · ');
      const st = p.status === 'alive' ? '' : p.status === 'pending' ? ' · ⏳ in attesa di rientrare' : p.status === 'ghost' ? ' · 👻 Fastidio' : ' · fuori';
      const card = h('div', { class: 'pl ' + (s.cur === p.id && !s.over ? 'cur ' : '') + (p.status === 'alive' ? '' : 'dead'), onclick: () => { this.view = p.id; this.tab = 'hand'; this.renderTabs(); this.renderPane(); } },
        h('img', { class: 'av', src: UI.charImg(p.char), style: `border-color:${UI.col(p.id)}`, alt: ch.n }),
        h('div', {}, h('div', { html: `<b>${esc(p.name)}</b> · ${esc(ch.n)} <span class="mini">(${esc(ch.role)})${p.kind === 'human' ? (this.net ? (p.id === this.view ? ' · tu' : ' · umano') : ' · tu') : ' · ' + AE.LEVEL_NAMES[p.level || 'medium']}${st}</span>` }),
          h('div', { class: 'stats', html: `<span class="stat">${icon('pv', 20)} ${Math.max(0, p.hp)}</span><span class="stat">${icon('mana', 20)} <span class="pips">${pips}</span></span><span class="stat">${icon('coin', 20)} ${p.coins}</span><span class="stat">${icon('V', 18)}${p.cubes.V} ${icon('U', 18)}${p.cubes.U} ${icon('M', 18)}${p.cubes.M}</span>${p.ultiHeld ? `<span class="stat" title="Ulti pronta">${icon('ulti', 20)}</span>` : p.ultiUsed ? '<span class="stat dim" title="Ulti usata">✖</span>' : ''}<span class="stat" title="Rientri">${icon('rientro', 18)} ${p.reentries}</span>` }),
          h('div', { class: 'mini', html: (wp || 'nessuna arma') + (p.armor ? ` · ${icon('armor', 14)} ${AE.ARMORS[p.armor.id].n} (${p.armor.dur})` : '') + (vis ? '' : ` · mano: ${p.skills.length + p.heal.length + p.specials.length + p.projects.length} carte`) })));
      return card;
    }
    handView() {
      const g = this.game, p = g.s.players[this.view] || g.s.players[0], R = g.rules;
      const box = h('div');
      const watch = this.mode === 'watch' && !this.cfg.review;
      const sel = h('select', { onchange: (e) => { this.view = +e.target.value; this.renderPane(); } });
      g.s.players.forEach((q) => { if (this.mode === 'play' && q.kind !== 'human' && !this.cfg.review && false) return; sel.append(h('option', { value: q.id, selected: q.id === p.id }, `${q.name} (${AE.CHARS[AE.CHAR_IDX[q.char]].n})`)); });
      box.append(h('div', { class: 'row' }, h('b', {}, 'Mano di:'), sel));
      const hidden = this.mode === 'play' && p.kind !== 'human';
      const sect = (t) => box.append(h('div', { class: 'sect' }, t));
      const row = (cards, extra) => { if (!cards.length) return; const r = h('div', { class: 'cardrow' }); cards.forEach((c) => r.append(c)); box.append(r); };
      const cb = (id, badge) => h('div', { class: 'cardbox' }, UI.cardImg(id), badge ? h('span', { class: 'badge' }, badge) : null);
      sect('Equipaggiamento');
      const eq = [];
      for (const sl of ['primary', 'secondary', 'melee']) { const w = p.weapons[sl]; if (w) eq.push(cb('w:' + w.id, `${w.ammo}/${g.weaponStats(p.id, sl).cap}${w.mod ? ' +' + w.mod : ''}`)); }
      if (p.armor) eq.push(cb('ar:' + p.armor.id, 'dur ' + p.armor.dur));
      eq.length ? row(eq) : box.append(h('div', { class: 'dim small' }, 'Solo il pugno.'));
      box.append(h('div', { class: 'stats', style: 'margin:8px 0', html: `<span class="stat">${icon('V', 22)} ${p.cubes.V}/${g.capCubes(p.id)}</span><span class="stat">${icon('U', 22)} ${p.cubes.U}/${g.capCubes(p.id)}</span><span class="stat">${icon('M', 22)} ${p.cubes.M}/${g.capCubes(p.id)}</span><span class="stat">${icon('coin', 22)} ${p.coins}/${R.coinsMax}</span>` }));
      if (hidden) { box.append(h('div', { class: 'dim small' }, `Carte in mano nascoste: ${p.heal.length} materiali di cura, ${p.skills.length} Skill, ${p.specials.length} speciali, ${p.projects.length} progetti.`)); }
      else {
        if (p.projects.length) { sect('Progetti (da craftare)'); row(p.projects.map((id) => { const c = g.craftCost(p.id, id); const txt = id.startsWith('mod:') ? '1 mana' : AE.RES_KEYS.filter((r) => c[r]).map((r) => `${c[r]}${AE.RES[r].i}`).join(' '); return cb(id, txt); })); }
        if (p.skills.length) { sect('Skill'); row(p.skills.map((id) => cb(id))); }
        if (p.specials.length) { sect('Carte speciali'); row(p.specials.map((id) => cb(id))); }
        if (p.heal.length) { sect('Cura'); row(p.heal.map((id) => cb(id))); }
      }
      // stati speciali: descritti sempre, anche quando non sono attivi
      const T = p.temp || {}, slowed = p.turn && p.turn.slowed;
      const st = [
        [!!T.shield, `${icon('armor', 16)} Scudo Solare`, T.shield ? `attivo: blocca fino a ${T.shield} danni al primo colpo` : 'non attivo (blocca 3 danni, di notte 2, al primo attacco subito)'],
        [!!T.mira, '🎯 Mira Perfetta', T.mira ? `attiva: prossimo attacco infallibile, −${T.mira} danni` : 'non attiva (prossimo attacco infallibile ma con meno danni)'],
        [!!T.svantaggio, '⚠ Svantaggio', T.svantaggio ? 'ATTIVO: nel prossimo combattimento tiri con svantaggio' : 'non attivo'],
        [!!slowed, '🕸 Rallentato', slowed ? 'sì: in questo turno non puoi attaccare' : 'no (le trappole ti fermano e ti impediscono di attaccare)'],
        [!!T.fabbro, '⚒ Sconto Fabbro', T.fabbro ? 'attivo sul prossimo crafting' : 'non attivo'],
        [!!T.ultiTurn, '⚡ Ulti di Karou', T.ultiTurn ? 'attiva fino a fine turno' : 'non attiva'],
        [!!T.moveOnly, '🚶 Solo movimento', T.moveOnly ? 'nel prossimo turno potrai solo muoverti (Soshito)' : 'no'],
        [!!T.skipTurn, '😴 Turno saltato', T.skipTurn ? 'salterai il prossimo turno (Soshito)' : 'no'],
        [!!T.excess, '✨ PV oltre il massimo', T.excess ? 'temporanei: spariscono al prossimo cambio giornata' : 'no'],
      ];
      box.append(h('div', { class: 'sect' }, 'Stati speciali'), h('div', { class: 'small', html: st.map(([on, n, d]) => `<div style="opacity:${on ? 1 : 0.55}">${on ? '●' : '○'} <b>${n}</b> — ${esc(d)}</div>`).join('') }));
      const ch = AE.CHARS[AE.CHAR_IDX[p.char]];
      box.append(h('div', { class: 'sect' }, 'Personaggio'), h('div', { class: 'row' }, UI.charCard(p.char), h('div', { class: 'small', style: 'flex:1;min-width:150px', html: `<b>${esc(ch.n)}</b> · ${esc(ch.role)}<br><b>Passiva:</b> ${esc(ch.passive)}<br><b>Ulti (${R.ultiMana} mana):</b> ${esc(ch.ulti)}<br>${p.ultiHeld ? '✔ Ulti raccolta' : p.ultiUsed ? '✖ Ulti usata (la ripristina il Sindaco)' : '… Ulti da raccogliere sulla tessera Ulti ' + (p.id + 1)}` })));
      return box;
    }

    // ───────────── decisioni umane ─────────────
    humanDecision(d) {
      return new Promise((resolve) => {
        const g = this.game;
        this.choiceResolve = (i) => { this.choiceResolve = null; this.sel = null; this.path = null; this.onCell = null; this.onHover = null; this.hintBox = null; const ap = $('#actionPanel'); if (ap) ap.innerHTML = ''; resolve(i); };
        const done = (i) => { this.choiceResolve(i); };
        const panel = $('#actionPanel'); panel.innerHTML = '';
        const pid = d.pid;
        this.view = pid;
        const head = (t, sub) => { panel.append(h('div', { html: `<h3>${esc(t)}</h3>${sub ? `<div class="dim small">${sub}</div>` : ''}` })); };
        const hintBtn = (fn) => panel.append(h('div', { class: 'row', style: 'margin-bottom:6px' }, h('button', { class: 'btn small', onclick: fn }, '💡 Suggerimento dell’AI'), h('span', { id: 'hintTxt', class: 'small dim' }, '')));
        const what = d.what;
        if (what === 'move') return this.moveUI(d, done, head, hintBtn);
        if (what === 'action') return this.actionUI(d, done, head, hintBtn);
        if (['cell', 'tile', 'swap1', 'swap2', 'respawn'].includes(what)) return this.boardPickUI(d, done, head, hintBtn);
        return this.listUI(d, done, head, hintBtn);
      });
    }
    suggest(d) { try { return this.hintAI.decide(this.game, d); } catch (e) { return 0; } }

    moveUI(d, done, head, hintBtn) {
      const g = this.game, s = g.s, panel = $('#actionPanel');
      const start = g.cellOfPlayer(d.pid);
      head(`Il tuo movimento: ${d.roll} ${d.roll === 1 ? 'passo' : 'passi'}${d.steps !== d.roll ? ` (puoi usarne ${d.steps})` : ''} — ${d.options.length} tessere raggiungibili`, d.ghost ? 'Fastidio: scegli dove muoverti.' : 'Devi muoverti <b>esattamente</b> di quel numero di tessere, ma puoi anche <b>girare</b>: l’importante è non ripassare due volte sulla stessa tessera. Contorno pieno = ci arrivi in linea, tratteggiato = ci arrivi girando, <b>rosa</b> = ci arrivi passando da un portale 🌀 (il salto da un portale all’altro conta come lo stesso passo). Passa sopra una tessera per vedere il percorso.');
      const viaPortal = (o) => { let prev = start; for (const c of o.path) { if (!AE.NB[prev].includes(c)) return true; prev = c; } return false; };
      const sel = {}; d.options.forEach((o) => { sel[o.cell] = viaPortal(o) ? 'selp' : AE.cellDist(start, o.cell) === d.steps ? 'sel' : 'selw'; }); this.sel = sel;
      const byCell = {}; d.options.forEach((o, i) => { byCell[o.cell] = i; });
      this.onHover = (ci) => { if (byCell[ci] != null) { this.path = [g.cellOfPlayer(d.pid)].concat(d.options[byCell[ci]].path); this.refresh(d); this.sel = sel; UI.renderBoard($('#board'), g, { sel, cur: d.pid, path: this.path, hint: this.hintCell }); } };
      this.onCell = (ci) => { if (byCell[ci] != null) this.confirmThen({ kind: 'move', label: d.options[byCell[ci]].label }, () => done(byCell[ci])); };
      hintBtn(() => { const i = this.suggest(d); this.hintCell = d.options[i].cell; UI.renderBoard($('#board'), g, { sel, cur: d.pid, hint: this.hintCell }); $('#hintTxt').textContent = `Suggerisco: ${d.options[i].label}`; });
      const list = h('div', { class: 'cardrow' });
      d.options.forEach((o, i) => { const t = AE.tile(o.tile); const threat = AE.AI.threatAt(g, d.pid, o.cell); list.append(h('button', { class: 'btn small', title: AE.TILE_TYPES[t.type].d, onmouseenter: () => this.onHover(o.cell), onclick: () => this.confirmThen({ kind: 'move', label: o.label }, () => done(i)) }, `${AE.TILE_TYPES[t.type].i} ${o.label}${threat > 1.5 ? ' ⚠' : ''}${o.stop ? ' 🕸' : ''}${viaPortal(o) ? ' 🌀' : ''}`)); });
      panel.append(h('details', {}, h('summary', { class: 'small dim' }, 'Elenco delle destinazioni'), list));
      this.refresh(d); UI.renderBoard($('#board'), g, { sel, cur: d.pid });
    }
    boardPickUI(d, done, head, hintBtn) {
      const g = this.game, panel = $('#actionPanel');
      head(d.prompt || 'Scegli una tessera', 'Clicca una tessera evidenziata sul tavolo, oppure scegli dall’elenco.');
      const sel = {}; const byCell = {};
      d.options.forEach((o, i) => { const ci = o.cell != null ? o.cell : g.cellOfTile(o.tile); if (ci >= 0) { sel[ci] = 'sel2'; byCell[ci] = i; } });
      this.sel = sel;
      this.onCell = (ci) => { if (byCell[ci] != null) done(byCell[ci]); };
      hintBtn(() => { const i = this.suggest(d); const o = d.options[i]; this.hintCell = o.cell != null ? o.cell : g.cellOfTile(o.tile); UI.renderBoard($('#board'), g, { sel, cur: d.pid, hint: this.hintCell }); $('#hintTxt').textContent = `Suggerisco: ${o.label}`; });
      const list = h('div', { class: 'cardrow' });
      d.options.forEach((o, i) => list.append(h('button', { class: 'btn small opt', style: 'width:auto;margin:2px', onclick: () => done(i) }, o.tile && g.cellOfTile(o.tile) < 0 ? h('img', { src: AE.tile(o.tile).img, width: 46, alt: '' }) : null, o.label)));
      if (Object.keys(sel).length) panel.append(h('details', {}, h('summary', { class: 'small dim' }, 'Elenco'), list)); else panel.append(list);
      this.refresh(d); UI.renderBoard($('#board'), g, { sel, cur: d.pid });
    }
    listUI(d, done, head, hintBtn) {
      const g = this.game, panel = $('#actionPanel');
      const modal = d.what === 'yesno' || d.what === 'overflow' || d.what === 'steal' || d.what === 'cards' || d.what === 'deck' || d.what === 'equip';
      head(d.prompt || 'Scegli');
      hintBtn(() => { const i = this.suggest(d); $('#hintTxt').textContent = `Suggerisco: ${d.options[i].label}`; const bs = $$('.opt', panel); if (bs[i]) bs[i].classList.add('hl'); });
      const $$ = UI.$$;
      d.options.forEach((o, i) => {
        const id = o.item || o.card || o.drop || null;
        const b = h('button', { class: 'btn opt', onclick: () => done(i) }, id && !String(id).startsWith('cube:') ? UI.cardImg(String(id)) : null, h('span', {}, o.label));
        panel.append(b);
      });
    }

    // ── azioni del turno ──
    actionUI(d, done, head, hintBtn) {
      const g = this.game, pid = d.pid, p = g.pl(pid), panel = $('#actionPanel');
      const cat = g.actionCatalog(pid);
      const en = d.options.filter((o) => o.kind !== 'end');
      head(`Tocca a te: ${p.name} — ${p.mana} mana${p.turn && p.turn.slowed ? ' · 🕸 rallentato' : ''}`, 'Le azioni grigie non sono disponibili ora: sotto ognuna c’è il motivo.');
      hintBtn(() => { const i = this.suggest(d); const o = d.options[i]; $('#hintTxt').textContent = o.kind === 'end' ? 'Suggerisco: finisci il turno' : `Suggerisco: ${o.label}`; $$('.act', panel).forEach((b) => b.classList.toggle('hl', +b.dataset.i === i)); });
      const $$ = UI.$$;
      const groups = [['attack', '⚔ Attaccare'], ['craft', '⚒ Crafting'], ['skill', '🃏 Skill'], ['heal', '💚 Curarsi'], ['buy', '🛒 Mercato'], ['ulti', '⚡ Ulti']];
      for (const [kind, title] of groups) {
        const kinds = kind === 'buy' ? ['buy', 'buyhp', 'buyammo', 'sell'] : [kind];
        const items = d.options.map((o, i) => [o, i]).filter(([o]) => kinds.includes(o.kind));
        const dis = cat.disabled.filter((o) => kinds.includes(o.kind));
        if (!items.length && !dis.length) continue;
        panel.append(h('div', { class: 'sect' }, title));
        for (const [o, i] of items) {
          const pv = this.preview(o);
          const b = h('button', { class: 'btn opt act', 'data-i': i, onclick: () => this.confirmThen(o, () => done(i)) },
            o.card || o.proj || (o.kind === 'buy' && o.card) ? UI.cardImg(o.card || o.proj) : null,
            h('span', { html: `<b>${esc(o.label || o.kind)}</b>${pv ? `<br><span class="small dim">${pv}</span>` : ''}` }));
          panel.append(b);
        }
        for (const o of dis) panel.append(h('button', { class: 'btn opt dis', disabled: true, title: o.reason }, h('span', { html: `${esc(o.label)}<div class="why">⛔ ${esc(o.reason)}</div>` })));
      }
      const endIdx = d.options.findIndex((o) => o.kind === 'end');
      panel.append(h('div', { class: 'sect' }, 'Fine'), h('button', { class: 'btn primary act', 'data-i': endIdx, onclick: () => { const useful = en.length && p.mana >= 2; if (useful) this.confirmThen({ kind: 'end', note: `Hai ancora ${p.mana} mana e ${en.length} azioni possibili.` }, () => done(endIdx)); else done(endIdx); } }, '✔ Fine del turno'));
      this.refresh(d);
    }
    preview(o) {
      const g = this.game, pid = this.game.s.cur;
      try {
        if (o.kind === 'attack' && o.target.kind === 'player') {
          const p = g.pl(pid), q = g.pl(o.target.pid), st = g.weaponStats(pid, o.slot);
          const same = o.target.dist === 0 && st.git >= 1, light = o.slot !== 'fist' && st.light;
          const advA = o.vant || (p.char === 'lasep' && light) || (p.temp.ultiTurn && p.temp.ultiTurn.adv && o.slot !== 'melee' && o.slot !== 'fist');
          const pw = p.temp.mira ? 1 : AE.AI.pWin(!!advA, same || !!p.temp.svantaggio, (q.char === 'soshito' && light) || same, !!q.temp.svantaggio);
          const dmg = Math.max(0, st.dan - (p.temp.mira || 0));
          return `Colpisci ~${Math.round(pw * 100)}% · danno ${dmg}${q.hp <= dmg ? ' → <b>eliminazione</b>' : ` (${q.name}: ${q.hp} PV)`}${st.fal ? ` · se fallisci subisci ${st.fal}` : ''}${o.cost ? '' : ''}`;
        }
        if (o.kind === 'craft') return o.proj.startsWith('mod:') ? 'Costa 1 mana' : `Costa 1 mana + ${AE.RES_KEYS.filter((r) => o.cost[r]).map((r) => `${o.cost[r]} ${AE.RES[r].s}`).join(', ') || 'nessuna risorsa'}`;
        if (o.kind === 'skill') return AE.cardText(o.card);
        if (o.kind === 'ulti') return this.game.charOf(pid).ulti;
        if (o.kind === 'heal') return AE.cardText(o.card);
      } catch (e) { }
      return '';
    }
    // conferma prima delle mosse costose o rischiose
    confirmThen(o, fn) {
      if (!o) return fn();
      const g = this.game, pid = g.s.cur, p = g.pl(pid);
      let warn = null;
      if (o.kind === 'ulti') warn = `Stai per usare l’Ulti (${g.rules.ultiMana} mana): si può usare una volta sola finché il Sindaco non la ripristina.`;
      else if (o.kind === 'skill' && ['tempesta', 'colpo', 'repeat', 'trappola'].includes(o.skill)) warn = `${AE.cardName(o.card)} ${o.skill === 'tempesta' ? 'colpisce anche te se non sei in un rifugio' : 'è una carta usa e getta'}: confermi?`;
      else if (o.kind === 'attack') { const st = g.weaponStats(pid, o.slot); if (st.fal > 0 || o.slot === 'fist') warn = `Se perdi la sfida subisci ${st.fal} danni (hai ${p.hp} PV).`; else if (o.target.kind === 'player' && g.pl(o.target.pid).char === 'nganga' && g.pl(o.target.pid).ultiHeld) warn = '’Nganga ha l’Ulti pronta: potrebbe difendersi e farti male.'; }
      else if (o.kind === 'end') warn = o.note;
      else if (o.kind === 'move') warn = `Ti fermi su ${o.label}?`;
      if (!warn) return fn();
      const m = UI.modal.open(h('div', {}, h('h3', {}, '⚠ Conferma'), h('p', {}, warn), h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { UI.modal.close(); fn(); } }, o.kind === 'move' ? 'Sì, vai' : 'Sì, procedi'), h('button', { class: 'btn', onclick: () => UI.modal.close() }, 'Annulla'))), { lock: false });
    }

    // ───────────── fine partita ─────────────
    endScreen() {
      const g = this.game, r = g.result, s = g.s;
      const w = r && r.winner != null ? s.players[r.winner] : null;
      const rows = s.players.map((p) => `<tr><td>${esc(p.name)} (${esc(AE.CHARS[AE.CHAR_IDX[p.char]].n)})</td><td>${p.kills}</td><td>${this.isGuest ? '—' : (g.stats.p[p.id].damageDealt || 0)}</td><td>${this.isGuest ? '—' : (g.stats.p[p.id].damageTaken || 0)}</td></tr>`).join('');
      const m = UI.modal.open(h('div', {}, h('h2', { html: w ? `🏆 Vince ${esc(w.name)}!` : '🏁 Nessun vincitore' }), h('p', {}, `${r ? r.why : ''} · ${s.round} round · ${s.turnNo} turni · seed ${this.cfg.seed}`), h('div', { html: `<table><tr><th>Giocatore</th><th>Eliminazioni</th><th>Danni inflitti</th><th>Danni subiti</th></tr>${rows}</table>` }),
        h('div', { class: 'row', style: 'margin-top:12px' },
          h('button', { class: 'btn primary', onclick: () => { UI.modal.close(); UI.go('home'); } }, 'Menu'),
          this.net ? null : h('button', { class: 'btn', onclick: () => { UI.modal.close(); UI.startSession({ seed: this.cfg.seed, players: this.cfg.players, rules: this.cfg.rules, history: g.history.slice(), review: true, speed: 'manual' }); } }, '⏪ Rivedi la partita'),
          this.net ? null : h('button', { class: 'btn', onclick: () => { UI.modal.close(); UI.startSession({ seed: this.cfg.seed, players: this.cfg.players, rules: this.cfg.rules }); } }, '🔁 Rigioca dallo stesso seed'),
          h('button', { class: 'btn', onclick: () => this.exportLog() }, '💾 Esporta cronaca'))));
    }
  }
  UI.Session = Session;
})(typeof window !== 'undefined' ? window : globalThis);
