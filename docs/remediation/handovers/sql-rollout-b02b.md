# B02b production rollout handover — September 12, 2026

## Objective and IDs

User authorized merge/deploy of B02b1/B02b2 (AUD-01; targeted AUD-19/48 work). Both PRs, SQL migrations and primary web production release are complete. Fresh authorization passed live QC. AUD-01 stays Partial for explicitly measured hosted cache/revocation limitations; AUD-04/B03 personal knowledge isolation remains the next urgent independent slice. AUD-06/QC-01 public projection and existing mobile findings remain separate. Preserve Noir Refined and Champagne Daylight draft PR #75.

## Resume here

Start with the [canonical backlog](../backlog.md) and [production QC report](../../audits/b02b-production-rollout-qc-2026-09-12.md). Product release: #86 merge `dcfaade6884c58b020459341fe7e94dcc787c22b`, #87 merge `fd391aadb359a8227ecf1d34674b49d0b234e707`. #87 final reviewed/tested head `2b2689e` includes the hosted migration correction. Release documentation is on `codex/b02b-release-verification`, based on that merged main; discover its PR/current merge status before proceeding.

Do not reapply migrations, repeat completed cleanup, or use stale fixture IDs. Next implementation starts from fresh main after release documentation. No permission reconfirmation is needed for actions already authorized in this session.

## State and decisions

Metadata RLS validates photo overrides and owned group anchors/members. Storage reads validate actual source entries and current photo metadata, preserving legacy/reclassified/slide-only sources and independent copies. Anonymous signing uses an explicit public-only predicate, dynamic share/OG routes, and one-hour image URLs. Public facade is invoker; narrow hidden lookup is private definer with explicit JWT identity and locked search path.

Hosted Storage is managed by `supabase_storage_admin`. The first attempted Storage migration rolled back on redundant owner-only ALTER TABLE. The corrected migration checks that RLS is enabled without changing managed ownership/settings. Its new negative guard test, 196-test suite, 148 Storage HTTP assertions and final-head CI passed before release.

A real hosted SDK-cache hit survived a fixture privacy change for a previously authorized request. Fresh request and new signing denied immediately; old signed URLs also retain their issued expiry. Keep the same AUD-01 ID and history; do not claim global TTL caps or immediate byte revocation. No broad policy restoration or bulk object/session purge was performed.

## Verification

Exact product/migration versions and details are in [live QC](../../audits/b02b-production-rollout-qc-2026-09-12.md): 56 fresh live Storage/Data API assertions, five production API assertions, eight rolled-back SQL role assertions, five share/OG states. Desktop/phone browser owner/viewer galleries, anonymous privacy reloads and navigation passed. Hosted 80×50 transformation and visually inspected 1200×630 public/denied OG images passed. Browser logs and bounded production error queries were empty.

Expo web against production showed owner three-image and non-owner two-image galleries and private-entry denial. Native runtimes are unavailable; native gestures, app-store binaries/OTA and old installed clients were not verified/released. This is web fallback evidence, not native acceptance. Existing QC-01/05/06/08 remain open. Advisors are unchanged (seven categories, 44 observations).

## Release state

- Merge: #86 and #87 merged, preserving ancestry and the unrelated draft.
- Web: primary `cellar-snap` production READY on `https://cellarsnap.app`; deployment `dpl_HpTnyMR3NSMfE2vg4cRKPvMz7cML` corresponds to `fd391aa`. Duplicate `cellarsnap` still fails (OPS-01).
- SQL: B02b1 remote `20260912235835`, MD5 `7801266297ae37d277d9b287216edfcf`; corrected B02b2 remote `20260913000034`, MD5 `747807c2c8fcfc46df46934c45ed5b99`. Both match exact reviewed files. [Catalog/checksum evidence](../evidence/b02b-production-rollout.json). Older B01/B02a mapping remains in [prior rollout](sql-rollout-b01-b02a.md).
- Live verification: passed within the documented scope; cache/native/transport limits remain explicit. No persistent application data rewrite. Fixtures removed; counts and capability fingerprint restored.
- Recovery: targeted forward correction. Retain new privacy policies/RPC if reverting presentation code; never restore bucket-wide authenticated reads. Existing capability/cache lifetimes are unaffected by policy rollback.

## Workspace and environment

No release-QC services remain running. Screenshots/logs under `/tmp/cellarsnap-b02b-release-qc/` and `/tmp/cellarsnap-b02b-*` are optional; credential/session file deleted. No environment file edits. Preserve preexisting modified `tsconfig.json`, untracked `cellarsnap-fix-plan.md`, `cellarsnap-qa-report.md`, and `.claude/worktrees/agent-a251821a0b01f63dc/` (`overhaul/w2b-palate`). A stale empty Git index lock with no Git process was removed to allow the release commit; no unrelated changes were staged.

## Next slice

1. Prioritize AUD-04/B03: inventory personal knowledge ownership/retrieval, define cross-user fixtures, isolate personal embeddings while preserving curated search and lifecycle propagation. Do not combine unrelated schema cleanup.
2. AUD-01 follow-up: specify required revocation window and measure same/new JWT cached download behavior through expiry, signed URLs, transforms, old clients and available native runtime; implement only evidence-backed changes. Fresh RLS/signing rollout is complete.
3. AUD-06/QC-01: explicit public identity/rating DTO parity is still separate.
4. Preserve OPS-01 and existing mobile/UI findings; do not call this release complete remediation of the 60-record backlog.
