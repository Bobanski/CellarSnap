import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createShareImageGetHandler } from '@/server/shares/imageDelivery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = createShareImageGetHandler(createSupabaseAdminClient);
