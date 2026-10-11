// Esporta le icone SVG in assets/sprites/*.svg e crea sprites.html (galleria). Servono anche per il kit stampabile.
const fs = require('fs'), path = require('path');
require('../tests/_load.js');
vm = require('vm');
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/ui/sprites.js'), 'utf8'));
const UI = globalThis.AE.UI, root = path.join(__dirname, '..');
fs.mkdirSync(path.join(root, 'assets/sprites'), { recursive: true });
let cells = '';
for (const n of UI.ICON_NAMES) {
  fs.writeFileSync(path.join(root, `assets/sprites/${n}.svg`), UI.iconSvg(n));
  cells += `<figure><img src="assets/sprites/${n}.svg" width="96" height="96" alt="${n}"><figcaption>${n}</figcaption></figure>`;
}
fs.writeFileSync(path.join(root, 'sprites.html'), `<!doctype html><meta charset="utf-8"><title>Sprite — Arena Extinctio</title><style>body{background:#12082e;color:#eee;font:16px system-ui;display:flex;flex-wrap:wrap;gap:16px;padding:16px}figure{margin:0;text-align:center;background:#1c1050;border-radius:12px;padding:12px}</style>${cells}`);
console.log(UI.ICON_NAMES.length + ' sprite esportati in assets/sprites e sprites.html');
