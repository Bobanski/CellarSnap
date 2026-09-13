import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { BADGE_DEFINITIONS, type BadgeTriggerSpec, type Database } from '@shared';
import { evaluateBadgeDefinition, evaluateBadgeTrigger, normalizeBadgeValue } from '@/server/badges/triggers';
import { evaluateAndAwardBadges } from '@/server/badges/evaluator';
import { loadBadgeEntryFacts, type BadgeEntryFact } from '@/server/badges/queries';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const fact = (overrides: Partial<BadgeEntryFact> = {}): BadgeEntryFact => ({
  id:'entry',region:null,appellation:null,country:null,producer:null,wine_type:null,grapes:[],...overrides,
});
const repeat = (n:number, overrides:Partial<BadgeEntryFact>={}) => Array.from({length:n},(_,i)=>fact({id:String(i),...overrides}));

// Hand-reviewed supported subset: unfiltered stored categorical facts only.
function positiveFacts(trigger: BadgeTriggerSpec): BadgeEntryFact[] | null {
  switch(trigger.type) {
    case 'entry_count': return repeat(trigger.count);
    case 'region_match': return repeat(trigger.count,{region:trigger.region});
    case 'country_match': return repeat(trigger.count,{country:trigger.country});
    case 'grape_match': return trigger.ratingFilter ? null : repeat(trigger.count,{grapes:[trigger.grape]}).map((f,i)=>({...f,region:`region ${i}`}));
    case 'wine_type_match': return trigger.ratingFilter || !['red','white','rose','sparkling','sweet','orange'].includes(trigger.wineType) ? null : repeat(trigger.count,{wine_type:trigger.wineType}).map((f,i)=>({...f,producer:`producer ${i}`}));
    case 'compound': {
      const parts=trigger.all.map(positiveFacts);
      return parts.some(p=>p===null)?null:parts.flatMap(p=>p!);
    }
    default: return null;
  }
}
for (const badge of BADGE_DEFINITIONS) {
  test(`definition ${badge.id}: explicit eligibility or deferred contract`,()=>{
    const positive=["challenge-winner","cellar-master"].includes(badge.id)?null:positiveFacts(badge.trigger);
    if(positive) {
      expect(evaluateBadgeDefinition(badge,positive)).toBe('earned');
      expect(evaluateBadgeDefinition(badge,[])).toBe('not_earned');
    } else {
      expect(evaluateBadgeDefinition(badge,repeat(1000,{wine_type:'red',region:'Bordeaux',country:'France',grapes:['Pinot Noir']}))).toBe('deferred');
    }
  });
}
test('all 85 unique definitions and all 12 shared trigger families retained',()=>{
  expect(BADGE_DEFINITIONS).toHaveLength(85);
  expect(new Set(BADGE_DEFINITIONS.map(b=>b.id)).size).toBe(85);
  const types=new Set<string>();
  function collect(t:BadgeTriggerSpec){types.add(t.type);if(t.type==='compound')t.all.forEach(collect);}
  BADGE_DEFINITIONS.forEach(b=>collect(b.trigger));
  expect([...types].sort()).toEqual(['compound','country_match','cross_region_count','entry_count','founding_member','grape_match','rating_ratio','region_match','social_compatibility','social_tag_count','sommelier_group_count','wine_type_match'].sort());
});
test('categorical matching is accent/case/underscore normalized, never substring matching',()=>{
  expect(normalizeBadgeValue('  Rhône  ')).toBe('rhone');
  expect(evaluateBadgeTrigger({type:'region_match',region:'rhone',count:2},[fact({region:'Rhône'}),fact({appellation:'RHONE'})])).toBe('earned');
  expect(evaluateBadgeTrigger({type:'grape_match',grape:'pinot_noir',count:1},[fact({grapes:['Pinot Noir']})])).toBe('earned');
  expect(evaluateBadgeTrigger({type:'grape_match',grape:'syrah',count:1},[fact({grapes:['Petite Syrah']})])).toBe('not_earned');
  expect(evaluateBadgeTrigger({type:'country_match',country:'georgia',count:1},[fact({country:'South Georgia'})])).toBe('not_earned');
});
test('grapes count distinct tastings, all constraints and compound conditions apply',()=>{
  const trigger:BadgeTriggerSpec={type:'grape_match',grape:'syrah',count:2,minRegions:2};
  expect(evaluateBadgeTrigger(trigger,[fact({grapes:['syrah','Syrah'],region:'Loire'})])).toBe('not_earned');
  expect(evaluateBadgeTrigger(trigger,repeat(2,{grapes:['syrah'],region:'Loire'}))).toBe('not_earned');
  expect(evaluateBadgeTrigger(trigger,[fact({grapes:['syrah'],region:'Loire'}),fact({grapes:['syrah'],region:'Rhône'})])).toBe('earned');
  expect(evaluateBadgeTrigger({type:'compound',all:[{type:'entry_count',count:1},{type:'country_match',country:'chile',count:1}]},[fact({country:'France'})])).toBe('not_earned');
  expect(evaluateBadgeTrigger({type:'compound',all:[{type:'entry_count',count:1},{type:'founding_member'}]},[fact()])).toBe('deferred');
  expect(evaluateBadgeTrigger({type:'wine_type_match',wineType:'orange',count:2,minProducers:2},repeat(2,{wine_type:'orange',producer:'Same'}))).toBe('not_earned');
});

type Reply={data:unknown;status?:number};
function client(replies: Reply[]){
  const calls:Array<{url:URL;method:string;body:unknown;prefer:string|null}>=[];
  const db=createClient<Database>('https://fixture.supabase.co','fixture-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    calls.push({url:new URL(String(input)),method:init?.method??'GET',body:init?.body?JSON.parse(String(init.body)):null,prefer:new Headers(init?.headers).get('prefer')});
    const reply=replies.shift();if(!reply)throw new Error('Unexpected query');
    return new Response(JSON.stringify(reply.data),{status:reply.status??200,headers:{'content-type':'application/json'}});
  }}});
  return {db,calls};
}
const stored=(id:string)=>({id,region:null,appellation:null,country:null,producer:null,wine_type:null,entry_primary_grapes:[]});
test('facts use authenticated owner/consumed scope and keyset past short capped pages',async()=>{
  const f=client([{data:[stored('a'),stored('b')]},{data:[stored('c')]},{data:[]}]);
  expect(await loadBadgeEntryFacts(f.db,'owner')).toHaveLength(3);
  expect(f.calls.map(c=>c.url.searchParams.get('id'))).toEqual([null,'gt.b','gt.c']);
  for(const {url} of f.calls){expect(url.searchParams.get('user_id')).toBe('eq.owner');expect(url.searchParams.get('entry_status')).toBe('eq.consumed');expect(url.searchParams.get('order')).toBe('id.asc');}
});
test('returns only persisted new awards; retries/concurrent conflicts produce no false toast',async()=>{
  for(const returned of [[{badge_id:'first-log'}],[]]) {
    const reader=client([{data:[]},{data:[stored('a')]},{data:[]}]);
    const writer=client([{data:returned}]);
    const result=await evaluateAndAwardBadges({supabase:reader.db,userId:'verified-owner',createAwardWriter:()=>writer.db});
    expect(result.newlyEarned.map(b=>b.id)).toEqual(returned.map(b=>b.badge_id));
    expect(writer.calls).toHaveLength(1);expect(writer.calls[0].method).toBe('POST');
    expect(writer.calls[0].body).toEqual([{user_id:'verified-owner',badge_id:'first-log'}]);
    expect(writer.calls[0].prefer).toContain('resolution=ignore-duplicates');
  }
});
test('already awarded badges never write again',async()=>{
  const reader=client([{data:[{badge_id:'first-log'}]},{data:[stored('a')]},{data:[]}]);
  await expect(evaluateAndAwardBadges({supabase:reader.db,userId:'owner',createAwardWriter:()=>{throw new Error('Unexpected write');}})).resolves.toEqual({newlyEarned:[]});
});
for(const stage of ['earned','facts','write'])test(`failed ${stage} does not report successful awards`,async()=>{
  const failure={data:{code:'XX000',message:'fixture failure'},status:500};
  const reader=client(stage==='earned'?[failure]:stage==='facts'?[{data:[]},failure]:[{data:[]},{data:[stored('a')]},{data:[]}]);
  const writer=client([failure]);
  await expect(evaluateAndAwardBadges({supabase:reader.db,userId:'owner',createAwardWriter:()=>writer.db})).rejects.toThrow(/Unable to/);
  if(stage!=='write')expect(writer.calls).toHaveLength(0);
});

for(const role of ['anon','authenticated'] as const)test(`${role} cannot insert, upsert, edit, delete or truncate awards; service retains authority`,async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create function auth.uid() returns uuid language sql as $$select '11111111-1111-4111-8111-111111111111'::uuid$$;
      create function auth.role() returns text language sql as $$select current_user::text$$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      create table user_badges(user_id uuid,badge_id text,earned_at timestamptz default now(),primary key(user_id,badge_id));
      alter table user_badges enable row level security;
      grant all on user_badges to anon,authenticated,service_role;
      create policy "Users can insert own badges" on user_badges for insert with check(auth.uid()=user_id);
      create policy "Authenticated users can view badges" on user_badges for select using(auth.role()='authenticated');
      insert into user_badges(user_id,badge_id) values(auth.uid(),'existing');`);
    const migration=await readFile('supabase/sql/20260913061822_server_authoritative_badge_awards.sql','utf8');
    await db.exec(migration);await db.exec(migration);
    await db.exec(`set role ${role}`);
    for(const sql of ["insert into user_badges values(auth.uid(),'fake',now())","insert into user_badges values(auth.uid(),'existing',now()) on conflict(user_id,badge_id) do update set earned_at=now()","update user_badges set badge_id='fake'","delete from user_badges","truncate user_badges"]){
      await expect(db.exec(sql)).rejects.toMatchObject({code:'42501'});
    }
    if(role==='authenticated') expect((await db.query('select badge_id from user_badges')).rows).toEqual([{badge_id:'existing'}]);
    else await expect(db.query('select * from user_badges')).rejects.toMatchObject({code:'42501'});
    await db.exec('reset role;set role service_role');
    expect((await db.query("insert into user_badges(user_id,badge_id) values(auth.uid(),'first-log') on conflict do nothing returning badge_id")).rows).toEqual([{badge_id:'first-log'}]);
    expect((await db.query("insert into user_badges(user_id,badge_id) values(auth.uid(),'first-log') on conflict do nothing returning badge_id")).rows).toEqual([]);
    await db.exec("delete from user_badges where badge_id='first-log'");
  } finally {await db.close();}
});
