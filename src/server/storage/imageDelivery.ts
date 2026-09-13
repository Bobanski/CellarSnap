import sharp from 'sharp';
import { RequestAuthError, requireRequestAuth, type RequestAuthResult } from '@/server/auth/requestAuth';
import { fetchShareImageBytes, SHARE_IMAGE_HEADERS } from '@/server/shares/imageDelivery';
import { isValidPhotoPath } from '@/lib/storage/photoDelivery';

const headers = { ...SHARE_IMAGE_HEADERS, Vary: 'Cookie, Authorization' };

export function createAuthenticatedImageGetHandler(
  authenticate: (request: Request) => Promise<RequestAuthResult> = requireRequestAuth,
  fetchBytes = fetchShareImageBytes,
) {
  return async (request: Request) => {
    const search = new URL(request.url).searchParams;
    const path = search.get('path') ?? '';
    const variant = search.get('variant') ?? 'display';
    if (!isValidPhotoPath(path) || !['display', 'original'].includes(variant)) {
      return new Response(null, { status: 404, headers });
    }
    try {
      const { supabase } = await authenticate(request);
      // Fresh database decision under the verified caller's JWT. A warmed Storage
      // response must never substitute for this source-owned authorization check.
      const { data: allowed, error } = await supabase.rpc('can_access_wine_photo', { object_name: path });
      if (error) return new Response(null, { status: 503, headers });
      if (allowed !== true) return new Response(null, { status: 404, headers });
      const bytes = await fetchBytes(path);
      const input = sharp(bytes, { limitInputPixels: 40_000_000, animated: false });
      const metadata = await input.metadata();
      if (!['jpeg', 'png', 'webp', 'gif', 'avif', 'heif'].includes(metadata.format ?? '')) {
        return new Response(null, { status: 404, headers });
      }
      const output = input.rotate();
      if (variant === 'display') output.resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true });
      // Keep original dimensions for recropping; never serve active uploaded content.
      const body = new Uint8Array(await output.webp({ quality: 90 }).toBuffer());
      return new Response(body, { headers: { ...headers, 'Content-Type': 'image/webp' } });
    } catch (error) {
      return new Response(null, { status: error instanceof RequestAuthError ? 401 : 503, headers });
    }
  };
}
