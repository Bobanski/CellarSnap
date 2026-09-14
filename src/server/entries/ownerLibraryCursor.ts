import { z } from 'zod';

const cursorSchema = z.object({
  v: z.literal(1), owner: z.string().uuid(),
  consumed_at: z.string().date(), created_at: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
}).strict();
type Cursor = z.infer<typeof cursorSchema>;

export function encodeOwnerLibraryCursor(owner: string, row: Pick<Cursor, 'id' | 'consumed_at' | 'created_at'>) {
  return Buffer.from(JSON.stringify({ v: 1, owner, id: row.id, consumed_at: row.consumed_at, created_at: row.created_at })).toString('base64url');
}
export function decodeOwnerLibraryCursor(value: string, owner: string): Cursor | null {
  if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    return cursor.owner === owner ? cursor : null;
  } catch { return null; }
}
/** Only validated date/timestamp/UUID values enter the PostgREST expression. */
export function ownerLibraryCursorFilter(cursor: Cursor) {
  return `consumed_at.lt.${cursor.consumed_at},and(consumed_at.eq.${cursor.consumed_at},created_at.lt.${cursor.created_at}),and(consumed_at.eq.${cursor.consumed_at},created_at.eq.${cursor.created_at},id.lt.${cursor.id})`;
}
