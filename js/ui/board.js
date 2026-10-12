/* ARENA EXTINCTIO — interfaccia: tavolo esagonale in SVG (tessere = le immagini originali). */
(function (root) {
  'use strict';
  const AE = root.AE, UI = AE.UI;
  const S = 64, R3 = Math.sqrt(3);
  const cx = (c) => 1.5 * S * c.q, cy = (c) => R3 * S * (c.r + c.q / 2);
  const hexPts = (x, y, s) => [0, 1, 2, 3, 4, 5].map((i) => { const a = Math.PI / 3 * i; return `${(x + s * Math.cos(a)).toFixed(1)},${(y + s * Math.sin(a)).toFixed(1)}`; }).join(' ');
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  AE.CELLS.forEach((c) => { minX = Math.min(minX, cx(c) - S); maxX = Math.max(maxX, cx(c) + S); minY = Math.min(minY, cy(c) - S * R3 / 2); maxY = Math.max(maxY, cy(c) + S * R3 / 2); });
  UI.boardBox = [minX - 8, minY - 8, maxX - minX + 16, maxY - minY + 16];
  UI.hexPts = hexPts;
  UI.cellXY = (ci) => [cx(AE.CELLS[ci]), cy(AE.CELLS[ci])];

  // Disegna tutto il tavolo. opts: { sel:{ci:'sel'|'sel2'}, hint:ci, cur:pid, path:[ci], focus:[ci] }
  UI.renderBoard = function (svg, g, opts) {
    opts = opts || {};
    const s = g.s, out = [];
    const bb = UI.boardBox;
    svg.setAttribute('viewBox', bb.join(' '));
    const pawnsBy = {};
    s.players.forEach((p) => { if ((p.status === 'alive' || p.status === 'ghost') && p.at) (pawnsBy[p.at] = pawnsBy[p.at] || []).push(p); });
    // celle
    s.cells.forEach((cell, ci) => {
      const c = AE.CELLS[ci], x = cx(c), y = cy(c), tid = cell.tile;
      const sel = opts.sel && opts.sel[ci];
      if (!tid) { out.push(`<g data-ci="${ci}"><polygon class="hex void" points="${hexPts(x, y, S - 1)}"/></g>`); return; }
      const t = AE.tile(tid);
      let g2 = `<g data-ci="${ci}" data-tile="${tid}">`;
      g2 += `<image href="${t.img}" x="${(x - S).toFixed(1)}" y="${(y - S * R3 / 2).toFixed(1)}" width="${2 * S}" height="${(S * R3).toFixed(1)}" ${cell.rot ? `transform="rotate(${cell.rot * 60} ${x.toFixed(1)} ${y.toFixed(1)})"` : ''}/>`;
      // proprietario delle tessere Luogo/Ulti
      if ((t.type === 'luogo' || t.type === 'ulti') && t.owner < s.n) {
        const pl = s.players[t.owner];
        g2 += `<circle cx="${(x - S * 0.62).toFixed(1)}" cy="${(y - S * 0.52).toFixed(1)}" r="11" fill="${UI.col(t.owner)}" stroke="#fff" stroke-width="2"/><text x="${(x - S * 0.62).toFixed(1)}" y="${(y - S * 0.52 + 5).toFixed(1)}" text-anchor="middle" font-size="14" font-weight="700" fill="#000">${t.owner + 1}</text>`;
        if (t.type === 'ulti') g2 += `<g transform="translate(${(x - 14).toFixed(1)},${(y - 14).toFixed(1)}) scale(1.17)" opacity="${s.crater[tid] ? 1 : 0.25}">${UI.sprites.ulti}</g>`;
      }
      // portali: lettera
      if (t.type === 'tele') g2 += `<text x="${x.toFixed(1)}" y="${(y + S * 0.55).toFixed(1)}" text-anchor="middle" class="tlabel" font-size="17">${t.portal === 'D' ? 'A+B' : t.portal}</text>`;
      // cloud
      if (s.cloud && s.cloud.tiles.includes(tid) && s.periodIdx < s.cloud.until) g2 += `<polygon points="${hexPts(x, y, S - 2)}" fill="#8cff6655" stroke="#8cff66" stroke-width="2"/>`;
      // segnalini di trappole/torrette
      s.traps.forEach((tr) => {
        if (tr.marks.includes(tid)) g2 += `<g transform="translate(${(x + S * 0.38).toFixed(1)},${(y - S * 0.62).toFixed(1)}) scale(1)"><circle cx="12" cy="12" r="13" fill="#000a" stroke="${tr.kind === 'trap' ? '#ffb347' : '#ff6b6b'}" stroke-width="2"/>${UI.sprites[tr.kind]}</g>`;
        if (tr.tile === tid) g2 += `<g transform="translate(${(x - S * 0.1).toFixed(1)},${(y + S * 0.05).toFixed(1)}) scale(1.5)"><title>${tr.kind === 'trap' ? 'Trappola' : 'Torretta'} (${tr.hp} PV)</title>${UI.sprites[tr.kind]}</g>`;
      });
      // bottino, rientro, blocco, seguaci
      let bi = 0; const badge = (icon, label) => { const bx = x - S * 0.7 + bi * 26, by = y + S * 0.42; bi++; return `<g transform="translate(${bx.toFixed(1)},${by.toFixed(1)})"><circle cx="12" cy="12" r="13" fill="#000b" stroke="#fff6"/><g transform="translate(2,2) scale(.83)">${UI.sprites[icon]}</g>${label ? `<text x="24" y="8" font-size="12" fill="#fff" font-weight="700">${label}</text>` : ''}</g>`; };
      s.loot.forEach((l) => { if (l.tile === tid) g2 += badge('loot', l.items.length); });
      s.tokens.forEach((tk) => { if (tk.tile === tid) g2 += badge('rientro', ''); });
      if (s.blocks[tid] != null) g2 += badge('block', '');
      if (s.followers) { if (s.followers.sun === tid) g2 += badge('sun', g.isDay() ? 'Sun' : 'sun'); if (s.followers.moon === tid) g2 += badge('moon', !g.isDay() ? 'Moon' : 'moon'); }
      // segnalini selezione
      g2 += `<polygon class="hex ${sel ? sel : ''} ${opts.hint === ci ? 'hint' : ''}" fill="transparent" points="${hexPts(x, y, S - 1.5)}"/>`;
      // pedine
      const ps = pawnsBy[tid] || [];
      ps.forEach((p, k) => {
        const n = ps.length, ang = n === 1 ? 0 : (2 * Math.PI * k) / n - Math.PI / 2, rr = n === 1 ? 0 : 20;
        const px = x + rr * Math.cos(ang), py = y + rr * Math.sin(ang) - 2;
        const id = 'clip' + p.id + '_' + ci;
        const r = n === 1 ? 26 : n <= 3 ? 22 : 17;
        g2 += `<g class="pawn ${opts.cur === p.id ? 'cur' : ''}" data-pid="${p.id}" data-x="${px.toFixed(1)}" data-y="${py.toFixed(1)}" opacity="${p.status === 'ghost' ? 0.6 : 1}"><title>${UI.esc(p.name)} (${AE.CHARS[AE.CHAR_IDX[p.char]].n}) ${p.hp} PV</title><clipPath id="${id}"><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${r}"/></clipPath><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${r + 3}" fill="${UI.col(p.id)}" stroke="#fff" stroke-width="2"/><image href="${UI.charImg(p.char)}" x="${(px - r * 1.6).toFixed(1)}" y="${(py - r * 0.95).toFixed(1)}" width="${(r * 3.2).toFixed(1)}" height="${(r * 3.2 * 1.56).toFixed(1)}" clip-path="url(#${id})" preserveAspectRatio="xMidYMin slice"/>${p.status === 'ghost' ? `<g transform="translate(${(px - 9).toFixed(1)},${(py - 9).toFixed(1)}) scale(.75)">${UI.sprites.ghost}</g>` : ''}<rect x="${(px + r - 8).toFixed(1)}" y="${(py - r - 4).toFixed(1)}" width="20" height="18" rx="5" fill="#000d" stroke="${UI.col(p.id)}"/><text x="${(px + r + 2).toFixed(1)}" y="${(py - r + 10).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">${p.status === 'ghost' ? '👻' : p.hp}</text></g>`;
      });
      g2 += '</g>';
      out.push(g2);
    });
    if (opts.path && opts.path.length > 1) {
      // il percorso si spezza ai portali: tratto pieno per i passi, tratteggiato rosa per il salto
      const P = opts.path, xy = (ci) => UI.cellXY(ci).map((v) => v.toFixed(1));
      let seg = [P[0]];
      const flush = () => { if (seg.length > 1) out.push(`<polyline points="${seg.map((ci) => xy(ci).join(',')).join(' ')}" fill="none" stroke="#00ffc8" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="2 10" opacity=".95" pointer-events="none"/>`); };
      for (let i = 1; i < P.length; i++) {
        if (AE.NB[P[i - 1]].includes(P[i])) seg.push(P[i]);
        else { flush(); const a = xy(P[i - 1]), c = xy(P[i]); out.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${c[0]}" y2="${c[1]}" stroke="#ff5ad7" stroke-width="5" stroke-dasharray="10 8" opacity=".95" pointer-events="none"/>`); seg = [P[i]]; }
      }
      flush();
    }
    const old = {};
    svg.querySelectorAll('.pawn[data-pid]').forEach((e) => { old[e.dataset.pid] = [+e.dataset.x, +e.dataset.y]; });
    svg.innerHTML = out.join('');
    UI.lastPos = UI.lastPos || {}; UI.moves = UI.moves || {};
    svg.querySelectorAll('.pawn[data-pid]').forEach((e) => {
      const id = e.dataset.pid, nw = [+e.dataset.x, +e.dataset.y], o = old[id];
      if (o && Math.hypot(o[0] - nw[0], o[1] - nw[1]) > 3 && !UI.moves[id]) UI.moves[id] = o;
      if (!o) UI.born = UI.born || {}, UI.born[id] = 1;
      UI.lastPos[id] = nw;
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
