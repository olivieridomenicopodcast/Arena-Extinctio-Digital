/* ARENA EXTINCTIO — piccolo convertitore Markdown → HTML (titoli, liste, tabelle, grassetto, corsivo, codice): usato dall'app e dal kit stampabile. */
(function (root) {
  'use strict';
  const AE = (root.AE = root.AE || {});
  // piccolo convertitore Markdown → HTML (titoli, liste, tabelle, grassetto, corsivo, codice)
  AE.md = function (md) {
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const inline = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\[chiarito\]/g, '<span class="tag ch">chiarito</span>').replace(/\[interpretazione\]/g, '<span class="tag in">interpretazione</span>').replace(/\*([^*]+)\*/g, '<i>$1</i>');
    const out = []; const L = md.split('\n'); let i = 0, list = null;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    while (i < L.length) {
      const l = L[i];
      if (/^\|/.test(l) && /^\|[\s:|-]+\|?$/.test(L[i + 1] || '')) {
        close(); const head = l.split('|').slice(1, -1).map((c) => c.trim()); i += 2; const rows = [];
        while (i < L.length && /^\|/.test(L[i])) { rows.push(L[i].split('|').slice(1, -1).map((c) => c.trim())); i++; }
        out.push('<table><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr>' + rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</table>'); continue;
      }
      let m;
      if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) { close(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
      else if ((m = /^\s*[-*]\s+(.*)$/.exec(l))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
      else if ((m = /^\s*\d+\.\s+(.*)$/.exec(l))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
      else if (/^\s*$/.test(l)) close();
      else { close(); out.push(`<p>${inline(l)}</p>`); }
      i++;
    }
    close(); return out.join('\n');
  };
})(typeof window !== 'undefined' ? window : globalThis);
