/* ARENA EXTINCTIO — partita con gli amici: creare la stanza (tavolo), unirsi, scegliere chi gioca e chi è AI. */
(function (root) {
  'use strict';
  const AE = root.AE, UI = AE.UI, { h, $, esc } = UI;
  const LEVELS = [['easy', 'Facile'], ['medium', 'Media'], ['hard', 'Difficile']];
  const NAME_KEY = 'ae-name';
  const loadName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; } };
  const saveName = (n) => { try { localStorage.setItem(NAME_KEY, n); } catch (e) { /* ok */ } };
  const joinLink = (code) => { const u = new URL(root.location.href); u.search = ''; u.hash = ''; u.searchParams.set('join', code); return u.toString(); };
  const shell = (title) => { const el = $('#screen'); el.innerHTML = ''; const nav = $('#nav'); nav.innerHTML = ''; nav.append(h('button', { class: 'btn small', onclick: () => UI.go('home') }, '🏠 Home')); const box = h('div', { class: 'card', style: 'max-width:760px;margin:0 auto' }, h('h2', {}, title)); el.append(box); return box; };
  const needNet = (box) => { if (UI.net.available()) return true; box.append(h('p', {}, 'Il componente di collegamento non è stato caricato (serve aprire l’app una volta con internet). Riprova più tardi.')); return false; };

  // ───────────── chi crea la stanza ─────────────
  UI.lobbyHost = function () {
    if (UI.session) { UI.session.destroy(); }
    const box = shell('👥 Partita con gli amici — crea la stanza');
    if (!needNet(box)) return;
    const net = UI.net, host = new net.Host();
    const st = { n: 3, seats: [], seed: String(Math.floor(Math.random() * 1e6)), name: loadName() || 'Giocatore 1', guests: [], err: '' };
    for (let i = 0; i < 6; i++) st.seats.push({ kind: i === 0 ? 'me' : i === 1 ? 'friend' : 'ai', level: 'medium', char: '' });
    const status = h('div', { class: 'small dim' }, 'Mi collego al servizio per aprire la stanza…');
    const codeBox = h('div', { style: 'font-size:2.4em;font-weight:900;letter-spacing:.2em;text-align:center;margin:8px 0' }, '····');
    const seatsBox = h('div'), friendsBox = h('div', { class: 'small' }), startBtn = h('button', { class: 'btn primary', disabled: true }, '▶ Inizia la partita'), msg = h('div', { class: 'small', style: 'color:#ff9a9a;margin-top:6px' });
    const friends = () => st.seats.slice(0, st.n).filter((s) => s.kind === 'friend').length;
    const draw = () => {
      host.maxGuests = friends();
      seatsBox.innerHTML = '';
      for (let i = 0; i < st.n; i++) {
        const s = st.seats[i];
        const kind = h('select', { onchange: (e) => { s.kind = e.target.value; draw(); } }, h('option', { value: 'me', selected: s.kind === 'me' }, '🙂 Io (questo dispositivo)'), h('option', { value: 'friend', selected: s.kind === 'friend' }, '📱 Amico (altro dispositivo)'), h('option', { value: 'ai', selected: s.kind === 'ai' }, '🤖 AI'));
        const lvl = h('select', { disabled: s.kind !== 'ai', onchange: (e) => { s.level = e.target.value; } }, ...LEVELS.map(([v, n]) => h('option', { value: v, selected: s.level === v }, n)));
        const ch = h('select', { class: 'c3', onchange: (e) => { s.char = e.target.value; } }, h('option', { value: '' }, '🎲 Personaggio a caso'), ...AE.CHARS.map((c) => h('option', { value: c.id, selected: s.char === c.id }, `${c.n} — ${c.role}`)));
        seatsBox.append(h('div', { class: 'seat' }, h('b', { style: `color:${UI.col(i)}` }, '#' + (i + 1)), kind, lvl, ch));
      }
      const need = friends(), have = st.guests.filter((g) => g.online).length, me = st.seats.slice(0, st.n).filter((s) => s.kind === 'me').length;
      friendsBox.innerHTML = '';
      friendsBox.append(h('div', {}, `Amici collegati: ${have} su ${need} richiesti`), ...st.guests.map((g) => h('div', {}, (g.online ? '🟢 ' : '⚪ ') + g.name)));
      const ok = st.err === '' && me === 1 && have === need && st.guests.length === need;
      startBtn.disabled = !ok;
      msg.textContent = st.err || (me !== 1 ? 'Serve esattamente un posto “Io”.' : have !== need ? 'Aspetto che si colleghino tutti gli amici.' : '');
    };
    host.onLobby = (list) => { st.guests = list; draw(); };
    const open = async (tries) => {
      const code = net.newCode();
      try { await host.open(code); } catch (e) {
        if (e && e.type === 'unavailable-id' && tries < 4) return open(tries + 1);
        st.err = 'Non riesco ad aprire la stanza (' + ((e && e.type) || 'errore') + '). Serve internet per il collegamento iniziale.'; status.textContent = ''; draw(); return;
      }
      codeBox.textContent = code;
      status.innerHTML = '';
      const link = joinLink(code);
      status.append(h('div', {}, 'Gli amici aprono la webapp e scelgono “Unisciti a una stanza” con questo codice, oppure aprono questo link:'), h('div', { style: 'word-break:break-all;margin:4px 0' }, link),
        h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: async () => { try { if (navigator.share) await navigator.share({ title: 'Arena Extinctio', text: 'Codice stanza ' + code, url: link }); else { await navigator.clipboard.writeText(link); UI.toast('Link copiato'); } } catch (e) { /* annullato */ } } }, '📤 Condividi il link')));
      draw();
    };
    host.onError = (e) => { st.err = 'Problema di collegamento: ' + ((e && e.type) || 'errore'); draw(); };
    const nsel = h('select', { onchange: (e) => { st.n = +e.target.value; draw(); } }, ...[2, 3, 4, 5, 6].map((n) => h('option', { value: n, selected: n === st.n }, n + ' giocatori in tutto')));
    const nameIn = h('input', { type: 'text', value: st.name, maxlength: 20, style: 'width:150px', oninput: (e) => { st.name = e.target.value; } });
    const seedIn = h('input', { type: 'text', value: st.seed, style: 'width:120px', oninput: (e) => { st.seed = e.target.value; } });
    startBtn.addEventListener('click', () => {
      const seats = st.seats.slice(0, st.n);
      const used = new Set(); for (const s of seats) if (s.char) { if (used.has(s.char)) { msg.textContent = 'Personaggio ripetuto: sceglierne di diversi.'; return; } used.add(s.char); }
      const names = new Set(); const uniq = (n) => { let x = n, k = 2; while (names.has(x.toLowerCase())) x = n + ' ' + k++; names.add(x.toLowerCase()); return x; };
      const myName = uniq((st.name || 'Giocatore 1').trim() || 'Giocatore 1'); saveName(myName);
      const queue = st.guests.slice(); const map = []; let mySeat = 0;
      const players = seats.map((s, i) => {
        if (s.kind === 'me') { mySeat = i; return { name: myName, kind: 'human', char: s.char || undefined }; }
        if (s.kind === 'friend') { const g = queue.shift(); const real = host.guests.find((x) => x.name === g.name); map.push({ guest: real, pid: i }); return { name: uniq(g.name), kind: 'human', char: s.char || undefined }; }
        return { name: uniq(`AI ${i + 1}`), kind: 'ai', level: s.level, char: s.char || undefined };
      });
      UI.clearSave();
      UI.startSession({ seed: st.seed, players, rules: { levelDays: AE.DEFAULT_RULES.levelDays.slice() }, speed: 'manual', net: host, mySeat });
      const g = UI.session.game;
      host.begin(map, { seed: st.seed, players, rules: g.rules, code: host.code });
      UI.session.renderNav();
    });
    box.append(h('div', { class: 'small dim' }, 'Codice stanza'), codeBox, status,
      h('div', { class: 'row', style: 'margin-top:10px' }, h('label', {}, 'Il tuo nome ', nameIn), nsel, h('label', {}, 'Seed ', seedIn)),
      h('div', { class: 'small dim', style: 'margin-top:8px' }, 'Scegli per ogni posto chi gioca: tu, un amico su un altro dispositivo, oppure l’AI. Gli amici prendono i posti “Amico” nell’ordine in cui si collegano.'),
      seatsBox, friendsBox, msg, h('div', { class: 'row', style: 'margin-top:12px' }, startBtn, h('button', { class: 'btn', onclick: () => { host.close(); UI.go('home'); } }, 'Annulla')));
    draw();
    open(0);
  };

  // ───────────── chi si unisce ─────────────
  const waitScreen = (guest, code, name) => {
    const box = shell('👥 Partita con gli amici');
    const info = h('div', {}, 'Collegato alla stanza ' + code + '. In attesa che il tavolo inizi la partita…'), list = h('div', { class: 'small', style: 'margin-top:8px' });
    box.append(info, list, h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn', onclick: () => { guest.close(); UI.go('home'); } }, 'Esci')));
    guest.onLobby = (m) => { list.textContent = 'Collegati: ' + m.names.join(', '); };
    guest.onReject = (why) => { guest.close(); box.append(h('p', { style: 'color:#ff9a9a' }, why)); };
    guest.onStart = (m) => {
      const evs = []; for (const e of (m.evs || [])) evs[e.i] = e;
      UI.startSession({ seed: m.seed, players: m.players, rules: m.rules, speed: 'normal', net: guest, mySeat: m.seat, resume: { s: JSON.stringify(m.s), events: evs, k: 0 } });
    };
    guest.onLost = () => { box.append(h('p', { style: 'color:#ff9a9a' }, 'Collegamento perso.')); };
  };
  const doJoin = async (code, name, box) => {
    const guest = new UI.net.Guest();
    try { await guest.connect(code, name); } catch (e) { return { err: e.message }; }
    saveName(name);
    waitScreen(guest, code, name);
    return { ok: true };
  };
  UI.joinScreen = function (prefill) {
    if (UI.session) { UI.session.destroy(); }
    const box = shell('👥 Unisciti alla partita di un amico');
    if (!needNet(box)) return;
    const code = h('input', { type: 'text', value: (prefill || '').toUpperCase(), maxlength: 4, style: 'width:110px;font-size:1.6em;letter-spacing:.2em;text-transform:uppercase' });
    const name = h('input', { type: 'text', value: loadName(), maxlength: 20, placeholder: 'Il tuo nome', style: 'width:180px' });
    const err = h('div', { class: 'small', style: 'color:#ff9a9a;margin-top:8px' });
    const go = h('button', { class: 'btn primary' }, 'Entra');
    go.addEventListener('click', async () => {
      const c = code.value.trim().toUpperCase(), n = name.value.trim();
      if (c.length !== 4) { err.textContent = 'Il codice ha 4 caratteri.'; return; }
      if (!n) { err.textContent = 'Scrivi il tuo nome.'; return; }
      go.disabled = true; err.textContent = 'Mi collego…';
      const r = await doJoin(c, n, box);
      if (r.err) { go.disabled = false; err.textContent = r.err; }
    });
    box.append(h('div', { class: 'row' }, h('label', {}, 'Codice stanza ', code), h('label', {}, 'Nome ', name), go), err,
      h('div', { class: 'small dim', style: 'margin-top:10px' }, 'Il codice lo vedi sul dispositivo di chi ha creato la stanza. Servono tutti sullo stesso wifi (o comunque con internet).'));
  };
  UI.rejoin = async function (code, name) {
    const box = shell('👥 Riconnessione…');
    box.append(h('div', {}, 'Mi ricollego alla stanza ' + code + '…'));
    const r = await doJoin(code, name, box);
    if (r.err) box.append(h('p', { style: 'color:#ff9a9a' }, r.err), h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => UI.rejoin(code, name) }, 'Riprova'), h('button', { class: 'btn', onclick: () => UI.go('home') }, 'Esci')));
  };
})(typeof window !== 'undefined' ? window : globalThis);
