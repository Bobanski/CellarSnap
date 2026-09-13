import { createAuthenticatedImageGetHandler } from '@/server/storage/imageDelivery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = createAuthenticatedImageGetHandler();
