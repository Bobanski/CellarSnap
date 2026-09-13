import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@shared';
import { createGrapesGetHandler } from '@/app/api/grapes/handler';
import { RequestAuthError } from '@/server/auth/requestAuth';

type Reply = { data: unknown; status?: number };
function fixture(replies: Reply[], mode: 'cookie' | 'bearer' = 'bearer') {
  const requests: URL[] = [];
  const supabase = createClient<Database>('https://fixture.supabase.co', 'fixture-anon', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      requests.push(new URL(String(input)));
      const reply = replies.shift();
      if (!reply) throw new Error('Unexpected query');
      return new Response(JSON.stringify(reply.data), {status: reply.status ?? 200, headers: {'content-type':'application/json'}});
    } },
  });
  const handler = createGrapesGetHandler(async () => ({supabase, user: {id:'fixture-user'} as never, authMode:mode}));
  return {requests, get:(params:string) => handler(new Request('http://localhost/api/grapes'+params))};
}
const varieties = [{id:'2',name:'White Syrah'},{id:'1',name:'Syrah'},{id:'3',name:'Syrah / Shiraz'}];
for (const mode of ['cookie','bearer'] as const) {
  test(`${mode} grape lookup ranks, deduplicates aliases and preserves DTOs`, async () => {
    const f=fixture([{data:varieties},{data:[{variety_id:'1'},{variety_id:'4'},{variety_id:'4'}]},{data:[{id:'4',name:'Shiraz'},varieties[1]]}],mode);
    const r=await f.get('?q=syrah&limit=8');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({grapes:[varieties[1],varieties[2],varieties[0],{id:'4',name:'Shiraz'}]});
    expect(f.requests[1].searchParams.get('alias_normalized')).toBe('ilike.%syrah%');
    expect(f.requests[2].searchParams.get('id')).toBe('in.(1,4)');
  });
}
test('alias-only search returns the canonical variety', async () => {
  const f=fixture([{data:[]},{data:[{variety_id:'1'}]},{data:[{id:'1',name:'Nebbiolo'}]}]);
  expect(await (await f.get('?q=spanna&limit=8')).json()).toEqual({grapes:[{id:'1',name:'Nebbiolo'}]});
});
for (const [limit,expected] of [['',8],['&limit=foo',8],['&limit=500',20],['&limit=-1',1],['&limit=2.9',2]] as const) {
  test(`grape limit ${limit || 'omitted'} is ${expected}`, async () => {
    const f=fixture([{data:varieties},{data:[]}]);
    const body=await (await f.get('?q=syrah'+limit)).json();
    expect(f.requests[0].searchParams.get('limit')).toBe(String(expected));
    expect(body.grapes.length).toBeLessThanOrEqual(expected);
  });
}
for (const q of ['', '!!!', '  ']) {
  test(`empty/non-searchable ${JSON.stringify(q)} avoids database reads`, async () => {
    const f=fixture([]);expect(await (await f.get('?q='+encodeURIComponent(q))).json()).toEqual({grapes:[]});expect(f.requests).toHaveLength(0);
  });
}
for (const table of ['grape_varieties','grape_aliases']) {
  test(`missing ${table} retains explicit 503`, async () => {
    const failure={data:{code:'42P01',message:`relation "public.${table}" does not exist`},status:404};
    const f=fixture(table==='grape_aliases'?[{data:[]},failure]:[failure]);
    const r=await f.get('?q=syrah');expect(r.status).toBe(503);expect((await r.json()).code).toBe('PRIMARY_GRAPES_UNAVAILABLE');
  });
}
test('anonymous or invalid auth returns 401 before querying', async () => {
  const handler=createGrapesGetHandler(async()=>{throw new RequestAuthError('Unauthorized');});
  const r=await handler(new Request('http://localhost/api/grapes?q=syrah'));
  expect(r.status).toBe(401);expect(await r.json()).toEqual({error:'Unauthorized'});
});
test('reference query failure is not reported as empty success', async () => {
  const f=fixture([{data:{message:'fixture query failed',code:'XX000'},status:500}]);
  expect((await f.get('?q=syrah')).status).toBe(500);
});

test('typed bearer factory validates user and forwards token to the data query without cookies', async () => {
  const { createServer } = await import('node:http');
  const { requireTypedRequestAuth } = await import('@/server/auth/requestAuth');
  const seen: Array<{path:string; authorization:string|undefined; cookie:string|undefined}> = [];
  const server=createServer((req,res)=>{
    seen.push({path:req.url!,authorization:req.headers.authorization,cookie:req.headers.cookie});
    res.setHeader('content-type','application/json');
    if(req.headers.authorization==='Bearer invalid') {res.writeHead(401);res.end(JSON.stringify({message:'Invalid JWT'}));return;}
    res.end(JSON.stringify(req.url?.startsWith('/auth/')?{id:'fixture-user',aud:'authenticated',email:'fixture@example.test'}:[{id:'1',name:'Nebbiolo'}]));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();if(!address||typeof address==='string')throw new Error('No test port');
  const previous={url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY};
  process.env.NEXT_PUBLIC_SUPABASE_URL=`http://127.0.0.1:${address.port}`;process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='fixture-anon';
  try {
    const auth=await requireTypedRequestAuth(new Request('http://localhost/api/grapes',{headers:{Authorization:'bEaReR fixture-token'}}),{allowCookieFallback:false});
    expect(auth.authMode).toBe('bearer');expect(auth.user.id).toBe('fixture-user');
    const {data,error}=await auth.supabase.from('grape_varieties').select('id,name');
    expect(error).toBeNull();expect(data).toEqual([{id:'1',name:'Nebbiolo'}]);
    expect(seen).toHaveLength(2);expect(seen.every(r=>r.authorization==='Bearer fixture-token'&&!r.cookie)).toBe(true);
    for(const headers of [new Headers(),new Headers({Authorization:'Bearer invalid'})]) {
      await expect(requireTypedRequestAuth(new Request('http://localhost/api/grapes',{headers}),{allowCookieFallback:false})).rejects.toBeInstanceOf(RequestAuthError);
    }
  } finally {
    if(previous.url===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=previous.url;
    if(previous.key===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=previous.key;
    await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  }
});
