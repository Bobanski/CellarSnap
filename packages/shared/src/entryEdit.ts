import type { Json } from './database.types';

/** Compare raw loaded values, not normalized form values. Only submitted fields
 * participate, so derived/background data cannot silently overwrite an edit. */
export function buildEntryEditSnapshot(updates: Record<string, unknown>, original: object): {
  updates: Json; expected: Json;
} {
  const source = original as Record<string, unknown>;
  const expected: Record<string, unknown> = {};
  for (const key of Object.keys(updates)) {
    if (!Object.prototype.hasOwnProperty.call(source, key) || source[key] === undefined || updates[key] === undefined) {
      throw new Error('Entry edit data is incomplete. Refresh the entry before saving.');
    }
    expected[key] = source[key];
  }
  return { updates: JSON.parse(JSON.stringify(updates)) as Json, expected: JSON.parse(JSON.stringify(expected)) as Json };
}
