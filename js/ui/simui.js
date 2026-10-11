/* ARENA EXTINCTIO — interfaccia: simulatore dentro l'app (partite AI contro AI a blocchi, per non bloccare la pagina). */
(function (root) {
  'use strict';
  const AE = root.AE, UI = AE.UI, { h, $, esc } = UI;
  UI.simScreen = function () {
    const el = $('#screen'); el.innerHTML = '';
    const out = h('div', { class: 'card rules', style: 'margin-top:12px;display:none' });
    const bar = h('div', { class: 'bar', style: 'display:none;margin-top:8px' }, h('i', { style: 'width:0%' }));
    const lv = (def) => h('select', {}, h('option', { value: '' }, '—'), ...AE.AI_LEVELS.map((l) => h('option', { value: l, selected: l === def }, AE.LEVEL_NAMES[l])));
    const a = lv('hard'), b = lv('medium'), c = lv('');
    const n = h('select', {}, ...[2, 3, 4, 5, 6].map((x) => h('option', { value: x, selected: x === 3 }, x + ' giocatori')));
    const games = h('input', { type: 'number', value: 100, min: 4, max: 5000, style: 'width:100px' });
    const seed = h('input', { type: 'number', value: 1, style: 'width:100px' });
    const exp = h('input', { type: 'text', placeholder: 'es. hp=8,10,12 (facoltativo)', style: 'width:220px' });
    let last = null, running = false, cancel = false;
    const btn = h('button', { class: 'btn primary', onclick: async () => {
      if (running) { cancel = true; return; }
      running = true; cancel = false; btn.textContent = '⏹ Ferma'; out.style.display = 'block'; bar.style.display = 'block';
      const profiles = [a, b, c].filter((s) => s.value).map((s) => ({ label: AE.LEVEL_NAMES[s.value], level: s.value }));
      if (!profiles.length) { UI.toast('Scegli almeno un profilo'); running = false; btn.textContent = '▶ Avvia'; return; }
      const G = +games.value, N = +n.value;
      const runOne = async (rules, label) => {
        const t = { n: N, games: 0, profiles: profiles.map((p) => ({ label: p.label, wins: 0, games: 0, kills: 0 })), seatWins: Array(N).fill(0), seatGames: Array(N).fill(0), draws: 0, rounds: [], turns: [], why: {}, stats: {}, byChar: {} };
        const chunk = 4;
        for (let done = 0; done < G && !cancel; done += chunk) {
          const part = AE.Sim.tournament({ games: Math.min(chunk, G - done), n: N, profiles, seed0: +seed.value + done, rules });
          // il torneo ruota i profili a partire dall'indice di partita: per mantenere la rotazione corretta si somma il risultato
          t.games += part.games; t.draws += part.draws; t.rounds.push(...part.rounds); t.turns.push(...part.turns);
          part.profiles.forEach((p, i) => { t.profiles[i].wins += p.wins; t.profiles[i].games += p.games; t.profiles[i].kills += p.kills; });
          part.seatWins.forEach((w, i) => { t.seatWins[i] += w; t.seatGames[i] += part.seatGames[i]; });
          for (const k in part.why) t.why[k] = (t.why[k] || 0) + part.why[k];
          for (const k in part.stats) t.stats[k] = (t.stats[k] || 0) + part.stats[k];
          for (const k in part.byChar) { const x = (t.byChar[k] = t.byChar[k] || { wins: 0, games: 0 }); x.wins += part.byChar[k].wins; x.games += part.byChar[k].games; }
          bar.firstChild.style.width = (100 * Math.min(G, done + chunk) / G) + '%';
          await UI.sleep(0);
        }
        return t;
      };
      let md;
      if (exp.value.includes('=')) {
        const [k, vals] = exp.value.split('='); const list = vals.split(',').map((v) => (isNaN(Number(v)) ? v : Number(v)));
        const lines = [`# Esperimento: ${k} = ${list.join(' / ')}`, '', `${G} partite per valore · ${N} giocatori`, '', '| valore | round medi | vince il posto 1 | ' + profiles.map((p) => p.label + ' %').join(' | ') + ' |', '|---|---|---|' + profiles.map(() => '---|').join('')];
        for (const v of list) { const t = await runOne({ [k]: v }); const f = (x) => (100 * x).toFixed(1); lines.push(`| ${v} | ${AE.Sim.mean(t.rounds).toFixed(1)} | ${f(t.seatWins[0] / Math.max(1, t.games))}% | ` + t.profiles.map((p) => f(p.wins / Math.max(1, p.games)) + '%').join(' | ') + ' |'); last = t; }
        md = lines.join('\n');
      } else { const t = await runOne(undefined); last = t; md = AE.Sim.report(t, 'Simulazione ' + profiles.map((p) => p.label).join(' vs ')); }
      out.innerHTML = UI.md(md) + '<div class="row"></div>';
      const r = $('.row', out); [['Esporta Markdown', () => UI.download('simulazione.md', md)], ['Esporta JSON', () => UI.download('simulazione.json', JSON.stringify(last, null, 1))], ['Esporta CSV', () => UI.download('simulazione.csv', 'posto,vittorie,partite\n' + last.seatWins.map((w, i) => `${i + 1},${w},${last.seatGames[i]}`).join('\n'))]].forEach(([t, f]) => r.append(h('button', { class: 'btn small', onclick: f }, t)));
      running = false; btn.textContent = '▶ Avvia'; bar.style.display = 'none';
    } }, '▶ Avvia');
    el.append(h('h2', {}, 'Simulatore'), h('div', { class: 'card' },
      h('div', { class: 'row' }, h('label', {}, 'Giocatori', n), h('label', {}, 'Partite', games), h('label', {}, 'Seed iniziale', seed)),
      h('div', { class: 'row', style: 'margin-top:8px' }, h('label', {}, 'Profilo A', a), h('label', {}, 'B', b), h('label', {}, 'C', c)),
      h('div', { class: 'small dim', style: 'margin:6px 0' }, 'I profili ruotano sui posti a ogni partita: così si misura la forza dell’AI e non il vantaggio di posto. Misura: vittorie con intervallo di confidenza 95%, vantaggio di chi inizia, durata media e distribuzione, eventi per partita.'),
      h('div', { class: 'row' }, h('label', {}, 'Esperimento sulle regole', exp), btn), bar), out);
  };
})(typeof window !== 'undefined' ? window : globalThis);
