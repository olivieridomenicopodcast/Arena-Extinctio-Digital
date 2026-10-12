/* ARENA EXTINCTIO — animazioni (solo grafica: il motore non ne sa nulla).
   Dadi che rotolano nel banner, pedine che camminano lungo il percorso, colpi, danni, cure, eliminazioni…
   Rispettano la velocità scelta (istantanea = nessuna animazione) e prefers-reduced-motion;
   un clic su "Avanti" le porta subito a fine. */
(function (root) {
  'use strict';
  const AE = root.AE, UI = AE.UI;
  const NS = 'http://www.w3.org/2000/svg';
  const FACTOR = { manual: 1, slow: 1, normal: 0.8, fast: 0.35, instant: 0 };
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const A = UI.anim = { active: [], speed: 'normal' };

  A.k = () => {
    try { if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0; } catch (e) { /* niente */ }
    const f = FACTOR[A.speed]; return f == null ? 1 : f;
  };
  A.finishAll = () => { const l = A.active.splice(0); l.forEach((x) => { try { x.finish(); } catch (e) { /* già finita */ } }); };
  A.takeMoves = () => { const m = UI.moves || {}, b = UI.born || {}; UI.moves = {}; UI.born = {}; return { moves: m, born: b }; };

  // anima un elemento con WAAPI; ritorna una promessa risolta a fine (o quando viene forzata)
  function run(el, kf, o) {
    return new Promise((res) => {
      if (!el || !el.animate) return res();
      const an = el.animate(kf, Object.assign({ fill: 'both', easing: 'ease-out' }, o));
      const h = { finish: () => { try { an.finish(); } catch (e) { /* ok */ } } };
      A.active.push(h);
      an.onfinish = an.oncancel = () => { const i = A.active.indexOf(h); if (i >= 0) A.active.splice(i, 1); res(); };
    });
  }
  const wait = (ms) => new Promise((res) => {
    const t = setTimeout(done, ms), h = { finish: done };
    A.active.push(h);
    function done() { clearTimeout(t); const i = A.active.indexOf(h); if (i >= 0) A.active.splice(i, 1); res(); }
  });

  // ───────────── dadi ─────────────
  function faceHtml(v) { return PIPS[v].map((i) => `<i style="grid-area:${Math.floor(i / 3) + 1}/${(i % 3) + 1}"></i>`).join(''); }
  A.dieEl = (v, cls) => { const d = document.createElement('div'); d.className = 'die ' + (cls || ''); d.dataset.v = v; d.innerHTML = faceHtml(v); return d; };
  function setFace(d, v) { d.dataset.v = v; d.innerHTML = faceHtml(v); }

  // gruppo di dadi con etichetta e somma; `dice` = valori finali, `drop` = indice scartato (o -1)
  A.diceGroup = (label, dice, drop, sum, mode) => {
    const g = document.createElement('div'); g.className = 'dgroup';
    g.innerHTML = `<div class="dlabel">${UI.esc(label)}${mode && mode !== 'normale' ? ` <span class="dmode ${mode}">${mode}</span>` : ''}</div><div class="drow"></div><div class="dsum">…</div>`;
    const row = g.querySelector('.drow'), els = dice.map((v) => { const d = A.dieEl(1 + ((v + 2) % 6)); row.append(d); return d; });
    return { el: g, dice, els, drop, sum };
  };

  // tira i dadi: ruotano e cambiano faccia, poi si fermano sul valore vero
  A.tumble = (grp, delay) => {
    const k = A.k();
    const settle = () => {
      grp.els.forEach((d, i) => { setFace(d, grp.dice[i]); d.classList.toggle('drop', i === grp.drop); d.style.transform = ''; });
      const s = grp.el.querySelector('.dsum'); s.textContent = grp.sum != null ? '= ' + grp.sum : ''; s.classList.add('on');
    };
    if (!k) { settle(); return Promise.resolve(); }
    const T = 750 * k;
    return wait(delay * k).then(() => {
      let stop = false;
      const iv = setInterval(() => grp.els.forEach((d) => { if (!stop) setFace(d, 1 + Math.floor(Math.random() * 6)); }), 70);
      const proms = grp.els.map((d, i) => run(d, [
        { transform: 'translateY(-70px) rotate(0deg) scale(1.15)', opacity: 0 },
        { transform: 'translateY(0) rotate(' + (360 + i * 90) + 'deg) scale(1)', opacity: 1, offset: 0.45 },
        { transform: 'translateY(-14px) rotate(' + (520 + i * 40) + 'deg)', offset: 0.7 },
        { transform: 'translateY(0) rotate(' + (720 + i * 30) + 'deg)' }], { duration: T + i * 90 * k, easing: 'ease-in' }));
      return Promise.all(proms).then(() => { stop = true; clearInterval(iv); settle(); });
    });
  };

  // la carta pescata arriva dal retro del suo mazzo, si gira e mostra il fronte
  A.flip = (img, k) => {
    const back = img.dataset.back, front = img.getAttribute('src');
    if (!k || !back) return Promise.resolve();
    img.src = back; img.style.animation = 'none';
    return run(img, [{ transform: 'translateY(-60px) rotateY(0deg) scale(.7)', opacity: 0 }, { transform: 'translateY(0) rotateY(0deg) scale(1)', opacity: 1, offset: 0.35 }, { transform: 'rotateY(90deg)', offset: 0.6 }], { duration: 650 * k })
      .then(() => { img.src = front; return run(img, [{ transform: 'rotateY(-90deg)' }, { transform: 'rotateY(0deg) scale(1.08)', offset: 0.7 }, { transform: 'rotateY(0deg) scale(1)' }], { duration: 350 * k }); });
  };

  // ───────────── SVG: livello effetti ─────────────
  function fxLayer(svg) { let g = svg.querySelector('#fx'); if (!g) { g = document.createElementNS(NS, 'g'); g.id = 'fx'; g.setAttribute('pointer-events', 'none'); svg.append(g); } return g; }
  function mk(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.append(e); return e; }
  const pawnEl = (svg, pid) => svg.querySelector(`.pawn[data-pid="${pid}"]`);
  const posOf = (svg, pid) => { const e = pawnEl(svg, pid); if (e) return [+e.dataset.x, +e.dataset.y]; return (UI.lastPos || {})[pid] || null; };
  const T = (x, y) => `translate(${x}px,${y}px)`;
  function floatText(fx, pos, text, color, k, big) {
    if (!pos) return Promise.resolve();
    const t = mk('text', { x: pos[0], y: pos[1] - 28, 'text-anchor': 'middle', 'font-size': big ? 40 : 30, 'font-weight': 800, fill: color, stroke: '#000', 'stroke-width': 4, 'paint-order': 'stroke' }, fx);
    t.textContent = text;
    return run(t, [{ transform: T(0, 6), opacity: 0 }, { transform: T(0, -8), opacity: 1, offset: 0.2 }, { transform: T(0, -46), opacity: 1, offset: 0.75 }, { transform: T(0, -64), opacity: 0 }], { duration: 1100 * k });
  }
  function ring(fx, pos, color, k, r1) {
    if (!pos) return Promise.resolve();
    const c = mk('circle', { cx: pos[0], cy: pos[1], r: 10, fill: 'none', stroke: color, 'stroke-width': 5 }, fx);
    c.style.transformBox = 'fill-box'; c.style.transformOrigin = 'center';
    return run(c, [{ transform: 'scale(.4)', opacity: 1 }, { transform: 'scale(' + (r1 || 4) + ')', opacity: 0 }], { duration: 550 * k });
  }
  function disc(fx, pos, color, k, r) {
    if (!pos) return Promise.resolve();
    const c = mk('circle', { cx: pos[0], cy: pos[1], r: r || 30, fill: color }, fx);
    return run(c, [{ opacity: 0.85 }, { opacity: 0 }], { duration: 450 * k });
  }
  function shake(el, k) {
    if (!el) return Promise.resolve();
    return run(el, [{ transform: T(0, 0) }, { transform: T(-9, 0) }, { transform: T(8, 0) }, { transform: T(-6, 0) }, { transform: T(4, 0) }, { transform: T(0, 0) }], { duration: 420 * k, easing: 'linear' });
  }
  // copia la pedina nel livello effetti (sopra a tutte le tessere) e nasconde l'originale finché dura l'animazione
  function lift(svg, fx, pid) {
    const e = pawnEl(svg, pid); if (!e) return null;
    const c = e.cloneNode(true); c.removeAttribute('data-pid'); c.classList.remove('cur');
    c.querySelectorAll('clipPath[id]').forEach((cp) => { const nid = cp.id + 'f'; c.querySelectorAll('[clip-path="url(#' + cp.id + ')"]').forEach((x) => x.setAttribute('clip-path', 'url(#' + nid + ')')); cp.id = nid; });
    fx.append(c);
    e.style.visibility = 'hidden';
    const h = { finish: () => { e.style.visibility = ''; } };
    return { el: c, back: () => { e.style.visibility = ''; c.remove(); }, h };
  }

  // ───────────── movimento ─────────────
  function walkPath(svg, fx, pid, path, k) {
    const P = path.filter((c, i) => i === 0 || c !== path[i - 1]);
    const L = lift(svg, fx, pid); if (!L || P.length < 2) { if (L) L.back(); return Promise.resolve(); }
    const end = UI.cellXY(P[P.length - 1]), n = P.length - 1;
    const rel = (ci) => { const c = UI.cellXY(ci); return [c[0] - end[0], c[1] - end[1]]; };
    const kf = [{ transform: T(...rel(P[0])), opacity: 1, offset: 0 }];
    const portals = [];
    for (let i = 1; i <= n; i++) {
      const a = rel(P[i - 1]), b = rel(P[i]);
      if (AE.NB[P[i - 1]].includes(P[i])) kf.push({ transform: T(...b), opacity: 1, offset: i / n });
      else {                                           // salto di portale: sparisce e riappare
        kf.push({ transform: T(...a), opacity: 0, offset: (i - 1) / n + 0.4 / n }, { transform: T(...b), opacity: 0, offset: (i - 1) / n + 0.6 / n }, { transform: T(...b), opacity: 1, offset: i / n });
        portals.push(P[i - 1], P[i]);
      }
    }
    // scia del percorso: tratto verde per i passi, rosa tratteggiato per il salto del portale (non è un passo che attraversa la mappa)
    const trails = [];
    let seg = [P[0]];
    const xy = (ci) => UI.cellXY(ci).map((v) => v.toFixed(1)).join(',');
    const flush = () => { if (seg.length > 1) trails.push(mk('polyline', { points: seg.map(xy).join(' '), fill: 'none', stroke: '#00ffc8', 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0 }, fx)); seg = [seg[seg.length - 1]]; };
    for (let i = 1; i < P.length; i++) {
      if (AE.NB[P[i - 1]].includes(P[i])) seg.push(P[i]);
      else { flush(); const a1 = UI.cellXY(P[i - 1]), c1 = UI.cellXY(P[i]); trails.push(mk('line', { x1: a1[0], y1: a1[1], x2: c1[0], y2: c1[1], stroke: '#ff5ad7', 'stroke-width': 5, 'stroke-dasharray': '10 8', opacity: 0 }, fx)); seg = [P[i]]; }
    }
    flush();
    trails.forEach((t) => fx.insertBefore(t, L.el));
    const prom = [run(L.el, kf, { duration: Math.max(600, n * 420) * k, easing: 'linear' }),
      ...trails.map((t) => run(t, [{ opacity: 0.55 }, { opacity: 0.55, offset: 0.6 }, { opacity: 0 }], { duration: (n * 420 + 600) * k }))];
    portals.forEach((ci) => prom.push(ring(fx, UI.cellXY(ci), '#ff5ad7', k, 3)));
    A.active.push(L.h);
    return Promise.all(prom).then(() => { L.back(); const i = A.active.indexOf(L.h); if (i >= 0) A.active.splice(i, 1); });
  }
  function slide(svg, fx, pid, from, k) {
    const e = pawnEl(svg, pid); if (!e) return Promise.resolve();
    const to = [+e.dataset.x, +e.dataset.y], d = Math.hypot(from[0] - to[0], from[1] - to[1]);
    const L = lift(svg, fx, pid); if (!L) return Promise.resolve();
    A.active.push(L.h);
    let p;
    if (d > 260) {                                  // teletrasporto / rientro lontano: svanisce e riappare
      L.el.style.transformBox = 'fill-box'; L.el.style.transformOrigin = 'center';
      p = Promise.all([run(L.el, [{ transform: T(from[0] - to[0], from[1] - to[1]) + ' scale(1)', opacity: 1 }, { transform: T(from[0] - to[0], from[1] - to[1]) + ' scale(.2)', opacity: 0, offset: 0.4 }, { transform: T(0, 0) + ' scale(.2)', opacity: 0, offset: 0.5 }, { transform: T(0, 0) + ' scale(1)', opacity: 1 }], { duration: 800 * k }), ring(fx, from, '#9d7bff', k, 3), ring(fx, to, '#9d7bff', k, 3)]);
    } else p = run(L.el, [{ transform: T(from[0] - to[0], from[1] - to[1]) }, { transform: T(0, 0) }], { duration: Math.max(500, d * 4.5) * k, easing: 'ease-in-out' });
    return p.then(() => { L.back(); const i = A.active.indexOf(L.h); if (i >= 0) A.active.splice(i, 1); });
  }

  // ───────────── attacco ─────────────
  function attackFx(svg, fx, ev, k) {
    const d = ev.d || {}, a = posOf(svg, ev.p), b = d.tgt != null ? posOf(svg, d.tgt) : null;
    if (!a || !b) return Promise.resolve();
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const after = () => {
      if (d.win) return Promise.all([ring(fx, b, '#ff3b5c', k, 3.5), disc(fx, b, '#ff3b5c', k, 32), shake(pawnEl(svg, d.tgt), k)]);
      const e = pawnEl(svg, d.tgt), ux = -dy / len * 14, uy = dx / len * 14;
      return Promise.all([floatText(fx, b, 'MANCATO', '#c8d4ff', k), e ? run(e, [{ transform: T(0, 0) }, { transform: T(ux, uy), offset: 0.4 }, { transform: T(0, 0) }], { duration: 450 * k }) : null]);
    };
    if (!d.dist) {                                  // stessa tessera: affondo
      const L = lift(svg, fx, ev.p); if (!L) return after();
      A.active.push(L.h);
      return run(L.el, [{ transform: T(0, 0) }, { transform: T(dx * 0.7, dy * 0.7), offset: 0.45 }, { transform: T(0, 0) }], { duration: 450 * k, easing: 'ease-in' })
        .then(() => { L.back(); const i = A.active.indexOf(L.h); if (i >= 0) A.active.splice(i, 1); return after(); });
    }
    // a distanza: lampo alla bocca e proiettile
    const col = d.win ? '#ffd23c' : '#9fb2ff';
    const ux = dx / len, uy = dy / len;
    const flash = disc(fx, [a[0] + ux * 30, a[1] + uy * 30], '#fff6b0', k, 14);
    const tr = mk('line', { x1: a[0], y1: a[1], x2: a[0], y2: a[1], stroke: col, 'stroke-width': 5, 'stroke-linecap': 'round', opacity: 0.9 }, fx);
    const bl = mk('circle', { cx: a[0], cy: a[1], r: 8, fill: col, stroke: '#fff', 'stroke-width': 2 }, fx);
    const dur = Math.min(520, 160 + len * 0.9) * k;
    return flash.then(() => Promise.all([run(bl, [{ transform: T(0, 0) }, { transform: T(dx, dy) }], { duration: dur, easing: 'ease-in' }),
      run(tr, [{ opacity: 0.9 }, { opacity: 0 }], { duration: dur })])).then(() => { bl.remove(); tr.remove(); return after(); });
  }

  // ───────────── dispatcher di un messaggio ─────────────
  // `st`: cosa è cambiato dal disegno precedente ({moves, born}); `banner`: elemento in cui mettere dadi e carte
  A.playBeat = (svg, ev, st, banner) => {
    A.finishAll();
    const k = A.k(), d = ev.d || {}, jobs = [];
    const dicePanel = banner && banner.querySelector('.dicebox');
    if (dicePanel && dicePanel._groups) {
      let del = 0; dicePanel._groups.forEach((g) => { jobs.push(A.tumble(g, del)); del += 250; });
      if (ev.k === 'attack') jobs.push(Promise.all(jobs.slice()).then(() => { const v = dicePanel.querySelector('.verdict'); if (v) v.classList.add('on'); }));
    }
    const gc = banner && banner.querySelector('.gaincard'); if (gc) jobs.push(A.flip(gc, k));
    if (!svg || !k) return Promise.all(jobs);
    const fx = fxLayer(svg);
    const moved = Object.assign({}, st.moves);
    const diceDelay = dicePanel ? 1100 * k : 0;           // dopo i dadi parte l'azione
    const after = (fn) => (diceDelay ? wait(diceDelay).then(fn) : fn());
    switch (ev.k) {
      case 'arrive': if (d.path && d.path.length > 1) { delete moved[ev.p]; jobs.push(walkPath(svg, fx, ev.p, d.path, k)); } break;
      case 'attack': if (d.tgt != null) jobs.push(after(() => attackFx(svg, fx, ev, k))); break;
      case 'damage': { const p = posOf(svg, ev.p); jobs.push(shake(pawnEl(svg, ev.p), k), floatText(fx, p, d.amt ? '−' + d.amt : '🛡', d.amt ? '#ff5c7a' : '#9fb2ff', k, true), disc(fx, p, '#ff3b5c', k, 30)); break; }
      case 'heal': { const p = posOf(svg, ev.p); jobs.push(floatText(fx, p, '+' + (d.n != null ? d.n : ''), '#6dff9a', k, true), ring(fx, p, '#6dff9a', k, 3)); break; }
      case 'kill': { const p = posOf(svg, ev.p); jobs.push(floatText(fx, p, '💀', '#fff', k, true), ring(fx, p, '#ffffff', k, 4)); break; }
      case 'coins': jobs.push(floatText(fx, posOf(svg, ev.p), '+' + (d.n || '') + ' 💰', '#ffd23c', k)); break;
      case 'respawn': { const e = pawnEl(svg, ev.p), p = posOf(svg, ev.p); if (e) { e.style.transformBox = 'fill-box'; e.style.transformOrigin = 'center'; jobs.push(run(e, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.25)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 700 * k })); } jobs.push(ring(fx, p, '#00ffc8', k, 4)); delete moved[ev.p]; break; }
      case 'turn': { const p = posOf(svg, ev.p); jobs.push(ring(fx, p, UI.col(ev.p), k, 3.5)); break; }
      case 'ulti': { const p = posOf(svg, ev.p); jobs.push(ring(fx, p, '#ff7a1a', k, 5), ring(fx, p, '#ffd23c', k, 3)); break; }
      case 'tempest': jobs.push(flashBoard(svg, fx, '#ffe24a', k, 0.45)); break;
      case 'period': jobs.push(flashBoard(svg, fx, ev.text.includes('NOTTE') ? '#10063a' : '#ffd86a', k, 0.5)); break;
      case 'level': if (d.cells) d.cells.forEach((ci) => {
        const p = mk('polygon', { points: UI.hexPts(...UI.cellXY(ci), 62), fill: '#000', stroke: '#ff3b5c', 'stroke-width': 4 }, fx);
        jobs.push(run(p, [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], { duration: 1400 * k })); }); break;
      case 'skill': if (d.tile != null) { /* il teletrasporto è gestito come spostamento generico */ } break;
      default: break;
    }
    for (const pid in moved) jobs.push(slide(svg, fx, pid, moved[pid], k));
    return Promise.all(jobs).then(() => { const f = svg.querySelector('#fx'); if (f) f.remove(); });
  };
  function flashBoard(svg, fx, color, k, op) {
    const vb = svg.viewBox.baseVal;
    const r = mk('rect', { x: vb.x, y: vb.y, width: vb.width, height: vb.height, fill: color }, fx);
    return run(r, [{ opacity: 0 }, { opacity: op, offset: 0.3 }, { opacity: 0 }], { duration: 900 * k });
  }
})(typeof window !== 'undefined' ? window : globalThis);
