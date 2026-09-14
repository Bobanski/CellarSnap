import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ownerEntryEditSchema } from '@shared/ownerEntryEdit';
import { requireTypedRequestAuth, RequestAuthError } from '@/server/auth/requestAuth';
import { log } from '@/server/log';

const HEADERS = {
  'Cache-Control': 'private, no-store', Vary: 'Authorization',
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};
const defaults = { requireTypedRequestAuth };
export function OPTIONS() { return new Response(null, { status: 204, headers: HEADERS }); }

// Bound bytes even when a caller omits or lies about Content-Length.
async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 140_000) { await reader.cancel(); throw new Error('Body too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export function createOwnerEntryEditHandler(dependencies: Partial<typeof defaults> = {}) {
  const deps = { ...defaults, ...dependencies };
  return async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: HEADERS });
    let stage = 'auth';
    try {
      // This additive mobile command is bearer-only. Cookies cannot authorize a write.
      const { supabase, user } = await deps.requireTypedRequestAuth(request, { allowCookieFallback: false });
      const { id } = await params;
      if (!z.string().uuid().safeParse(id).success) return json({ error: 'Invalid entry' }, 400);
      let body: unknown;
      try { body = await readBody(request); } catch { return json({ error: 'Invalid edit payload' }, 400); }
      const parsed = ownerEntryEditSchema.safeParse(body);
      if (!parsed.success) return json({ error: 'Invalid entry details or incomplete snapshot' }, 400);
      const edit = parsed.data;
      stage = 'command';
      const { data, error } = await supabase.rpc('save_entry_details', {
        p_entry_id: id, p_updates: edit.updates, p_expected: edit.expected,
        ...(edit.grape_ids !== undefined ? {
          p_grape_ids: edit.grape_ids, p_expected_grape_ids: edit.expected_grape_ids,
        } : {}),
      });
      if (error) {
        if (error.code === 'PT409') return json({ error: 'Entry changed elsewhere', code: 'CONFLICT' }, 409);
        if (error.code === '42501') return json({ error: 'Entry unavailable' }, 403);
        if (['22023','23514','22P02','22007','22008','23502','23503'].includes(error.code)) {
          return json({ error: 'Invalid entry details' }, 400);
        }
        throw error;
      }
      stage = 'receipt';
      // Never serialize the RPC's full row (including its private numeric rating).
      const receipt = z.object({ entry: z.object({ id: z.literal(id), user_id: z.literal(user.id) }), replayed: z.boolean() }).safeParse(data);
      if (!receipt.success) throw new Error('Invalid command receipt');
      log.debug('owner_entry_edit.saved', { replayed: receipt.data.replayed });
      return json({ entry_id: id, viewer_user_id: user.id, replayed: receipt.data.replayed });
    } catch (error) {
      if (error instanceof RequestAuthError) return json({ error: 'Unauthorized' }, 401);
      log.error('owner_entry_edit.failed', { stage });
      return json({ error: 'Unable to confirm the save. Please retry.' }, 503);
    }
  };
}
export const POST = createOwnerEntryEditHandler();
