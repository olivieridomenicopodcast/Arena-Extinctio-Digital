/* ARENA EXTINCTIO — sprite: icone SVG disegnate a mano (nessuna risorsa esterna). `AE.UI.icon(nome, px)` → stringa SVG. */
(function (root) {
  'use strict';
  const AE = root.AE;
  const UI = (AE.UI = AE.UI || {});

  const P = {
    pv: '<path d="M12 21s-7.5-4.6-9.6-9.3C1 8.3 3 5 6.3 5c2 0 3.4 1.1 4.2 2.4h3C14.3 6.1 15.7 5 17.7 5 21 5 23 8.3 21.6 11.7 19.5 16.4 12 21 12 21z" fill="#ff3b5c" stroke="#ffd0d8" stroke-width="1.2"/>',
    mana: '<path d="M13.5 2 5 13.5h5.5L9.5 22 19 9.8h-5.7z" fill="#35c9ff" stroke="#d6f4ff" stroke-width="1.2" stroke-linejoin="round"/>',
    coin: '<circle cx="12" cy="12" r="9" fill="#ffd23f" stroke="#fff2b3" stroke-width="1.4"/><circle cx="12" cy="12" r="6" fill="none" stroke="#b8860b" stroke-width="1.4"/><path d="M12 8v8M9.8 10c.6-.8 1.4-1 2.2-1s1.7.3 2.2 1" fill="none" stroke="#b8860b" stroke-width="1.3" stroke-linecap="round"/>',
    V: '<g fill="none" stroke="#7fe8ff" stroke-width="1.8" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7"/><path d="M12 5.5 9.8 3.8M12 5.5l2.2-1.7M12 18.5l-2.2 1.7M12 18.5l2.2 1.7"/></g>',
    U: '<circle cx="12" cy="12" r="10.4" fill="#2b3a00" opacity=".55"/><path d="M12 12L7.40 4.03A9.2 9.2 0 0 1 16.60 4.03Z" fill="#c8ff3d" stroke="#2b3a00" stroke-width="0.8" stroke-linejoin="round"/><path d="M12 12L21.20 12.00A9.2 9.2 0 0 1 16.60 19.97Z" fill="#c8ff3d" stroke="#2b3a00" stroke-width="0.8" stroke-linejoin="round"/><path d="M12 12L7.40 19.97A9.2 9.2 0 0 1 2.80 12.00Z" fill="#c8ff3d" stroke="#2b3a00" stroke-width="0.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.2" fill="#c8ff3d" stroke="#2b3a00" stroke-width="0.8"/>',
    M: '<path d="M12 2 20 7v10l-8 5-8-5V7z" fill="#ff8a3c" stroke="#ffd2a8" stroke-width="1.3"/><path d="M12 2v20M4 7l8 5 8-5M4 17l8-5 8 5" fill="none" stroke="#a24a00" stroke-width="1" opacity=".7"/>',
    ammo: '<path d="M9 21V9c0-3 1.3-5.5 3-7 1.7 1.5 3 4 3 7v12z" fill="#e0b050" stroke="#fff0c0" stroke-width="1.2"/><rect x="9" y="17" width="6" height="4" fill="#9c7424"/>',
    armor: '<path d="M12 2 4 5v6c0 5 3.4 9 8 11 4.6-2 8-6 8-11V5z" fill="#6aa6ff" stroke="#e0ecff" stroke-width="1.3"/><path d="M12 5v14" stroke="#16307a" stroke-width="1.2" opacity=".6"/>',
    sun: '<circle cx="12" cy="12" r="4.6" fill="#ffd23f"/><g stroke="#ffd23f" stroke-width="2" stroke-linecap="round"><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></g>',
    moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5z" fill="#b9c7ff" stroke="#eef" stroke-width="1"/>',
    ulti: '<path d="M12 1.5 14.6 9l7.9.3-6.2 4.8 2.2 7.6L12 17l-6.5 4.7 2.2-7.6L1.5 9.3 9.4 9z" fill="#ff5ad7" stroke="#ffe0f7" stroke-width="1.1"/>',
    rientro: '<path d="M4 12a8 8 0 1 0 3-6.2" fill="none" stroke="#6bff9c" stroke-width="2.4" stroke-linecap="round"/><path d="M3 3v5h5" fill="none" stroke="#6bff9c" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    trap: '<g fill="none" stroke="#ffb347" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/></g>',
    turret: '<g stroke="#ffd6d6" stroke-width="1" stroke-linejoin="round"><path d="M5 21h14l-1.6-4H6.6z" fill="#8a2a2a"/><circle cx="12" cy="13" r="5" fill="#ff6b6b"/><rect x="12" y="10.6" width="9.5" height="3" rx="1" fill="#ff9a9a" transform="rotate(-18 12 12)"/><circle cx="12" cy="13" r="1.8" fill="#4d0a0a"/></g>',
    cloud: '<path d="M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8.5a4.5 4.5 0 0 1 .5 9.5z" fill="#8cff66" stroke="#e3ffd6" stroke-width="1.2" opacity=".9"/>',
    loot: '<path d="M7 9c0-3 2-5 5-5s5 2 5 5l2.5 10c.2 1-.5 2-1.5 2H6c-1 0-1.7-1-1.5-2z" fill="#c68b4e" stroke="#ffe0b0" stroke-width="1.2"/><path d="M8 10h8" stroke="#6a3f12" stroke-width="1.6"/>',
    ghost: '<path d="M5 21V11a7 7 0 0 1 14 0v10l-2.3-2-2.4 2-2.3-2-2.3 2-2.4-2z" fill="#e8f0ff" stroke="#fff" stroke-width="1"/><circle cx="9.5" cy="11" r="1.4" fill="#222"/><circle cx="14.5" cy="11" r="1.4" fill="#222"/>',
    block: '<g fill="#ff9a3c" stroke="#fff" stroke-width="1"><path d="M3 18 12 4l9 14z" /><path d="M12 9v5M12 16v1.5" stroke="#222" stroke-width="2" stroke-linecap="round"/></g>',
    skull: '<path d="M12 2a8 8 0 0 0-8 8c0 3 1.5 5 3.5 6.2V20h9v-3.8C18.5 15 20 13 20 10a8 8 0 0 0-8-8z" fill="#f2f2f2" stroke="#999" stroke-width="1"/><circle cx="9" cy="10.5" r="2" fill="#222"/><circle cx="15" cy="10.5" r="2" fill="#222"/><path d="M10 20v-2M12 20v-2M14 20v-2" stroke="#222" stroke-width="1.3"/>',
    dice: '<rect x="3" y="3" width="18" height="18" rx="3.5" fill="#fff" stroke="#999" stroke-width="1.2"/><g fill="#222"><circle cx="8" cy="8" r="1.7"/><circle cx="16" cy="8" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="8" cy="16" r="1.7"/><circle cx="16" cy="16" r="1.7"/></g>',
    carte: '<rect x="4" y="3" width="12" height="17" rx="2" fill="#7a5cff" stroke="#d9d0ff" stroke-width="1.2" transform="rotate(-8 10 11)"/><rect x="8" y="4" width="12" height="17" rx="2" fill="#ffcf5a" stroke="#fff3c9" stroke-width="1.2" transform="rotate(6 14 12)"/>',
    gun: '<path d="M2 9h13l1.5-2H20v4h-3v2h-3l-1 5H8l1-5H2z" fill="#9db4c8" stroke="#e6f0f8" stroke-width="1"/>',
    fist: '<path d="M6 10h11v7a4 4 0 0 1-4 4H9a4 4 0 0 1-3-3.4zM7 10V7a1.7 1.7 0 0 1 3.4 0v3M10.4 8a1.7 1.7 0 0 1 3.4 0v2M13.8 9a1.7 1.7 0 0 1 3.2.7V10" fill="#f0b98a" stroke="#fff0e0" stroke-width="1"/>',
    wall: '<g fill="#b9523a" stroke="#ffd0c0" stroke-width=".8"><rect x="2" y="5" width="9" height="5"/><rect x="13" y="5" width="9" height="5"/><rect x="7" y="12" width="10" height="5"/><rect x="2" y="12" width="3.5" height="5"/><rect x="18.5" y="12" width="3.5" height="5"/></g>',
    heal: '<rect x="3" y="3" width="18" height="18" rx="4" fill="#fff" stroke="#c33" stroke-width="1.2"/><path d="M12 6.5v11M6.5 12h11" stroke="#d62a2a" stroke-width="3.2" stroke-linecap="round"/>',
    shelter: '<path d="M3 11 12 3l9 8v10H3z" fill="#6bd6ff" stroke="#e6f9ff" stroke-width="1.2"/><rect x="10" y="14" width="4" height="7" fill="#12607f"/>',
    time: '<circle cx="12" cy="12" r="9" fill="none" stroke="#b9c7ff" stroke-width="1.8"/><path d="M12 6v6l4 2.5" fill="none" stroke="#b9c7ff" stroke-width="1.8" stroke-linecap="round"/>',
  };
  UI.ICON_NAMES = Object.keys(P);
  UI.icon = (name, px) => `<svg class="ico" width="${px || 22}" height="${px || 22}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;
  UI.iconSvg = (name) => `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24">${P[name]}</svg>`;
  UI.resIcon = (r, px) => UI.icon(r, px);
  UI.sprites = P;
})(typeof window !== 'undefined' ? window : globalThis);
