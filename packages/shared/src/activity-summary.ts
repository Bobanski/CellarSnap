import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { BADGE_DEFINITIONS } from './badges';
import { z } from 'zod';

export const activitySummarySchema = z.object({
  entryCount:z.number().int().nonnegative(), countryCount:z.number().int().nonnegative(),
  friendCount:z.number().int().nonnegative(), pendingFriendRequests:z.number().int().nonnegative(),
  badgeCount:z.number().int().nonnegative(),
});
export type ActivitySummary = z.infer<typeof activitySummarySchema>;
export function summaryCountry(entry:{country:string|null;canonical_country:string|null}) {
  return (entry.canonical_country?.trim() || entry.country?.trim() || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
}

/** Own-profile totals, independent of gallery pages, search, or group collapsing.
 * Canonical country wins, falling back to raw country. Accepted relationships
 * count unique other users in either direction; pending requests never count.
 */
export async function loadActivitySummary(db:SupabaseClient<Database>,userId:string):Promise<ActivitySummary> {
  const loadTastings=async()=>{
    let after:string|undefined, entryCount=0;const countries=new Set<string>();
    for(;;){
      let q=db.from('wine_entries').select('id,country,canonical_country').eq('user_id',userId)
        .eq('entry_status','consumed').order('id').limit(500);
      if(after)q=q.gt('id',after);
      const {data,error}=await q;if(error||!data)throw new Error('Unable to load tasting counts.');
      if(!data.length)return {entryCount,countryCount:countries.size};
      entryCount+=data.length;for(const entry of data){const country=summaryCountry(entry);if(country)countries.add(country);}
      after=data[data.length-1].id;
    }
  };
  const loadFriends=async()=>{
    let after:string|undefined,pendingFriendRequests=0;const friends=new Set<string>();
    for(;;){
      let q=db.from('friend_requests').select('id,requester_id,recipient_id,status')
        .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
        .in('status',['accepted','pending']).order('id').limit(500);
      if(after)q=q.gt('id',after);
      const {data,error}=await q;if(error||!data)throw new Error('Unable to load friend counts.');
      if(!data.length)return {friendCount:friends.size,pendingFriendRequests};
      for(const row of data){
        const other=row.requester_id===userId?row.recipient_id:row.requester_id;
        if(row.status==='accepted'&&other!==userId)friends.add(other);
        if(row.status==='pending'&&row.recipient_id===userId)pendingFriendRequests++;
      }
      after=data[data.length-1].id;
    }
  };
  const [tastings,friends,badges]=await Promise.all([loadTastings(),loadFriends(),db.from('user_badges')
    .select('id',{count:'exact',head:true}).eq('user_id',userId).in('badge_id',BADGE_DEFINITIONS.map(b=>b.id))]);
  if(badges.error||badges.count===null)throw new Error('Unable to load badge count.');
  return {...tastings,...friends,badgeCount:badges.count};
}
