# Da ricordare — misure, note di bilanciamento, cose da guardare al playtest

Tutte le misure sono fatte col **simulatore** (`node tools/sim.js …`), con l'AI *difficile* contro sé stessa salvo diversa indicazione, posti e profili ruotati in modo bilanciato, **intervalli di confidenza al 95%** (Wilson, tra parentesi o tra quadre). Sono misure di *questa* versione di regole e di AI: se cambia una regola o l'AI vanno rifatte. **Nessuna regola è stata cambiata per rimediare a quello che trovo qui sotto: sono segnalazioni, la decisione è tua.** Le varianti che ho aggiunto sono spente di default e servono solo a misurare (`punchMax`, `shelterLimit`).

## 1. Obiettivi di bilanciamento (proposti, da confermare)
1. Nessun posto di turno oltre "1/N + 10 punti" (con 3 giocatori nessun posto oltre il 43%).
2. L'abilità conta: AI difficile > media > facile, in modo netto.
3. Le strategie sbagliate di proposito (non attaccare mai, scelte a caso, solo rifugio, solo attacco) non devono battere la media.
4. Durata della partita: **da decidere insieme** (non mi hai ancora detto il massimo accettabile al tavolo: 60–90 minuti?).
5. Nessuno stallo: una partita deve poter finire.

## 2. Durata e vantaggio di posto (AI difficile contro sé stessa, 120 partite per numero di giocatori)

| Giocatori | Round: media | mediana | 10° – 90° perc. | partite > 100 round | interrotte al limite (400) | Vince il posto 1 (atteso) | Vince l'**ultimo** posto (atteso) |
|---|---|---|---|---|---|---|---|
| 2 | 46 | 32 | 18 – 61 | 5,0% | 3 | 52% [43–60] (50%) | 46% [37–55] |
| 3 | 25 | 18 | 8 – 31 | 1,7% | 2 | 27% [20–35] (33%) | 39% [31–48] |
| 4 | 14 | 11 | 3 – 31 | 0% | 0 | 26% [19–34] (25%) | 24% [17–33] |
| 5 | 16 | 10 | 3 – 29 | 0,8% | 1 | 14% [9–22] (20%) | 26% [19–34] |
| 6 | 13 | 11 | 3 – 28 | 0% | 0 | 9% [5–16] (17%) | **36% [28–45]** (17%) |

Un round = un turno per tutti. Con 4–6 giocatori **la partita finisce di solito in circa 10 round**: il primo livello della mappa (round 11) spesso non fa in tempo a sparire. Con 2–3 giocatori ci sono i rientri e la partita dura molto di più.
**Vantaggio di posto:** con 6 giocatori l'**ultimo** posto vince il 36% delle partite (atteso 17%, intervallo 28–45%): è una differenza netta; il primo posto vince solo il 9%. Con 3 e 5 giocatori l'ultimo posto tende a vincere di più. Probabile causa: nel primo round tutti corrono alla stessa tessera Equipaggiamento e si picchiano, e chi gioca per ultimo trova gli altri già feriti.

## 3. L'abilità conta? (3 giocatori, 90 partite, posti e profili ruotati)

| Prova | Risultato | Atteso |
|---|---|---|
| difficile / media / facile | **58% / 39% / 3%** (IC difficile 48–68%) | 33% ciascuno |
| 2 difficili + **non attacca mai** | non attacca mai **4%** (IC 2–11%) | 33% |
| 2 difficili + **a caso** | a caso **4%** (IC 2–11%) | 33% |
| 2 difficili + **solo attacco** | solo attacco **19%** (IC 12–28%) | 33% |
| 2 difficili + **solo rifugio** | solo rifugio **39%** (IC 30–49%) | 33% |
| 1 difficile contro **solo rifugio**, 2 giocatori (100 partite) | difficile 79%, solo rifugio **17%** (IC 11–26%) | 50% |

Lettura: i livelli sono distinti e le strategie davvero sbagliate perdono. Ma **"solo rifugio" non perde con 3 giocatori**: si fa portare la vittoria dagli altri due che si combattono (il classico "terzo incomodo" dei battle royal), e la differenza fra AI difficile e media è meno marcata che fra media e facile: la sfida 2D6 contro 2D6 lascia molto alla fortuna.

## 4. Possibili buchi di regola (misurati, da decidere)

1. **Il pugno è gratis e illimitato** (gittata 0, danno 1, colpi ∞, costa 0 mana, se perdi subisci 1). Colpisce il 58% delle volte (pareggio all'attaccante), quindi ogni pugno ha valore atteso positivo e conviene spammarlo. Nel primo round tutti corrono alla stessa tessera e fanno a pugni: in un log un giocatore ha dato **25 pugni in un solo turno**. Con il parametro `punchMax` (pugni massimi per turno, 0 = illimitati), 4 giocatori, 100 partite:

   | punchMax | round medi (mediana) | oltre 100 round | primo posto |
   |---|---|---|---|
   | 0 (regola attuale) | 14,9 (12) | 0% | 24% |
   | 1 | 37,4 (30) | 2% | 33% |
   | 2 | 32,7 (28) | 2% | 32% |
   | 3 | 25,7 (24) | 1% | 27% |

   Si prova dall'app (*Parametri delle regole → Pugni max per turno*) o con `node tools/sim.js --players 4 --a hard --experiment punchMax=0,1,2,3`.
2. **Stallo nei rifugi — decisione di Niky: non è un problema** (il movimento è obbligato a ogni turno, quindi non si può restare fermi in un rifugio). Nel simulatore, però, due rifugi vicini si possono "rimbalzare" anche con il movimento esatto (con 2D6 esiste quasi sempre un percorso di quella lunghezza fra i due): succede raramente, vedi i numeri. Lo lascio com'è e lo tengo d'occhio al playtest. **Stallo nei rifugi — dati:** Dentro un Rifugio non si subiscono danni da nessuna fonte esterna (attacchi, Colpo Distruttivo, Tempesta Imminente, Pioggia acida di giorno…): **nessuna carta può dislodgere chi ci sta** (l'unica eccezione è la Pioggia acida di notte di Lasep, 1 danno a tutti anche nei rifugi). Se tutti i giocatori rimasti si mettono nei rifugi la partita non finisce più: visto più volte nei log (tre giocatori che oscillano fra due rifugi per 400 round, tutti a 10 PV). Frequenza: con 2 giocatori il 5% supera 100 round e il 2,5% arriva al limite, con 3 giocatori l'1,7%. Provato:
   - `rifugioCoins = 0` (niente moneta nei rifugi): **nessun effetto** (4,2% → 4,2%), quindi non sono le monete;
   - variante `shelterLimit` (dopo N turni di fila in un Rifugio il movimento successivo non può finire in un Rifugio):

   | shelterLimit | 2 giocatori: oltre 100 round / limite | 3 giocatori: oltre 100 round / limite | round medi (2p / 3p) |
   |---|---|---|---|
   | 0 (regola attuale) | 5,0% / 3 | 1,7% / 2 | 46 / 25 |
   | 2 | 2,5% / 0 | 0% / 0 | 34 / 16 |
   | 3 | 1,7% / 0 | 0% / 0 | 35 / 18 |

   Cambia poco la forza relativa dei profili. Altre strade possibili (non provate): la Plancia Tempo toglie anche i rifugi quando restano i livelli 1–2; una Tempesta che colpisce anche i rifugi; il rifugio protegge solo per N turni.
3. **La Plancia Tempo conta poco** con 4–6 giocatori (la partita finisce intorno al round 10–15, il livello 5 salta al round 11) e **moltissimo** con 2–3 (dopo il livello 3 restano 7 tessere e si gioca a 1D6). Se vuoi che il restringimento della mappa sia protagonista, le giornate (5-4-3) vanno ridotte o il pugno limitato.
4. **Vantaggio dell'ultimo di turno** (vedi §2): 36% con 6 giocatori, 39% con 3.
5. **Personaggi** (AI difficile, scelti a caso, 600 partite sommate). Rapporto fra vittorie osservate e attese: Hatci **1,66** (98 contro 59 attese), Lasep 1,24, Mia Ika 1,13, Soshito 1,11, God_Nocy 0,90, ’Nganga 0,87, Sejhnam 0,85, Kone 0,84, **Karou 0,67**, **Ricca Gigaduca 0,67**. Attenzione: dipende anche da come l'AI usa le Ulti; per ’Nganga e Mia Ika (Ulti "reattive") e per Sejhnam la stima è meno affidabile. Hatci (+1 danno su tutto) e Lasep (vantaggio sempre) hanno passive molto forti in un gioco in cui si lanciano molti attacchi.
6. **Carico mentale al tavolo** (segnalato come chiedi): (a) il costo degli attacchi cresce *per arma e per turno* (0-1-2-3, 1-3, 1-4): bisogna ricordare quanti attacchi con ciascuna arma; (b) con vantaggio/svantaggio si tirano 3 dadi e se ne scartano 1; (c) i pugni illimitati significano decine di tiri a turno; (d) bottino, rientri, mod e progetti sono molti oggetti da tracciare; (e) le Ulti hanno molti casi (giorno/notte); (f) la Plancia Tempo conta 24 cambi giornata. Il resto (somme e confronti) è leggero.

## 5. Cose da riguardare al playtest (interpretazioni mie)
Vedi le voci **[interpretazione]** del regolamento. Le più importanti: raggio e spinta dell'Onda di God_Nocy; difesa reattiva di ’Nganga (come funziona il tiro); nuvola tossica di Sejhnam (dove, quanto dura); seguaci di Kone (dove, quanto restano); Hatci di giorno (cosa si "lancia"); la Tempesta Imminente colpisce anche chi la usa; Zaino (+2 per ogni risorsa); inventario dei progetti (1 per tipo) e delle carte speciali (2); quando il Fastidio ruba il cubetto va perso; monete iniziali 0; ordine di turno fisso per posto; rivendita del bottino (solo finché il proprietario è in attesa di rientrare); le Skill/effetti che tolgono il mana agli avversari (si ferma a 0).

## 6. Decisioni prese (risposte di Niky)
1. **Durata massima al tavolo:** non lo so ancora → obiettivo n. 4 aperto; si decide dopo i primi playtest.
2. **Pugno:** resta **gratis e illimitato** [chiarito] (se fallisce si perdono PV, quindi non conviene rischiare troppo).
3. **Rifugio/stallo:** non è un problema, il movimento è obbligato a ogni turno. Nessuna modifica; `shelterLimit` resta una variante spenta per le prove.
4. **Giornate 5-4-3:** per ora restano così.
5. **Ordine di turno:** resta fisso per posto [chiarito], anche se l'ultimo di turno vince di più con 6 giocatori (da riguardare al playtest).
6. **Rivendita del bottino:** va bene com'è [chiarito].

## 7. Cosa è cambiato nell'AI durante questa tappa (letti i log di partite difficile contro difficile)
- Non fa più attacchi "suicidi": un contraccolpo (pugno perso, corpo a corpo) che può ucciderla pesa molto, e pesa di più quando ha pochi PV.
- Cerca i bersagli esposti (soprattutto feriti) e considera i rifugi poco attraenti quando sta bene; dopo molti round senza danni il timore cala.
- Non resta fermo ad aspettare per sempre se qualcuno è esposto: ma se *tutti* sono nei rifugi non c'è nulla da fare (vedi §4.2).

## 8. Come rifare le misure
```
node tools/sim.js --games 120 --players 4 --a hard --out report.md --json report.json
node tools/sim.js --games 90 --players 3 --a hard --b hard --c camper     # prove estreme (anche pacifist, rusher, random)
node tools/sim.js --games 100 --players 4 --a hard --experiment punchMax=0,1,2,3
node tools/sim.js --games 120 --players 2 --a hard --experiment shelterLimit=0,2,3
node tools/sim.js --games 60 --players 3 --a medium --effects 60          # resa di ogni carta forzata
```

## 9. Animazioni (aggiunte dopo la richiesta di Niky)
Dadi che rotolano (movimento e sfide: il dado scartato col vantaggio/svantaggio è scurito), pedina che cammina lungo il percorso (portali: sparisce e riappare), affondo nello stesso spazio, proiettile con lampo a distanza, scossa e −N sul colpito, "MANCATO", +N verde per le cure, 💀 all'eliminazione, monete, rientro, Ulti, cambio giorno/notte, tempesta, livello che sparisce e carta guadagnata nel messaggio. Seguono la velocità scelta (istantanea = nessuna), rispettano `prefers-reduced-motion` e un clic su *Avanti* le salta. Prova nel browser: `NODE_PATH=/opt/node-tools/node_modules node tools/e2e-anim.js`.

## 10. Tessera Equipaggiamento: una sola scelta (regola di Niky)
Sulla tessera si fa **una sola cosa** (arma base, o munizioni al massimo, o medikit). Rimisurato con la regola nuova (3 giocatori, 240 partite, difficile/media/facile): **51% [45–57] / 36% [30–43] / 13% [9–17]**; prima della modifica era 58/39/3 (90 partite): la facile guadagna perché ora la scelta giusta pesa meno. Il test dei livelli AI usa 60 partite e controlla solo che la facile sia nettamente dietro (la distanza difficile/media a 60 partite è dentro il rumore).

## 11. Rifugi: non ci si ferma due turni di fila (regola di Niky, ora attiva)
`shelterLimit = 1`: se il turno prima sei finito in un Rifugio, nel turno dopo il movimento non può terminare in un Rifugio (si può passarci sopra). Misure dopo la modifica (AI difficile): 2 giocatori, 100 partite: round medi 46, massimo 172, nessuna al limite dei 400 (prima 3 su 100 al limite); 3 giocatori con 2 difficili + "solo rifugio" (90 partite): difficili 34% e 24%, **solo rifugio 41% [31–51]** (prima 39%). Quindi gli stalli veri spariscono, ma "solo rifugio" che salta fra due rifugi a turni alterni **vince comunque come prima** con 3 giocatori: lo stile di gioco che vedi nelle AI (fermarsi nei rifugi un turno sì e uno no) è ancora conveniente. Se vuoi scoraggiarlo servono altre regole (es. il rifugio protegge solo se hai appena preso la moneta, i rifugi spariscono coi livelli, ecc.): da decidere insieme.

## 12. Salvataggi e aggiornamenti delle regole
Il salvataggio contiene la cronologia delle scelte (si rigioca mossa per mossa) **e**, da ora, un'istantanea dello stato a inizio di ogni turno. Se il motore è cambiato dal salvataggio (impronta in `js/version.js`, rigenerata da `node tools/build-sw.js`), la cronologia non è più affidabile — le opzioni disponibili sono cambiate — e la partita riparte dall'istantanea (si perde solo il turno in corso). I salvataggi fatti **prima** di questa funzione non hanno istantanea: l'app avvisa e non li carica di nascosto. Per il playtest: dopo ogni aggiornamento delle regole non contare di riprendere esattamente una partita già iniziata a metà turno.

## 13. Pugno a costo crescente (regola di Niky) e mazzo Materiali
**Pugno:** il 1° del turno è gratis, poi 1, 2, 3 mana (stessa scala delle armi base, si azzera ogni turno): con 4 mana al massimo 3 pugni a turno. Prima era gratis e illimitato e un'AI poteva darne decine in un turno. Misura dopo la modifica (4 giocatori, AI difficile, 100 partite): **round medi 36** (mediana 35, 10°–90° percentile 23–51, massimo 104), contro i **15** di prima: le partite ora durano più del doppio; il parametro `punchMax` (0 = nessun tetto oltre al mana) resta per gli esperimenti. Da riguardare il bilanciamento e la durata al prossimo playtest.
**Medikit "sempre trovato" dall'AI:** il mazzo è mischiato con Fisher–Yates a inizio partita e a ogni rimescolo. Misurato su 1870 carte Materiali pescate da AI difficili: Medikit 13,2% (atteso 13,3% = 10 su 75); se l'AI ha ≤5 PV 12,7%; sulle carte comprate "coperte" dal mazzo Materiali 13,3% su 2483 (AI media: 13,0%). Quindi l'AI non sbircia: l'impressione viene dal fatto che le carte di cura vengono comprate proprio quando servono e si ricordano di più.
