import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { canUserViewEntry } from "../src/lib/access/entryVisibility";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = uid(1);
const friend = uid(2);
const distantFriend = uid(3);
const stranger = uid(4);
const tester = uid(5);
const otherTester = uid(6);
const pending = uid(7);
const entryId = (n: number) => uid(100 + n);
const migrationPath = "supabase/sql/20260912200417_enforce_entry_read_privacy.sql";
const capabilityPath = "supabase/sql/20260912185640_protect_profile_capabilities_and_public_assets.sql";
const privacies = ["public", "friends", "friends_of_friends", "private"] as const;

async function asRole(db: PGlite, user: string | null, role = "authenticated") {
  // Only fixed test roles are passed here; user identities are bound parameters.
  await db.exec(`reset role; set role ${role};`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]);
  await db.query("select set_config('request.jwt.claim.role', $1, false)", [role]);
}

async function migrate(db: PGlite) {
  await db.exec("reset role");
  await db.exec(await readFile(migrationPath, "utf8"));
}

async function database({ protectedCapabilities = true, migrated = true } = {}) {
  const db = new PGlite();
  await db.exec(await readFile("e2e/fixtures/entry-access-schema.sql", "utf8"));
  await db.exec(await readFile("e2e/fixtures/entry-access-functions.sql", "utf8"));
  await db.exec(await readFile("e2e/fixtures/entry-access-seed.sql", "utf8"));
  if (protectedCapabilities) await db.exec(await readFile(capabilityPath, "utf8"));
  if (migrated) await migrate(db);
  return db;
}

async function visibleIds(db: PGlite) {
  return (await db.query<{ id: string }>("select id from wine_entries order by id")).rows.map(r => r.id);
}

test("captured broad policy leaks private rows before the real migration; replay is idempotent", async () => {
  const db = await database({ migrated: false });
  try {
    await asRole(db, stranger);
    expect(await visibleIds(db)).toContain(entryId(3));
    expect(await visibleIds(db)).toContain(entryId(13));
    await migrate(db);
    await migrate(db);
    await asRole(db, stranger);
    expect(await visibleIds(db)).toEqual([entryId(0)]);
  } finally { await db.close(); }
});

test("database and application agree on owner, friend, two-hop, pending, stranger and trusted tester access", async () => {
  const db = await database();
  try {
    const cases = [
      { viewer: owner, allowed: [0, 1, 2, 3], friends: [friend], fof: [distantFriend] },
      { viewer: friend, allowed: [0, 1, 2], friends: [owner, distantFriend], fof: [] },
      { viewer: distantFriend, allowed: [0, 2], friends: [friend], fof: [owner] },
      { viewer: stranger, allowed: [0], friends: [], fof: [] },
      { viewer: pending, allowed: [0], friends: [], fof: [] },
      { viewer: tester, allowed: [0, 1, 2, 3, 10, 11, 12, 13], friends: [], fof: [] },
      { viewer: otherTester, allowed: [0, 1, 2, 3, 10, 11, 12, 13], friends: [], fof: [] },
    ];
    for (const c of cases) {
      await asRole(db, c.viewer);
      expect(await visibleIds(db), `viewer ${c.viewer}`).toEqual(c.allowed.map(entryId));
      for (const target of [owner, tester]) {
        for (const [i, privacy] of privacies.entries()) {
          const visible = c.allowed.includes((target === tester ? 10 : 0) + i);
          const appVisible = await canUserViewEntry({
            supabase: {} as never, viewerUserId: c.viewer, ownerUserId: target,
            entryPrivacy: privacy, acceptedFriendIds: new Set(c.friends),
            friendsOfFriendsIds: new Set(c.fof), blockedUserIds: new Set(),
            viewerIsTestAccount: [tester, otherTester].includes(c.viewer),
            ownerIsTestAccount: target === tester,
          });
          expect(appVisible, `${c.viewer} / ${target} / ${privacy}`).toBe(visible);
        }
      }
    }
  } finally { await db.close(); }
});

test("blocks in either direction override friendship and the trusted tester bypass", async () => {
  const db = await database();
  try {
    for (const viewer of [friend, tester]) {
      for (const [blocker, blocked] of [[owner, viewer], [viewer, owner]]) {
        await db.exec("reset role; delete from user_blocks");
        await db.query("insert into user_blocks values ($1,$2)", [blocker, blocked]);
        await asRole(db, viewer);
        expect((await visibleIds(db)).filter(id => [0, 1, 2, 3].map(entryId).includes(id))).toEqual([]);
        expect(await canUserViewEntry({
          supabase: {} as never, viewerUserId: viewer, ownerUserId: owner,
          entryPrivacy: "public", acceptedFriendIds: new Set([owner]),
          blockedUserIds: new Set([owner]), viewerIsTestAccount: viewer === tester,
          ownerIsTestAccount: false,
        })).toBe(false);
      }
    }
  } finally { await db.close(); }
});

test("anonymous and missing-identity requests see no rows; service-role reads remain available", async () => {
  const db = await database();
  try {
    await asRole(db, null, "anon");
    expect(await visibleIds(db)).toEqual([]);
    await asRole(db, null);
    expect(await visibleIds(db)).toEqual([]);
    await asRole(db, null, "service_role");
    expect(await visibleIds(db)).toHaveLength(8);
  } finally { await db.close(); }
});

test("shared copies, tags and group membership do not unlock a private original or sibling", async () => {
  const db = await database();
  try {
    await db.query("update wine_entries set entry_group_id=$1, tasted_with_user_ids=array[$2::uuid] where user_id=$3",
      [uid(300), stranger, owner]);
    await db.query("insert into wine_entries (id,user_id,entry_privacy,root_entry_id,entry_group_id,rating) values ($1,$2,'private',$3,$4,81)",
      [entryId(20), stranger, entryId(3), uid(300)]);
    await asRole(db, stranger);
    expect(await visibleIds(db)).toEqual([entryId(0), entryId(20)]);
    expect((await db.query("select rating from wine_entries where id=$1", [entryId(20)])).rows)
      .toEqual([{ rating: 81 }]);
    expect((await db.query("select path from entry_photos order by path")).rows)
      .toEqual([{ path: "synthetic/photo-0.jpg" }]);
    await asRole(db, owner);
    expect(await visibleIds(db)).not.toContain(entryId(20));
  } finally { await db.close(); }
});

test("owners retain private ratings and entry mutations; viewers and testers cannot change others' rows", async () => {
  const db = await database();
  try {
    await asRole(db, owner);
    expect((await db.query("select rating,notes from wine_entries where id=$1", [entryId(3)])).rows)
      .toEqual([{ rating: 92, notes: "Synthetic tasting" }]);
    await db.query("insert into wine_entries (id,user_id,entry_privacy,rating) values ($1,$2,'private',100)", [entryId(30), owner]);
    expect((await db.query("update wine_entries set rating=1 where id=$1 returning rating", [entryId(30)])).rows)
      .toEqual([{ rating: 1 }]);
    await expect(db.query("update wine_entries set user_id=$1 where id=$2", [stranger, entryId(30)]))
      .rejects.toMatchObject({ code: "42501" });
    expect((await db.query("delete from wine_entries where id=$1 returning id", [entryId(30)])).rows).toHaveLength(1);
    for (const viewer of [stranger, tester]) {
      await asRole(db, viewer);
      expect((await db.query("update wine_entries set rating=1 where user_id=$1 returning id", [owner])).rows).toEqual([]);
      expect((await db.query("delete from wine_entries where user_id=$1 returning id", [owner])).rows).toEqual([]);
      await expect(db.query("insert into wine_entries (id,user_id) values ($1,$2)", [entryId(31), owner]))
        .rejects.toMatchObject({ code: "42501" });
      await expect(db.query("update profiles set is_test_account=not is_test_account where id=$1", [viewer]))
        .rejects.toMatchObject({ code: "42501" });
    }
  } finally { await db.close(); }
});

test("malformed or null privacy fails closed for ordinary viewers without hiding the owner's row", async () => {
  const db = await database();
  try {
    await db.query("insert into wine_entries (id,user_id,entry_privacy) values ($1,$3,null),($2,$3,'unexpected')",
      [entryId(40), entryId(41), owner]);
    await asRole(db, stranger);
    expect(await visibleIds(db)).toEqual([entryId(0)]);
    await asRole(db, owner);
    expect(await visibleIds(db)).toEqual([0, 1, 2, 3, 40, 41].map(entryId));
  } finally { await db.close(); }
});

test("migration refuses an unprotected capability or unreviewed permissive read policy atomically", async () => {
  for (const scenario of ["missing", "disabled", "extra-policy"] as const) {
    const db = await database({ protectedCapabilities: scenario !== "missing", migrated: false });
    try {
      if (scenario === "disabled") await db.exec("alter table profiles disable trigger profiles_protect_capabilities");
      if (scenario === "extra-policy") await db.exec('create policy "Unexpected read" on wine_entries for select using (true)');
      await expect(migrate(db)).rejects.toThrow(scenario === "extra-policy" ? /Unreviewed/ : /capability protection/);
      await db.exec("rollback");
      // The failed rollout must leave the existing catalog untouched.
      expect((await db.query("select policyname from pg_policies where tablename='wine_entries' and policyname='Authenticated users can view wine entries'")).rows)
        .toHaveLength(1);
    } finally { await db.close(); }
  }
});
