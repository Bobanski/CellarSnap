import { test, expect } from '@playwright/test';
import type { User } from '@supabase/supabase-js';
import { createOwnerLibraryGetHandler, OPTIONS } from '../src/app/api/entries/library/handler';
import { decodeOwnerLibraryCursor, encodeOwnerLibraryCursor } from '../src/server/entries/ownerLibraryCursor';
import { requireRequestAuth, RequestAuthError } from '../src/server/auth/requestAuth';
const owner = '10000000-0000-4000-8000-000000000001';
const stranger = '10000000-0000-4000-8000-000000000002';
const row = { id: '20000000-0000-4000-8000-000000000001', user_id: owner,
  wine_name: 'Fixture', producer: null, vintage: '2020', rating: 92,
  consumed_at: '2026-09-13', created_at: '2026-09-13T12:00:00+00:00',
  label_image_path: null, country: 'France', region: null, appellation: null,
  classification: null, qpr_level: 'good_value', entry_group_id: null };
function harness(rows = [row], fault?: string) {
  const calls: unknown[][] = [];
  const builder = {
    select: (...args: unknown[]) => { calls.push(['select', ...args]); return builder; },
    eq: (...args: unknown[]) => { calls.push(['eq', ...args]); return builder; },
    order: (...args: unknown[]) => { calls.push(['order', ...args]); return builder; },
    or: (...args: unknown[]) => { calls.push(['or', ...args]); return builder; },
    limit: (...args: unknown[]) => { calls.push(['limit', ...args]); return builder; },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({data: rows, error: fault === 'query' ? {message:'private diagnostic'} : null})),
  };
  const labels = {in: () => labels, eq: () => labels, order: () => labels,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({data: [], error: fault === 'labels' ? {message:'private diagnostic'} : null}))};
  const client = {from: (table: string) => (table === 'wine_entries' || table === 'wine_entries_with_ratings') ? builder : {select: () => labels}};
  const handler = createOwnerLibraryGetHandler({
    requireRequestAuth: async (_request, options) => {
      calls.push(['auth',options]);
      if (fault === 'auth') throw new RequestAuthError('Unauthorized');
      return {user: {id:owner} as User, supabase: client as unknown as Awaited<ReturnType<typeof requireRequestAuth>>['supabase'], authMode:'bearer'};
    },
    fetchPrimaryGrapesByEntryId: async (_db, _ids, options) => {expect(options).toEqual({strict:true}); if(fault==='grapes')throw new Error('private diagnostic');return new Map();},
    resolveGroupedPostData: async (_db, _rows, options) => {expect(options).toEqual({strict:true});if(fault==='groups')throw new Error('private diagnostic');return new Map();},
    signPhotoUrls: async () => new Map(),
  });
  return {handler,calls};
}
test('library scopes rows to authenticated owner and consumed status, retains numbers and deterministic ordering', async()=>{
  const {handler,calls}=harness();const r=await handler(new Request('https://example.test/api/entries/library?user_id='+stranger));
  expect(r.status).toBe(200);expect(await r.json()).toMatchObject({viewer_user_id:owner,entries:[{rating:92,user_id:owner}],has_more:false,next_cursor:null});
  expect(calls).toContainEqual(['eq','user_id',owner]);expect(calls).toContainEqual(['eq','entry_status','consumed']);
  expect(calls.filter(c=>c[0]==='order')).toEqual(['consumed_at','created_at','id'].map(key=>['order',key,{ascending:false}]));
  expect(r.headers.get('cache-control')).toBe('private, no-store');expect(r.headers.get('vary')).toBe('Cookie, Authorization');
});
test('library pagination retains tied chronology with ID cursor and bounded page size',async()=>{
  const {handler,calls}=harness([row,{...row,id:'20000000-0000-4000-8000-000000000000'}]);
  const body=await (await handler(new Request('https://example.test/api/entries/library?limit=1'))).json();
  expect(body.entries).toHaveLength(1);expect(body.has_more).toBe(true);
  expect(decodeOwnerLibraryCursor(body.next_cursor,owner)).toMatchObject({id:row.id,consumed_at:row.consumed_at,created_at:row.created_at});
  expect(calls).toContainEqual(['limit',2]);
  await handler(new Request('https://example.test/api/entries/library?cursor='+body.next_cursor));
  expect(calls.find(c=>c[0]==='or')?.[1]).toContain(`id.lt.${row.id}`);
});
for(const [index, value] of ['', 'garbage', 'x'.repeat(513), Buffer.from(JSON.stringify({v:1,owner,...row,consumed_at:'2026-01-01),user_id.neq.x'})).toString('base64url'),encodeOwnerLibraryCursor(stranger,row)].entries())test('library rejects malformed or other-owner cursor '+index,async()=>{
  const {handler,calls}=harness();expect((await handler(new Request('https://example.test/api/entries/library?cursor='+value))).status).toBe(400);expect(calls.filter(c=>c[0]==='select')).toHaveLength(0);
});
for(const limit of ['','0','-1','101','1.5','NaN','Infinity'])test('library rejects limit '+limit,async()=>{
  expect((await harness().handler(new Request('https://example.test/api/entries/library?limit='+limit))).status).toBe(400);
});
for(const fault of ['query','grapes','groups','labels','auth'])test('library '+fault+' failure is bounded and sanitized',async()=>{
  const r=await harness([row],fault).handler(new Request('https://example.test/api/entries/library'));
  expect(r.status).toBe(fault==='auth'?401:500);expect(JSON.stringify(await r.json())).not.toContain('diagnostic');expect(r.headers.get('cache-control')).toContain('no-store');
});
test('library rejects other-owner serialization and invalid private score',async()=>{
  for(const changed of [{user_id:stranger},{rating:101}])expect((await harness([{...row,...changed}]).handler(new Request('https://example.test/api/entries/library'))).status).toBe(500);
});
test('library auth disables cookie fallback for any supplied authorization; preflight is read only',async()=>{
  for(const authorization of ['Bearer invalid','invalid','']){
    const {handler,calls}=harness();await handler(new Request('https://example.test/api/entries/library',{headers:{authorization}}));
    expect(calls).toContainEqual(['auth',{allowCookieFallback:false}]);
  }
  const r=OPTIONS();expect(r.status).toBe(204);expect(r.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS');
});

test('required grape hydration surfaces database failure while legacy callers preserve their fallback',async()=>{
  const {fetchPrimaryGrapesByEntryId}=await import('../src/lib/primaryGrapes');
  const query={in:()=>query,order:async()=>({data:null,error:{message:'fixture grape outage'}})};
  const client={from:()=>({select:()=>query})} as unknown as Awaited<ReturnType<typeof requireRequestAuth>>['supabase'];
  expect(await fetchPrimaryGrapesByEntryId(client,[row.id])).toEqual(new Map());
  await expect(fetchPrimaryGrapesByEntryId(client,[row.id],{strict:true})).rejects.toThrow('fixture grape outage');
});
test('required event hydration rejects missing-schema fallback instead of silently dropping events',async()=>{
  const {resolveGroupedPostData}=await import('../src/server/entries/groupPosts');
  const client={from:()=>({select:()=>({in:async()=>({data:null,error:{message:'relation entry_groups does not exist'}})})})} as unknown as Awaited<ReturnType<typeof requireRequestAuth>>['supabase'];
  const anchors=[{id:row.id,entry_group_id:row.id}];
  expect(await resolveGroupedPostData(client,anchors)).toEqual(new Map());
  await expect(resolveGroupedPostData(client,anchors,{strict:true})).rejects.toThrow('relation entry_groups does not exist');
});
