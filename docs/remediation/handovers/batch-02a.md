# Batch 02a handover — September 12, 2026

## Objective and IDs

Implemented the bounded entry-row portion of AUD-01, pulled forward the affected-policy/function baseline from AUD-19, and expanded AUD-48 regression tests. Photo Storage, group metadata/slides, photo-specific privacy, public identity/rating projection (AUD-06/QC-01) remain deferred B02 slices. AUD-02/03 remain B01 release work. No findings are closed.

## Resume here

1. Check Git, [PR #80](https://github.com/Bobanski/CellarSnap/pull/80), and B02a draft [PR #82](https://github.com/Bobanski/CellarSnap/pull/82) ([issue #81](https://github.com/Bobanski/CellarSnap/issues/81)). Implementation is `50f9fc6d6ac9288f2cc0a5cdc4bfd7d314466afd` on `codex/b02a-entry-privacy`, stacked on B01 `37f183deaa5011ddcafe043ed15c223172f9f7cf`. Main was still `778e43c` during this session.
2. Read [the access contract](../b02a-access-contract.md), its captured policies and function fixture, and [QC report](../../audits/b02a-browser-database-qc-2026-09-12.md). Do not replay historical SQL against production.
3. Complete B01 review/release coordination and provision a disposable integration target before claiming B02a end-to-end QC. The B02a migration requires the enabled B01 capability trigger and rejects unreviewed read-policy drift. Retarget/rebase the stacked PR after B01 merges; keep the migration order.
4. B02b should tackle Storage/photo/group access with explicit source/copy ownership and mixed-privacy fixtures. See the matrix and remaining acceptance in the access contract. Public identity/ratings can be B02c; AUD-04 personal knowledge isolation is the next urgent batch afterward.

## State and decisions

- Preserve Noir Refined and separate Champagne Daylight PR #75.
- The deployed helper/application explicitly gives unblocked trusted testers read access beyond ordinary privacy. B02a preserves this; B01 must protect the flag before rollout. Existing flags are not modified/backfilled.
- Shared copies retain their own owner/privacy. Tags, root IDs and groups do not unlock private original/sibling rows. Private owner ratings stay 1–100. This does not solve column-level rating exposure on visible entries.
- Actual live entry_privacy is nullable text, unlike the old enum migration. All 384 live rows currently have recognized non-null values. The selected policy explicitly calls the text helper; malformed/null input remains database-denied for ordinary non-owners. Application normalization of such values still differs (AUD-18/19).
- The migration is `supabase/sql/20260912200417_enforce_entry_read_privacy.sql`, appended after B01 in the manifest. No helper or write-policy replacements, schema/data rewrites, product UI changes, or dependencies were added.

## Verification

At implementation `50f9fc6`: 181 unit/route/PGlite tests passed (eight new tests including 56 app/database comparisons), web lint and TypeScript passed. `git diff --check` passed. The captured pre-fix policy demonstrably leaks synthetic private rows; executing the actual migration closes that local role-based reproduction. Reapplying the migration is safe; missing/disabled capability guards and unexpected SELECT policies abort transactionally.

Browser baseline: in-app desktop 1365×900, actual 390×844 phone layout, and Chrome editor/disclosure/Cancel/logout/protected redirect. Owner private fixture, Library search, rating retention and disabled Share passed. Chrome's requested 390px viewport actually measured 487px, so exact phone evidence is the in-app screenshot. Read-only owner Data API and bearer API passed; anonymous table/API denial passed. Known QC-02/03/04 remain. See the QC report for the in-app disclosure limitation and browser-extension warnings.

**Integration remains pending:** browsers/HTTP used the unchanged live database. PGlite acceptance is not PostgREST/Storage integration or live verification. No Docker, iOS simulator or Android runtime was installed; no Expo/native run this slice. No production build was repeated for SQL/test-only changes.

## Release state

- B01 PR #80 is still open/draft: web/mobile CI and primary `Vercel – cellar-snap` passed at `37f183d`; duplicate `Vercel – cellarsnap` failed (OPS-01).
- B02a code is committed and pushed on its dependent branch in draft PR #82 (base `codex/audit-remediation`); inspect its exact checks separately.
- Merge: neither B01 nor B02a merged in this session. Code deployment: no production deployment performed. Migration deployment: neither B01 nor B02a applied live. Live verification of the fixes: not done.
- Read-only live catalog still shows all three P0 exposures AUD-01/02/03. AUD-04 also remains open.
- Next release gate: reviewed integration results on B01→B02a SQL, then normal merge/deploy workflow and explicit target approval where needed. After rollout, capture live policies, verify ordinary/test/admin role behavior and real API/Storage paths before closing any finding.
- Recovery: transactional migration errors leave prior policies intact. After a successful rollout, prefer a targeted forward correction if a legitimate path regresses; do not blindly restore the all-authenticated SELECT leak. No row data was changed by this migration.

## Workspace and environment

Preserve existing modified `tsconfig.json` formatting, untracked `cellarsnap-fix-plan.md`, `cellarsnap-qa-report.md`, and `.claude/worktrees/agent-a251821a0b01f63dc/` (`overhaul/w2b-palate`, `64f7392`). None was staged. Root remains the main checkout; the new branch intentionally carries the B01 dependency, not an independent main-based repair.

Next port 3001 was started for QC and stopped. No environment file edits or saved test-data mutations. Temporary browser sessions were signed out/reloaded to Login, viewport overrides reset. Screenshots live in the QC report's local directory; canonical catalog/contract/test evidence is checked in and does not depend on screenshots or this chat surviving.

## Next slice

Complete the integration/release prerequisites above, then B02b:

1. Capture current Storage/group definitions again and enumerate supported legacy, ordered-photo, shared-copy and entry-less group slide paths from writers/readers.
2. Add disposable role fixtures for parent-plus-photo privacy, both block directions, trusted testers, source privacy changes, forged paths/root IDs, and owner upload/upsert/delete.
3. Implement a small forward migration plus any required signing/projection adjustment. Avoid replaying absent historical functions without reconciling today's text columns and path formats.
4. Verify actual Data API, Storage download/signing and affected browser/Expo flows against the migrated target; use native runtimes if available. Update [backlog](../backlog.md) and [hub](../README.md), then publish the next handover.
