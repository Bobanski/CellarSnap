import { defaultLoadEntriesForScoring } from "../src/server/algorithm/scoringEntries";
import { projectEntryRatingForViewer, projectPublicFeedRating } from '../src/server/entries/publicFeed';
import { expect, test } from "@playwright/test";
import { signPhotoPaths } from "../packages/shared/src/storage";
import { defaultLoadEntryForScoring } from "../src/app/api/algorithm/score/handler";

test("photo signing deduplicates, chunks, and retains failures by requested path", async () => {
  const paths = Array.from({ length: 205 }, (_, index) => `photo-${index}`);
  const batches: string[][] = [];
  const signed = await signPhotoPaths([...paths, paths[0], null, "pending"], {
    signBatch: async (batch) => {
      batches.push(batch);
      return {
        data: batch.filter((path) => path !== "photo-3").map((path) => ({
          path,
          signedUrl: `https://example.test/${path}`,
          error: path === "photo-2" ? "denied" : null,
        })),
        error: null,
      };
    },
    signOne: async () => { throw new Error("Do not retry per-item access denials"); },
  });
  expect(batches.map((batch) => batch.length)).toEqual([100, 100, 5]);
  expect(signed.size).toBe(205);
  expect(signed.get("photo-2")).toBeNull();
  expect(signed.get("photo-3")).toBeNull();
  expect(signed.get("photo-204")).toBe("https://example.test/photo-204");
});

test("photo signing falls back after a batch error and skips empty requests", async () => {
  let batches = 0;
  const signer = {
    signBatch: async () => {
      batches += 1;
      return { data: null, error: { message: "Batch unavailable" } };
    },
    signOne: async (path: string) => path === "denied" ? null : `signed:${path}`,
  };
  expect((await signPhotoPaths([null, undefined, "", "pending"], signer)).size).toBe(0);
  expect(batches).toBe(0);
  expect(await signPhotoPaths(["pending", "denied"], signer, { treatPendingAsNull: false }))
    .toEqual(new Map([["pending", "signed:pending"], ["denied", null]]));
  expect(batches).toBe(1);
});

for (const canonicalColumnsPresent of [true, false]) {
  test(`score entry loader retains wine type with canonical columns ${canonicalColumnsPresent ? "present" : "absent"}`, async () => {
    const fields: string[] = [];
    const filters: Record<string, unknown>[] = [];
    const client = {
      from(table: string) {
        if (table === "entry_primary_grapes") {
          return { select: () => ({ in: () => ({ order: async () => ({ data: [], error: null }) }) }) };
        }
        expect(table).toBe("wine_entries_with_ratings");
        return {
          select(columns: string) {
            fields.push(columns);
            const where: Record<string, unknown> = {};
            filters.push(where);
            const query = {
              eq(column: string, value: unknown) { where[column] = value; return query; },
              in: async (column: string, values: string[]) => {
                where[column] = values[0];
                if (!canonicalColumnsPresent && columns.includes("canonical_region")) {
                  return { data: null, error: { code: "42703", message: 'column "canonical_region" does not exist' } };
                }
                return {
                  data: [{
                    id: "entry", user_id: "owner", wine_type: "red", classification: "Reserve", vintage: "2020",
                    canonical_region: "Bordeaux", region: "Bordeaux",
                  }],
                  error: null,
                };
              },
            };
            return query;
          },
        };
      },
    };
    const result = await defaultLoadEntryForScoring(client as never, "owner", "entry");
    expect(fields.every((columns) => !columns.split(", ").includes("quality_tier"))).toBe(true);
    expect(filters.every((where) => where.user_id === "owner" && where.id === "entry")).toBe(true);
    expect(result).toMatchObject({
      wine_type: "red", canonical_region: "Bordeaux", quality_tier: "Reserve", vintage: 2020,
    });
    expect(fields.length).toBe(canonicalColumnsPresent ? 1 : 2);
  });
}

test('public feed payloads preserve enjoyment bands while excluding every private 1–100 score', () => {
  for (let rating = 1; rating <= 100; rating++) {
    const source = { id: 'fixture', rating, notes: 'Tasting note', qpr_level: 'good' };
    const projected = JSON.parse(JSON.stringify(projectPublicFeedRating(source)));
    expect(projected).toEqual({ ...source, rating: null, public_rating_label:
      rating >= 90 ? 'Loved it' : rating >= 75 ? 'Really liked it' : rating >= 60 ? 'Liked it' : 'Tried it' });
    expect(source.rating).toBe(rating);
  }
  expect(projectPublicFeedRating({ rating: null }).public_rating_label).toBeNull();
});

test('entry rating projection uses row ownership, preserving every owner input and public band', () => {
  for (const rating of [null, ...Array.from({ length: 100 }, (_, i) => i + 1)]) {
    const row = { id: 'fixture', user_id: 'author', rating, tasted_with_user_ids: ['viewer'] };
    const owner = JSON.parse(JSON.stringify(projectEntryRatingForViewer(row, 'author')));
    const taggedViewer = JSON.parse(JSON.stringify(projectEntryRatingForViewer(row, 'viewer')));
    expect(owner.rating).toBe(rating);
    expect(taggedViewer.rating).toBeNull();
    expect(taggedViewer.public_rating_label).toBe(owner.public_rating_label);
    expect(row.rating).toBe(rating);
  }
});

test("fifty entry score inputs use one owner-filtered entry query and one ordered grape query", async () => {
  let entryReads = 0, grapeReads = 0;
  const ids = Array.from({ length: 50 }, (_, n) => `entry-${n}`);
  const client = { from(table: string) {
    if (table === "entry_primary_grapes") return { select: () => ({ in: (_key: string, allowed: string[]) => {
      grapeReads++; expect(allowed).toEqual(ids.slice(0, 49));
      return { order: async () => ({ data: allowed.map(entry_id => ({ entry_id, position: 0, grape_varieties: { id: "grape", name: "Merlot" } })), error: null }) };
    } }) };
    expect(table).toBe("wine_entries_with_ratings");
    return { select: () => ({ eq: (key: string, owner: string) => { expect([key, owner]).toEqual(["user_id", "owner"]);
      return { in: async (_key: string, requested: string[]) => { entryReads++; expect(requested).toEqual(ids);
        return { data: ids.slice(0, 49).map(id => ({ id, user_id: "owner", wine_type: "red", vintage: "2020", classification: "Reserve" })), error: null }; } };
    } }) };
  } };
  const result = await defaultLoadEntriesForScoring(client as never, "owner", [...ids, ids[0]]);
  expect(result.size).toBe(49); expect(result.has(ids[49])).toBe(false);
  expect(result.get(ids[0])).toMatchObject({ primary_grapes: "Merlot", vintage: 2020, quality_tier: "Reserve" });
  expect([entryReads, grapeReads]).toEqual([1, 1]);
  await expect(defaultLoadEntriesForScoring(client as never, "owner", [...ids, "extra"])).rejects.toThrow("50");
  expect(await defaultLoadEntriesForScoring(client as never, "owner", [])).toEqual(new Map());
  expect([entryReads, grapeReads]).toEqual([1, 1]);
});

test("bulk score hydration does not query grapes for inaccessible rows or treat grape outages as empty grapes", async () => {
  let grapeReads = 0;
  let rows: Array<{ id: string; user_id: string; wine_type: string }> = [];
  const client = { from(table: string) {
    if (table === "entry_primary_grapes") { grapeReads++; return { select: () => ({ in: () => ({ order: async () => ({ data: null, error: { message: "grape read unavailable" } }) }) }) }; }
    return { select: () => ({ eq: () => ({ in: async () => ({ data: rows, error: null }) }) }) };
  } };
  expect(await defaultLoadEntriesForScoring(client as never, "owner", ["entry"])).toEqual(new Map());
  expect(grapeReads).toBe(0);
  rows = [{ id: "entry", user_id: "foreign", wine_type: "red" }];
  expect(await defaultLoadEntriesForScoring(client as never, "owner", ["entry"])).toEqual(new Map());
  expect(grapeReads).toBe(0);
  rows = [{ id: "entry", user_id: "owner", wine_type: "red" }];
  await expect(defaultLoadEntriesForScoring(client as never, "owner", ["entry"])).rejects.toThrow("grape read unavailable");
  expect(grapeReads).toBe(1);
});
