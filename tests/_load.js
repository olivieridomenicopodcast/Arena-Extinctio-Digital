// Carica i file del motore (script classici che riempiono `globalThis.AE`), nello stesso ordine di index.html.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const files = ['js/data.js', 'js/version.js', 'js/netcore.js', 'js/engine.js', 'js/combat.js', 'js/cards.js', 'js/ai.js', 'js/sim.js', 'js/rulebook.js'];
for (const f of files) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p });
}
module.exports = globalThis.AE;
