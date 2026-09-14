import { NextResponse } from 'next/server';
import { log } from '@/server/log';
import { PHOTO_DELIVERY_HEADER } from '@shared/photoDelivery';
import { OWNER_LIBRARY_PAGE_SIZE, ownerLibraryPageSchema } from '@shared/ownerLibrary';
import { requireRequestAuth, RequestAuthError } from '@/server/auth/requestAuth';
import { fetchPrimaryGrapesByEntryId } from '@/lib/primaryGrapes';
import { resolveGroupedPostData } from '@/server/entries/groupPosts';
import { signPhotoUrls } from '@/server/storage/signedUrls';
import { decodeOwnerLibraryCursor, encodeOwnerLibraryCursor, ownerLibraryCursorFilter } from '@/server/entries/ownerLibraryCursor';

const HEADERS = {
  'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization',
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': `Authorization, ${PHOTO_DELIVERY_HEADER}`,
};
const FIELDS = 'id, user_id, wine_name, producer, vintage, rating, consumed_at, created_at, label_image_path, country, region, appellation, classification, qpr_level, entry_group_id';
const defaults = { requireRequestAuth, fetchPrimaryGrapesByEntryId, resolveGroupedPostData, signPhotoUrls };
export function OPTIONS() { return new Response(null, { status: 204, headers: HEADERS }); }

export function createOwnerLibraryGetHandler(dependencies: Partial<typeof defaults> = {}) {
  const deps = { ...defaults, ...dependencies };
  return async (request: Request) => {
    const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: HEADERS });
    let stage = 'auth';
    try {
      const { user, supabase } = await deps.requireRequestAuth(request, {
        allowCookieFallback: !request.headers.has('authorization'),
      });
      const url = new URL(request.url);
      const rawCursor = url.searchParams.get('cursor');
      const cursor = rawCursor === null ? null : decodeOwnerLibraryCursor(rawCursor, user.id);
      if (rawCursor !== null && !cursor) return json({ error: 'Invalid library cursor' }, 400);
      const rawLimit = url.searchParams.get('limit');
      const limit = rawLimit === null ? OWNER_LIBRARY_PAGE_SIZE : Number(rawLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > OWNER_LIBRARY_PAGE_SIZE) {
        return json({ error: 'Invalid library limit' }, 400);
      }
      stage = 'entries';
      let query = supabase.from('wine_entries').select(FIELDS)
        .eq('user_id', user.id).eq('entry_status', 'consumed')
        .order('consumed_at', { ascending: false }).order('created_at', { ascending: false })
        .order('id', { ascending: false }).limit(limit + 1);
      if (cursor) query = query.or(ownerLibraryCursorFilter(cursor));
      const { data, error } = await query;
      if (error) throw error;
      const rows = data ?? [];
      // Also enforce ownership at serialization, even if an upstream query regresses.
      if (rows.some(row => row.user_id !== user.id)) throw new Error('Owner mismatch');
      const page = rows.slice(0, limit);
      const ids = page.map(row => row.id);
      stage = 'metadata';
      const [grapes, groups, labels] = await Promise.all([
        deps.fetchPrimaryGrapesByEntryId(supabase, ids, { strict: true }),
        deps.resolveGroupedPostData(supabase, page, { strict: true }),
        ids.length ? supabase.from('entry_photos').select('entry_id, path')
          .in('entry_id', ids).eq('type', 'label')
          .order('position', { ascending: true }).order('created_at', { ascending: true })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (labels.error) throw labels.error;
      const labelMap = new Map<string, string>();
      for (const label of labels.data ?? []) if (!labelMap.has(label.entry_id)) labelMap.set(label.entry_id, label.path);
      const paths = page.map(row => labelMap.get(row.id) ?? row.label_image_path);
      stage = 'photos';
      const urls = await deps.signPhotoUrls(paths.filter((path): path is string => !!path), supabase);
      const last = page.at(-1);
      stage = 'projection';
      const payload = ownerLibraryPageSchema.parse({
        viewer_user_id: user.id,
        entries: page.map((row, index) => ({ ...row,
          primary_grapes: grapes.get(row.id) ?? [], label_image_url: urls.get(paths[index] ?? '') ?? null,
          entry_group: groups.get(row.id)?.entry_group ?? null,
          group_slides: groups.get(row.id)?.group_slides ?? [],
        })),
        has_more: rows.length > limit,
        next_cursor: rows.length > limit && last ? encodeOwnerLibraryCursor(user.id, {
          id: last.id, consumed_at: last.consumed_at, created_at: last.created_at,
        }) : null,
      });
      log.debug('owner_library.loaded', { entries: payload.entries.length, has_more: payload.has_more });
      return json(payload);
    } catch (error) {
      if (error instanceof RequestAuthError) return json({ error: 'Unauthorized' }, error.status);
      // Keep tokens, source rows and raw database diagnostics out of logs/responses.
      log.error('owner_library.load_failed', { stage });
      return json({ error: 'Unable to load your library. Please try again.' }, 500);
    }
  };
}
export const GET = createOwnerLibraryGetHandler();
