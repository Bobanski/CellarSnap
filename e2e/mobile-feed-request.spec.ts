import { test, expect } from '@playwright/test';
import { createFeedPageFetcher } from '../apps/mobile/src/lib/feed/feedRequest';

const args = { viewerUserId: 'viewer', scope: 'friends' as const, cursor: 'opaque/+cursor', limit: 30 };
const entry = { id: 'entry', rating: null, public_rating_label: 'Loved it', photo_gallery: [], group_slides: [
  { id: 'slide', rating: null, public_rating_label: 'Tried it', notes: 'Different wine', qpr_level: 'good_value' },
] };
const payload = { viewer_user_id: 'viewer', entries: [entry], has_more: true, next_cursor_v2: 'next' };
const dependencies = { getBaseUrl: () => 'https://example.test', getAccessToken: async () => 'fixture-token',
  photoHeaders: { 'X-CellarSnap-Photo-Delivery': 'request-v1' } };

test('mobile feed uses bearer-only projected transport and opaque cursor with group metadata intact', async () => {
  const requests: Array<{url: string; init?: RequestInit}> = [];
  const fetcher = createFeedPageFetcher({ ...dependencies, fetch: async (url, init) => {
    requests.push({url: String(url), init}); return Response.json(payload);
  } });
  expect(await fetcher(args)).toEqual({ entries: [entry], nextCursor: 'next', hasMore: true, errorMessage: null });
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0].url).searchParams.get('cursor_v2')).toBe(args.cursor);
  expect(new URL(requests[0].url).searchParams.get('scope')).toBe('friends');
  expect(requests[0].init).toMatchObject({ credentials: 'omit', cache: 'no-store', headers: {
    Authorization: 'Bearer fixture-token', 'X-CellarSnap-Photo-Delivery': 'request-v1',
  } });
});

for (const [name, body] of [
  ['different authenticated viewer', { ...payload, viewer_user_id: 'other' }],
  ['raw entry rating', { ...payload, entries: [{ ...entry, rating: 92 }] }],
  ['raw slide rating', { ...payload, entries: [{ ...entry, group_slides: [{ rating: 45, public_rating_label: 'Tried it' }] }] }],
  ['missing page cursor', { ...payload, next_cursor_v2: null }],
  ['invalid band', { ...payload, entries: [{ ...entry, public_rating_label: '92/100' }] }],
  ['invalid entries', { ...payload, entries: null }],
] as const) {
  test(`mobile feed rejects ${name} without a direct SDK fallback`, async () => {
    let calls = 0;
    const fetcher = createFeedPageFetcher({ ...dependencies, fetch: async () => { calls++; return Response.json(body); } });
    const result = await fetcher(args);
    expect(result.entries).toEqual([]); expect(result.hasMore).toBe(false); expect(result.errorMessage).toBeTruthy();
    expect(calls).toBe(1);
  });
}

for (const status of [401, 403, 500, 503]) {
  test(`mobile feed ${status} exposes a recoverable error and next request succeeds`, async () => {
    let failed = true;
    const fetcher = createFeedPageFetcher({ ...dependencies, fetch: async () => failed
      ? new Response('untrusted error', { status }) : Response.json(payload) });
    const result = await fetcher(args); expect(result.errorMessage).toBeTruthy(); expect(result.entries).toEqual([]);
    expect(result.errorMessage).not.toContain('untrusted');
    failed = false; expect((await fetcher(args)).entries).toEqual([entry]);
  });
}

test('mobile feed timeout, malformed JSON, absent config/token and refresh failure are bounded failures', async () => {
  const timeout = createFeedPageFetcher({ ...dependencies, timeoutMs: 5, fetch: async (_url, init) =>
    new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))) });
  expect((await timeout(args)).errorMessage).toContain('too long');
  const brokenJson = createFeedPageFetcher({ ...dependencies, fetch: async () => new Response('not json') });
  expect((await brokenJson(args)).errorMessage).toBeTruthy();
  let calls = 0;
  const neverFetch = async () => { calls++; return Response.json(payload); };
  expect((await createFeedPageFetcher({ ...dependencies, getBaseUrl: () => null, fetch: neverFetch })(args)).errorMessage).toBeTruthy();
  expect((await createFeedPageFetcher({ ...dependencies, getAccessToken: async () => null, fetch: neverFetch })(args)).errorMessage).toContain('sign in');
  expect((await createFeedPageFetcher({ ...dependencies, getAccessToken: async () => { throw new Error('refresh failed'); }, fetch: neverFetch })(args)).errorMessage).toBeTruthy();
  expect(calls).toBe(0);
});
