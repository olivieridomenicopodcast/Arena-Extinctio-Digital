# Da implementare (idee decise o regole ancora semplificate)

Stato: ⬜ da fare · 🟨 fatto in modo semplificato · ✅ fatto

| Stato | Cosa | Note |
|---|---|---|
| 🟨 | **Rivendita del bottino al rientrante** (5 monete; "prendi 2 carte + rivendi" 2 monete) | Oggi chi si ferma su un bottino prende fino a 2 oggetti gratis; la rivendita al giocatore che rientra non c'è. Serve una tua decisione su *quando* si può fare (il giocatore eliminato rientra all'inizio del suo turno). |
| 🟨 | **Ulti di God_Nocy** (raggio, spinta) | Raggio 2 tessere e spinta di 1 lontano dal personaggio: sono parametri (`godNocyRange`). |
| 🟨 | **Ulti di Kone** (seguaci Sun/Moon) | Restano finché la tessera esiste; il seguace attivo (giorno = Sun, notte = Moon) blocca il passaggio. |
| 🟨 | **Difesa reattiva di 'Nganga** | Interpretazione della carta: tira una sfida; vince = assorbe 5 (giorno) / 3 (notte), perde = l'avversario subisce 2 di giorno. |
| 🟨 | **Sindaco: sostituzione tessera** | Si sceglie una tessera senza giocatori e una di un livello eliminato; la rimossa esce dal gioco. L'AI non usa mai questa opzione (usa solo "ripristina Ulti"). |
| ⬜ | **Carta Ulti "Mia Ika" scelta manuale** del rientro in caso di più Luoghi | Di notte sceglie lei la tessera: già fatto; manca solo l'anteprima sulla mappa. |
| ⬜ | **Kit stampabile** (carte fronte/retro, tessere, plance) | Seguirà con le istruzioni del repo `stampa-gioco`, quando il digitale sarà stabile. Gli originali ad alta risoluzione sono nel repo `Arena-Extinctio-Regolamento` (qui ci sono solo versioni WebP leggere). |
| ⬜ | **Modalità "passa il telefono"** | Esclusa su tua richiesta per ora. Il motore la supporta già (ogni giocatore umano ha le sue decisioni). |
| ⬜ | **Salvataggio dei log in cartella / condivisione** | Oggi la cronaca si esporta in .txt e .json dal pulsante in alto. |
| ⬜ | **Stallo con giocatori nei rifugi** | Vedi `DA_RICORDARE.md`: è una questione di regola, non la tocco senza la tua decisione. |

## Regole eliminate o spente (restano nel codice come parametri/varianti)

Per ora nessuna regola è stata eliminata. Gli interruttori a disposizione in `AE.DEFAULT_RULES`: `godNocyTemp` (l'eccesso di PV di God_Nocy è temporaneo), `godNocyRange`, `startCoins`, `inv.*`.
