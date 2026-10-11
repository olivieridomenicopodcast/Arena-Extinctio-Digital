// Genera js/rulebook.js dal regolamento unico docs/REGOLAMENTO.md (mostrato nell'app alla voce Regole).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const md = fs.readFileSync(path.join(root, 'docs/REGOLAMENTO.md'), 'utf8');
fs.writeFileSync(path.join(root, 'js/rulebook.js'), '/* GENERATO da tools/build-rules.js a partire da docs/REGOLAMENTO.md — non modificare a mano. */\n(function (r) { (r.AE = r.AE || {}).RULEBOOK_MD = ' + JSON.stringify(md) + '; })(typeof window !== "undefined" ? window : globalThis);\n');
console.log('js/rulebook.js generato (' + md.length + ' caratteri)');
