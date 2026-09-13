import { test, expect } from '@playwright/test';
import { createClient, type User } from '@supabase/supabase-js';
import sharp from 'sharp';
import { createAuthenticatedImageGetHandler } from '@/server/storage/imageDelivery';
import { RequestAuthError } from '@/server/auth/requestAuth';
import { authenticatedPhotoUrl, registerCookiePhotoClient } from '@/lib/storage/photoDelivery';
import { signPhotoUrl, signPhotoUrls } from '@/server/storage/signedUrls';

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
  const client = registerCookiePhotoClient(createClient('https://fixture.supabase.co', 'fixture-key', { global: { fetch: async (_input, init) => {
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
