import { test, expect } from "@playwright/test";
import { createServer, request as httpRequest, type Server } from "node:http";
import { gzipSync, brotliCompressSync, deflateSync } from "node:zlib";
import { createRemoteMenuFetcher, fetchRemoteMenu, isPublicMenuAddress, parseMenuUrl, REMOTE_MENU_LIMITS } from "../src/server/listScan/remoteSource";

const unsafe = ["168.63.129.16", "127.0.0.1", "0.0.0.0", "10.0.0.1", "172.16.1.1", "192.168.1.1", "169.254.169.254", "100.100.100.200", "192.0.2.1", "198.18.0.1", "224.0.0.1", "255.255.255.255", "::1", "::", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "64:ff9b::7f00:1", "2002:7f00:1::", "2001:db8::1", "3fff::1"];
for (const address of unsafe) test(`reject non-public destination ${address}`, async () => {
  expect(isPublicMenuAddress(address)).toBe(false);
  await expect(fetchRemoteMenu(`http://${address.includes(":") ? `[${address}]` : address}/`)).rejects.toThrow(/public website/);
});
test("public IPv4, IPv6 and mapped public addresses are recognized", () => {
  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) expect(isPublicMenuAddress(address)).toBe(true);
});
test("reject credential URLs, private address encodings, internal names, protocols and ports", () => {
  for (const value of ["file:///etc/passwd", "ftp://example.com", "http://user:secret@example.com", "http://localhost.", "http://a.local", "http://metadata.google.internal", "http://2130706433", "http://0x7f000001", "http://127.1", "http://example.com:5432/"]) expect(() => parseMenuUrl(value)).toThrow();
  expect(parseMenuUrl("https://restaurant.example/menu#white").hash).toBe("#white");
});

let server: Server, port: number;
let hits: string[];
const menu = "<html><title>Fixture Wine List</title><h2>Wines</h2><p>2022 Example Pinot Noir $40</p></html>";
test.beforeAll(async () => {
  server = createServer((req,res) => {
    const path = req.url ?? "/"; hits.push(path);
    if (path.startsWith("/delay/")) { const n=Number(path.split("/").pop()); setTimeout(()=>{if(!res.destroyed){res.writeHead(302,{Location:n>1?`/delay/${n-1}`:"/menu"});res.end();}},40); return; }
    if (path === "/exact") {res.writeHead(200);res.end("a".repeat(REMOTE_MENU_LIMITS.text));return;}
    if (path === "/pdf-large") {res.writeHead(200,{"Content-Type":"application/pdf","Content-Length":REMOTE_MENU_LIMITS.pdf+1});res.end();return;}
    if (path === "/image-large") {res.writeHead(200,{"Content-Type":"image/png","Content-Length":REMOTE_MENU_LIMITS.image+1});res.end();return;}
    if (path === "/private") { res.writeHead(302, {Location:"http://127.0.0.1/secret"}); res.end(); return; }
    if (path === "/dns-private") { res.writeHead(302, {Location:"http://private.example/secret"}); res.end(); return; }
    if (path === "/redirect") { res.writeHead(302, {Location:"/menu#red"}); res.end(); return; }
    if (path === "/loop") { res.writeHead(307, {Location:"/loop"}); res.end(); return; }
    if (path === "/large-length") { res.writeHead(200, {"Content-Length":REMOTE_MENU_LIMITS.text+1}); res.end(); return; }
    if (path === "/large") { res.writeHead(200); res.end("a".repeat(REMOTE_MENU_LIMITS.text+1)); return; }
    if (path === "/bomb") { res.writeHead(200, {"Content-Encoding":"gzip"}); res.end(gzipSync("a".repeat(REMOTE_MENU_LIMITS.text+1))); return; }
    if (path === "/slow-body") { res.writeHead(200); res.write("start"); return; }
    if (path === "/slow-headers") return;
    if (path === "/reset") { res.writeHead(200); res.write("start"); res.destroy(); return; }
    if (path === "/MENU.PDF") { res.writeHead(200,{"Content-Type":"application/octet-stream"});res.end("%PDF-uppercase");return; }
    if (path === "/pdf") { res.writeHead(200,{"Content-Type":"application/pdf"}); res.end(Buffer.from("%PDF-fixture")); return; }
    if (path === "/image") { res.writeHead(200,{"Content-Type":"image/png"}); res.end(Buffer.from([137,80,78,71])); return; }
    const encoder = path === "/gzip" ? gzipSync : path === "/br" ? brotliCompressSync : path === "/deflate" ? deflateSync : null;
    res.writeHead(200, {"Content-Type":"text/html", ...(encoder ? {"Content-Encoding":path.slice(1)} : {})});
    res.end(encoder ? encoder(menu) : menu);
  });
  await new Promise<void>(resolve => server.listen(0,"127.0.0.1",resolve));
  port = (server.address() as {port:number}).port;
});
test.beforeEach(()=>{ hits=[]; });
test.afterAll(async()=>{ server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); });

function fixture(resolve = async (host:string) => [{address: host === "private.example" ? "10.0.0.1" : "8.8.8.8", family:4}]) {
  const validated: unknown[] = [];
  const fetch = createRemoteMenuFetcher({resolve, request:(url,options,callback)=> {
    // Route the real socket to our disposable HTTP server only in this fixture.
    // Inspect the production socket lookup callback before overriding transport.
    options.lookup!(url.hostname, {}, (error,address,family)=>validated.push({error,address,family}));
    return httpRequest(new URL(`http://127.0.0.1:${port}${url.pathname}`), {...options, lookup:undefined}, callback);
  }});
  return {fetch, validated};
}
test("real HTTP streaming preserves text, compressed text, PDF/image bytes and relative redirects", async () => {
  const f=fixture();
  for (const path of ["/menu","/gzip","/br","/deflate","/redirect"]) {
    const result=await f.fetch(`http://restaurant.example${path}`);
    expect(new TextDecoder().decode(result.bytes)).toBe(menu);
    expect(result.kind).toBe("text");
    if(path==="/redirect") expect(result.url.hash).toBe("#red");
  }
  expect(new TextDecoder().decode((await f.fetch("http://restaurant.example/pdf")).bytes)).toBe("%PDF-fixture");
  expect(Array.from((await f.fetch("http://restaurant.example/image")).bytes)).toEqual([137,80,78,71]);
  expect(f.validated.every(v=>JSON.stringify(v)===JSON.stringify({error:null,address:"8.8.8.8",family:4}))).toBe(true);
});
test("one source-kind contract selects both the byte limit and parser for uppercase PDF paths", async () => {
  const r=await fixture().fetch("http://restaurant.example/MENU.PDF");
  expect(r.kind).toBe("pdf");
  expect(new TextDecoder().decode(r.bytes)).toBe("%PDF-uppercase");
  expect((await fixture().fetch("http://restaurant.example/image")).kind).toBe("image");
});
test("reject literal and DNS-private redirects before contacting their targets", async () => {
  for(const path of ["/private","/dns-private"]) await expect(fixture().fetch(`http://restaurant.example${path}`)).rejects.toThrow(/public website/);
  expect(hits).toEqual(["/private","/dns-private"]);
});
test("mixed DNS answers fail closed and rebinding cannot cause an unvalidated second lookup", async () => {
  await expect(fixture(async()=>[{address:"8.8.8.8",family:4},{address:"127.0.0.1",family:4}]).fetch("http://restaurant.example/menu")).rejects.toThrow(/public website/);
  expect(hits).toEqual([]);
  let lookups=0;
  const f=fixture(async()=>[{address:++lookups===1?"8.8.8.8":"127.0.0.1",family:4}]);
  await f.fetch("http://restaurant.example/menu");
  expect(lookups).toBe(1);
  expect(f.validated).toEqual([{error:null,address:"8.8.8.8",family:4}]);
});
test("enforce declared, streamed and decompressed byte caps", async () => {
  for(const path of ["/large-length","/large","/bomb","/pdf-large","/image-large"]) await expect(fixture().fetch(`http://restaurant.example${path}`)).rejects.toThrow(/too large/);
});
test("exact byte boundary succeeds and redirects share the same deadline", async () => {
  expect((await fixture().fetch("http://restaurant.example/exact")).bytes.byteLength).toBe(REMOTE_MENU_LIMITS.text);
  await expect(fixture().fetch("http://restaurant.example/delay/3",{timeoutMs:90})).rejects.toThrow(/too long/);
});
test("one wall-clock deadline covers DNS, headers and body; sockets are destroyed", async () => {
  for(const path of ["/slow-headers","/slow-body"]) {
    const start=Date.now();
    await expect(fixture().fetch(`http://restaurant.example${path}`,{timeoutMs:100})).rejects.toThrow(/too long/);
    expect(Date.now()-start).toBeLessThan(2000);
  }
  const start=Date.now();
  await expect(fixture(()=>new Promise(()=>{})).fetch("http://restaurant.example/menu",{timeoutMs:100})).rejects.toThrow(/too long/);
  expect(Date.now()-start).toBeLessThan(2000);
});
test("redirect loops and connection resets fail without hanging", async () => {
  await expect(fixture().fetch("http://restaurant.example/loop",{maxRedirects:2})).rejects.toThrow(/redirected/);
  expect(hits).toHaveLength(3);
  await expect(fixture().fetch("http://restaurant.example/reset")).rejects.toThrow();
});
