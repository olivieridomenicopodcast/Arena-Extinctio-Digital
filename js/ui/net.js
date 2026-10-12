/* ARENA EXTINCTIO — partita in rete locale: collegamento fra dispositivi (WebRTC tramite PeerJS).
   Il dispositivo che crea la stanza ("host") fa da tavolo: tiene lo stato vero e gira il motore; gli altri ("guest") ricevono lo stato,
   vedono le proprie scelte e rimandano la risposta. Il servizio pubblico di PeerJS serve solo a far trovare i dispositivi (serve internet
   al momento del collegamento); poi i dati passano direttamente fra i dispositivi. Per i test: ?peerhost=localhost&peerport=9000 usa un server locale. */
(function (root) {
  'use strict';
  const AE = root.AE, UI = AE.UI;
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const PREFIX = 'arena-extinctio-';
  const net = UI.net = {};
  net.available = () => typeof root.Peer === 'function';
  net.newCode = () => { let c = ''; for (let i = 0; i < 4; i++) c += ALPHA[Math.floor(Math.random() * ALPHA.length)]; return c; };
  net.peerOpts = () => {
    const q = new URLSearchParams(root.location ? root.location.search : '');
    const o = { debug: 0 };
    if (q.get('peerhost')) { o.host = q.get('peerhost'); o.port = +q.get('peerport') || 9000; o.path = q.get('peerpath') || '/'; o.secure = q.get('peersecure') === '1'; }
    return o;
  };
  net.keepAwake = async () => { try { if (navigator.wakeLock) net._lock = await navigator.wakeLock.request('screen'); } catch (e) { /* non supportato */ } };
  net.releaseAwake = () => { try { if (net._lock) net._lock.release(); } catch (e) { /* ok */ } net._lock = null; };

  // ───────────── host ─────────────
  class Host {
    constructor() {
      this.role = 'host'; this.guests = []; this.started = false; this.pidGuest = {}; this.pending = {}; this.seq = 0;
      this.onLobby = null; this.onOffline = null; this.onBack = null; this.snapshot = null; this.meta = null;
      this.dog = setInterval(() => {      // un dispositivo che sparisce di colpo (schermo spento, app chiusa) non sempre avvisa: si controlla il battito
        const now = Date.now();
        for (const g of this.guests) { if (g.online && g.conn) { if (now - (g.seen || now) > 12000) this._closed(g.conn); else try { g.conn.send({ t: 'ping' }); } catch (e) { /* ok */ } } }
      }, 4000);
    }
    open(code) {
      this.code = code;
      return new Promise((resolve, reject) => {
        this.peer = new root.Peer(PREFIX + code, net.peerOpts());
        this.peer.on('open', () => resolve(code));
        this.peer.on('error', (e) => { if (!this.opened) reject(e); else if (this.onError) this.onError(e); });
        this.peer.on('connection', (conn) => this._incoming(conn));
        this.peer.on('open', () => { this.opened = true; });
        this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (e) { /* ok */ } });
      });
    }
    _incoming(conn) {
      conn.on('data', (m) => this._data(conn, m));
      conn.on('close', () => this._closed(conn));
      conn.on('error', () => this._closed(conn));
    }
    _guestOf(conn) { return this.guests.find((g) => g.conn === conn); }
    _data(conn, m) {
      if (!m || typeof m !== 'object') return;
      const gg = this._guestOf(conn); if (gg) gg.seen = Date.now();
      if (m.t === 'ping') return;
      if (m.t === 'hello') {
        const name = String(m.name || 'Amico').slice(0, 20).trim() || 'Amico';
        const old = this.guests.find((g) => g.name === name);
        if (old && !old.online) { old.conn = conn; old.online = true; old.seen = Date.now(); this._rejoin(old); this._lobby(); return; }
        if (old) { conn.send({ t: 'reject', why: 'Esiste già un giocatore con questo nome in stanza.' }); return; }
        if (this.started) { conn.send({ t: 'reject', why: 'La partita è già iniziata.' }); return; }
        if (this.maxGuests != null && this.guests.length >= this.maxGuests) { conn.send({ t: 'reject', why: 'La stanza è piena.' }); return; }
        this.guests.push({ name, conn, online: true, seen: Date.now() });
        this._lobby();
      } else if (m.t === 'ans') {
        const g = this._guestOf(conn); if (!g) return;
        for (const pid in this.pending) { const p = this.pending[pid]; if (p.id === m.id && this.pidGuest[pid] === g) { delete this.pending[pid]; p.resolve(m.i); } }
      }
    }
    _closed(conn) {
      const g = this._guestOf(conn); if (!g || g.conn !== conn) return;
      g.online = false;
      if (!this.started) { this.guests = this.guests.filter((x) => x !== g); this._lobby(); return; }
      this._lobby();
      for (const pid in this.pending) if (this.pidGuest[pid] === g && this.onOffline) this.onOffline(+pid, g);
    }
    _lobby() { if (this.onLobby) this.onLobby(this.guests.map((g) => ({ name: g.name, online: g.online }))); this._sendLobby(); }
    _sendLobby() {
      if (this.started) return;
      const names = this.guests.map((g) => g.name);
      for (const g of this.guests) if (g.online) { try { g.conn.send({ t: 'lobby', names, you: g.name, info: this.lobbyInfo || '' }); } catch (e) { /* ok */ } }
    }
    // inizio partita: `map` = [{ guest, pid }]; `meta` = ciò che serve al guest per costruire la sua copia
    begin(map, meta) {
      this.started = true; this.meta = meta; this.pidGuest = {};
      for (const m of map) this.pidGuest[m.pid] = m.guest;
      for (const g of this.guests) if (!map.some((m) => m.guest === g) && g.online) { try { g.conn.send({ t: 'reject', why: 'Non c’è un posto per te in questa partita.' }); } catch (e) { /* ok */ } }
      for (const m of map) this._sendStart(m.guest, m.pid);
    }
    isRemote(pid) { return !!this.pidGuest[pid]; }
    isOnline(pid) { const g = this.pidGuest[pid]; return !!(g && g.online); }
    nameOf(pid) { const g = this.pidGuest[pid]; return g ? g.name : ''; }
    _sendStart(g, pid) { if (!g.online) return; try { g.conn.send(Object.assign({ t: 'start', seat: pid }, this.meta, this.snapshot ? this.snapshot(true) : {})); } catch (e) { /* ok */ } }
    _rejoin(g) {
      if (!this.started) return;
      const pid = +Object.keys(this.pidGuest).find((k) => this.pidGuest[k] === g);
      this._sendStart(g, pid);
      if (this.pending[pid]) this._sendDecide(pid);
      if (this.onBack) this.onBack(pid, g);
    }
    broadcast(msg) {
      const extra = this.snapshot ? this.snapshot(false) : {};
      for (const pid in this.pidGuest) { const g = this.pidGuest[pid]; if (g.online) { try { g.conn.send(Object.assign({}, msg, extra)); } catch (e) { /* ok */ } } }
    }
    ask(pid, d) {
      return new Promise((resolve) => {
        this.pending[pid] = { id: ++this.seq, d, resolve };
        if (this.isOnline(pid)) this._sendDecide(pid); else if (this.onOffline) this.onOffline(pid, this.pidGuest[pid]);
      });
    }
    _sendDecide(pid) {
      const p = this.pending[pid], g = this.pidGuest[pid]; if (!p || !g || !g.online) return;
      try { g.conn.send(Object.assign({ t: 'decide', id: p.id, d: p.d }, this.snapshot ? this.snapshot(false) : {})); } catch (e) { /* ok */ }
    }
    cancel(pid) { const p = this.pending[pid]; if (p) { delete this.pending[pid]; p.resolve(null); } }
    close() { clearInterval(this.dog); try { for (const g of this.guests) g.conn.close(); this.peer.destroy(); } catch (e) { /* ok */ } }
  }

  // ───────────── guest ─────────────
  class Guest {
    constructor() { this.role = 'guest'; this.q = []; this.waiters = []; this.onLobby = null; this.onStart = null; this.onReject = null; this.onLost = null; this.closed = false; }
    connect(code, name) {
      this.code = code; this.name = name;
      return new Promise((resolve, reject) => {
        let done = false;
        const fail = (why) => { if (!done) { done = true; reject(new Error(why)); } };
        this.peer = new root.Peer(undefined, net.peerOpts());
        this.peer.on('error', (e) => fail(e && e.type === 'peer-unavailable' ? 'Stanza non trovata: controlla il codice.' : 'Impossibile collegarsi (' + (e && e.type || 'errore') + '). Serve internet per il primo collegamento.'));
        this.peer.on('open', () => {
          this.conn = this.peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
          this.conn.on('open', () => {
            this.conn.send({ t: 'hello', name }); this.seen = Date.now();
            this.dog = setInterval(() => { if (this.closed) return; try { this.conn.send({ t: 'ping' }); } catch (e) { /* ok */ } if (Date.now() - this.seen > 14000) { clearInterval(this.dog); if (this.onLost) this.onLost(); } }, 4000);
            if (!done) { done = true; resolve(); }
          });
          this.conn.on('data', (m) => this._data(m));
          this.conn.on('close', () => { if (!this.closed && this.onLost) this.onLost(); });
          this.conn.on('error', () => { if (!this.closed && this.onLost) this.onLost(); });
        });
        setTimeout(() => fail('Nessuna risposta dalla stanza: controlla il codice e che il tavolo sia aperto.'), 20000);
      });
    }
    _data(m) {
      if (!m || typeof m !== 'object') return;
      this.seen = Date.now();
      if (m.t === 'ping') return;
      if (m.t === 'lobby') { if (this.onLobby) this.onLobby(m); return; }
      if (m.t === 'reject') { if (this.onReject) this.onReject(m.why); return; }
      if (m.t === 'start' && !this.started && this.onStart) { this.started = true; this.onStart(m); return; }
      this.q.push(m);
      const w = this.waiters.shift(); if (w) w();
    }
    next() { return new Promise((res) => { const go = () => { if (this.q.length) res(this.q.shift()); else this.waiters.push(go); }; go(); }); }
    send(m) { try { this.conn.send(m); } catch (e) { /* connessione persa */ } }
    close() { this.closed = true; clearInterval(this.dog); try { this.peer.destroy(); } catch (e) { /* ok */ } this.waiters.splice(0).forEach((w) => w()); }
  }
  net.Host = Host; net.Guest = Guest;
})(typeof window !== 'undefined' ? window : globalThis);
