import { test, expect } from '@playwright/test';
import { createDetailFetcher } from '../apps/mobile/src/lib/api/detailRequest';
const entry = { id: 'entry', user_id: 'owner', rating: 92, public_rating_label: 'Loved it',
  primary_grapes: [{ id: 'grape', name: 'Syrah', position: 1 }], notes: 'Tasting',
  group_slides: [{ rating: null, public_rating_label: 'Tried it' }] };
const deps = { getBaseUrl: () => 'https://example.test', getAccessToken: async () => 'fixture', photoHeaders: { 'X-CellarSnap-Photo-Delivery': 'request-v1' } };
test('detail preserves owner number, raw edit fields and grapes using projected bearer transport', async () => {
  const payload = { viewer_user_id: 'owner', entry };
  const result = await createDetailFetcher({ ...deps, fetch: async (url, init) => {
    expect(url).toBe('https://example.test/api/entries/entry');
    expect(init).toMatchObject({ credentials: 'omit', cache: 'no-store', headers: { Authorization: 'Bearer fixture', 'X-CellarSnap-Photo-Delivery': 'request-v1' } });
    return Response.json(payload);
  } })('entry', 'owner');
  expect(result).toEqual({ ok: true, payload });
});
test('detail accepts only the band for a different owner', async () => {
  const payload = { viewer_user_id: 'viewer', entry: { ...entry, rating: null } };
  expect(await createDetailFetcher({ ...deps, fetch: async () => Response.json(payload) })('entry', 'viewer')).toEqual({ ok: true, payload });
});
for (const [name, body] of [
  ['raw public number', { viewer_user_id: 'viewer', entry }],
  ['wrong session', { viewer_user_id: 'other', entry: { ...entry, rating: null } }],
  ['wrong entry', { viewer_user_id: 'viewer', entry: { ...entry, rating: null, id: 'other' } }],
  ['missing entry', { viewer_user_id: 'viewer' }],
  ['missing owner', { viewer_user_id: 'viewer', entry: { id: 'entry', rating: null, public_rating_label: null } }],
  ['raw group number', { viewer_user_id: 'viewer', entry: { ...entry, rating: null, group_slides: [entry] } }],
  ['invalid band', { viewer_user_id: 'viewer', entry: { ...entry, rating: null, public_rating_label: '92/100' } }],
  ['null response', null],
] as const) test(`detail rejects ${name} without exposing entry state`, async () => {
  const result = await createDetailFetcher({ ...deps, fetch: async () => Response.json(body) })('entry', 'viewer');
  expect(result.ok).toBe(false); expect(result).not.toHaveProperty('payload');
});
for (const rating of [0, 101, 1.5, '92', undefined]) test(`detail rejects invalid owner rating ${rating}`, async () => {
  expect((await createDetailFetcher({ ...deps, fetch: async () => Response.json({ viewer_user_id: 'owner', entry: { ...entry, rating } }) })('entry','owner')).ok).toBe(false);
});
for (const status of [401,403,404,500,503]) test(`detail ${status} fails closed, then recovers`, async () => {
  let failed = true;
  const fetcher = createDetailFetcher({ ...deps, fetch: async () => failed ? new Response('private diagnostic', {status}) : Response.json({viewer_user_id:'owner',entry}) });
  const result=await fetcher('entry','owner'); expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain('diagnostic');
  failed=false;expect((await fetcher('entry','owner')).ok).toBe(true);
});
