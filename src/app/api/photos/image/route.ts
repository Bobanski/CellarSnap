import { AUTHENTICATED_IMAGE_HEADERS, createAuthenticatedImageGetHandler } from '@/server/storage/imageDelivery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = createAuthenticatedImageGetHandler();
export function OPTIONS() {
  return new Response(null, { status: 204, headers: AUTHENTICATED_IMAGE_HEADERS });
}
