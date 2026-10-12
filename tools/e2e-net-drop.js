// Prova nel browser: un amico cade (modale sull'host), rientra con lo stesso nome, poi cade di nuovo e l'AI gioca al suo posto.
//   serve tools/peer-server.js attivo (vedi l'intestazione) · NODE_PATH=/opt/node-tools/node_modules node tools/e2e-net-drop.js
const { chromium } = require('playwright'); const path=require('path'),fs=require('fs'),http=require('http');
const root=path.join(__dirname,'..');
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';const f=path.join(root,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}const t={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png'}[path.extname(f)]||'application/octet-stream';r.writeHead(200,{'Content-Type':t});fs.createReadStream(f).pipe(r);});
(async()=>{await new Promise(r=>server.listen(0,r));const base='http://localhost:'+server.address().port+'/',q='peerhost=localhost&peerport=9000';
const b=await chromium.launch({args:['--disable-features=WebRtcHideLocalIpsWithMdns']});const errs=[];
const mk=async(n)=>{const c=await b.newContext({viewport:{width:1300,height:950}});const p=await c.newPage();p.on('pageerror',e=>errs.push(n+': '+e.message));return p;};
const host=await mk('host'),g=await mk('g');
await host.goto(base+'?'+q);await host.click('text=Crea una stanza');
await host.waitForFunction(()=>/^[A-Z0-9]{4}$/.test((document.querySelector('#screen .card div[style*="letter-spacing"]')||{}).textContent||''));
const code=await host.locator('#screen .card div[style*="letter-spacing"]').first().innerText();
await host.selectOption('#screen select >> nth=0','2');
await g.goto(base+'?join='+code+'&'+q);await g.fill('input[placeholder="Il tuo nome"]','Erika');await g.click('button:has-text("Entra")');
await host.waitForFunction(()=>/Amici collegati: 1 su 1/.test(document.body.innerText));
await host.click('button:has-text("Inizia la partita")');await g.waitForSelector('#board');await host.selectOption('#nav select','fast');
// host gioca finché tocca all'amico
const step=async(p)=>{ if(await p.locator('#modal:visible h3:has-text("non è più collegato")').count())return; if(await p.locator('#modalBg:visible .btn.primary').count()){await p.locator('#modalBg:visible .btn.primary').first().click();return;} if(await p.locator('#banner:visible').count()){await p.keyboard.press('Space');return;} const hex=p.locator('#board .hex.sel, #board .hex.selw, #board .hex.selp, #board .hex.sel2');if(await hex.count()){await hex.first().dispatchEvent('click');return;} const acts=p.locator('#actionPanel .act:not([disabled])');if(await acts.count()){await acts.last().click();return;} const opts=p.locator('#actionPanel .opt:not([disabled])');if(await opts.count()){await opts.first().click();return;} };
let t0=Date.now();
while(Date.now()-t0<60000){ await step(host).catch(()=>{}); if(/Tocca a Erika/.test(await host.locator('#actionPanel').innerText().catch(()=>''))) break; await host.waitForTimeout(30);}
// l'amico cade
await g.context().close();
for(let i=0;i<900&&!(await host.locator('#modal:visible').count());i++){await step(host).catch(()=>{});await host.waitForTimeout(40);}
console.log('modale host:',(await host.locator('#modal').innerText()).split('\n')[0]);
// riconnessione con lo stesso nome
const g2=await mk('g2');await g2.goto(base+'?join='+code+'&'+q);await g2.fill('input[placeholder="Il tuo nome"]','Erika');await g2.click('button:has-text("Entra")');
await g2.waitForSelector('#board',{timeout:15000});
await g2.waitForFunction(()=>/Il tuo movimento|Cosa fai|Tuo|TUO|Scegli|Tocca a Erika/.test(document.querySelector('#actionPanel').innerText)||document.querySelector('#actionPanel .act,#actionPanel .opt'),null,{timeout:10000}).catch(()=>{});
console.log('amico rientrato, pannello:',(await g2.locator('#actionPanel').innerText()).slice(0,60).replace(/\n/g,' '));
console.log('modale host dopo rientro visibile:',await host.locator('#modalBg:visible').count());
// ora l'amico gioca una mossa e la partita prosegue
for(let i=0;i<60;i++){await step(g2).catch(()=>{});await step(host).catch(()=>{});await g2.waitForTimeout(40);}
console.log('round host/amico:',(await host.locator('#status').innerText()).match(/Round\s+(\d+)/)[1],(await g2.locator('#status').innerText()).match(/Round\s+(\d+)/)[1]);
// seconda caduta: sostituzione con AI
await g2.context().close();
for(let i=0;i<1500&&!(await host.locator('#modal:visible h3:has-text("non è più collegato")').count());i++){await step(host).catch(()=>{});await host.waitForTimeout(40);}
const hasModal=await host.locator('#modal:visible h3:has-text("non è più collegato")').count();console.log('seconda caduta, modale:',hasModal);
if(hasModal){await host.click('button:has-text("gioca al posto")');
 let r0=+(await host.locator('#status').innerText()).match(/Round\s+(\d+)/)[1];
 for(let i=0;i<400;i++){await step(host).catch(()=>{});await host.waitForTimeout(20);}
 const r1=+(await host.locator('#status').innerText()).match(/Round\s+(\d+)/)[1];console.log('round dopo AI al posto:',r0,'→',r1);}
console.log('errori',errs);await b.close();server.close();})();
