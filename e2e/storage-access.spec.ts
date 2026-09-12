import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import type { PGlite } from "@electric-sql/pglite";
import { storageDatabase, storageMigration } from "./fixtures/storage-access-database";
import { uid } from "./fixtures/photo-group-database";
import { resolvePublicSharePhotoPaths } from "../src/server/shares/photoAccess";

async function asRole(db:PGlite, viewer:number|null, role="authenticated") {
  await db.exec(`reset role; set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[viewer?uid(viewer):"",role]);
}
const path=(entry:number,type="label",file="legacy",owner=1)=>`${uid(owner)}/${uid(entry)}/${type}-${file}.jpg`;
async function allowed(db:PGlite,p:string) {
  return (await db.query<{v:boolean}>("select can_access_wine_photo($1) v",[p])).rows[0].v;
}

test("Storage source matrix preserves relationships, overrides, originals, tester isolation and denies anon RPC",async()=>{
  const db=await storageDatabase();
  try{
    for(const [viewer,expected] of [
      [1,[true,true,true,true,true]], [2,[true,false,true,true,false]],
      [3,[false,false,false,true,false]], [4,[false,false,false,false,false]],
      [7,[false,false,false,false,false]], [5,[true,true,true,true,true]],
    ] as const) {
      await asRole(db,viewer);
      const results=await Promise.all([path(100),path(100,"place"),path(101),path(102),path(103)].map(p=>allowed(db,p)));
      expect(results,`viewer ${viewer}`).toEqual(expected);
      expect(await allowed(db,path(100,"pairing"))).toBe(true);
      expect(await allowed(db,path(100).replace('.jpg','__original.jpg'))).toBe(expected[0]);
      expect(await allowed(db,`${uid(1)}/avatar.jpg`)).toBe(true);
      expect(await allowed(db,`${uid(1)}/collections/${uid(800)}/cover.jpg`)).toBe(viewer===1);
      expect(await allowed(db,path(110,"label","legacy",5))).toBe(viewer===5);
    }
    await asRole(db,null);
    expect(await allowed(db,path(100,"pairing"))).toBe(false);
    await asRole(db,null,"anon");
    await expect(allowed(db,path(100,"pairing"))).rejects.toMatchObject({code:"42501"});
    await asRole(db,null,"service_role");
    expect(await allowed(db,path(100,"pairing"))).toBe(true);
    for(const p of [path(100),path(100,"place"),path(101),path(103),path(110,"label","legacy",5),`${uid(1)}/avatar.jpg`])
      expect(await allowed(db,p),p).toBe(false);
  }finally{await db.close();}
});

test("Storage metadata and path forgery cannot broaden source; copies and context have independent authority",async()=>{
  const db=await storageDatabase();
  try{
    const secret=path(103);
    await db.query("insert into wine_entries(id,user_id,entry_privacy,root_entry_id,label_image_path) values ($1,$2,'public',$3,$4)",[uid(130),uid(4),uid(103),secret]);
    await db.query("insert into entry_photos(id,entry_id,path,type) values ($1,$2,$3,'label')",[uid(230),uid(130),secret]);
    await db.query("insert into entry_group_slides(id,group_id,entry_id,photo_type,path) values ($1,$2,null,'pairing',$3)",[uid(430),uid(300),secret]);
    const hiddenModern=`${uid(1)}/${uid(100)}/place/${uid(210)}.jpg`;
    await db.query("insert into entry_group_slides(id,group_id,entry_id,photo_type,path) values ($1,$2,null,'pairing',$3)",[uid(431),uid(300),hiddenModern]);
    const ownCopy=path(130,"label","legacy",4);
    await db.query("update wine_entries set label_image_path=$1 where id=$2",[ownCopy,uid(130)]);
    for(const role of ["authenticated","service_role"]) {
      await asRole(db,2,role);
      expect(await allowed(db,secret)).toBe(false);
      expect(await allowed(db,hiddenModern)).toBe(false);
      expect(await allowed(db,ownCopy)).toBe(true);
      expect(await allowed(db,`${uid(1)}/${uid(100)}/pairing/context-${uid(403)}.jpg`)).toBe(true);
      for(const p of [`${uid(1)}/${uid(100)}/pairing/unattached.jpg`,`${uid(1)}/bad/label/a.jpg`,`${uid(4)}/${uid(100)}/pairing/a.jpg`,"pending","../../etc/passwd"]) expect(await allowed(db,p)).toBe(false);
    }
    await db.exec('reset role');
    await db.query("update wine_entries set entry_privacy='private' where id=$1",[uid(100)]);
    await asRole(db,2);
    expect(await allowed(db,`${uid(1)}/${uid(100)}/pairing/context-${uid(403)}.jpg`)).toBe(false);
    expect(await allowed(db,ownCopy)).toBe(true);
  }finally{await db.close();}
});

test("both-direction blocks override object/avatar access including trusted testers",async()=>{
  const db=await storageDatabase();
  try{
    for(const viewer of [2,5]) for(const reverse of [false,true]) {
      await db.exec('reset role; delete from user_blocks');
      await db.query('insert into user_blocks values ($1,$2)',reverse?[uid(viewer),uid(1)]:[uid(1),uid(viewer)]);
      await asRole(db,viewer);
      for(const p of [path(100,'pairing'),`${uid(1)}/avatar.jpg`]) expect(await allowed(db,p)).toBe(false);
    }
  }finally{await db.close();}
});

test("reclassification follows authoritative metadata and context cannot override hidden or duplicate source types",async()=>{
  const db=await storageDatabase();
  try{
    const modern=`${uid(1)}/${uid(100)}/label/${uid(200)}.jpg`;
    await db.query("update entry_photos set type='people' where id=$1",[uid(200)]);
    await asRole(db,4);
    expect(await allowed(db,modern)).toBe(true);
    await db.exec('reset role');
    await db.query("insert into entry_photos(id,entry_id,path,type) values ($1,$2,$3,'place')",[uid(240),uid(100),modern]);
    await db.query("insert into entry_group_slides(id,group_id,entry_id,photo_type,path) values ($1,$2,null,'pairing',$3)",[uid(440),uid(300),modern]);
    for(const role of ['authenticated','service_role']){
      await asRole(db,4,role);
      expect(await allowed(db,modern)).toBe(false);
    }
    await asRole(db,null,'anon');
    await expect(db.query('select private.can_access_wine_photo($1)',[modern])).rejects.toMatchObject({code:'42501'});
    await db.exec('reset role');
    expect((await db.query<{proname:string;prosecdef:boolean}>("select n.nspname||'.'||p.proname proname,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname='can_access_wine_photo' order by 1")).rows)
      .toEqual([{proname:'private.can_access_wine_photo',prosecdef:true},{proname:'public.can_access_wine_photo',prosecdef:false}]);
  }finally{await db.close();}
});

test("Storage migration replays and rejects unknown policies, public bucket and missing predecessor",async()=>{
  for(const scenario of ['replay','policy','bucket','predecessor']) {
    const db=await storageDatabase(false);
    try{
      if(scenario==='policy') await db.exec('create policy leak on storage.objects for all using (true)');
      if(scenario==='bucket') await db.exec("update storage.buckets set public=true where id='wine-photos'");
      if(scenario==='predecessor') await db.exec('drop policy "Users can view allowed entry group slides" on entry_group_slides');
      const sql=await readFile(storageMigration,'utf8');
      if(scenario==='replay'){await db.exec(sql);await db.exec(sql);}
      else {await expect(db.exec(sql)).rejects.toThrow(/Unreviewed|private|B01/);await db.exec('rollback');}
    }finally{await db.close();}
  }
});

test("slide-only member images require both source privacy and an owned readable group anchor",async()=>{
  const db=await storageDatabase();
  try{
    const p=`${uid(1)}/${uid(101)}/label/slide-only.jpg`;
    await db.query("insert into entry_group_slides(id,group_id,entry_id,photo_type,path) values ($1,$2,$3,'label',$4)",[uid(450),uid(300),uid(101),p]);
    await asRole(db,2);expect(await allowed(db,p)).toBe(true);
    await asRole(db,4);expect(await allowed(db,p)).toBe(false);
    await db.exec('reset role');
    await db.query("update wine_entries set entry_privacy='public' where id=$1",[uid(101)]);
    await asRole(db,null,'service_role');expect(await allowed(db,p)).toBe(true);
    await db.exec('reset role');
    await db.query("update wine_entries set entry_privacy='private' where id=$1",[uid(100)]);
    for(const role of ['authenticated','service_role']) {await asRole(db,2,role);expect(await allowed(db,p)).toBe(false);}
  }finally{await db.close();}
});

test("anonymous preview skips private first slide/photo and never approves paths on RPC failure",async()=>{
  const approved:string[]=[];
  const data:Record<string,object|object[]|null>={
    entry_photos:[{path:'owner/own/label/hidden.jpg',type:'label'},{path:'owner/own/pairing/visible.jpg',type:'pairing'}],
    entry_groups:{id:'g',user_id:'owner',anchor_entry_id:'anchor'},
    entry_group_slides:[{entry_id:'private',photo_type:'label',path:'owner/private/label/a.jpg'},{entry_id:null,photo_type:'pairing',path:'owner/anchor/pairing/b.jpg'}],
  };
  let anchorVisible=true; let rpcFails=false;
  const client={from(table:string){
    let multiple=false;
    const q={select:()=>q,eq:()=>q,order:()=>q,in:()=>{multiple=true;return q;},maybeSingle:()=>q,
      then:(resolve:(v:object)=>unknown)=>Promise.resolve({data:table==='wine_entries'?(multiple?[{id:'anchor',entry_privacy:'public',label_photo_privacy:null,place_photo_privacy:null}]:anchorVisible?{id:'anchor'}:null):data[table],error:null}).then(resolve)};
    return q;
  },rpc:async(_name:string,{object_name}:{object_name:string})=>{
    approved.push(object_name);return {data:object_name!=='owner/own/label/hidden.jpg'&&object_name!=='owner/own/label/forged.jpg',error:rpcFails?{message:'migration absent'}:null};
  }};
  const entry={entry_privacy:'public',label_photo_privacy:null,place_photo_privacy:null,id:'own',user_id:'owner',entry_group_id:'g',label_image_path:'owner/own/label/forged.jpg'};
  expect(await resolvePublicSharePhotoPaths(client as never,entry)).toEqual({labelPath:null,previewPath:'owner/anchor/pairing/b.jpg'});
  expect(approved).not.toContain('owner/private/label/a.jpg');
  anchorVisible=false;
  expect(await resolvePublicSharePhotoPaths(client as never,entry)).toEqual({labelPath:null,previewPath:'owner/own/pairing/visible.jpg'});
  rpcFails=true;
  expect(await resolvePublicSharePhotoPaths(client as never,entry)).toEqual({labelPath:null,previewPath:null});
});
