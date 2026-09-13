// Compile-only regression contracts. Never import this module at runtime.
import type { QueryData, SupabaseClient } from '@supabase/supabase-js';
import type { Database, TablesInsert, Tables } from '../../packages/shared/src/database.types';

declare const db: SupabaseClient<Database>;
const joined = db.from('entry_primary_grapes').select('entry_id, grape_varieties(id, name)');
type JoinedGrape = NonNullable<QueryData<typeof joined>[number]['grape_varieties']>;
const name: JoinedGrape['name'] = 'Nebbiolo';
const entry: TablesInsert<'wine_entries'> = { user_id:'fixture-owner', rating:92 };
const nullableProducer: Tables<'wine_entries'>['producer'] = null;
void [name, entry, nullableProducer];
// @ts-expect-error Unknown table must fail before a network call.
db.from('wine_entry_typo');
// @ts-expect-error Missing required writer ownership must fail.
const missingOwner: TablesInsert<'wine_entries'> = { wine_name:'Fixture' };
// @ts-expect-error Physical rating is numeric, independently of public rating DTOs.
db.from('wine_entries').update({rating:'excellent'});
// @ts-expect-error Existing AUD-10 drift is intentionally not invented in generated types.
db.from('wine_entries').update({ai_notes_summary:'not in reviewed schema'});
// @ts-expect-error Invalid RPC argument must fail.
db.rpc('get_email_for_username', {username_typo:'fixture'});
const absentAlias = db.from('grape_aliases').select('alias_type');
// @ts-expect-error Invalid selects produce SelectQueryError, not a plausible domain row.
type AbsentAlias = QueryData<typeof absentAlias>[number]['alias_type'];
void [missingOwner, joined, absentAlias];
export type { AbsentAlias };
