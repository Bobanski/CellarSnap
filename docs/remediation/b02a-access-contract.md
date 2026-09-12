# B02a entry access contract — September 12, 2026

Scope: AUD-01 entry-row containment, targeted AUD-19 baseline, and AUD-48 regression coverage. Implementation: `50f9fc6d6ac9288f2cc0a5cdc4bfd7d314466afd`, branch `codex/b02a-entry-privacy`, based on B01 `37f183d`. [Issue #81](https://github.com/Bobanski/CellarSnap/issues/81). This document captures the pre-deployment contract. The migration is now deployed; see the [SQL rollout handover](handovers/sql-rollout-b01-b02a.md) for current status.

## Live baseline

Read-only catalog capture from `rbmkypbqavmnuycznssv` on September 12, before implementation:

- [Affected policies](evidence/b02a-live-policies.json): entries, entry photos, groups/slides, profiles and Storage. These are definitions, not user rows.
- [Entry access functions](../../e2e/fixtures/entry-access-functions.sql): exact deployed definitions of `are_friends`, `is_user_blocked`, `is_test_account`, `can_view_test_authored_content`, `can_view_entry_standard`, and the text overload of `can_view_entry`. This file is an isolated-test fixture, **not a migration to replay in production**.
- `wine_entries`, `entry_photos`, `entry_groups`, and `entry_group_slides` all have RLS enabled. Entry SELECT still includes `Authenticated users can view wine entries` with only `auth.role() = 'authenticated'`, alongside owner SELECT. INSERT/UPDATE/DELETE are owner-only; UPDATE has an implicit check inherited from USING.
- `wine_entries.entry_privacy` is nullable **text** live; historical 004 used an enum. Aggregate-only inspection found 257 public, 66 friends, 61 private, zero null or other values. No private entry contents were exported to establish this finding.
- Anon/authenticated/service_role each hold SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on the affected public tables and storage.objects. B02a preserves grants and owner mutation policies; it repairs SELECT policy behavior.
- Entry photos use parent-entry visibility, but do not enforce photo-specific privacy. Groups/slides still have broad authenticated SELECT plus owner ALL. Wine Storage SELECT still allows every authenticated viewer; separate own-prefix policies also exist. `can_view_wine_photo` is absent live.
- No noninternal profile trigger was returned. The two PUBLIC public-assets write policies remain. AUD-02/03's B01 migration is still not deployed.

Re-capture with these read-only queries (run separately where the SQL connector returns only one result set):

```sql
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in
  ('wine_entries','entry_photos','entry_groups','entry_group_slides','profiles'))
  or schemaname = 'storage'
order by schemaname, tablename, policyname;

select p.proname, pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid), p.proacl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in
  ('are_friends','is_user_blocked','is_test_account','can_view_test_authored_content',
   'can_view_entry_standard','can_view_entry','can_view_wine_photo')
order by p.proname;

select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where grantee in ('anon','authenticated','service_role','PUBLIC')
  and ((table_schema='public' and table_name in
    ('wine_entries','entry_photos','entry_groups','entry_group_slides','profiles'))
    or (table_schema='storage' and table_name='objects'));

select tgname, pg_get_triggerdef(oid)
from pg_trigger where tgrelid='public.profiles'::regclass and not tgisinternal;
```

## Entry-row matrix

This preserves the **existing** application and deployed helper contract, including trusted internal testers' read bypass. It does not turn the test flag into an ordinary user setting. The B01 guard is a mandatory rollout prerequisite.

| Viewer relative to an ordinary owner | Public | Friends | Friends of friends | Private |
|---|---|---|---|---|
| Owner | Allow | Allow | Allow | Allow |
| Accepted friend | Allow | Allow | Allow | Deny |
| Accepted two-hop friend | Allow | Deny | Allow | Deny |
| Stranger or pending request | Allow | Deny | Deny | Deny |
| Blocked in either direction | Deny | Deny | Deny | Deny |
| Trusted test viewer, unblocked | Allow | Allow | Allow | Allow |
| Anonymous / missing identity | Deny | Deny | Deny | Deny |

Test-authored rows remain invisible to ordinary non-owner viewers regardless of privacy or friendship. Their owner and unblocked trusted test viewers retain access. Service-role administration retains bypass-RLS access.

An original and a shared copy each use their own owner/privacy. Owning a copy, being tagged, or sharing a group does not grant access to a private original/sibling. Owner ratings retain their 1–100 scale. **Row visibility is not column privacy**: numeric ratings on otherwise visible rows remain available through current projections; AUD-06/QC-01 must address those payloads separately.

The database helper denies malformed/null privacy for ordinary non-owner viewers. Current app normalization treats missing/unrecognized values as public. B02a keeps the database's conservative behavior; no current live rows have those values. Do not claim parity for malformed historical inputs; reconcile normalization with AUD-18/19 before introducing nullable data.

## Migration and tests

`supabase/sql/20260912200417_enforce_entry_read_privacy.sql` was generated with the installed Supabase CLI's `migration new`, moved into the repository's canonical `supabase/sql` directory, and appended to the manifest. It:

1. Requires the enabled B01 profile-capability trigger, including its expected function reference.
2. Refuses unreviewed SELECT/ALL policy drift so another permissive policy cannot silently bypass the repair.
3. Replaces the known broad/owner SELECT policies with an authenticated SELECT using `can_view_entry(auth.uid(), user_id, entry_privacy::text)`.
4. Preserves owner mutations, existing grants, helper definitions, schema/data, and internal tester behavior. Transactional failure leaves the prior catalog intact.

`e2e/entry-access-policy.spec.ts` uses real PGlite PostgreSQL roles/RLS and captured helper definitions, with synthetic profiles, relationship graphs, blocks, entries and photo metadata. It first reproduces the broad-policy leak locally, then runs the actual B01 and B02a migration files. Eight tests cover the matrix (56 application/database comparisons), both block directions including testers, anonymous/missing identity, backend reads, shared copies/tags/groups, parent-photo metadata, ratings/owner mutations, foreign-write denial, capability escalation/revocation, malformed privacy, migration replay and prerequisite/drift rejection. No live fixture mutations are performed by these tests.

## Remaining photo/group access work — B02b

Entry-row filtering alone does **not** close AUD-01. Build the next fixtures around this target contract before writing the Storage migration:

| Surface | Required allow/deny evidence |
|---|---|
| Legacy label/place paths | Parent entry visibility **and** effective photo-specific privacy; owner can manage their own uploads. |
| Ordered entry_photos | Resolve actual stored path/type; don't guess privacy from filenames. Apply parent and photo privacy consistently to metadata, signing and delivery. |
| Shared-copy photo references | Retain legitimate copied-photo access under the original source's permission contract; a forged root/path must not unlock a private source. Establish explicit intended behavior when source privacy changes. |
| Group slides | Group visibility must not unlock private member entries/photos; include entry-less slides and mixed-privacy groups. |
| Storage signing/read | Known path alone never grants another viewer access. Test direct download, signing, batched signing, owner pre-entry uploads and upsert/delete workflows. |
| Public shares / API projections | Preserve intended anonymous share pages through their explicit server projection; do not add anonymous table reads. Verify no raw private ratings or hidden photo URLs leak. |

No replacement Storage function or group policy was deployed or implemented in this slice. Photo-specific and grouped tests remain outstanding, not implied by the parent-photo metadata test.

## Supabase review

Checked the current changelog, [RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access documentation](https://supabase.com/docs/guides/storage/security/access-control), and [new-table grant change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically). B02a creates no new table and preserves existing grants. The live security advisor still reports the public_profiles definer view (AUD-06), mutable search paths (AUD-04/19), and exposed definer helpers (AUD-05/19), plus existing extension/auth warnings. These are not new effects of the undeployed migration. See the [advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view); do not mechanically switch public_profiles to invoker and break legitimate profile reads.
