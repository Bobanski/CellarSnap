import { ingestWineEntryEmbeddings } from "../src/server/sommelier/ingest";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { asKnowledgeRole, embedding, knowledgeDatabase, knowledgeReadMigration, uid } from "./fixtures/knowledge-database";

test("baseline reproduces direct and general-search disclosure", async () => {
  const db = await knowledgeDatabase(false);
  try {
    await asKnowledgeRole(db, "authenticated", uid(2));
    expect((await db.query("select content from wine_knowledge_chunks where source_row_id = $1", [uid(11)])).rows).toHaveLength(1);
    await asKnowledgeRole(db, "service_role");
    expect((await db.query("select * from match_wine_knowledge($1,0,50)", [embedding])).rows).toHaveLength(5);
  } finally { await db.close(); }
});

test("owners read only their personal chunks; public entries and forged metadata do not share notes", async () => {
  const db = await knowledgeDatabase();
  try {
    for (const [user, marker] of [[uid(1), "Private marker A"], [uid(2), "Private marker B"]]) {
      await asKnowledgeRole(db, "authenticated", user);
      expect((await db.query("select content from wine_knowledge_chunks order by id")).rows)
        .toEqual([{ content: "Curated wine context" }, { content: marker }]);
      expect((await db.query("select content from match_user_entries($1,$2,0,50)", [embedding, user])).rows)
        .toEqual([{ content: marker }]);
      expect((await db.query("select * from match_user_entries($1,$2,0,50)", [embedding, user === uid(1) ? uid(2) : uid(1)])).rows).toEqual([]);
    }
  } finally { await db.close(); }
});

test("general search excludes all personal and unknown sources, including service-role requests", async () => {
  const db = await knowledgeDatabase();
  try {
    for (const role of ["authenticated", "service_role"] as const) {
      await asKnowledgeRole(db, role, uid(1));
      expect((await db.query("select content from match_wine_knowledge($1,0,50)", [embedding])).rows)
        .toEqual([{ content: "Curated wine context" }]);
      expect((await db.query("select * from match_wine_knowledge($1,1,50)", [embedding])).rows).toEqual([]);
      expect((await db.query("select * from match_wine_knowledge($1,0,-1)", [embedding])).rows).toEqual([]);
    }
    expect((await db.query("select content from match_user_entries($1,$2,0,50)", [embedding, uid(1)])).rows)
      .toEqual([{ content: "Private marker A" }]);
  } finally { await db.close(); }
});

test("anonymous access and client writes are denied, including TRUNCATE", async () => {
  const db = await knowledgeDatabase();
  try {
    await asKnowledgeRole(db, "anon");
    for (const query of ["select * from wine_knowledge_chunks", "select * from match_wine_knowledge($1)", `select * from match_user_entries($1,'${uid(1)}')`]) {
      await expect(db.query(query, query.includes("$1") ? [embedding] : [])).rejects.toMatchObject({ code: "42501" });
    }
    await asKnowledgeRole(db, "authenticated", uid(1));
    for (const query of ["delete from wine_knowledge_chunks", "update wine_knowledge_chunks set content='forged'", "truncate wine_knowledge_chunks", "insert into wine_knowledge_chunks(source_table,source_row_id,content) values ('base_profiles','fake','forged')"]) {
      await expect(db.query(query)).rejects.toMatchObject({ code: "42501" });
    }
  } finally { await db.close(); }
});

test("replay preserves curated/personal data and missing identity fails closed", async () => {
  const db = await knowledgeDatabase();
  try {
    await db.exec(await readFile(knowledgeReadMigration, "utf8"));
    expect((await db.query("select * from wine_knowledge_chunks")).rows).toHaveLength(5);
    await asKnowledgeRole(db, "authenticated");
    expect((await db.query("select * from match_user_entries($1,$2,0,50)", [embedding, uid(1)])).rows).toEqual([]);
    await db.query("select set_config('request.jwt.claim.role','service_role',false)");
    expect((await db.query("select * from match_user_entries($1,$2,0,50)", [embedding, uid(1)])).rows).toEqual([]);
  } finally { await db.close(); }
});

const lifecycleMigration = "supabase/sql/20260913003148_enforce_personal_knowledge_lifecycle.sql";
async function lifecycleDatabase() {
  const db = await knowledgeDatabase();
  await db.exec(await readFile(lifecycleMigration, "utf8"));
  return db;
}
async function publish(db: Awaited<ReturnType<typeof knowledgeDatabase>>, id = uid(11), content = "Current private note") {
  await asKnowledgeRole(db, "service_role");
  const snapshot = (await db.query<{ snapshot: unknown }>("select entry_knowledge_snapshot($1) as snapshot", [id])).rows[0].snapshot;
  const result = await db.query<{ ok: boolean }>("select publish_entry_knowledge($1,$2,$3,$4) as ok", [id, JSON.stringify(snapshot), content, embedding]);
  expect(result.rows[0].ok).toBe(true);
  return snapshot;
}

test("lifecycle separates personal data, preserves curated data and closes the legacy writer", async () => {
  const db = await lifecycleDatabase();
  try {
    expect((await db.query("select source_table from wine_knowledge_chunks order by id")).rows)
      .toEqual([{ source_table: "base_profiles" }, { source_table: "future_source" }]);
    await asKnowledgeRole(db, "service_role");
    await expect(db.query("insert into wine_knowledge_chunks(source_table,source_row_id,content) values ('wine_entries',$1,'stale')", [uid(11)]))
      .rejects.toMatchObject({ code: "23514" });
    await publish(db);
    await publish(db, uid(12), "B private note");
    await asKnowledgeRole(db, "authenticated", uid(1));
    expect((await db.query("select content from user_entry_knowledge_chunks")).rows).toEqual([{ content: "Current private note" }]);
    expect((await db.query("select content from match_user_entries($1,$2,0,50)", [embedding, uid(1)])).rows).toEqual([{ content: "Current private note" }]);
    expect((await db.query("select * from match_user_entries($1,$2,0,50)", [embedding, uid(2)])).rows).toEqual([]);
    await asKnowledgeRole(db, "service_role");
    expect((await db.query("select content from match_wine_knowledge($1,0,50)", [embedding])).rows).toEqual([{ content: "Curated wine context" }]);
  } finally { await db.close(); }
});

test("publication is service-only, canonical-owner-bound and idempotent", async () => {
  const db = await lifecycleDatabase();
  try {
    const snapshot = await publish(db);
    await publish(db, uid(11), "Replacement note");
    expect((await db.query("select count(*)::int as count from user_entry_knowledge_chunks")).rows).toEqual([{ count: 1 }]);
    const params = [uid(11), JSON.stringify(snapshot), "forged", embedding];
    for (const role of ["anon", "authenticated"] as const) {
      await asKnowledgeRole(db, role, uid(1));
      await expect(db.query("select publish_entry_knowledge($1,$2,$3,$4)", params)).rejects.toMatchObject({ code: "42501" });
      await expect(db.query("select * from get_entry_knowledge_sources()")).rejects.toMatchObject({ code: "42501" });
      await expect(db.query("select entry_knowledge_snapshot($1)", [uid(11)])).rejects.toMatchObject({ code: "42501" });
      await expect(db.query("delete from user_entry_knowledge_chunks")).rejects.toMatchObject({ code: "42501" });
    }
    await asKnowledgeRole(db, "service_role");
    await expect(db.query("update user_entry_knowledge_chunks set user_id=$1 where entry_id=$2", [uid(2), uid(11)])).rejects.toMatchObject({ code: "23503" });
  } finally { await db.close(); }
});

test("entry edit invalidates synchronously and rejects late stale generation", async () => {
  const db = await lifecycleDatabase();
  try {
    const old = await publish(db);
    await asKnowledgeRole(db, "authenticated", uid(1));
    await db.query("update wine_entries set notes='Edited notes', rating=93 where id=$1", [uid(11)]);
    expect((await db.query("select * from user_entry_knowledge_chunks")).rows).toEqual([]);
    await asKnowledgeRole(db, "service_role");
    expect((await db.query("select publish_entry_knowledge($1,$2,$3,$4) as ok", [uid(11), JSON.stringify(old), "Old notes", embedding])).rows).toEqual([{ ok: false }]);
    await publish(db, uid(11), "Edited notes");
    expect((await db.query("select metadata->>'rating' as rating from user_entry_knowledge_chunks")).rows).toEqual([{ rating: "93" }]);
    await db.query("update wine_entries set entry_privacy='public' where id=$1", [uid(11)]);
    expect((await db.query("select * from user_entry_knowledge_chunks")).rows).toEqual([]);
  } finally { await db.close(); }
});

test("grape insert, reassignment, edit, deletion and variety rename invalidate affected entries", async () => {
  const db = await lifecycleDatabase();
  try {
    await db.query("insert into grape_varieties values ($1,'Chardonnay'),($2,'Riesling')", [uid(41), uid(42)]);
    const old = await publish(db);
    await asKnowledgeRole(db, "authenticated", uid(1));
    await db.query("insert into entry_primary_grapes values ($1,$2,$3,1)", [uid(31), uid(11), uid(41)]);
    expect((await db.query("select * from user_entry_knowledge_chunks")).rows).toEqual([]);
    await asKnowledgeRole(db, "service_role");
    expect((await db.query("select publish_entry_knowledge($1,$2,$3,$4) as ok", [uid(11), JSON.stringify(old), "old", embedding])).rows).toEqual([{ ok: false }]);
    const snapshot = await publish(db) as { primary_grapes: Array<{ name: string }> };
    expect(snapshot.primary_grapes.map(g => g.name)).toEqual(["Chardonnay"]);
    await publish(db, uid(12));
    await db.query("update entry_primary_grapes set entry_id=$1 where id=$2", [uid(12), uid(31)]);
    expect((await db.query("select * from user_entry_knowledge_chunks")).rows).toEqual([]);
    await publish(db, uid(12));
    await db.query("update entry_primary_grapes set variety_id=$1 where id=$2", [uid(42), uid(31)]);
    expect((await db.query("select * from user_entry_knowledge_chunks")).rows).toEqual([]);
    await publish(db, uid(12));
    await db.exec("reset role");
    await db.query("update grape_varieties set name='New Riesling name' where id=$1", [uid(42)]);
    expect((await db.query("select * from user_entry_knowledge_chunks")).rows).toEqual([]);
    await publish(db, uid(12));
    await db.query("delete from entry_primary_grapes where id=$1", [uid(31)]);
    expect((await db.query("select * from user_entry_knowledge_chunks")).rows).toEqual([]);
  } finally { await db.close(); }
});

test("entry/account deletion cascade and stale publication cannot recreate deleted chunks", async () => {
  const db = await lifecycleDatabase();
  try {
    const old = await publish(db);
    await asKnowledgeRole(db, "authenticated", uid(1));
    await db.query("delete from wine_entries where id=$1", [uid(11)]);
    expect((await db.query("select * from user_entry_knowledge_chunks")).rows).toEqual([]);
    await asKnowledgeRole(db, "service_role");
    expect((await db.query("select publish_entry_knowledge($1,$2,$3,$4) as ok", [uid(11), JSON.stringify(old), "old", embedding])).rows).toEqual([{ ok: false }]);
    await publish(db, uid(12));
    await db.exec("reset role");
    await db.query("delete from auth.users where id=$1", [uid(2)]);
    expect((await db.query("select * from user_entry_knowledge_chunks")).rows).toEqual([]);
  } finally { await db.close(); }
});

test("keyset snapshots paginate deterministically and replay retains new personal data", async () => {
  const db = await lifecycleDatabase();
  try {
    await publish(db);
    const first = await db.query<{ entry_id: string }>("select * from get_entry_knowledge_sources(null,1)");
    expect(first.rows.map(x=>x.entry_id)).toEqual([uid(11)]);
    const next = await db.query<{ entry_id: string }>("select * from get_entry_knowledge_sources($1,1)", [first.rows[0].entry_id]);
    expect(next.rows.map(x=>x.entry_id)).toEqual([uid(12)]);
    expect((await db.query("select * from get_entry_knowledge_sources($1,1)", [next.rows[0].entry_id])).rows).toEqual([]);
    await db.exec("reset role");
    await db.exec(await readFile(lifecycleMigration, "utf8"));
    expect((await db.query("select * from user_entry_knowledge_chunks")).rows).toHaveLength(1);
    expect((await db.query("select * from wine_knowledge_chunks")).rows).toHaveLength(2);
  } finally { await db.close(); }
});

function ingestionClient(db: Awaited<ReturnType<typeof knowledgeDatabase>>) {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "get_entry_knowledge_sources") {
        return { data: (await db.query("select * from get_entry_knowledge_sources($1,$2)", [args.after_entry_id, args.batch_size])).rows, error: null };
      }
      if (name === "publish_entry_knowledge") {
        const result = await db.query<{ ok: boolean }>("select publish_entry_knowledge($1,$2,$3,$4) as ok", [args.target_entry_id, JSON.stringify(args.expected_snapshot), args.chunk_content, JSON.stringify(args.chunk_embedding)]);
        return { data: result.rows[0].ok, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  } as never;
}

test("real ingestion skips an edit during embedding, then retries current content", async () => {
  const db = await lifecycleDatabase();
  try {
    await asKnowledgeRole(db, "service_role");
    const result = await ingestWineEntryEmbeddings({
      supabase: ingestionClient(db),
      generateEmbeddings: async inputs => {
        expect(inputs[0]).toContain("Private marker A");
        await db.query("update wine_entries set notes='Fresh note after generation began' where id=$1", [uid(11)]);
        return inputs.map(() => JSON.parse(embedding));
      },
    });
    expect(result).toEqual({ sourceTable: "wine_entries", insertedCount: 1, skippedCount: 1 });
    expect((await db.query("select * from user_entry_knowledge_chunks where entry_id=$1", [uid(11)])).rows).toEqual([]);
    const retried = await ingestWineEntryEmbeddings({ supabase: ingestionClient(db), generateEmbeddings: async inputs => inputs.map(() => JSON.parse(embedding)) });
    expect(retried.insertedCount).toBe(2);
    expect((await db.query<{ content: string }>("select content from user_entry_knowledge_chunks where entry_id=$1", [uid(11)])).rows[0].content).toContain("Fresh note after generation began");
  } finally { await db.close(); }
});

test("ingestion rejects incomplete embedding responses before publication", async () => {
  const db = await lifecycleDatabase();
  try {
    await asKnowledgeRole(db, "service_role");
    await expect(ingestWineEntryEmbeddings({ supabase: ingestionClient(db), generateEmbeddings: async () => [] })).rejects.toThrow("invalid dimensions or count");
    expect((await db.query("select * from user_entry_knowledge_chunks")).rows).toEqual([]);
  } finally { await db.close(); }
});

test("ingestion keyset pages cover more than one hundred entries without duplicates", async () => {
  const db = await lifecycleDatabase();
  try {
    for (let i = 100; i < 201; i++) await db.query("insert into wine_entries(id,user_id,notes) values ($1,$2,'Paged fixture')", [uid(i),uid(1)]);
    await asKnowledgeRole(db, "service_role");
    const sizes: number[] = [];
    const result = await ingestWineEntryEmbeddings({ supabase: ingestionClient(db), generateEmbeddings: async inputs => { sizes.push(inputs.length); return inputs.map(() => JSON.parse(embedding)); } });
    expect(sizes).toEqual([100,3]);
    expect(result.insertedCount).toBe(103);
    expect((await db.query("select count(*)::int as count from user_entry_knowledge_chunks")).rows).toEqual([{ count: 103 }]);
  } finally { await db.close(); }
});
