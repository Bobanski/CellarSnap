import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { photoGroupBaselineSql, photoGroupMigration, uid } from "./fixtures/photo-group-database";
import { filterVisibleGroupSlides } from "../packages/shared/src/groupedPhotos";
import { resolveGroupedPostData } from "../src/server/entries/groupPosts";

async function database(migrated = true) {
  const db = new PGlite();
  for (const file of ["e2e/fixtures/entry-access-schema.sql", "e2e/fixtures/entry-access-functions.sql", "e2e/fixtures/entry-access-seed.sql",
    "supabase/sql/20260912185640_protect_profile_capabilities_and_public_assets.sql", "supabase/sql/20260912200417_enforce_entry_read_privacy.sql"]) {
    await db.exec(await readFile(file, "utf8"));
  }
  await db.exec(await photoGroupBaselineSql());
  await db.exec(await readFile("e2e/fixtures/photo-group-seed.sql", "utf8"));
  if (migrated) await db.exec(await readFile(photoGroupMigration, "utf8"));
  return db;
}
async function asRole(db: PGlite, viewer: number | null, role = "authenticated") {
  await db.exec(`reset role; set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [viewer ? uid(viewer) : ""]);
  await db.query("select set_config('request.jwt.claim.role', $1, false)", [role]);
}
async function ids(db: PGlite, table: "entry_photos" | "entry_groups" | "entry_group_slides") {
  return (await db.query<{id: string}>(`select id from ${table} order by id`)).rows.map(r => Number(r.id.slice(-12)));
}

test("captured policies leak private group/slide and photo overrides; actual migration closes it and replays", async () => {
  const db = await database(false);
  try {
    await asRole(db, 4);
    expect(await ids(db, "entry_groups")).toContain(301);
    expect(await ids(db, "entry_group_slides")).toContain(402);
    expect(await ids(db, "entry_photos")).toContain(210);
    await db.exec("reset role");
    await db.exec(await readFile(photoGroupMigration, "utf8"));
    await db.exec(await readFile(photoGroupMigration, "utf8"));
    await asRole(db, 4);
    expect(await ids(db, "entry_groups")).toEqual([300]);
    expect(await ids(db, "entry_group_slides")).toEqual([403,405]);
    expect(await ids(db, "entry_photos")).toEqual([211]);
  } finally { await db.close(); }
});

test("photo and group matrix covers owners, friendship, two-hop, pending, testers and anonymous", async () => {
  const db = await database();
  try {
    for (const c of [
      {viewer:1, photos:[200,201,202,203,210,211,212], groups:[300,301,303], slides:[400,401,402,403,404,405,406,408]},
      {viewer:2, photos:[200,201,202,211], groups:[300], slides:[400,401,403,405]},
      {viewer:3, photos:[202,211], groups:[300], slides:[403,405]},
      {viewer:4, photos:[211], groups:[300], slides:[403,405]},
      {viewer:7, photos:[211], groups:[300], slides:[403,405]},
      {viewer:5, photos:[200,201,202,203,210,211,212], groups:[300,301,302], slides:[400,401,402,403,404,405,406,407]},
      {viewer:null, photos:[], groups:[], slides:[]},
    ]) {
      await asRole(db, c.viewer, c.viewer === null ? "anon" : "authenticated");
      expect(await ids(db, "entry_photos"), `photos for ${c.viewer}`).toEqual(c.photos);
      expect(await ids(db, "entry_groups"), `groups for ${c.viewer}`).toEqual(c.groups);
      expect(await ids(db, "entry_group_slides"), `slides for ${c.viewer}`).toEqual(c.slides);
    }
    await asRole(db, null);
    expect(await ids(db, "entry_group_slides")).toEqual([]);
    await asRole(db, null, "service_role");
    expect(await ids(db, "entry_group_slides")).toHaveLength(9);
  } finally { await db.close(); }
});

test("blocks in both directions override testers and friends; anchor privacy changes revoke group/context access", async () => {
  const db = await database();
  try {
    for (const viewer of [2,5]) for (const reverse of [true,false]) {
      await db.exec("reset role; delete from user_blocks");
      await db.query("insert into user_blocks values ($1,$2)", reverse ? [uid(viewer),uid(1)] : [uid(1),uid(viewer)]);
      await asRole(db, viewer);
      expect(await ids(db,"entry_photos")).toEqual([]);
      expect((await ids(db,"entry_groups")).filter(id => id !== 302)).toEqual([]);
      expect((await ids(db,"entry_group_slides")).filter(id => id !== 407)).toEqual([]);
    }
    await db.exec("reset role; delete from user_blocks");
    await db.query("update wine_entries set entry_privacy='private' where id=$1", [uid(100)]);
    await asRole(db,2);
    expect(await ids(db,"entry_groups")).toEqual([]);
    expect(await ids(db,"entry_group_slides")).toEqual([]);
    // A public photo override never broadens its private parent.
    expect(await ids(db,"entry_photos")).toEqual([201,202]);
    await asRole(db,1);
    expect(await ids(db,"entry_groups")).toEqual([300,301,303]);
  } finally { await db.close(); }
});

test("forged anchors, member ids, copies and foreign entry-less paths do not unlock groups or slides", async () => {
  const db = await database();
  try {
    await db.query("insert into entry_groups values ($1,$2,$3,'Forged')", [uid(304),uid(4),uid(100)]);
    await db.query("insert into entry_group_slides values ($1,$2,$3,'pairing','foreign'),($4,$2,null,'pairing',$5)",
      [uid(410),uid(300),uid(103),uid(411),`${uid(4)}/foreign.jpg`]);
    await db.query("insert into wine_entries (id,user_id,entry_privacy,root_entry_id,entry_group_id) values ($1,$2,'public',$3,$4)",
      [uid(121),uid(4),uid(103),uid(301)]);
    await asRole(db,2);
    expect(await ids(db,"entry_groups")).toEqual([300]);
    expect(await ids(db,"entry_group_slides")).toEqual([400,401,403,405]);
    await asRole(db,4);
    expect(await ids(db,"entry_groups")).toEqual([300,304]); // May manage own forged draft only.
    expect(await ids(db,"entry_group_slides")).toEqual([403,405]);
    await asRole(db,5);
    expect(await ids(db,"entry_group_slides")).not.toContain(410);
    expect(await ids(db,"entry_group_slides")).not.toContain(411);
  } finally { await db.close(); }
});

test("owners retain draft and hidden-photo writes; foreign mutations and ownership transfers fail", async () => {
  const db = await database();
  try {
    await asRole(db,1);
    await db.query("insert into entry_groups values ($1,$2,null,'New draft')",[uid(305),uid(1)]);
    await db.query("insert into entry_group_slides values ($1,$2,null,'place','pending')",[uid(412),uid(305)]);
    await db.query("update entry_group_slides set path='uploaded' where id=$1",[uid(412)]);
    expect((await db.query("update entry_photos set path='edited-private-photo' where id=$1 returning id",[uid(210)])).rows).toHaveLength(1);
    await expect(db.query("update entry_groups set user_id=$1 where id=$2",[uid(4),uid(305)])).rejects.toMatchObject({code:"42501"});
    await asRole(db,4);
    expect((await db.query("update entry_groups set title='attack' returning id")).rows).toEqual([]);
    expect((await db.query("delete from entry_group_slides returning id")).rows).toEqual([]);
    await expect(db.query("insert into entry_photos (id,entry_id,path) values ($1,$2,'attack')",[uid(214),uid(100)])).rejects.toMatchObject({code:"42501"});
    await asRole(db,1);
    expect((await db.query("delete from entry_group_slides where id=$1 returning id",[uid(412)])).rows).toHaveLength(1);
    expect((await db.query("delete from entry_groups where id=$1 returning id",[uid(305)])).rows).toHaveLength(1);
  } finally { await db.close(); }
});

test("migration rejects missing prerequisites and extra permissive policies transactionally", async () => {
  for (const scenario of ["capability","entry","photos","groups","slides"]) {
    const db = await database(false);
    try {
      if (scenario === "capability") await db.exec("alter table profiles disable trigger profiles_protect_capabilities");
      else if (scenario === "entry") await db.exec("create policy leak on wine_entries for select using (true)");
      else await db.exec(`create policy leak on ${scenario === "photos" ? "entry_photos" : scenario === "groups" ? "entry_groups" : "entry_group_slides"} for all using (true)`);
      await expect(db.exec(await readFile(photoGroupMigration,"utf8"))).rejects.toThrow(/capability protection|B02a|Unreviewed/);
      await db.exec("rollback");
      expect((await db.query("select policyname from pg_policies where tablename='entry_groups' and policyname='Authenticated users can view entry groups'")).rows).toHaveLength(1);
    } finally { await db.close(); }
  }
});

test("shared slide filter keeps order and context, denies missing groups/entries including failed lookups", () => {
  const slides = [
    {id:"allowed",group_id:"g",entry_id:"e"}, {id:"hidden",group_id:"g",entry_id:"private"},
    {id:"context",group_id:"g",entry_id:null}, {id:"unknown-group",group_id:"missing",entry_id:"e"},
  ];
  expect(filterVisibleGroupSlides(slides,new Set(["g"]),new Set(["e"])).map(s=>s.id)).toEqual(["allowed","context"]);
  expect(filterVisibleGroupSlides(slides,new Set(),new Set(["e"]))).toEqual([]);
  expect(filterVisibleGroupSlides(slides,new Set(["g"]),new Set()).map(s=>s.id)).toEqual(["context"]);
});

test("web grouped resolver never requests a signature for a hidden parent, and preserves visible/context slides", async () => {
  const requested: string[] = [];
  const rows: Record<string, object[]> = {
    entry_groups:[{id:"g",mode:"event",title:"Fixture",anchor_entry_id:"e"}],
    entry_group_slides:[
      {id:"s1",group_id:"g",entry_id:"e",photo_type:"label",path:"allowed"},
      {id:"s2",group_id:"g",entry_id:"hidden",photo_type:"label",path:"secret"},
      {id:"s3",group_id:"g",entry_id:null,photo_type:"place",path:"context"},
      {id:"s4",group_id:"missing",entry_id:"e",photo_type:"label",path:"other-secret"},
    ],
    wine_entries_with_ratings:[{id:"e",wine_name:"Visible wine"}],
  };
  const client = {
    rpc: async (_: string, {object_names}: {object_names: string[]}) => {requested.push(...object_names); return {data: object_names, error: null};},
    from(table: string) {
      const query = {select:()=>query,in:()=>query,order:()=>query,
        then:(resolve:(value:object)=>unknown)=>Promise.resolve({data:rows[table],error:null}).then(resolve)};
      return query;
    },
    storage:{from:()=>({createSignedUrls:async(paths:string[])=>{
      requested.push(...paths);return {data:paths.map(path=>({path,signedUrl:`signed:${path}`})),error:null};
    }})},
  };
  const result = await resolveGroupedPostData(client as never,[{id:"e",entry_group_id:"g"}]);
  expect(requested).toEqual(["allowed","context"]);
  expect(result.get("e")?.group_slides.map(s=>s.id)).toEqual(["s1","s3"]);
});
