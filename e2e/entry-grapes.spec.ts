import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loadEntryPrimaryGrapes, primaryGrapeSelectionChanged, ENTRY_GRAPES_LOAD_ERROR, type Database } from '@shared';

function fixture(data: unknown, status=200) {
  const requests: URL[]=[];
  const client=createClient<Database>('https://fixture.supabase.co','fixture-key',{auth:{persistSession:false},global:{fetch:async input=>{
    requests.push(new URL(String(input)));
    return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
  }}});
  return {requests,load:()=>loadEntryPrimaryGrapes(client.from('entry_primary_grapes')
    .select('position, grape_varieties(id, name)').eq('entry_id','fixture-entry').order('position',{ascending:true}))};
}
test('canonical typed grape join preserves ordered IDs and names',async()=>{
  const f=fixture([{position:1,grape_varieties:{id:'syrah',name:'Syrah'}},{position:2,grape_varieties:{id:'cab',name:'Cabernet Sauvignon'}}]);
  expect(await f.load()).toEqual({grapes:[{id:'syrah',name:'Syrah',position:1},{id:'cab',name:'Cabernet Sauvignon',position:2}],error:null});
  expect(f.requests[0].pathname).toBe('/rest/v1/entry_primary_grapes');expect(f.requests[0].searchParams.get('entry_id')).toBe('eq.fixture-entry');expect(f.requests[0].searchParams.get('order')).toBe('position.asc');
});
test('successful empty grapes is distinct from missing table, outage and missing joined variety',async()=>{
  expect(await fixture([]).load()).toEqual({grapes:[],error:null});
  for(const [body,status] of [[{code:'PGRST205'},404],[{message:'outage'},503],[null,200],[[{position:1,grape_varieties:null}],200]] as const)
    expect(await fixture(body,status).load()).toEqual({grapes:null,error:ENTRY_GRAPES_LOAD_ERROR});
});
test('notes-only selection preserves existing links, labels and positions; explicit add/remove/reorder detected',()=>{
  const grapes=[{id:'a',name:'Old name',position:1},{id:'b',name:'Other',position:2}];
  expect(primaryGrapeSelectionChanged(grapes,[{...grapes[0],name:'Renamed'},grapes[1]])).toBe(false);
  expect(primaryGrapeSelectionChanged(grapes,[grapes[1],grapes[0]])).toBe(false);
  expect(primaryGrapeSelectionChanged(grapes,[{...grapes[0],position:0},{...grapes[1],position:1}])).toBe(false);
  for(const changed of [[],[grapes[0]],[...grapes,{id:'c',name:'Third',position:3}],[{...grapes[1],position:1},{...grapes[0],position:2}]])
    expect(primaryGrapeSelectionChanged(grapes,changed)).toBe(true);
});
