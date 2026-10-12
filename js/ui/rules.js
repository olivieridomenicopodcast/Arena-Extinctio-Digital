/* ARENA EXTINCTIO — interfaccia: legenda e regolamento (generato da docs/REGOLAMENTO.md). */
(function (root) {
  'use strict';
  const AE = root.AE, UI = AE.UI, { h, $, esc, icon } = UI;

  UI.legendHtml = function () {
    const R = AE.DEFAULT_RULES;
    const li = (ic, t, d) => `<div class="li">${ic}<div><b>${t}</b><br><span class="small dim">${d}</span></div></div>`;
    const tile = (id, t, d) => `<div class="li"><img src="assets/tiles/t${String(id).padStart(2, '0')}.webp" width="44" alt=""><div><b>${t}</b><br><span class="small dim">${d}</span></div></div>`;
    return `<h3>Legenda</h3>
      ${li(icon('pv', 26), 'Punti vita (PV)', `${R.hp} all’inizio. A 0 sei eliminato.`)}
      ${li(icon('mana', 26), 'Mana', `${R.mana} slot (${R.manaSfera} con la Sfera di Energia). Si ricarica a ogni cambio giornata. Muoversi e attivare tessere è gratis.`)}
      ${li(icon('coin', 26), 'Monete', `Max ${R.coinsMax}. +${R.killCoins} per eliminazione, +${R.luogoCoins} su Luogo, +${R.rifugioCoins} su Rifugio a ogni cambio giornata.`)}
      ${li(icon('V', 26) + icon('U', 26) + icon('M', 26), 'Cubetti: Vetro, Uranio, Minerale', `Servono per il crafting. Ogni carta materiale ne dà ${R.cubesPerCard}. Max ${R.cubeMax} per tipo.`)}
      ${li(icon('ammo', 26), 'Munizioni', 'Ogni attacco ne consuma 1. Si ricaricano su Equipaggiamento (o 2 monete per 1).')}
      ${li(icon('armor', 26), 'Armatura', 'Assorbe danni a ogni attacco subito e perde 1 durata.')}
      ${li(icon('sun', 26) + icon('moon', 26), 'Giorno / Notte', 'Cambia a ogni cambio giornata: molti effetti dipendono da questo.')}
      ${li(icon('ulti', 26), 'Ulti', `Si raccoglie fermandosi sulla propria tessera Ulti; costa ${R.ultiMana} mana; una sola volta (poi il Sindaco la ripristina).`)}
      ${li(icon('rientro', 26), 'Rientro', 'Se vieni eliminato ma hai un rientro, torni su una tessera di respawn con PV e mana pieni.')}
      ${li(icon('trap', 26), 'Trappola Rallentante', 'Chi tocca una tessera segnalata si ferma e non può attaccare.')}
      ${li(icon('turret', 26), 'Torretta', 'Chi tocca una tessera segnalata subisce 2 danni.')}
      ${li(icon('cloud', 26), 'Nuvola tossica', '2 danni a chi ci entra (Sejhnam).')}
      ${li(icon('loot', 26), 'Bottino', 'Equipaggiamento di chi è stato eliminato: fermandoti prendi fino a 2 oggetti.')}
      ${li(icon('ghost', 26), 'Giocatore Fastidio', 'Eliminato senza rientri: tira 2 dadi per muoversi e disturbare.')}
      ${li(icon('block', 26), 'Tessera bloccata', 'Un Fastidio ci impedisce il passaggio.')}
      <h3 style="margin-top:12px">Tessere</h3>
      ${tile(1, 'Luogo', AE.TILE_TYPES.luogo.d)}${tile(7, 'Ulti', AE.TILE_TYPES.ulti.d)}${tile(20, 'Carte', AE.TILE_TYPES.carte.d)}${tile(37, 'Equipaggiamento', AE.TILE_TYPES.equip.d)}${tile(53, 'Rifugio', AE.TILE_TYPES.rifugio.d)}${tile(32, 'Teletrasporto', AE.TILE_TYPES.tele.d)}${tile(47, 'Muro', AE.TILE_TYPES.muro.d)}${tile(59, 'Insormontabile', AE.TILE_TYPES.insorm.d)}${tile(13, 'Vuota', AE.TILE_TYPES.vuota.d)}
      <h3 style="margin-top:12px">Costo degli attacchi (mana)</h3>
      <div class="small">Stessa arma nello stesso turno: <b>base</b> 0-1-2-3 · <b>standard</b> 1-3 · <b>avanzata</b> 1-4 (il 2° attacco serve la Sfera di Energia). Pugno: gratis, ma se perdi subisci 1.</div>
      <h3 style="margin-top:12px">Sfida dei dadi</h3>
      <div class="small">Attaccante 2D6 contro difensore 2D6: vince il più alto, pareggio all’attaccante. Vantaggio: 3D6 tieni i 2 migliori. Svantaggio: 3D6 tieni i 2 peggiori.</div>`;
  };

  UI.md = (s) => AE.md(s);
  UI.rulesModal = function () {
    const box = h('div', { class: 'rules' }, h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => UI.modal.close() }, '✖ Chiudi')), h('div', { html: UI.md(AE.RULEBOOK_MD || '') }));
    const m = UI.modal.open(box); m.style.maxWidth = '980px';
  };
  UI.rulesScreen = function () {
    const el = $('#screen'); el.innerHTML = '';
    const input = h('input', { type: 'text', placeholder: 'Cerca nel regolamento…', style: 'width:100%;max-width:420px', oninput: () => filter() });
    const body = h('div', { class: 'rules card' });
    el.append(h('div', { class: 'row' }, h('h2', {}, 'Regolamento'), input), body);
    body.innerHTML = UI.md(AE.RULEBOOK_MD || '# Regolamento non generato\nEsegui `node tools/build-rules.js`.');
    function filter() {
      const q = input.value.trim().toLowerCase();
      for (const e of Array.from(body.children)) e.style.display = !q || e.textContent.toLowerCase().includes(q) || /^H[1-4]$/.test(e.tagName) && false ? '' : 'none';
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
