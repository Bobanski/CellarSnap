import { test, expect } from '@playwright/test';
import type { ListScanParsedWine } from '../packages/shared/src/listScan';
import { createRecommendationNotesRequester } from '../apps/mobile/src/lib/api/recommendationNotesRequest';
const items: ListScanParsedWine[] = [{id:'wine', source_order:0, menu_label:'QC wine', producer:null, wine_name:null, vintage:null, wine_type:'red', price_display:null, price_value:null, varietals:[], regions:[], match_percent:80, parse_confidence:90, rationale:''}];
const dependencies = { getBaseUrl: () => 'https://api.example.test', getAccessToken: async () => 'current-token' };
const body = { notes: [{ id:'wine', note:' A savory finish. ' }] };
test('notes use configured host and fresh bearer without ambient cookies', async () => {
  let token = 'first';
  const request = createRecommendationNotesRequester({ ...dependencies, getAccessToken: async () => token, fetch: async (url, init) => {
    expect(url).toBe('https://api.example.test/api/list-scan/recommendation-notes');
    expect(init).toMatchObject({ method:'POST', credentials:'omit', cache:'no-store', headers:{Authorization:`Bearer ${token}`, 'Content-Type':'application/json'} });
    expect(JSON.parse(init!.body as string)).toEqual({items});
    return Response.json(body);
  }});
  expect(await request(items)).toEqual({ok:true, notes:{wine:'A savory finish.'}});
  token = 'refreshed'; expect((await request(items)).ok).toBe(true);
});
for (const status of [401,403,429,500,503]) test(`notes ${status} retains retry and recovers`, async () => {
  let failed = true;
  const request = createRecommendationNotesRequester({...dependencies, fetch:async () => failed ? new Response('private diagnostic', {status}) : Response.json(body)});
  const result = await request(items); expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain('private diagnostic');
  failed=false; expect((await request(items)).ok).toBe(true);
});
test('notes reject malformed or unrelated responses, accepting an intentional empty result',async()=>{
  for(const response of [null,{}, {notes:[{id:'other',note:'foreign'}]}, {notes:[{id:'wine',note:42}]}]) {
    expect((await createRecommendationNotesRequester({...dependencies,fetch:async()=>Response.json(response)})(items)).ok).toBe(false);
  }
  expect(await createRecommendationNotesRequester({...dependencies,fetch:async()=>Response.json({notes:[]})})(items)).toEqual({ok:true,notes:{}});
});
test('missing configuration/session and session failures never send notes',async()=>{
  let calls=0; const fetch=async()=>{calls++;return Response.json(body)};
  for(const override of [{getBaseUrl:()=>null},{getAccessToken:async()=>null},{getAccessToken:async()=>{throw Error('private token diagnostic')}}]) {
    expect((await createRecommendationNotesRequester({...dependencies,...override,fetch})(items)).ok).toBe(false);
  }
  expect(calls).toBe(0);
});
test('notes token, transport and body deadlines settle; late tokens cannot dispatch',async()=>{
  const never=()=>new Promise<never>(()=>{});
  for(const override of [{getAccessToken:never},{fetch:never},{fetch:async()=>({ok:true,json:never} as unknown as Response)}]) {
    expect((await createRecommendationNotesRequester({...dependencies,...override,timeoutMs:5})(items)).ok).toBe(false);
  }
  let release!:(token:string)=>void;let calls=0;
  const request=createRecommendationNotesRequester({...dependencies,timeoutMs:5,getAccessToken:()=>new Promise(resolve=>{release=resolve}),fetch:async()=>{calls++;return Response.json(body)}});
  expect((await request(items)).ok).toBe(false);release('late');await new Promise(resolve=>setTimeout(resolve,10));expect(calls).toBe(0);
});
test('filter/unmount cancellation settles even when a dependency ignores AbortSignal',async()=>{
 const controller=new AbortController(); let release!:(token:string)=>void;let calls=0;
 const request=createRecommendationNotesRequester({...dependencies,getAccessToken:()=>new Promise(resolve=>{release=resolve}),fetch:async()=>{calls++;return Response.json(body)}});
 const result=request(items,controller.signal);controller.abort();expect((await result).ok).toBe(false);release('late');await new Promise(resolve=>setTimeout(resolve,10));expect(calls).toBe(0);
});
test('invalid JSON and network failure remain retryable',async()=>{
 for(const fetch of [async()=>new Response('not JSON'),async()=>{throw Error('offline')}]) expect((await createRecommendationNotesRequester({...dependencies,fetch})(items)).ok).toBe(false);
});
