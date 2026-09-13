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
