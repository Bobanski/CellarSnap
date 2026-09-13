import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePublicShareSource, SHARE_ID_PATTERN } from './source';
import { resolvePublicSharePhotoPaths } from './photoAccess';

export type ShareImageKind = 'label' | 'preview';
export type ShareImageVariant = 'display' | 'og';
export const SHARE_IMAGE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
const MAX_BYTES = 24 * 1024 * 1024;

export function publicShareImageUrl(id: string, kind: ShareImageKind, variant: ShareImageVariant = 'display') {
  return `/api/share/${encodeURIComponent(id)}/image?kind=${kind}&variant=${variant}`;
}

/** Fixed configured Storage origin, no redirects, no client-supplied path/URL.
 * Authorize at the application boundary even if upstream returns cached bytes. */
export async function fetchShareImageBytes(path: string): Promise<Uint8Array> {
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!origin || !key) throw new Error('Storage unavailable');
  const segments = path.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) throw new Error('Invalid image path');
  const objectPath = segments.map(encodeURIComponent).join('/');
  const response = await fetch(`${origin}/storage/v1/object/authenticated/wine-photos/${objectPath}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > MAX_BYTES) {
    await response.body?.cancel();
    throw new Error('Image unavailable');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error('Image too large');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return new Uint8Array(Buffer.concat(chunks));
}

export async function loadPublicShareImage(
  supabase: SupabaseClient, shareId: string, kind: ShareImageKind,
  variant: ShareImageVariant, fetchBytes = fetchShareImageBytes,
) {
  const source = await resolvePublicShareSource(supabase, shareId);
  if (!source) return null;
  const paths = await resolvePublicSharePhotoPaths(supabase, source.entry);
  const path = kind === 'label' ? paths.labelPath : paths.previewPath;
  if (!path) return null;
  const bytes = await fetchBytes(path);
  // Re-encode only raster input, bound decoded pixels and output dimensions.
  // SVG/HTML uploaded with an image-looking name cannot become same-origin content.
  const input = sharp(bytes, {limitInputPixels: 40_000_000, animated: false});
  const metadata = await input.metadata();
  if (!['jpeg', 'png', 'webp', 'gif', 'avif', 'heif'].includes(metadata.format ?? '')) return null;
  const output = input.rotate().resize({
    width: variant === 'og' ? 640 : 2048, height: variant === 'og' ? 640 : 2048,
    fit: variant === 'og' && kind === 'preview' ? 'cover' : 'inside', withoutEnlargement: true,
  });
  // Satori's OG renderer supports PNG/JPEG, not WebP decoding.
  return new Uint8Array(await (variant === 'og' ? output.png() : output.webp({quality: 90})).toBuffer());
}

export function createShareImageGetHandler(client: () => SupabaseClient, fetchBytes = fetchShareImageBytes) {
  return async (request: Request, {params}: {params: Promise<{shareId: string}>}) => {
    const {shareId} = await params;
    const search = new URL(request.url).searchParams;
    const kind = search.get('kind') ?? 'label';
    const variant = search.get('variant') ?? 'display';
    if (!SHARE_ID_PATTERN.test(shareId) || !['label','preview'].includes(kind) || !['display','og'].includes(variant)) {
      return new Response(null, {status: 404, headers: SHARE_IMAGE_HEADERS});
    }
    try {
      const bytes = await loadPublicShareImage(client(), shareId, kind as ShareImageKind, variant as ShareImageVariant, fetchBytes);
      return new Response(bytes, {status: bytes ? 200 : 404, headers: {...SHARE_IMAGE_HEADERS, 'Content-Type': variant === 'og' ? 'image/png' : 'image/webp'}});
    } catch {
      return new Response(null, {status: 503, headers: SHARE_IMAGE_HEADERS});
    }
  };
}
