import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loadActivitySummary, summaryCountry, type Database } from '@shared';

const owner='11111111-1111-4111-8111-111111111111';
type Entry={id:string;country:string|null;canonical_country:string|null};
type Friend={id:string;requester_id:string;recipient_id:string;status:string};
function fixture(entries:Entry[],friends:Friend[],fail?:string) {
  const calls:URL[]=[];
  const db=createClient<Database>('https://fixture.supabase.co','fixture-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input)=>{
    const url=new URL(String(input));calls.push(url);
    const table=url.pathname.split('/').pop();
    if(table===fail)return new Response(JSON.stringify({code:'XX000',message:'fixture failure'}),{status:500,headers:{'content-type':'application/json'}});
    if(table==='user_badges')return new Response(null,{status:200,headers:{'content-range':'*/3'}});
    const rows=(table==='wine_entries' || table === 'wine_entries_with_ratings')?entries:friends;
    const after=url.searchParams.get('id')?.slice(3)??'';
    // Deliberately return less than the requested 500 and more than 1000 total.
    return new Response(JSON.stringify(rows.filter(r=>r.id>after).slice(0,37)),{headers:{'content-type':'application/json'}});
  }}});
  return {db,calls};
}
test('complete owned summary passes service cap, ignores gallery pages and deduplicates bidirectional friends',async()=>{
  const entries=Array.from({length:1007},(_,i)=>({id:String(i).padStart(6,'0'),country:i===1006?'Japan':' france ',canonical_country:i===1005?'CHILE':null}));
  const friends=[{id:'1',requester_id:owner,recipient_id:'friend-a',status:'accepted'},{id:'2',requester_id:'friend-a',recipient_id:owner,status:'accepted'},
    {id:'3',requester_id:'friend-b',recipient_id:owner,status:'accepted'},
    {id:'4',requester_id:'friend-c',recipient_id:owner,status:'pending'},
    {id:'5',requester_id:owner,recipient_id:'friend-d',status:'pending'}];
  const f=fixture(entries,friends);expect(await loadActivitySummary(f.db,owner)).toEqual({entryCount:1007,countryCount:3,friendCount:2,pendingFriendRequests:1,badgeCount:3});
  for(const url of f.calls){
    if(url.pathname.endsWith('wine_entries')){expect(url.searchParams.get('user_id')).toBe('eq.'+owner);expect(url.searchParams.get('entry_status')).toBe('eq.consumed');}
    if(url.pathname.endsWith('friend_requests')){expect(url.searchParams.get('or')).toBe(`(requester_id.eq.${owner},recipient_id.eq.${owner})`);expect(url.searchParams.get('status')).toBe('in.(accepted,pending)');}
    if(url.pathname.endsWith('user_badges'))expect(url.searchParams.get('user_id')).toBe('eq.'+owner);
  }
});
test('country canonical preference, raw fallback, case/accent/space normalization and unknown exclusion',async()=>{
  const rows=[{country:'France',canonical_country:null},{country:' france ',canonical_country:''},{country:'Wrong',canonical_country:' FRANCE '},
    {country:null,canonical_country:null},{country:'   ',canonical_country:' '},{country:"Côte d’Ivoire",canonical_country:null},{country:"cote d’ivoire",canonical_country:null}];
  const f=fixture(rows.map((row,i)=>({id:String(i),...row})),[]);
  expect((await loadActivitySummary(f.db,owner)).countryCount).toBe(2);
  expect(summaryCountry({country:'raw',canonical_country:'  Canonical  '})).toBe('canonical');
});
test('empty successful source really is zero',async()=>{
  const f=fixture([],[]);expect(await loadActivitySummary(f.db,owner)).toMatchObject({entryCount:0,countryCount:0,friendCount:0,pendingFriendRequests:0});
});
for(const table of ['wine_entries','friend_requests','user_badges'])test(`failed ${table} rejects rather than fabricating zeros`,async()=>{
  const f=fixture([],[],table);await expect(loadActivitySummary(f.db,owner)).rejects.toThrow(/Unable to load/);
});
