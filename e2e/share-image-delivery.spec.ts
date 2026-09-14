import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { createShareImageGetHandler, fetchShareImageBytes } from '@/server/shares/imageDelivery';

const shareId = '00000000-0000-4000-8000-000000000001';
const photoPath = 'owner/entry/label/photo.png';
function fixture() {
  const state = {revoked:false, expires:null as string|null, privacy:'public', test:false, profile:true, photo:true, gate:true, queryError:false};
  const calls:string[]=[];
  const db=createClient('https://fixture.supabase.co','fixture-key',{auth:{persistSession:false},global:{fetch:async input=>{
    const url=new URL(String(input));calls.push(url.pathname);
    let data:unknown=null;
    if(url.pathname.endsWith('/post_shares')) {expect(url.searchParams.get('revoked_at')).toBe('is.null');data=state.revoked?null:{id:shareId,post_id:'entry',expires_at:state.expires};}
    if(url.pathname.endsWith('/wine_entries_with_ratings'))data={id:'entry',user_id:'owner',entry_privacy:state.privacy,label_photo_privacy:'public',label_image_path:photoPath};
    if(url.pathname.endsWith('/public_profiles'))data=state.profile?{display_name:'Fixture',is_test_account:state.test}:null;
    if(url.pathname.endsWith('/entry_photos'))data=state.photo?[{path:photoPath,type:'label'}]:[];
    if(url.pathname.endsWith('/rpc/can_access_wine_photo'))data=state.gate;
    return new Response(JSON.stringify(state.queryError?{message:'Fixture outage'}:data),{status:state.queryError?500:200,headers:{'content-type':'application/json'}});
  }}});
  let downloads=0;
  const get=createShareImageGetHandler(()=>db,async path=>{expect(path).toBe(photoPath);downloads++;return new Uint8Array(await sharp({create:{width:800,height:1200,channels:3,background:'#712343'}}).png().toBuffer());});
  return {state,calls,downloads:()=>downloads,get:(query='')=>get(new Request('https://app.test/api/share/'+shareId+'/image'+query),{params:Promise.resolve({shareId})})};
}

test('same public image URL reauthorizes after share, entry, author and source access changes',async()=>{
  const f=fixture();
  const ok=await f.get();expect(ok.status).toBe(200);expect(ok.headers.get('cache-control')).toContain('no-store');expect(ok.headers.get('cdn-cache-control')).toBe('no-store');expect(ok.headers.get('location')).toBeNull();
  const metadata=await sharp(Buffer.from(await ok.arrayBuffer())).metadata();expect(metadata.format).toBe('webp');expect(metadata.width).toBe(800);
  for(const patch of [{revoked:true},{expires:'2000-01-01'},{expires:'invalid'},{privacy:'private'},{test:true},{profile:false},{gate:false}]) {
    const previous={...f.state};Object.assign(f.state,patch);
    const r=await f.get();expect(r.status).toBe(404);expect(r.headers.get('cache-control')).toContain('no-store');expect((await r.arrayBuffer()).byteLength).toBe(0);expect(f.downloads()).toBe(1);
    Object.assign(f.state,previous);
  }
  expect((await f.get()).status).toBe(200);expect(f.downloads()).toBe(2);
});

test('variants are fixed and bounded; arbitrary object paths cannot be selected',async()=>{
  const f=fixture();
  for(const query of ['?kind=other','?variant=raw','?kind=../private'])expect((await f.get(query)).status).toBe(404);
  expect(f.calls).toHaveLength(0);
  const og=await f.get('?kind=preview&variant=og&path=foreign/secret');expect(og.status).toBe(200);
  const meta=await sharp(Buffer.from(await og.arrayBuffer())).metadata();expect(meta.format).toBe('png');expect(og.headers.get('content-type')).toBe('image/png');expect([meta.width,meta.height]).toEqual([640,640]);expect(f.downloads()).toBe(1);
  f.state.queryError=true;const denied=await f.get();expect(denied.status).toBe(404);expect(f.downloads()).toBe(1);
});

test('fixed-origin download disables cache and redirects, bounds streamed bytes and cancels oversized bodies',async()=>{
  const originalFetch=globalThis.fetch;const originalUrl=process.env.NEXT_PUBLIC_SUPABASE_URL, originalKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://storage.example.test';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-server-only';
  let cancelled=false;
  try{
    await expect(fetchShareImageBytes('owner/entry/../../secret')).rejects.toThrow('Invalid image path');
    globalThis.fetch=async(input,options)=>{
      expect(String(input)).toBe('https://storage.example.test/storage/v1/object/authenticated/wine-photos/owner/photo%3Ftoken%3Dnot-a-query.png');
      expect(options?.cache).toBe('no-store');expect(options?.redirect).toBe('error');expect(options?.signal).toBeDefined();
      return new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(13*1024*1024));},cancel(){cancelled=true;}}));
    };
    await expect(fetchShareImageBytes('owner/photo?token=not-a-query.png')).rejects.toThrow('Image too large');expect(cancelled).toBe(true);
  }finally{globalThis.fetch=originalFetch;for(const[k,v]of[['NEXT_PUBLIC_SUPABASE_URL',originalUrl],['SUPABASE_SERVICE_ROLE_KEY',originalKey]]){if(v===undefined)delete process.env[k!];else process.env[k!]=v;}}
});
