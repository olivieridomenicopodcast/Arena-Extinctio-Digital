/* ARENA EXTINCTIO — rete: parti pure (nessun DOM, nessun PeerJS), usabili anche nei test di Node.
   PeerJS chiude il collegamento se un messaggio JSON supera circa 16 KB: ogni messaggio più grande si spezza in "parti" piccole
   ({ t:'part', id, i, n, d }) e chi riceve lo ricompone. I messaggi restano JSON puro. */
(function (root) {
  'use strict';
  const AE = (root.AE = root.AE || {});
  const NC = (AE.NetCore = {});
  NC.LIMIT = 12000;     // oltre questa lunghezza (caratteri del JSON) si spezza
  NC.CHUNK = 8000;      // lunghezza massima del testo contenuto in una parte
  let seq = 0;
  // il messaggio da mandare diventa una lista di messaggi di rete (uno solo se è piccolo)
  NC.encode = (msg) => {
    const str = JSON.stringify(msg);
    if (str.length <= NC.LIMIT) return [msg];
    const id = Date.now().toString(36) + '-' + (++seq), n = Math.ceil(str.length / NC.CHUNK), out = [];
    for (let i = 0; i < n; i++) out.push({ t: 'part', id, i, n, d: str.slice(i * NC.CHUNK, (i + 1) * NC.CHUNK) });
    return out;
  };
  // riceve i messaggi di rete uno alla volta: ritorna il messaggio completo oppure null se mancano parti
  NC.Assembler = class {
    constructor() { this.parts = {}; }
    push(m) {
      if (!m || m.t !== 'part') return m;
      const p = this.parts[m.id] || (this.parts[m.id] = { got: 0, n: m.n, a: [] });
      if (p.a[m.i] == null) { p.a[m.i] = m.d; p.got++; }
      if (p.got < p.n) return null;
      delete this.parts[m.id];
      try { return JSON.parse(p.a.join('')); } catch (e) { return null; }
    }
  };
  NC.isPure = (x) => { try { return JSON.stringify(JSON.parse(JSON.stringify(x))) === JSON.stringify(x); } catch (e) { return false; } };
})(typeof window !== 'undefined' ? window : globalThis);
