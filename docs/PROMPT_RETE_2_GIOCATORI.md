# Prompt da incollare nella chat di Fifo Fafo

Voglio aggiungere a questa webapp la **partita a due su due dispositivi** (es. io e la mia ragazza, ognuno col proprio iPad, sullo stesso wifi), senza server miei e senza account. Ho già fatto la stessa cosa per un altro gioco ("Arena Extinctio", repo `olivieridomenicopodcast/Arena-Extinctio-Digital`, branch `ccr-5d735358-i2uk8t`): se riesci a leggerlo, guarda **js/ui/net.js** (collegamento), **js/ui/lobby.js** (stanza e ingresso), **tools/e2e-net.js**, **tools/e2e-net-drop.js** e **tools/peer-server.js** (prove) e il paragrafo "Partita in rete" di `docs/DA_IMPLEMENTARE.md`. Riusa quell'impostazione adattandola al codice di questa app, senza stravolgerla.

**Come deve funzionare**
- Dalla home: "Crea una stanza" (codice di 4 caratteri + link da condividere) e "Unisciti a una stanza" (codice + nome). Solo 2 giocatori: niente scelta di posti multipli, ma l'host può scegliere se giocare per primo o lasciare la scelta al caso.
- Collegamento diretto fra i due dispositivi con **WebRTC tramite PeerJS** (file `peerjs.min.js` salvato in `js/vendor/`, non da CDN, così funziona offline anche dopo il primo collegamento); il servizio pubblico di PeerJS serve solo a farli trovare. Per i test deve funzionare anche con un server locale (`?peerhost=localhost&peerport=9000`).
- **L'host è il tavolo**: tiene lo stato vero e fa girare le regole; l'altro dispositivo riceve lo stato e spedisce le proprie scelte. Le regole devono restare separate dalla grafica: se in questa app non lo sono abbastanza, dimmelo prima di rifare mezza app.
- Informazione nascosta: qui sono solo 2 giocatori, quindi **non mandare allo sfidante lo stato con le carte nascoste dell'host** (mano, mazzo): manda una vista filtrata per giocatore. Dimmi se per questo gioco è semplice o complicato.
- Disconnessioni: battito ("ping" ogni 4 s, dispositivo considerato perso dopo ~12 s); se l'altro cade, l'host vede un avviso con "aspetto che torni" oppure "gioca l'AI al posto suo" (solo se questa app ha un'AI); chi rientra con lo stesso nome riprende da dove era, con la scelta ancora pendente. Attenzione: quando l'avviso viene chiuso per il rientro va azzerato il flag "avviso aperto", altrimenti la seconda caduta non mostra nulla (bug che ho avuto).
- Tenere lo schermo acceso (Screen Wake Lock) dove supportato; l'iPad in standby fa cadere il collegamento.
- Tutti i messaggi devono essere **JSON puro** (niente funzioni o oggetti con cicli): aggiungi un test che lo verifichi sulle scelte del gioco.
- Aggiorna il service worker/cache offline, i test, il README e i documenti.

**Come lavorare**
- Italiano, in modo che io capisca. Prima di scrivere codice dimmi cosa riusi e cosa dovrai cambiare e se vedi rischi per il gioco esistente: non voglio che si rompa niente di quello che c'è.
- Prova tutto nel browser con **due (o più) contesti separati di Chromium** con Playwright: collegamento, una partita giocata da entrambi con lo stesso stato su entrambi gli schermi, caduta e rientro. Se la tua chat non ha Playwright, dimmelo.
- **Dimmi con onestà cosa hai verificato e cosa no**: non puoi provare su iPad veri né col servizio pubblico di PeerJS (usa un server locale per i test), quindi lo devo provare io. Non dire "funziona" se non l'hai visto funzionare.
- Non cambiare le regole del gioco e non fare commit/push se non te lo chiedo.
