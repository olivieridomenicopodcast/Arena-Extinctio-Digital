# Arena Extinctio — prototipo digitale per il playtest

Versione digitale di **Arena Extinctio** (battle royal da tavolo a esagoni, 2–6 giocatori) per provare le regole prima di giocare con carte e segnalini veri.
Nessuna build: apri `index.html` (o `npm run serve` → http://localhost:8080). È una **PWA** installabile e funziona offline.

**Stato: prima versione giocabile.** Motore completo con test, interfaccia con le **tessere e le carte originali**, AI a tre livelli, simulatore.
La modalità "passa il telefono" non c'è (rimandata su tua richiesta).

## Modalità
- 🤖 **Contro l'AI** (2–5 AI di livello facile / media / difficile) con 💡 *suggerimento dell'AI* facoltativo e anteprima delle conseguenze (probabilità di colpire, danno, eliminazione).
- 🍿 **AI contro AI**, da guardare, con velocità regolabile (manuale, lenta, normale, veloce, istantanea).
- 📊 **Simulazione veloce** dentro l'app e da riga di comando (vittorie con intervallo di confidenza, vantaggio di posto, durata, eventi per partita, esperimenti sulle regole, analisi di ogni carta "forzata").
- Salvataggio automatico con ripresa, cronaca esportabile (.txt e .json) con **note di playtest**, **Rivedi** a fine partita, seed per rigiocare la stessa partita.

## Comandi
```
npm test                                   # test sulle regole, sul regolamento, sull'AI (node:test)
node tools/build-rules.js                  # rigenera js/rulebook.js dopo ogni modifica a docs/REGOLAMENTO.md
node tools/build-sw.js                     # rigenera sw.js (alza la versione della cache)
node tools/sim.js --games 200 --players 4 --a hard --b medium --out report.md
node tools/sim.js --games 100 --players 3 --a hard --experiment hp=8,10,12      # confronto di un parametro di regola
node tools/sim.js --games 60 --players 3 --a medium --effects 60                # resa di ogni carta forzata
node tools/fuzz.js 100                     # 100 partite casuali con controllo delle invarianti (carte mai perse né duplicate…)
node tools/export-sprites.js               # esporta le icone SVG in assets/sprites e sprites.html
python3 tools/make-assets.py ../Arena-Extinctio-Regolamento   # rigenera le immagini WebP dagli originali
NODE_PATH=/opt/node-tools/node_modules node tools/e2e.js --mode vs|watch [--mobile]   # prova nel browser (Chromium + Playwright)
NODE_PATH=/opt/node-tools/node_modules node tools/e2e-resume.js                      # ripresa, regole, simulatore
```
I profili AI per le prove: `easy`, `medium`, `hard` e quelli "estremi" `pacifist` (non attacca mai), `camper` (si rifugia), `rusher` (attacca sempre), `random`. Strategie sbagliate di proposito: devono perdere.

## Struttura
| File | Ruolo |
|---|---|
| `docs/REGOLAMENTO.md` | regolamento unico (fonte), con ogni punto segnato **[chiarito]** o **[interpretazione]** e la tabella delle differenze dalla v1.0 |
| `docs/DA_RICORDARE.md` | misure, note di bilanciamento, cose da guardare al playtest |
| `docs/DA_IMPLEMENTARE.md` | idee decise ma non ancora fatte (con lo stato) |
| `js/data.js` | tessere, carte, armi, personaggi, parametri di regola (`DEFAULT_RULES`) |
| `js/engine.js` · `combat.js` · `cards.js` | motore: partita come generatore di decisioni, RNG con seed, stato clonabile, replay |
| `js/ai.js` | AI a 3 livelli, informazione nascosta rispettata (determinizzazione + simulazione sul motore) |
| `js/sim.js` · `tools/sim.js` | simulazioni in blocco, statistiche, esperimenti, carte forzate |
| `js/ui/*` | tavolo SVG con le immagini originali, sessione di gioco, pannelli, regole, simulatore |
| `assets/` | tessere (`tiles/`), carte e personaggi (`cards/`), logo e sfondo in WebP leggero; `sprites/` icone SVG |
| `tests/` | regole, determinismo/replay, fuzz con invarianti, regolamento sincronizzato, AI |

## Immagini
Le tessere e le carte sono **esattamente quelle** del repo `Arena-Extinctio-Regolamento`, convertite in WebP (tessere ritagliate a esagono, carte 420 px di larghezza) per tenere l'app leggera e offline. Gli originali (circa 130 MB) restano in quel repo e serviranno per il kit stampabile.

## Architettura in breve
- **Motore separato dall'interfaccia**: `game.run()` è un generatore che fa `yield` di *decisioni* (`move`, `action`, `choose`) e riceve un indice; con `cfg.beats` emette anche i messaggi a schermo.
- **RNG con seed** e cronologia delle risposte (`game.history`) → ogni partita è riproducibile, si salva e si rivede.
- **Informazione nascosta**: l'AI non legge Skill, progetti e cure in mano agli avversari, né l'ordine dei mazzi, né i dadi futuri; un test lo verifica.
- Parametri delle regole in un unico oggetto, modificabili dall'interfaccia (per gli esperimenti).
