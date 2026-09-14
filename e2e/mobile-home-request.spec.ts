import { test, expect } from '@playwright/test';
import { createHomeFetcher } from '../apps/mobile/src/lib/api/homeRequest';

const entry = { id: 'entry', user_id: 'viewer', rating: 92, public_rating_label: 'Loved it', tasted_with_names: [], group_slides: [] };
const payload = { viewer_user_id: 'viewer', recentEntries: [entry], circleEntries: [{ ...entry, user_id: 'friend', rating: null }] };
const dependencies = { getBaseUrl: () => 'https://example.test', getAccessToken: async () => 'fixture-token',
  photoHeaders: { 'X-CellarSnap-Photo-Delivery': 'request-v1' } };

test('home keeps owner inputs and circle bands over bearer-only no-store transport', async () => {
  const fetcher = createHomeFetcher({ ...dependencies, fetch: async (url, init) => {
    expect(url).toBe('https://example.test/api/home');
    expect(init).toMatchObject({ credentials: 'omit', cache: 'no-store', headers: {
      Authorization: 'Bearer fixture-token', 'X-CellarSnap-Photo-Delivery': 'request-v1',
    } });
    return Response.json(payload);
  } });
  expect(await fetcher('viewer')).toEqual({ ok: true, payload });
});
for (const [name, body] of [
  ['wrong viewer', { ...payload, viewer_user_id: 'other' }],
  ['raw circle rating', { ...payload, circleEntries: [entry] }],
  ['non-owner recent', { ...payload, recentEntries: [{ ...entry, user_id: 'friend' }] }],
  ['bad owner number', { ...payload, recentEntries: [{ ...entry, rating: 101 }] }],
  ['raw slide', { ...payload, circleEntries: [{ ...entry, rating: null, group_slides: [entry] }] }],
  ['invalid band', { ...payload, circleEntries: [{ ...entry, rating: null, public_rating_label: '92' }] }],
  ['missing arrays', { viewer_user_id: 'viewer' }],
  ['null body', null],
] as const) test(`home rejects ${name}`, async () => {
  const result = await createHomeFetcher({ ...dependencies, fetch: async () => Response.json(body) })('viewer');
  expect(result.ok).toBe(false); expect(result).not.toHaveProperty('payload');
});
for (const status of [401, 403, 404, 500, 503]) test(`home ${status} fails closed and recovers`, async () => {
  let failed = true;
  const fetcher = createHomeFetcher({ ...dependencies, fetch: async () => failed
    ? new Response('private diagnostic', { status }) : Response.json(payload) });
  expect(await fetcher('viewer')).toMatchObject({ ok: false }); failed = false;
  expect(await fetcher('viewer')).toEqual({ ok: true, payload });
});
test('home token, fetch and body deadlines settle even if dependencies ignore abort', async () => {
  const never = () => new Promise<never>(() => {});
  for (const override of [ { getAccessToken: never }, { fetch: never }, { fetch: async () => ({ ok: true, json: never } as unknown as Response) } ]) {
    const result = await createHomeFetcher({ ...dependencies, ...override, timeoutMs: 5 })('viewer');
    expect(result).toEqual({ ok: false, errorMessage: 'Loading took too long. Please try again.' });
  }
});
test('home configuration, session, JSON and network errors are bounded failures', async () => {
  let calls = 0;
  const fetch = async () => { calls++; return Response.json(payload); };
  for (const override of [{ getBaseUrl: () => null }, { getAccessToken: async () => null }, { getAccessToken: async () => { throw new Error('token'); } }]) {
    expect((await createHomeFetcher({ ...dependencies, fetch, ...override })('viewer')).ok).toBe(false);
  }
  expect(calls).toBe(0);
  for (const fetch of [async () => new Response('bad json'), async () => { throw new Error('offline'); }]) {
    expect((await createHomeFetcher({ ...dependencies, fetch })('viewer')).ok).toBe(false);
  }
});
test('a token arriving after its deadline cannot dispatch a request', async () => {
  let release!: (token: string) => void; let calls = 0;
  const fetcher = createHomeFetcher({ ...dependencies, timeoutMs: 5,
    getAccessToken: () => new Promise(resolve => { release = resolve; }),
    fetch: async () => { calls++; return Response.json(payload); } });
  expect((await fetcher('viewer')).ok).toBe(false); release('late');
  await new Promise(resolve => setTimeout(resolve, 10)); expect(calls).toBe(0);
});
