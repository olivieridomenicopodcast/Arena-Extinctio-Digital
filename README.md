# Arena Extinctio — prototipo digitale per il playtest

Versione digitale di **Arena Extinctio** (battle royal da tavolo a esagoni, 2–6 giocatori) per provare le regole prima di giocare con carte e segnalini veri.
Nessuna build: apri `index.html` (o `npm run serve` → http://localhost:8080). È una **PWA** installabile e funziona offline.

**Stato: versione completa per il playtest.** Motore con test, interfaccia con le **tessere e le carte originali**, AI a tre livelli, simulatore, **kit stampabile** (carte 9 per foglio A4, tessere, zone, plance, PDF).
La modalità "passa il telefono" non c'è (rimandata su tua richiesta).

## Modalità
- 🤖 **Contro l'AI** (2–5 AI di livello facile / media / difficile) con 💡 *suggerimento dell'AI* facoltativo e anteprima delle conseguenze (probabilità di colpire, danno, eliminazione).
- 🍿 **AI contro AI**, da guardare, con velocità regolabile (manuale, lenta, normale, veloce, istantanea).
- 📊 **Simulazione veloce** dentro l'app e da riga di comando (vittorie con intervallo di confidenza, vantaggio di posto, durata, eventi per partita, esperimenti sulle regole, analisi di ogni carta "forzata").
- 🖨 **Stampa e gioca**: dalla home si apre `stampa/index.html` con i PDF da scaricare (carte fronte/retro e solo fronti, tessere, zone di gioco, Plancia Tempo, plance giocatore, scheda riassuntiva, regolamento), le impostazioni di stampa e l'elenco dei segnalini fisici.
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
node tools/build-print.js                  # rigenera il kit stampabile in stampa/ (HTML + PDF, serve Playwright)
python3 tools/make-print-assets.py ../Arena-Extinctio-Regolamento   # immagini per la stampa (JPEG 300 dpi) dagli originali
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
| `stampa/` | kit stampabile generato da `tools/build-print.js` (PDF committati) e `stampa/img` (immagini per la stampa) |
| `tests/` | regole, determinismo/replay, fuzz con invarianti, regolamento sincronizzato, AI |

## Immagini
Le tessere e le carte sono **esattamente quelle** del repo `Arena-Extinctio-Regolamento`, convertite in WebP (tessere ritagliate a esagono, carte 420 px di larghezza) per tenere l'app leggera e offline. Per la stampa ci sono anche JPEG a 300 dpi in `stampa/img` (carte portate al formato poker allargando la cornice, non deformate). Gli originali (circa 130 MB) restano nel repo `Arena-Extinctio-Regolamento`.

## Architettura in breve
- **Motore separato dall'interfaccia**: `game.run()` è un generatore che fa `yield` di *decisioni* (`move`, `action`, `choose`) e riceve un indice; con `cfg.beats` emette anche i messaggi a schermo.
- **RNG con seed** e cronologia delle risposte (`game.history`) → ogni partita è riproducibile, si salva e si rivede.
- **Informazione nascosta**: l'AI non legge Skill, progetti e cure in mano agli avversari, né l'ordine dei mazzi, né i dadi futuri; un test lo verifica.
- Parametri delle regole in un unico oggetto, modificabili dall'interfaccia (per gli esperimenti).

## Plancia Tempo scelta alla creazione
Quando crei una partita (anche in rete) puoi scegliere dopo quante giornate sparisce ogni livello della mappa: livello 5, poi 4, poi 3 (base **5 – 4 – 3**, una giornata = giorno + notte). Il valore viaggia con le regole: gli amici in rete lo ricevono dal tavolo e il salvataggio lo ricorda. Pulsante «Ripristina» per tornare al 5-4-3.

## Partita con gli amici (più dispositivi)
Dalla home: **Crea una stanza** (il tuo dispositivo fa da tavolo) e gli amici **Unisciti a una stanza** con il codice di 4 caratteri o dal link. Per ogni posto scegli: tu, un amico su un altro dispositivo oppure un'AI (qualsiasi combinazione, da 2 a 6 posti). Il collegamento è diretto fra i dispositivi (WebRTC, libreria PeerJS in `js/vendor/`); il servizio pubblico di PeerJS serve solo a farli trovare, quindi serve internet **al momento del collegamento**. Se un amico si disconnette, il tavolo può aspettarlo (rientra con lo stesso nome) oppure far giocare l'AI al suo posto.

**Salvataggio e ripresa del tavolo.** Il tavolo salva da sé la partita sul proprio dispositivo (`localStorage`, chiave `ae-netsave-v1`) dopo ogni scelta: seed, giocatori e posti (io/amico/AI, personaggi), regole, cronologia delle risposte, codice stanza, nome di ogni amico, e una fotografia a inizio turno. Se chiude l'app, nella home compare **«Partita in rete in sospeso»** → **«Riapri la stanza»**: la partita si ricostruisce identica (il motore è deterministico: seed + risposte), la stanza riapre **con lo stesso codice** (se il servizio lo tiene ancora occupato riprova ogni 3 s fino a 8 volte, poi propone un codice nuovo) e gli amici rientrano con lo stesso nome (se hanno la finestra aperta premono «Riconnetti»). Si riprende quando sono tornati tutti; chi entra con un nome non presente nel salvataggio viene rifiutato e il tavolo lo segnala. Se nel frattempo le regole dell'app sono cambiate, si riparte dall'inizio dell'ultimo turno invece di rigiocare le risposte. Il salvataggio si cancella a fine partita e con «Abbandona la partita»; uscire con «Menu» non lo cancella. Se l'AI aveva preso il posto di un amico caduto, dopo la ripresa torna l'attesa dell'amico.
I messaggi di rete sono sempre JSON puro e piccoli: PeerJS chiude il collegamento oltre ~16 KB, quindi i messaggi grandi si spezzano in parti da ~8 KB (`js/netcore.js`) e il log si manda a blocchi da 25 eventi. Prove: `tests/net.test.js` (Node) e `tools/e2e-net.js [--resume]`, `tools/e2e-net-drop.js` (browser, con `tools/peer-server.js`). Prove nel browser: `tools/peer-server.js` + `tools/e2e-net.js` e `tools/e2e-net-drop.js`.
