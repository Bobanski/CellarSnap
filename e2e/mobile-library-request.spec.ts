import { test, expect } from '@playwright/test';
import { createLibraryFetcher } from '../apps/mobile/src/lib/api/libraryRequest';
const owner='10000000-0000-4000-8000-000000000001', other='10000000-0000-4000-8000-000000000002';
const entry={id:'20000000-0000-4000-8000-000000000001',user_id:owner,wine_name:'Owner wine',producer:null,vintage:'2020',country:'France',region:null,appellation:null,classification:null,rating:92,qpr_level:'good_value',consumed_at:'2026-09-13',created_at:'2026-09-13T12:00:00+00:00',label_image_path:null,label_image_url:null,primary_grapes:[],entry_group_id:null,entry_group:null,group_slides:[]};
const payload={viewer_user_id:owner,entries:[entry],has_more:false,next_cursor:null};
const deps={getBaseUrl:()=> 'https://example.test',getAccessToken:async()=> 'fixture',photoHeaders:{'X-CellarSnap-Photo-Delivery':'request-v1'}};
test('owner library requires bearer without cookies and preserves rating/filter fields',async()=>{
  const result=await createLibraryFetcher({...deps,fetch:async(url,init)=>{
    expect(url).toBe('https://example.test/api/entries/library?cursor=opaque%2B%2F');expect(init).toMatchObject({credentials:'omit',cache:'no-store',headers:{Authorization:'Bearer fixture','X-CellarSnap-Photo-Delivery':'request-v1'}});return Response.json(payload);
  }})(owner,'opaque+/');expect(result).toEqual({ok:true,payload});
});
for(const [name,body] of [
  ['wrong viewer',{...payload,viewer_user_id:other}],['wrong owner',{...payload,entries:[{...entry,user_id:other}]}],
  ['raw group score',{...payload,entries:[{...entry,group_slides:[{rating:92}]}]}],
  ['missing grapes',{...payload,entries:[{...entry,primary_grapes:undefined}]}],
  ['invalid score',{...payload,entries:[{...entry,rating:101}]}],
  ['missing cursor',{...payload,has_more:true}],['unexpected cursor',{...payload,next_cursor:'repeat'}],
  ['empty continuation',{...payload,entries:[],has_more:true,next_cursor:'next'}],
  ['duplicate rows',{...payload,entries:[entry,entry]}],['invalid date',{...payload,entries:[{...entry,consumed_at:'bad'}]}],
  ['malformed',null],['repeated cursor',{...payload,has_more:true,next_cursor:'repeat'}],
] as const)test('owner library rejects '+name,async()=>{
  expect((await createLibraryFetcher({...deps,fetch:async()=>Response.json(body)})(owner,'repeat')).ok).toBe(false);
});
for(const status of [401,403,500,503])test('owner library '+status+' fails closed then recovers',async()=>{
  let failed=true;const read=createLibraryFetcher({...deps,fetch:async()=>failed?new Response('private diagnostic',{status}):Response.json(payload)});
  const out=await read(owner);expect(out.ok).toBe(false);expect(JSON.stringify(out)).not.toContain('diagnostic');failed=false;expect((await read(owner)).ok).toBe(true);
});
for(const phase of ['token','fetch','body'])test('owner library deadline bounds '+phase+' even without abort cooperation',async()=>{
  const never=()=>new Promise<never>(()=>{});
  const read=createLibraryFetcher({...deps,timeoutMs:10,getAccessToken:phase==='token'?never:deps.getAccessToken,fetch:phase==='fetch'?never:async()=>phase==='body'?{ok:true,json:never} as unknown as Response:Response.json(payload)});
  expect(await read(owner)).toEqual({ok:false,errorMessage:'Loading took too long. Please try again.'});
});
