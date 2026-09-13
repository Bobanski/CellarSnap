import {test,expect} from '@playwright/test';
import {resolveEventSelection,filterVisibleGroupSlides} from '@shared';
const fallback={id:'representative-b',wine_name:'Wine B'};
const a={id:'slide-a',entry_id:'wine-a',wine_name:'Wine A',producer:'Producer A',group_id:'group'};
const b={id:'slide-b',entry_id:'wine-b',wine_name:'Wine B',producer:'Producer B',group_id:'group'};
const context={id:'context',entry_id:null,wine_name:null,producer:null,group_id:'group'};
test('each selected wine determines caption and target regardless of representative entry',()=>{
  expect(resolveEventSelection([a,b,context],null,fallback)).toMatchObject({entryId:'wine-a',title:'Wine A',index:0});
  expect(resolveEventSelection([a,b,context],b.id,fallback)).toMatchObject({entryId:'wine-b',title:'Wine B',index:1});
});
test('reordered slides retain identity and index agrees with controlled gallery',()=>{
  expect(resolveEventSelection([b,context,a],a.id,fallback)).toMatchObject({entryId:'wine-a',title:'Wine A',index:2});
});
test('context never borrows a sibling title or link; photo-less events preserve representative navigation',()=>{
  expect(resolveEventSelection([a,context,b],context.id,fallback)).toMatchObject({entryId:null,title:'Event context',index:1});
  expect(resolveEventSelection([],null,fallback)).toMatchObject({entryId:'representative-b',title:'Wine B',slide:null});
});
test('restricted removed selection falls back only to a remaining authorized slide',()=>{
  const visible=filterVisibleGroupSlides([a,b,context],new Set(['group']),new Set(['wine-a']));
  expect(resolveEventSelection(visible,b.id,fallback)).toMatchObject({entryId:'wine-a',title:'Wine A',index:0});
  expect(resolveEventSelection([context],b.id,fallback).entryId).toBeNull();
});
