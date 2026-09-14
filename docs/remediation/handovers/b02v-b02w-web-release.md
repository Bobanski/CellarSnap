# B02v/B02w web privacy release — September 14, 2026

## Objective and IDs

Deploy and activate owner-only numeric ratings (QC-01) and revocable web photo access (AUD-01), preserving all existing user source data and photo bytes. The owner confirmed the product is web-only, with no launched iOS/Android population. Native testing and distribution are deferred to mobile launch. Temporary photo unavailability is acceptable; permanent loss is not.

**Current web rollout is complete. QC-01 is Closed for this product scope. AUD-01 remains P0/Partial for retained historical photo objects; AUD-22 owns source reconciliation.** This is not a universal legacy-capability revocation claim. [Canonical backlog](../backlog.md), [sanitized evidence](../evidence/b02v-b02w-web-release.json).

## Resume here

Application #158 is merged as `90e4dd29cc37551340440481813c85b04a01924e`, tree `f735bc14da592240ee462700067707a5a262ef31`, exactly matching tested `d184d33`. Primary deployment `dpl_HWksZqA8MHWzzF72x2Z1fbF4Nc6B` / GitHub deployment `6440087080` is successful for that application commit at `https://cellarsnap.app`. This release record is on `fix/privacy-web-release`, based on that merged application. Recheck Git and hosting before subsequent work; this evidence applies to the stated application tree.

No further owner input is needed to complete the deployed web protection. Next privacy work is the separate historical-media residual described below, not another numeric projection slice or native release gate.

## State and decisions

- Exact existing SQL was applied: `20260914134821_private_rating_source.sql` as hosted `20260914150233`, SHA-256 `037374f8f593c6b8046e6b5b93ced35d24b103eb54a9694effa6e25639faa64d`; `20260914135415_photo_authority_fence.sql` as hosted `20260914150255`, SHA-256 `38a0ffc7a603fb3d075a5ad470f4c45c0e41ef64b5b409d20c9d11aba526b871`. Full live catalog matched expected catalog before activation. No migration rewrite or new application fix occurred during rollout.
- Preflight: 390 entries, 272 non-null ratings, 384 personal knowledge chunks, 882 Storage objects, 650 photo reference cells. Rating and full knowledge fingerprints were unchanged after staging and before activation. No rating relation was in a logical/Realtime publication.
- Rating isolation activated at `2026-09-14T15:14:50.364Z`: all 272 values preserved in owner-only storage, raw committed numeric values zero. Full private-knowledge fingerprint unchanged by activation.
- Legacy photo signing cutoff was observed active at `2026-09-14T15:24:26.730Z`. New direct raw/transformed signing and downloads are denied; protected application delivery remains available with current authorization. All nine canonical reference fields and original siblings participate in durable fences.
- Private durable recovery backup is outside Git at `/Users/esneider/Projects/Claude-OS/backups/cellarsnap/privacy-cutover-20260914`. It contains the affected-table/reference/object snapshot and all 882 original photo files, **2,320,713,813 bytes**, size-checked and SHA-256 indexed. Directory mode 0700 and files 0600. All images decode within current renderer format/pixel/byte bounds. **Keep this backup**; it contains private data and is the recovery source for historical reconciliation.

## Photo migration and residual boundary

All **487 extant referenced base cohorts / 684 base-and-original objects** completed the audited resumable operator workflow: compare source bytes to the recovery archive, copy and verify identical bytes, transactionally swap every canonical reference, fence old keys against reuse, prove protected access to replacements, then delete old objects. Four transient retirement failures held originals and passed retries. Stable operation IDs allowed safe resumption.

All 684 old objects were prewarmed on raw/transformed capability URLs from **us-east-1 and eu-west-1**, with 2,736 successful observations after nine transient warming failures passed retries. Following retirement, all **2,736 matching denial observations** were accepted by the database; **487/487 retirement phases are `verified`**. Last observation: `2026-09-14T15:51:33.059Z`. The pilot briefly served cached bytes after deletion before subsequent denial. These observations establish the tested capabilities and regions, not a universal CDN revocation time or a way to revoke already downloaded bytes.

**Retained outside retirement:** 118 unreferenced base objects and 80 originals without a base, totaling 198 original objects. Twelve photo references were already missing: ten group slides and two ordered entry photos. Nine have a retained original sibling; three have no known stored bytes. Their source records and all remaining bytes were preserved; no automatic reconstruction or deletion was attempted. AUD-01 stays P0/Partial until any historical capabilities for retained objects are safely addressed; AUD-22 retains ownership/representation repair. Do not treat the P2 lifecycle label as downgrading the privacy residual.

Final independent integrity verification at `2026-09-14T15:52:21.849Z` downloaded **all 882 current Storage objects** and matched their sizes/SHA-256 hashes against the original archive: 684 replacements, 198 retained originals, zero failures. All 650 reference cells match the intended old-to-new mapping, all retired keys are absent, all 272 ratings and source fields across entries/photos/slides/groups/profiles/collections are preserved. Derived personal knowledge changed from 384 to 368 because source-changing photo updates synchronously invalidate stale entries under the existing knowledge contract; source notes and ratings remain unchanged and the original derived rows are backed up. Regeneration belongs to the existing knowledge lifecycle, not restoration of lost user input.

## Verification

- Prior implementation: **557 isolated / 39 schema checks**, real PostgreSQL replay/catalog/race tests, types/lint/build/exports. #158 CI run `34859819092` passed Web and Mobile; primary preview succeeded. The duplicate Vercel `cellarsnap` target remains the known OPS-01 missing-environment failure.
- Hands-on Playwright on actual production at **1440×1000 and 390×844**, with screenshots visually inspected: creation → required survey → optional comparison → detail/reload preserves owner rating 96; owner edits preserve numeric ratings, notes and grape link IDs. Bearer 1/100/null, invalid-grape atomic rollback, stale 409, foreign-tester 403 and idempotent retries pass.
- After isolation, direct REST owner and actual foreign-tester reads/embeds/filters prove raw values null and private numbers owner-only. Public sharing displays qualitative bands without numeric ratings. Tests used disposable fixtures and restored original account flags.
- Owner upload/upsert/copy/delete works after cutoff; raw/transformed signing and direct download denied, listings empty, metadata and protected display/original work. A rekeyed fixture displays at both widths; crop-save and original reopening pass. Privacy, test-author and anonymous denial checks pass. Expected `Duplicate` Storage copy 400 preserves an already-existing original and does not prevent crop completion.
- Anonymous share image and band display pass at both widths. Photo privacy returns image 404; entry privacy renders the intentional HTTP-200 “Link expired” page without wine details, denies image access, and replaces OG with generic imagery.
- Read-only actual migrated production photo checks pass at both widths: image decoded at nonzero dimensions through protected URLs and old source reference absent. Real-user screenshots remain private; repository screenshots contain disposable test fixtures only.
- Successful runs have **zero page exceptions**. The existing navigation-related owner fetch console diagnostic and aborted navigation requests are recorded separately (AUD-50). One bounded production-log error at 15:36:12Z was a 10-second Supabase connection timeout during protected-image authentication; retirement held old bytes until successful retry. Final ten-minute production error window is empty. This is not a claim that the service never had transient errors.
- Harness timing corrections were retested: await comparison-or-navigation; wait for actual avatar decode/visible opacity; wait for owner profile bootstrap rather than a five-second rating-label assertion; assert the actual expired-share UI contract. No product code change was needed. Slow owner controls are retained under AUD-39. Regional observation concurrency was reduced after hitting the pool connection limit; complete rerun passed.
- **Native coverage intentionally deferred by owner.** Responsive browser acceptance is web testing, not native acceptance. No binary/OTA release occurred.

Selected visual evidence: [phone owner rating](../evidence/b02v-web-release-create-phone.png), [desktop owner edit result](../evidence/b02v-web-release-live-owner-desktop.png), [phone crop](../evidence/b02v-web-release-live-image-owner-phone-crop.png), [anonymous phone share](../evidence/b02v-web-release-share-phone.png).

## Release state and recovery

Implementation, merge, primary deployment, both SQL migrations, both activations, referenced-photo retirement, regional evidence and final live/integrity verification are complete. This documentation branch publishes the resulting record; it changes no application behavior. Native release and historical residual reconciliation remain explicitly separate.

Do not roll back to a client that requires raw numeric columns or legacy photo signing. Preserve private rating rows, operation mappings, fences and retirement evidence. For a verified photo recovery, use the private archive and reviewed operation/reference mapping; do not blindly restore old keys or disable protections. Staging/activation did not delete source ratings or knowledge. Existing advisor warnings remain in their canonical authority/schema findings; new private deny-all tables intentionally have RLS without client policies.

## Workspace and environment

Both designated E2E operator flags were restored to their original false values; fixture cleanup restored profile state and removed disposable rows/objects/operations. Final source comparison matches the pre-rollout inventory except documented rating/path/derived changes. Temporary secret-guarded regional Edge probe `privacy-cutover-probe-20260914` was deleted; function inventory is empty. Owned Next listener on 127.0.0.1:3009 is stopped. No environment-file change remains.

Preserve the user's modified `tsconfig.json`, untracked `cellarsnap-fix-plan.md` and `cellarsnap-qa-report.md`, other worktrees and design PR #75. Private operational logs, capability URLs and credentials are under `/tmp/cellarsnap-web-cutover`; they are not committed. The durable recovery archive above must outlive temporary scratch cleanup. Sanitized evidence and synthetic screenshots are in the repository.

## Next slice

1. AUD-01/AUD-22: reconcile the 198 retained objects and twelve already-missing references. Establish canonical owners/sources or protected archival treatment, preserve every known byte, then perform a separately reviewed retirement with copy/hash/reference/access and regional evidence. Do not re-run the completed 487 cohorts or infer missing bytes can be recovered.
2. Resume AUD-13/15 atomic grouped/lifecycle commands, then the remaining B07–B15 sequence. AUD-39 bootstrap and AUD-50 diagnostics stay tracked; no unrelated implementation was added here.
3. Before any mobile launch, complete installed iOS/Android privacy and functional acceptance against the active backend. Historical native-only Partial statuses remain dated coverage records until individually reconciled, not present web blockers.

The broader backlog remains **71 findings: 8 Closed, 21 Partial, 37 Open, 2 QC passed/release pending, 2 Needs triage and 1 Not reproducible**. Finding counts are not an effort percentage; the privacy deployment above is one completed slice of the larger plan.
