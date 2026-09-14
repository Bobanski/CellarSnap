import { test, expect } from '@playwright/test';
import { createEntryEditor, EDIT_CONFLICT_MESSAGE, EDIT_RETRY_MESSAGE } from '../apps/mobile/src/lib/api/entryEditRequest';
const owner='10000000-0000-4000-8000-000000000001', id='20000000-0000-4000-8000-000000000001';
const edit={updates:{rating:93},expected:{rating:92}}, receipt={entry_id:id,viewer_user_id:owner,replayed:false};
const deps={getBaseUrl:()=> 'https://example.test/',getAccessToken:async()=> 'fixture'};
test('editor uses bounded bearer command and preserves raw snapshot',async()=>{
  expect(await createEntryEditor({...deps,fetch:async(url,init)=>{
    expect(url).toBe(`https://example.test/api/entries/${id}/details`);
    expect(init).toMatchObject({method:'POST',credentials:'omit',cache:'no-store',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'}});
    expect(JSON.parse(init?.body as string)).toEqual(edit);return Response.json(receipt);
  }})(id,owner,edit)).toBeNull();
});
for(const status of [400,401,403,404,409,500,503])test('editor preserves form on '+status+' without fallback or automatic write retry',async()=>{
  let calls=0;const save=createEntryEditor({...deps,fetch:async()=>{calls++;return new Response('private diagnostic',{status});}});
  const result=await save(id,owner,edit);expect(result).not.toBeNull();expect(result).not.toContain('diagnostic');expect(calls).toBe(1);if(status===409)expect(result).toBe(EDIT_CONFLICT_MESSAGE);
});
for(const body of [null,{}, {...receipt,entry_id:owner},{...receipt,viewer_user_id:id},{...receipt,replayed:'true'},{...receipt,rating:93}])test('editor rejects malformed/foreign receipt '+JSON.stringify(body),async()=>{
  expect(await createEntryEditor({...deps,fetch:async()=>Response.json(body)})(id,owner,edit)).toBe(EDIT_RETRY_MESSAGE);
});
test('lost success can be retried once explicitly with identical snapshot',async()=>{
  const bodies:unknown[]=[];const save=createEntryEditor({...deps,fetch:async(_url,init)=>{
    bodies.push(init?.body);if(bodies.length===1)throw new Error('network lost');return Response.json({...receipt,replayed:true});
  }});
  expect(await save(id,owner,edit)).toBe(EDIT_RETRY_MESSAGE);expect(await save(id,owner,edit)).toBeNull();expect(bodies[0]).toBe(bodies[1]);
});
test('deadline includes stalled token acquisition and prevents late write',async()=>{
  let resolve!: (token:string)=>void, calls=0;
  const save=createEntryEditor({...deps,timeoutMs:10,getAccessToken:()=>new Promise(r=>{resolve=r}),fetch:async()=>{calls++;return Response.json(receipt)}});
  expect(await save(id,owner,edit)).toBe(EDIT_RETRY_MESSAGE);resolve('late');await Promise.resolve();expect(calls).toBe(0);
});
test('session/unmount cancellation rejects a late success',async()=>{
  let resolve!: (r:Response)=>void;const controller=new AbortController();
  const save=createEntryEditor({...deps,fetch:()=>new Promise(r=>{resolve=r})});
  const pending=save(id,owner,edit,controller.signal);await Promise.resolve();controller.abort();
  expect(await pending).toBe(EDIT_RETRY_MESSAGE);resolve(Response.json(receipt));
});
test('missing backend or auth cannot write',async()=>{
  for(const overrides of [{getBaseUrl:()=>null},{getAccessToken:async()=>null}]){
    expect(await createEntryEditor({...deps,...overrides,fetch:async()=>{throw new Error('must not fetch')}})(id,owner,edit)).not.toBeNull();
  }
});
