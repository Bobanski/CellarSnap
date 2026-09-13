import { test, expect } from '@playwright/test';
import { createClient, type User } from '@supabase/supabase-js';
import sharp from 'sharp';
import { createAuthenticatedImageGetHandler } from '@/server/storage/imageDelivery';
import { RequestAuthError } from '@/server/auth/requestAuth';
import { authenticatedPhotoUrl, registerRequestPhotoClient } from '@/lib/storage/photoDelivery';
import { signPhotoUrl, signPhotoUrls } from '@/server/storage/signedUrls';
import { requireRequestAuth } from '@/server/auth/requestAuth';
import { fetchAuthorizedPhoto, resolveAuthenticatedPhotoUrl, MAX_DELIVERED_PHOTO_BYTES } from '@shared/photoDelivery';
import { OPTIONS } from '@/app/api/photos/image/route';

const path = 'owner/entry/label/photo.jpg';
function fixture() {
  const state = { allowed: true, rpcError: false, authenticated: true, downloads: 0, checks: 0, svg: false, upstreamError: false };
  const supabase = createClient('https://fixture.supabase.co', 'fixture-key', { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    expect(String(input)).toBe('https://fixture.supabase.co/rest/v1/rpc/can_access_wine_photo');
    expect(JSON.parse(String(init?.body))).toEqual({ object_name: path });
    state.checks++;
    return new Response(JSON.stringify(state.rpcError ? { message: 'Unavailable' } : state.allowed), { status: state.rpcError ? 500 : 200, headers: { 'content-type': 'application/json' } });
  } } });
  const handler = createAuthenticatedImageGetHandler(async () => {
    if (!state.authenticated) throw new RequestAuthError('Unauthorized');
    return { supabase, user: { id: 'viewer' } as User, authMode: 'cookie' };
  }, async requested => {
    expect(requested).toBe(path); state.downloads++;
    if (state.upstreamError) throw new Error('Unavailable');
    return state.svg ? Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"></svg>') : sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#792b45' } }).png().toBuffer();
  });
  return { state, get: (url = authenticatedPhotoUrl(path)) => handler(new Request('https://app.test' + url)) };
}

test('every image request rechecks authorization before warmed bytes; denial and recovery are no-store', async () => {
  const f = fixture();
  const first = await f.get(); expect(first.status).toBe(200);
  expect((await sharp(Buffer.from(await first.arrayBuffer())).metadata()).width).toBe(2048);
  f.state.allowed = false;
  for (let i = 0; i < 2; i++) {
    const denied = await f.get(); expect(denied.status).toBe(404); expect(await denied.text()).toBe('');
    expect(denied.headers.get('cache-control')).toContain('no-store');
  }
  expect(f.state.downloads).toBe(1); expect(f.state.checks).toBe(3);
  f.state.allowed = true;
  const recovered = await f.get(authenticatedPhotoUrl(path, 'original'));
  expect(recovered.status).toBe(200);
  expect((await sharp(Buffer.from(await recovered.arrayBuffer())).metadata()).width).toBe(2400);
  for (const name of ['cdn-cache-control', 'vercel-cdn-cache-control']) expect(recovered.headers.get(name)).toBe('no-store');
  expect(recovered.headers.get('vary')).toBe('Cookie, Authorization');
  expect(recovered.headers.get('location')).toBeNull(); expect(recovered.headers.get('content-type')).toBe('image/webp');
});

test('missing auth, database/storage failure and active content fail closed', async () => {
  const f = fixture();
  f.state.authenticated = false; expect((await f.get()).status).toBe(401); expect(f.state.checks).toBe(0);
  f.state.authenticated = true; f.state.rpcError = true;
  expect((await f.get()).status).toBe(503); expect(f.state.downloads).toBe(0);
  f.state.rpcError = false; f.state.svg = true; expect((await f.get()).status).toBe(404);
  f.state.svg = false; f.state.upstreamError = true;
  const failed = await f.get(); expect(failed.status).toBe(503); expect(failed.headers.get('cache-control')).toContain('no-store');
});

test('path traversal, empty/pending paths, backslashes, control bytes and unknown variants never reach auth or Storage', async () => {
  const f = fixture();
  for (const bad of ['', 'pending', 'a/../b', 'a/./b', '/a', 'a//b', 'a\\b', 'a\0b', 'a'.repeat(2049)]) {
    expect((await f.get(authenticatedPhotoUrl(bad))).status).toBe(404);
  }
  expect((await f.get('/api/photos/image?path=' + encodeURIComponent(path) + '&variant=raw')).status).toBe(404);
  expect(f.state.checks).toBe(0);
});

test('cookie-web payloads hide capabilities and preserve per-object nulls', async () => {
  const client = registerRequestPhotoClient(createClient('https://fixture.supabase.co', 'fixture-key', { global: { fetch: async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify(body.paths
      ? body.paths.map((p: string) => ({ path: p, signedURL: '/object/sign/wine-photos/' + p + '?token=fixture', error: p === 'missing.jpg' ? 'not found' : null }))
      : { signedURL: '/object/sign/wine-photos/' + path + '?token=fixture' }), { headers: { 'content-type': 'application/json' } });
  } } }));
  expect(await signPhotoUrl(path, client)).toBe(authenticatedPhotoUrl(path));
  const urls = await signPhotoUrls([path, path, 'pending', null, 'missing.jpg'], client);
  expect([...urls]).toEqual([[path, authenticatedPhotoUrl(path)], ['missing.jpg', null]]);
  expect(await signPhotoUrl(null, client)).toBeNull();
});

test('unadopted bearer/native clients retain signed response compatibility', async () => {
  let calls = 0;
  const client = createClient('https://fixture.supabase.co', 'fixture-key', { global: { fetch: async () => {
    calls++; return new Response(JSON.stringify({ signedURL: '/object/sign/wine-photos/' + path + '?token=fixture' }), { headers: { 'content-type': 'application/json' } });
  } } });
  expect(await signPhotoUrl(path, client)).toContain('/storage/v1/object/sign/'); expect(calls).toBe(1);
});

test('only explicitly adopted verified bearer clients receive request-authorized payloads', async () => {
  for (const version of [null, 'unknown', 'request-v1']) {
    const client = createClient('https://fixture.supabase.co', 'fixture-key', { global: { fetch: async () =>
      new Response(JSON.stringify({ signedURL: '/object/sign/wine-photos/' + path + '?token=fixture' }), { headers: { 'content-type': 'application/json' } }) } });
    client.auth.getUser = async () => ({ data: { user: { id: 'viewer' } as User }, error: null });
    const headers = new Headers({ authorization: 'Bearer fixture' });
    if (version) headers.set('X-CellarSnap-Photo-Delivery', version);
    const auth = await requireRequestAuth(new Request('https://app.test/api/feed', { headers }), undefined, {
      getEnv: () => ({ supabaseUrl: 'https://fixture.supabase.co', supabaseAnonKey: 'fixture-key' }),
      createBearerClient: () => client,
      createCookieClient: async () => { throw new Error('Unexpected cookie fallback'); },
    });
    const url = await signPhotoUrl(path, auth.supabase);
    expect(url?.includes('/storage/v1/')).toBe(version !== 'request-v1');
    if (version === 'request-v1') expect(url).toBe(authenticatedPhotoUrl(path));
  }
});

test('mobile normalizes only configured image origins and strips legacy capabilities and arbitrary query fields', () => {
  const resolve = (uri: string) => resolveAuthenticatedPhotoUrl(uri, 'https://app.test', 'https://fixture.supabase.co');
  expect(resolve(authenticatedPhotoUrl(path) + '&token=secret')).toBe('https://app.test' + authenticatedPhotoUrl(path));
  for (const prefix of ['object/sign', 'object/authenticated', 'render/image/sign', 'render/image/authenticated']) {
    expect(resolve(`https://fixture.supabase.co/storage/v1/${prefix}/wine-photos/${path}?token=secret&width=20`))
      .toBe('https://app.test' + authenticatedPhotoUrl(path));
  }
  for (const bad of ['https://evil.test/api/photos/image?path=' + path, 'https://fixture.supabase.co.evil.test/storage/v1/object/sign/wine-photos/' + path,
    'https://app.test/api/photos/image?path=a%2F..%2Fb', 'https://user:password@app.test/api/photos/image?path=' + path,
    'https://fixture.supabase.co/storage/v1/object/sign/public-assets/a.jpg', '/api/photos/image?path=pending', '/api/photos/image?path=a&variant=raw']) {
    expect(resolve(bad)).toBeNull();
  }
  expect(resolveAuthenticatedPhotoUrl(authenticatedPhotoUrl(path), 'http://insecure.test', 'https://fixture.supabase.co')).toBeNull();
  expect(resolveAuthenticatedPhotoUrl(authenticatedPhotoUrl(path), 'http://localhost:8083', 'https://fixture.supabase.co'))
    .toBe('http://localhost:8083' + authenticatedPhotoUrl(path));
});

test('mobile reads use bearer-only no-store requests and bound streamed bytes, error bodies and types', async () => {
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#792b45' } }).webp().toBuffer();
  const fetcher: typeof fetch = async (url, init) => {
    expect(url).toBe('https://app.test/api/photos/image');
    expect(init).toMatchObject({ headers: { Authorization: 'Bearer fixture' }, credentials: 'omit', cache: 'no-store', redirect: 'error' });
    return new Response(bytes, { headers: { 'content-type': 'image/webp' } });
  };
  const signal = new AbortController().signal;
  expect((await fetchAuthorizedPhoto('https://app.test/api/photos/image', 'fixture', signal, fetcher)).size).toBe(bytes.length);
  for (const response of [new Response(null, { status: 401 }), new Response(null, { status: 404 }), new Response('html', { headers: { 'content-type': 'text/html' } }),
    new Response(null, { headers: { 'content-type': 'image/webp', 'content-length': String(MAX_DELIVERED_PHOTO_BYTES + 1) } }),
    new Response(new Uint8Array(MAX_DELIVERED_PHOTO_BYTES + 1), { headers: { 'content-type': 'image/webp' } }),
    new Response(null, { headers: { 'content-type': 'image/webp' } })]) {
    await expect(fetchAuthorizedPhoto('https://app.test/api/photos/image', 'fixture', signal, async () => response)).rejects.toThrow('Photo unavailable');
  }
  const preflight = OPTIONS();
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get('access-control-allow-headers')).toBe('Authorization');
  expect(preflight.headers.get('access-control-allow-credentials')).toBeNull();
  expect(preflight.headers.get('cache-control')).toContain('no-store');
});
