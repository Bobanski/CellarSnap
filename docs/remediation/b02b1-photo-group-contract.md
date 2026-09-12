# B02b1 photo/group metadata contract — September 12, 2026

Scope: AUD-01 metadata containment, targeted AUD-19 catalog capture and AUD-48 regressions. Implementation `256a76f09fd7d22b604af8c66f59e8f53dbca22a`, based on main `a122d70`; issue #81. [Current handover](handovers/batch-02b1.md).

## Baseline and bounded scope

The fresh [live policy capture](evidence/b02b1-live-policies.json) confirms broad authenticated SELECT on `entry_groups` and `entry_group_slides`; `entry_photos` checks entry privacy but ignores `label_photo_privacy` / `place_photo_privacy`. Owner ALL policies also contribute SELECT access. B01/B02a are already deployed; retain their version mapping from the rollout handover rather than reapplying them.

Aggregate-only inspection before fixtures: 34 groups, 33 valid anchors, one null anchor, 107 slides, eight entry-less slides, zero foreign-prefix entry-less slides, zero current entry photo overrides. Valid means the anchor belongs to the group author and its `entry_group_id` references that group. Null-anchor drafts remain owner-only. These counts describe the captured environment, not a migration prerequisite or a data backfill.

Storage shares the wine bucket with avatars, collection covers, originals and copied photos. B02b1 deliberately stops at metadata and application pre-sign filtering. **Known paths, legacy image fields, owner-created foreign path references, source/copy object authority and anonymous service-role signing remain B02b2.** This is a partial P0 repair, not full image confidentiality.

## Access rules

| Surface | Non-owner authenticated read | Owner / backend |
|---|---|---|
| Entry photo metadata | Parent entry must be readable. Label/place must additionally pass the corresponding override, falling back to parent privacy when null. Other types use parent privacy. | Owner retains all own rows and mutations; backend bypass remains. |
| Group title/event metadata | Valid owned anchor must be readable. An unrelated visible member/copy or forged group ID does not unlock a hidden anchor. | Owner can manage draft, unanchored and private groups. |
| Entry-backed group slide | Group must be readable; slide entry must belong to that group and its author; entry and effective photo privacy must pass. | Group owner retains slide management. Application omits slides whose referenced entry is unavailable. |
| Entry-less context slide | Inherit the valid anchor's entry and type-specific photo privacy; path must use the group author's upload prefix. | Owner retains pre-upload/draft management. |
| Web / mobile gallery | Before signing and rendering, intersect slide references with successfully fetched groups and entries. Null-entry contexts remain eligible under group RLS. | Visible slides retain database ordering; failed/missing signatures are omitted as before. |

The existing `can_view_entry` contract continues to enforce both-direction blocks, ordinary friendship/two-hop rules, tester-authored content isolation and protected trusted-test extra visibility. Photo privacy cannot broaden a hidden parent. The change does not remove the intentional trusted-test bypass. Null overrides inherit; malformed values retain the existing conservative helper behavior for ordinary viewers.

The group writers (`src/app/api/entries/bulk-group/handler.ts` and the mobile bulk workflow) create an author-owned anchor and author-owned members, then update membership. Owner ALL policies preserve that temporary draft state. No new product privacy setting or schema field was introduced.

## Migration and regression evidence

`20260912214315_enforce_photo_and_group_metadata_privacy.sql` was created with `supabase migration new`, moved to `supabase/sql`, and appended to the manifest. It checks enabled capability protection and the B02a read-policy prerequisite, rejects unexpected SELECT/ALL policies, recreates the known owner ALL policies with the same ownership conditions, and replaces broad SELECT policies. It is transactional and replayable. Release preflight must compare the fresh catalog to the capture; allowed policy names alone are not a substitute for reviewing changed definitions.

Dependencies are acyclic: slides → groups → entries, and photos → entries. No new SECURITY DEFINER function, grant, table, Storage policy, historical script replay or data rewrite. Joins use entry/group primary keys; no performance improvement is claimed. The Supabase changelog, current Storage/RLS docs and Postgres skill were consulted. Live advisors still report the seven existing issue categories; this read-only advisory check does not validate an undeployed migration.

Eight new tests share captured live policies and synthetic fixtures. The actual SQL demonstrates the pre-fix leaks and their removal, full role matrix, private-parent precedence, both block directions, anchor privacy revocation, forged anchors/member IDs/copies/prefixes, retained owner draft/photo writes, foreign-write denial, transactional drift/prerequisite rejection and pre-sign filtering. The suite totals 189 passing tests.

The local HTTP runner adds 54 assertions through actual PostgreSQL 17.10 + PostgREST 16.3, including pooled JWT identity isolation and immediate next-request privacy revocation. Run:

```sh
node scripts/qc/postgrest-photo-group-access.mjs /tmp/cellarsnap-review-runtime
```

See the [runtime setup](handovers/merge-readiness.md#reproduce-isolated-http-checks-on-macos-arm64) if the temporary runtime is absent. The runner cannot accept a production database URL, never reads project credentials, and removes its local database. Its schema is a targeted fixture, not the full canonical production replay still owed by B05.

[Browser/Expo QC](../audits/b02b1-photo-group-qc-2026-09-12.md) verifies the application change against disposable live data. The SQL was applied only in isolated test databases. After an authorized rollout, repeat real Data API and browser/Expo checks against the migrated target before closing this slice's release gate.
