export type EntryPrimaryGrape = { id: string; name: string; position: number };
export const ENTRY_GRAPES_LOAD_ERROR = "We couldn't load this entry's grapes. Try again before editing.";

/** An empty successful relation is distinct from unavailable or partial data.
 * Never seed an editor with an empty selection after a failed grape read. */
type GrapeQuery = PromiseLike<{
  data: {position: number; grape_varieties: {id: string; name: string} | null}[] | null;
  error: unknown;
}>;
export async function loadEntryPrimaryGrapes(query: GrapeQuery): Promise<
  { grapes: EntryPrimaryGrape[]; error: null } | { grapes: null; error: string }
> {
  try {
    const {data, error} = await query;
    if (error || !data || data.some(row => !row.grape_varieties)) return {grapes:null, error:ENTRY_GRAPES_LOAD_ERROR};
    return {grapes:data.map(row => ({id:row.grape_varieties!.id, name:row.grape_varieties!.name, position:row.position})), error:null};
  } catch { return {grapes:null, error:ENTRY_GRAPES_LOAD_ERROR}; }
}

/** Notes-only saves must not clear/reinsert confirmed grape links (or overwrite
 * grapes changed concurrently elsewhere). Compare ordered IDs, not labels. */
export function primaryGrapeSelectionChanged(original: readonly EntryPrimaryGrape[], selected: readonly EntryPrimaryGrape[]) {
  const ids = (grapes: readonly EntryPrimaryGrape[]) => [...grapes].sort((a,b) => a.position-b.position).map(grape => grape.id);
  const before=ids(original), after=ids(selected);
  return before.length !== after.length || before.some((id,index) => id !== after[index]);
}
