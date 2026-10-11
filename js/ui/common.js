/* ARENA EXTINCTIO — interfaccia: utilità comuni. */
(function (root) {
  'use strict';
  const AE = root.AE, UI = AE.UI;
  UI.$ = (s, r) => (r || document).querySelector(s);
  UI.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  UI.esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  UI.h = function (tag, attrs) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v);
    }
    for (let i = 2; i < arguments.length; i++) { const c = arguments[i]; if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(c)); }
    return e;
  };
  UI.modal = {
    open(html, opts) {
      opts = opts || {};
      const bg = UI.$('#modalBg'), m = UI.$('#modal'); m.style.maxWidth = '';
      m.innerHTML = ''; if (typeof html === 'string') m.innerHTML = html; else m.append(html);
      bg.style.display = 'flex'; bg.dataset.lock = opts.lock ? '1' : '';
      return m;
    },
    close() { UI.$('#modalBg').style.display = 'none'; UI.$('#modal').innerHTML = ''; },
  };
  document.addEventListener('click', (e) => { const bg = UI.$('#modalBg'); if (e.target === bg && !bg.dataset.lock) UI.modal.close(); });
  UI.zoom = (src) => { const lb = UI.$('#lightbox'); UI.$('img', lb).src = src; lb.style.display = 'flex'; };
  document.addEventListener('click', (e) => { const lb = UI.$('#lightbox'); if (lb.style.display === 'flex' && lb.contains(e.target)) lb.style.display = 'none'; });
  UI.toast = (txt) => { const t = UI.h('div', { class: 'toast' }, txt); document.body.append(t); setTimeout(() => t.remove(), 2600); };
  UI.cardImg = (id, extra) => {
    const src = id.startsWith('eq:') ? AE.CARD_IMG(id.slice(3)) : id.startsWith('cube:') ? null : AE.CARD_IMG(id);
    if (!src) return UI.h('span', { html: UI.icon(id.slice(5), 36) });
    const img = UI.h('img', Object.assign({ class: 'cardimg', src, alt: AE.cardName(id.replace(/^eq:/, '')), title: AE.cardName(id.replace(/^eq:/, '')) + ' — tocca per ingrandire' }, extra || {}));
    img.addEventListener('click', (e) => { e.stopPropagation(); UI.zoom(src); });
    return img;
  };
  UI.charCard = (cid) => { const src = UI.charImg(cid); const img = UI.h('img', { class: 'cardimg', src, alt: cid, style: 'width:104px', title: 'Tocca per ingrandire' }); img.addEventListener('click', (e) => { e.stopPropagation(); UI.zoom(src); }); return img; };
  UI.download = (name, text, mime) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  UI.charImg = (cid) => `assets/cards/${cid}.webp`;
  UI.col = (i) => AE.PLAYER_COLORS[i % AE.PLAYER_COLORS.length];
  UI.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
})(typeof window !== 'undefined' ? window : globalThis);
