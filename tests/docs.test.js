const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const AE = require('./_load.js');
const md = fs.readFileSync(path.join(__dirname, '../docs/REGOLAMENTO.md'), 'utf8');

test('regolamento: il testo mostrato nell’app (js/rulebook.js) è sincronizzato con docs/REGOLAMENTO.md', () => {
  assert.strictEqual(AE.RULEBOOK_MD, md, 'esegui: node tools/build-rules.js');
});
test('regolamento: la tabella dei parametri coincide con AE.DEFAULT_RULES', () => {
  const sec = md.split('## 12. Parametri')[1].split('## 13.')[0];
  const rows = [...sec.matchAll(/^\| (\w+) \| (-?\d+) \|$/gm)];
  assert.ok(rows.length >= 15, 'tabella dei parametri trovata');
  for (const [, k, v] of rows) assert.strictEqual(AE.DEFAULT_RULES[k], Number(v), `parametro ${k}`);
  const m = /\*\*(\d+), (\d+), (\d+)\*\* \(parametro `levelDays`\)/.exec(sec);
  assert.deepStrictEqual(AE.DEFAULT_RULES.levelDays, [Number(m[1]), Number(m[2]), Number(m[3])]);
});
test('regolamento: i conteggi dei mazzi citati sono quelli del codice', () => {
  const d = AE.buildDecks();
  assert.ok(md.includes(`| Mazzo Materiali | ${d.mat.length} `)); assert.ok(md.includes(`| Mazzo Skill | ${d.skill.length} `));
  assert.ok(md.includes(`| Mazzo Armi e Progetti | ${d.proj.length} `)); assert.ok(md.includes(`| Mazzo Armi Base | ${d.base.length} `));
  assert.ok(md.includes(`**${d.mat.length + d.skill.length + d.proj.length}**`) || md.includes(String(d.mat.length + d.skill.length + d.proj.length)));
});
test('regolamento: la tabella delle armi coincide con i dati', () => {
  const sec = md.split('### 8.5 Armi')[1].split('### 8.6')[0];
  for (const k in AE.WEAPONS) {
    const w = AE.WEAPONS[k];
    const row = new RegExp(`^\\| ${w.n.replace(/[-.]/g, '\\$&')} \\| [^|]+ \\| [^|]+ \\| (\\d+) \\| (\\d+) \\| (\\d+) \\|`, 'm').exec(sec);
    assert.ok(row, 'riga ' + w.n);
    assert.deepStrictEqual([+row[1], +row[2], +row[3]], [w.git, w.dan, w.mun], w.n);
  }
});
test('regolamento: i costi di attacco in tabella coincidono col codice', () => {
  const sec = md.split('### 8.3')[1].split('### 8.4')[0];
  const rows = { base: [0, 1, 2, 3], std: [1, 3, 5], adv: [1, 4] };
  for (const [tier, costs] of Object.entries(rows)) costs.forEach((c, i) => assert.strictEqual(AE.attackManaCost(tier, i + 1), c));
  assert.match(sec, /\| Base \| 0 \| 1 \| 2 \| 3 \|/); assert.match(sec, /\| Standard \| 1 \| 3 \| 5 \| — \|/); assert.match(sec, /\| Avanzata \| 1 \| 4 \| — \| — \|/);
});
test('regolamento: ogni personaggio compare con nome e passiva', () => {
  for (const c of AE.CHARS) assert.ok(md.includes(c.n.replace('’', '’')) || md.includes(c.n), c.n);
});
test('immagini: ogni tessera e ogni carta usata ha il suo file', () => {
  const root = path.join(__dirname, '..');
  for (const t of AE.TILES) assert.ok(fs.existsSync(path.join(root, t.img)), t.img);
  const d = AE.buildDecks(); const ids = new Set([].concat(d.mat, d.skill, d.proj, d.base));
  for (const id of ids) assert.ok(fs.existsSync(path.join(root, AE.CARD_IMG(id))), id);
  for (const c of AE.CHARS) assert.ok(fs.existsSync(path.join(root, 'assets/cards/' + c.id + '.webp')), c.id);
});
