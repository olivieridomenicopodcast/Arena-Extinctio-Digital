// Server di segnalazione PeerJS in locale, solo per provare la partita in rete senza internet:
//   npm i peer   (in una cartella qualsiasi)   poi   NODE_PATH=<quella>/node_modules node tools/peer-server.js 9000
//   e si apre l'app con ?peerhost=localhost&peerport=9000
const { PeerServer } = require('peer');
const port = Number(process.argv[2] || 9000);
PeerServer({ port, host: '127.0.0.1', path: '/' }, () => console.log('PeerServer locale su 127.0.0.1:' + port));
