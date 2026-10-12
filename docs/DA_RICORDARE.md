# Da ricordare — misure, note di bilanciamento, cose da guardare al playtest

Tutte le misure sono fatte col **simulatore** (`node tools/sim.js …`), con l'AI *difficile* contro sé stessa salvo diversa indicazione, posti e profili ruotati in modo bilanciato, **intervalli di confidenza al 95%** (Wilson). Sono misure di *questa* versione di regole e di AI: se cambia una regola o l'AI vanno rifatte. **Nessuna regola è stata cambiata per rimediare a quello che trovo qui sotto: sono segnalazioni, la decisione è tua.**

## 1. Obiettivi di bilanciamento (proposti, da confermare)
1. Nessun posto di turno sopra "1/N + 10 punti" (per esempio con 3 giocatori nessun posto oltre il 43%).
2. L'abilità conta: AI difficile > media > facile, in modo netto.
3. Le strategie sbagliate di proposito (non attaccare mai, scelte a caso, solo rifugio, solo attacco) non devono battere la media.
4. Durata della partita: **da decidere insieme** (non mi hai ancora detto il massimo accettabile al tavolo: 60–90 minuti?).
5. Nessuno stallo: una partita deve poter finire.

## 2. Durata e vantaggio di posto (AI difficile contro sé stessa, 120 partite per numero di giocatori)

| Giocatori | Round: media | mediana | 10° – 90° perc. | max | partite > 100 round | Vince il posto 1 (atteso) |
|---|---|---|---|---|---|---|
| 2 | 46 | 32 | 17 – 54 | 401 (limite) | 5,0% (4 interrotte al limite) | 54% (50%) |
| 3 | 21 | 18 | 6 – 32 | 336 | 0,8% | 36% (33%) |
| 4 | 11 | 7 | 2 – 27 | 53 | 0% | 27% (25%) |
| 5 | 11 | 9 | 3 – 22 | 46 | 0% | 13% (20%) |
| 6 | 12 | 7 | 2 – 29 | 41 | 0% | 11% (17%) con IC 6–18% |

Un round = un turno per tutti. Con 4–6 giocatori **la partita finisce di solito in meno di 10 round**: il primo livello della mappa (round 11) spesso non fa in tempo a sparire. Con 2–3 giocatori ci sono i rientri e la partita dura molto di più.
Vantaggio di posto: con 6 giocatori l'**ultimo** posto vince il 28% delle partite (IC 21–37%, atteso 17%); con 2 giocatori chi inizia vince il 54% (IC 45–63%, quindi non è dimostrato). Da rimisurare con più partite prima di fare conclusioni.

## 3. L'abilità conta? (3 giocatori, 90 partite, posti e profili ruotati)

| Prova | Risultato | Atteso |
|---|---|---|
| difficile / media / facile | **61% / 33% / 6%** (IC difficile 51–70%) | 33% ciascuno |
| 2 difficili + **non attacca mai** | non attacca mai **9%** (IC 5–17%) | 33% |
| 2 difficili + **a caso** | a caso **6%** (IC 2–12%) | 33% |
| 2 difficili + **solo attacco** | solo attacco **27%** (IC 19–37%) | 33% |
| 2 difficili + **solo rifugio** | solo rifugio **38%** (IC 28–48%) | 33% |
| 1 difficile contro **solo rifugio**, 2 giocatori (100 partite) | difficile 79%, solo rifugio **16%** (IC 10–24%), 5 interrotte al limite | 50% |

Lettura: livelli ben distinti e le strategie davvero sbagliate perdono. Ma **"solo rifugio" non perde con 3 giocatori** (si fa portare la vittoria dagli altri due che si combattono: è il classico "terzo incomodo" dei battle royal), e "solo attacco" quasi pareggia con l'AI difficile: la sfida 2D6 contro 2D6 lascia molto alla fortuna.

## 4. Possibili buchi di regola (misurati, da decidere)

1. **Il pugno è gratis e illimitato** (Gittata 0, danno 1, colpi ∞, costa 0 mana, se perdi subisci 1). Colpisce il 58% delle volte (pareggio all'attaccante), quindi ogni pugno ha valore atteso positivo e conviene sempre spammarlo. Nel primo round tutti corrono alla stessa tessera Equipaggiamento e fanno a pugni: partite da 4 giocatori lunghe in media **11 round (mediana 7)**, il 10% finisce entro 2 round. Con il parametro `punchMax` (pugni massimi per turno, 0 = illimitati):

   | punchMax | round medi (mediana), 4 giocatori, 100 partite |
   |---|---|
   | 0 (regola attuale) | 11,7 (7) |
   | 1 | 36,5 (30) |
   | 2 | 32,8 (28) |
   | 3 | 25,1 (24) |

   Si prova dall'app: *Parametri delle regole → Pugni max per turno*, oppure `node tools/sim.js --players 4 --a hard --experiment punchMax=0,1,2,3`.
2. **Stallo nei rifugi.** Dentro un Rifugio non si subiscono né si danno attacchi, e si prende 1 moneta a ogni cambio giornata. Un giocatore che resta fermo in un rifugio non si può dislodgere (se non con la Tempesta Imminente). Nelle partite 2 giocatori il 5% supera 100 round e il 3% arriva al **limite di 400 round** senza vincitore; con 3 giocatori si è visto un caso da 336 round. Nel log: due giocatori che oscillano fra due rifugi senza mai attaccarsi.
3. **La Plancia Tempo conta poco** con 4–6 giocatori (la partita finisce prima del round 11) e **moltissimo** con 2–3 (dopo il livello 3 restano 7 tessere e si ricomincia a giocare con 1D6). Se vuoi che il restringimento della mappa sia protagonista, le giornate (5-4-3) vanno ridotte o il pugno limitato.
4. **Personaggi** (AI difficile, casuali, tutte le partite sommate: 600 partite). Rapporto fra vittorie osservate e attese: Hatci **1,51** (89 contro 59 attese), Mia Ika 1,19, Lasep 1,08, Soshito 1,05, God_Nocy 1,05, Kone 0,95, Ricca 0,90, Karou 0,81, **Sejhnam 0,68**, **’Nganga 0,67**. Attenzione: dipende anche da come l'AI usa le Ulti; per 'Nganga e Mia Ika (Ulti "reattive") e per Sejhnam la stima è meno affidabile.
5. **Carico mentale al tavolo** (segnalato come chiedi): (a) il costo degli attacchi cresce *per arma e per turno* (0-1-2-3, 1-3, 1-4): bisogna ricordare quanti attacchi con ciascuna arma; (b) con vantaggio/svantaggio si tirano 3 dadi e se ne scartano 1; (c) i pugni illimitati significano decine di tiri a turno; (d) bottino, rientri, mod e progetti sono molti oggetti da tracciare; (e) le Ulti hanno molti casi (giorno/notte). Il resto (somme e confronti) è leggero.

## 5. Cose da riguardare al playtest (interpretazioni mie)
Vedi le voci **[interpretazione]** del regolamento. Le più importanti: raggio e spinta dell'Onda di God_Nocy; difesa reattiva di ’Nganga (come funziona il tiro); nuvola tossica di Sejhnam (dove, quanto dura); seguaci di Kone (dove, quanto restano); Hatci di giorno (cosa si "lancia"); costo in mana di Cibo/Medikit (ora 1); la Tempesta Imminente colpisce anche chi la usa; Zaino (+2 per ogni risorsa); inventario dei progetti (1 per tipo) e delle carte speciali (2); quando il Fastidio ruba il cubetto va perso; monete iniziali 0; ordine di turno fisso per posto.

## 6. Domande aperte per te
1. Durata massima accettabile della partita al tavolo (per fissare l'obiettivo n. 4)?
2. Vuoi tenere il pugno gratis e illimitato (come regolamento) o provo un limite per turno?
3. Come vuoi trattare il Rifugio (stallo)? Per esempio: niente moneta se resti più di N turni, oppure una Tempesta ricorrente… Dimmelo e lo misuro.
4. Le giornate 5-4-3 sono quelle giuste? (Non ricordavi bene: restano parametro.)
5. La rivendita del bottino al rientrante (vedi `DA_IMPLEMENTARE.md`): quando si può fare?

## 7. Come rifare le misure
```
node tools/sim.js --games 120 --players 4 --a hard --out report.md --json report.json
node tools/sim.js --games 90 --players 3 --a hard --b hard --c camper     # prove estreme (anche pacifist, rusher, random)
node tools/sim.js --games 100 --players 4 --a hard --experiment punchMax=0,1,2,3
node tools/sim.js --games 60 --players 3 --a medium --effects 60          # resa di ogni carta forzata
```
