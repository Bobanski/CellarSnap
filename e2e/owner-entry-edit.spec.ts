import { test, expect } from '@playwright/test';
import type { User } from '@supabase/supabase-js';
import { createOwnerEntryEditHandler, OPTIONS } from '../src/app/api/entries/[id]/details/handler';
import { requireTypedRequestAuth, RequestAuthError } from '../src/server/auth/requestAuth';
const owner = '10000000-0000-4000-8000-000000000001';
const id = '20000000-0000-4000-8000-000000000001';
const edit = { updates: { rating: 93, notes: 'new' }, expected: { rating: 92, notes: ' raw ' } };
function harness(code?: string, data: unknown = { entry: { id, user_id: owner, rating: 93, notes: 'private' }, replayed: false }) {
  const calls: unknown[][] = [];
  const handler = createOwnerEntryEditHandler({ requireTypedRequestAuth: async (_req, options) => {
    calls.push(['auth', options]);
    if (code === 'auth') throw new RequestAuthError('Private auth diagnostic');
    const client = { rpc: async (...args: unknown[]) => {
      calls.push(['rpc', ...args]);
      if (code === 'throw') throw new Error('private diagnostic');
      return { data, error: code ? { code, message: 'private diagnostic' } : null };
    } };
    return { user: { id: owner } as User, authMode: 'bearer', supabase: client as unknown as Awaited<ReturnType<typeof requireTypedRequestAuth>>['supabase'] };
  } });
  return { calls, run: (body: unknown = edit, entryId = id) => handler(new Request('https://example.test/api/entries/'+entryId+'/details', {
    method: 'POST', headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }), { params: Promise.resolve({ id: entryId }) }) };
}
test('owner command preserves raw snapshots, sends one atomic RPC, and serializes only receipt', async () => {
  const h = harness(); const r = await h.run();
  expect(r.status).toBe(200); expect(await r.json()).toEqual({ entry_id:id, viewer_user_id:owner, replayed:false });
  expect(h.calls).toEqual([['auth',{allowCookieFallback:false}],['rpc','save_entry_details',{p_entry_id:id,p_updates:edit.updates,p_expected:edit.expected}]]);
  expect(r.headers.get('cache-control')).toBe('private, no-store');
  expect(r.headers.get('access-control-allow-credentials')).toBeNull();
});
test('explicit grape clears and replay receipt are preserved', async () => {
  const h=harness(undefined,{entry:{id,user_id:owner},replayed:true});
  expect(await (await h.run({...edit,grape_ids:[],expected_grape_ids:[id]})).json()).toMatchObject({replayed:true});
  expect(h.calls[1]).toEqual(['rpc','save_entry_details',{p_entry_id:id,p_updates:edit.updates,p_expected:edit.expected,p_grape_ids:[],p_expected_grape_ids:[id]}]);
});
for(const [name,body] of Object.entries({
  'rating outside range':{updates:{rating:101},expected:{rating:92}},
  'fractional rating':{updates:{rating:1.5},expected:{rating:92}},
  'string rating':{updates:{rating:'93'},expected:{rating:92}},
  'owner injection':{updates:{user_id:owner},expected:{user_id:owner}},
  'snapshot missing':{updates:{rating:93},expected:{}},
  'extra snapshot':{...edit,expected:{...edit.expected,user_id:owner}},
  'unpaired grapes':{...edit,grape_ids:[]},
  'duplicate grapes':{...edit,grape_ids:[id,id],expected_grape_ids:[]},
  'invalid date':{updates:{consumed_at:'2026-02-30'},expected:{consumed_at:'2026-01-01'}},
  'group mutation':{...edit,entry_group_title:'no'},
  'oversized body':{...edit,expected:{notes:'é'.repeat(75000),rating:92}},
  'malformed JSON':'{',
}))test('rejects '+name+' before mutation',async()=>{
  const h=harness();const r=await h.run(body);expect(r.status).toBe(400);expect(h.calls.filter(c=>c[0]==='rpc')).toHaveLength(0);
});
test('nullable owner rating and friends-of-friends privacy remain supported',async()=>{
  expect((await harness().run({updates:{rating:null,entry_privacy:'friends_of_friends'},expected:{rating:92,entry_privacy:'public'}})).status).toBe(200);
});
for(const [code,status] of [['auth',401],['42501',403],['PT409',409],['23514',400],['23503',400],['22023',400],['22P02',400],['XX000',503],['throw',503]] as const)test('sanitizes '+code+' failures',async()=>{
  const r=await harness(code).run();expect(r.status).toBe(status);expect(JSON.stringify(await r.json())).not.toContain('diagnostic');expect(r.headers.get('cache-control')).toContain('no-store');
});
for(const data of [null,{}, {entry:{id,user_id:id},replayed:false},{entry:{id:owner,user_id:owner},replayed:false},{entry:{id,user_id:owner}}])test('rejects invalid owner receipt '+JSON.stringify(data),async()=>{
  expect((await harness(undefined,data).run()).status).toBe(503);
});
test('invalid ID cannot reach command and preflight cannot write',async()=>{
  const h=harness();expect((await h.run(edit,'invalid')).status).toBe(400);expect(h.calls).toHaveLength(1);
  const r=OPTIONS();expect(r.status).toBe(204);expect(r.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
});
