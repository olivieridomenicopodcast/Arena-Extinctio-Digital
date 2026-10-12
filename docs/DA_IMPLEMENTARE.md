# Da implementare (idee decise o regole ancora semplificate)

Stato: ⬜ da fare · 🟨 fatto in modo semplificato · ✅ fatto

| Stato | Cosa | Note |
|---|---|---|
| ✅🟨 | **Rivendita del bottino al rientrante** (5 monete; "prendi 2 carte + rivendi" 2 monete) | Fatta con questa interpretazione: si può rivendere solo finché il proprietario è *in attesa di rientrare* (cioè tra la sua eliminazione e l'inizio del suo turno); le monete vengono dalla banca e il bottino gli torna quando rientra. Confermata da Niky. |
| 🟨 | **Ulti di God_Nocy** (raggio, spinta) | Raggio 2 tessere e spinta di 1 lontano dal personaggio: sono parametri (`godNocyRange`). |
| 🟨 | **Ulti di Kone** (seguaci Sun/Moon) | Restano finché la tessera esiste; il seguace attivo (giorno = Sun, notte = Moon) blocca il passaggio. |
| 🟨 | **Difesa reattiva di 'Nganga** | Interpretazione della carta: tira una sfida; vince = assorbe 5 (giorno) / 3 (notte), perde = l'avversario subisce 2 di giorno. |
| 🟨 | **Sindaco: sostituzione tessera** | Si sceglie una tessera senza giocatori e una di un livello eliminato; la rimossa esce dal gioco. L'AI non usa mai questa opzione (usa solo "ripristina Ulti"). |
| ⬜ | **Carta Ulti "Mia Ika" scelta manuale** del rientro in caso di più Luoghi | Di notte sceglie lei la tessera: già fatto; manca solo l'anteprima sulla mappa. |
| ✅ | **Kit stampabile** (carte fronte/retro e solo fronti, tessere, zone, Plancia Tempo, plance, scheda, regolamento) | Fatto, vedi `stampa/index.html`. Plancia Tempo e plance giocatore sono disegnate da me (non erano nei materiali): [interpretazione]. |
| ⬜ | **Modalità "passa il telefono"** | Esclusa su tua richiesta per ora. Il motore la supporta già (ogni giocatore umano ha le sue decisioni). |
| ⬜ | **Salvataggio dei log in cartella / condivisione** | Oggi la cronaca si esporta in .txt e .json dal pulsante in alto. |
| ✅ | **Stallo con giocatori nei rifugi** | Niente da fare per decisione di Niky (movimento obbligato). Resta la variante `shelterLimit` spenta per le prove. |

## Regole eliminate o spente (restano nel codice come parametri/varianti)

Per ora nessuna regola è stata eliminata. Varianti spente di default: `punchMax` (pugni per turno), `shelterLimit` (turni di fila in un Rifugio). Gli interruttori a disposizione in `AE.DEFAULT_RULES`: `godNocyTemp` (l'eccesso di PV di God_Nocy è temporaneo), `godNocyRange`, `startCoins`, `inv.*`.
