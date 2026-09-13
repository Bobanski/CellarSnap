// Local browser-QC harness. Run against a production Next build to avoid dev
// websocket/HMR proxy differences. Only the owner-summary endpoint is altered.
// QC_SUMMARY_MODE_FILE contains outage (default), empty, or normal. No credentials
// are logged, no live service is modified, and the listener is loopback-only.
import http from 'node:http';
import { readFileSync } from 'node:fs';
const port=Number(process.env.QC_PROXY_PORT ?? 3017);
const upstreamPort=Number(process.env.QC_UPSTREAM_PORT ?? 3001);
for(const value of [port,upstreamPort]) if(!Number.isInteger(value)||value<1024||value>65535) throw new Error('Invalid local port');
if(port===upstreamPort) throw new Error('Proxy and upstream must differ');
http.createServer((req,res)=>{
  let mode='outage';
  if(process.env.QC_SUMMARY_MODE_FILE) {
    try { mode=readFileSync(process.env.QC_SUMMARY_MODE_FILE,'utf8').trim(); } catch { /* default outage */ }
  }
  if(req.url.split('?')[0]==='/api/profile/summary' && mode!=='normal') {
    const empty=mode==='empty';
    res.writeHead(empty?200:503,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify(empty?{entryCount:0,friendCount:0,countryCount:0,badgeCount:0,pendingFriendRequests:0}:{error:'QC injected summary outage'}));return;
  }
  const proxy=http.request({hostname:'127.0.0.1',port:upstreamPort,path:req.url,method:req.method,headers:{...req.headers,host:`localhost:${upstreamPort}`}},up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res)});
  proxy.on('error',()=>{if(!res.headersSent) res.writeHead(502);res.end('Local upstream unavailable');});
  req.on('aborted',()=>proxy.destroy());req.pipe(proxy);
}).listen(port,'127.0.0.1',()=>console.log(`Local summary QC proxy on ${port}`));
