# Remediation hub

- **Latest handover / iOS launch push:** [B11d–B11f / B04e](handovers/b11d-b11f-ios-launch.md), [sanitized evidence](evidence/b11d-b11f-ios-launch.json), [submission gates](ios-launch-readiness.md). #167 repairs six mobile issues and prepares build 3; browser/Expo QC passes. Apple production signing/2FA, installed-native acceptance and release remain pending. Queue **76 / 15 Closed**. Prior #164 release closures reconciled; #165 historical archive remains separate/open.

- **Latest handover / larger release candidate:** [B02x/B07b/B09a](handovers/b02x-b07b-b09a.md), [sanitized evidence](evidence/b02x-b07b-b09a-qc.json). #164 source `f504e4e`: seeded scoring/refresh correctness, bounded batch reads and score retry pass local QC; historical photo preservation/reconciliation verified read-only. Merge, production deployment and live acceptance pending.

- **Previous release / five closures:** [B11a–B11c / B01 verification](handovers/b11a-b11c-release.md), [sanitized evidence](evidence/b11a-b11c-release.json). #161 merged `83454a1`, primary live; AUD-17/AUD-27/QC-11/QC-18/QC-19 Closed. 13 Closed / 72 total, including newly recorded QC-20 (Open/P2).

- **Previous web release:** [B02v/B02w](handovers/b02v-b02w-web-release.md), [sanitized evidence](evidence/b02v-b02w-web-release.json). #158 merged, primary and SQL live, both cutoffs active, all 487 referenced photo cohorts retired/verified and all 882 files preserved. QC-01 Closed for current web scope; AUD-01 remains Partial for retained historical media. Native acceptance is deferred to mobile launch by owner.

This is the starting point for continuing the September 2026 audit. The plan preserves features and the dark Noir Refined theme while repairing correctness/privacy issues and reducing repeated work. It does not authorize feature removal or a theme replacement.

- **Historical implementation checkpoint (since released):** [B02v/B02w privacy cutoff](handovers/b02v-b02w-privacy-cutover.md), [runbook](b02v-b02w-cutover.md), [local QC](evidence/b02v-b02w-qc.json). Rating isolation, durable photo fences/retirement and native 1.0.1/build 2 candidates implemented. No hosted SQL/cutoff or installed-native acceptance; QC-01/AUD-01 remain Partial.
- **Previous release:** [B02t/B02u](handovers/b02t-b02u-release.md), [sanitized evidence](evidence/b02t-b02u-release.json). #155/#156 merged; owner atomic edit API/mobile adoption and focus-loss fix final-primary verified. Physical/direct/native privacy remains Partial.
- **Previous release:** [B02r/B02s](handovers/b02r-b02s-release.md), [sanitized evidence](evidence/b02r-b02s-release.json). #152/#153 merged; owner-library API and mobile Library/Events adoption live-verified. Physical/direct/native rating privacy remains Partial.
- **Previous release:** [B02o/B02p/B02q](handovers/b02o-b02p-b02q-release.md), [sanitized evidence](evidence/b02o-b02p-b02q-release.json). #148/#149/#150 merged; rating inventory, Home circle containment and required projected mobile detail live-verified. Physical/direct/native rating privacy remains Partial.
- **Previous release:** [B02m/B02n/B05f](handovers/b02m-b02n-b05f-release.md), [sanitized evidence](evidence/b02m-b02n-b05f-release.json). #144/#145/#146 merged; owner-aware detail/profile ratings and projected bearer/mobile feed live-verified. AUD-49 Git-index cleanup closed; physical rating privacy/native rollout remain Partial.
- **Previous release:** [B02l](handovers/b02l-release.md), [operator contract](b02l-photo-rekey-operator.md), [sanitized release QC](evidence/b02l-release.json). #142 merged; private copy/hash/reference-swap machinery live and fixture-verified. No production retirement or native cutoff.
- **Previous release and resume point:** [B02i/B02j/B02k](handovers/b02i-b02j-b02k-release.md), [sanitized QC](evidence/b02i-b02j-b02k-release.json). #138/#139/#140 merged; adopted metadata signing removed, canonical photo inventory available, web feed ratings projected. SQL and primary application live-verified; broader privacy/native rollout remains explicit.
- **Photo inventory:** [B02j](handovers/batch-02j.md), [sanitized counts](evidence/b02j-inventory.json); review twelve missing references before any rekey/retirement.
- **Previous release:** [B02g/B02h/B08c](handovers/b02g-b02h-b08c-release.md), [sanitized QC](evidence/b02g-b02h-b08c-release.json). #134/#135/#136 merged; bearer/mobile source adopted, legacy revocation measured, ordinary web atomic edits and SQL released. Native distribution and broader privacy/lifecycle residuals remain explicit.
- **Legacy-photo migration contract:** [B02h](b02h-photo-revocation-contract.md); synthetic measurement is complete, production rekey/client cutoff remains P0/Partial.
- **Previous release:** [B02e/B02f/B08b](handovers/b02e-b02f-b08b-release.md), [QC](evidence/b02e-b02f-b08b-release.json).
- **Work queue and current finding status:** [canonical backlog](backlog.md).
- **Previous release:** [B02c2/B02d/B08a](handovers/b02c2-b02d-b08a-release.md), [sanitized QC](evidence/b02c2-b02d-b08a-release.json).
- **Previous release:** [B02c1/B06g/B07a/B06h](handovers/b02c1-b06g-b07a-b06h-release.md), [QC](evidence/b02c1-b06g-b07a-b06h-qc.json).
- **Previous release:** [B06e/B06f/B05e](handovers/b06e-b06f-b05e-release.md), [sanitized evidence](evidence/b06e-b06f-b05e-release.json).
- **Previous completed release:** [B06b/B06c/B06d](handovers/b06b-b06d-release.md), [combined QC](../audits/b06b-b06d-qc-2026-09-13.md), [badge contract](b06-badge-contract.md).
- **Prior releases:** [B05d/B06a](handovers/b05d-b06a-release.md), [B05b/B05c](handovers/b05b-b05c-release.md), [B04d/B05a](handovers/b04d-b05a-release.md), [B04c](handovers/b04c-release.md), [B04a/B04b](handovers/b04-release.md), [B03](handovers/b03-release.md), [B02b](handovers/sql-rollout-b02b.md), [B01/B02a](handovers/sql-rollout-b01-b02a.md).
- **Original evidence:** [50-finding audit](../audits/codebase-backend-audit-2026-09-12.md), [supporting evidence](../audits/codebase-backend-audit-2026-09-12-evidence.md).
- **Implementation/QC history:** [progress log](../audits/remediation-progress.md), [batch-one browser/mobile QC](../audits/batch-1-browser-mobile-qc-2026-09-12.md).

The backlog is the source of truth for work status. Original reports remain dated evidence. Handovers describe a particular stopping point; always recheck Git, PR, and deployment state before continuing. No existing chat, local screenshot, or untracked file is required to understand the queue.

## Where we are now

**iOS is now an explicit launch target.** #167 implements notes auth/retry, Apple nonce exchange, nested-header/viewport/photo repairs, scan contrast and a matching SDK56 prebuild template. 582 isolated tests and desktop/phone Expo flows pass; native unavailable. EAS production build was blocked before upload by missing credentials and Apple 2FA. No App Store submission. [Current handover](handovers/b11d-b11f-ios-launch.md). The previous web-only native deferral does not certify this launch. #164 is already live (`421f244`), AUD-11/28 Closed; #165 archive code/SQL remain unmerged/unhosted.

**B02x/B07b/B09a is ready for release review in #164, source `f504e4e`.** Scores after refresh now use the same palate seeds as on-demand/list scoring and preserve canonical location/vintage. Batch hydration uses two queries for up to 50 owned entries, preserves mixed-item results and deduplicates cache writes; scoring outages offer an accurate alert and keyboard retry. 568 isolated / 41 schema-tool checks, web lint/types/build and desktop/phone production-build browser QC pass. Historical reconciliation verified all 882 backup files and all 198 retained live objects without Storage mutation. No new finding closures: AUD-11/28 are QC passed/release pending; AUD-01 remains P0/Partial, AUD-22 remains Open. [Current handover](handovers/b02x-b07b-b09a.md).

**B11a–B11c and B01 release verification are complete at application `83454a1` (#161).** Five findings closed: Explore grape statistics, all-hit/terminal scoring batches, empty scans, editor input labels and phone profile wrapping. 562 isolated tests and web/mobile CI pass; final-primary desktop/phone browser and cookie-stripped Expo web scan/retry acceptance passed. Fixtures removed and temporary profile names restored. QC-20 separately records a pre-existing mobile notes-authentication failure; it remains Open. Current totals: **13 Closed, 21 Partial, 35 Open, 2 Needs triage, 1 Not reproducible (72)**. Native runtimes are unavailable and launch acceptance remains deferred by owner. [Current handover](handovers/b11a-b11c-release.md).

**B02v/B02w web rollout is complete at application commit `90e4dd2` (#158).** Both exact migrations are live and activated. All 272 private ratings, 650 photo reference cells and source records are preserved. All 487 extant referenced photo cohorts / 684 old objects have verified retirement evidence from Virginia and Ireland; all 882 current files match the private backup byte for byte. Desktop/phone web creation, editing, photos/cropping, avatar and anonymous-share privacy pass. QC-01 is Closed for the current web-only product. AUD-01 remains P0/Partial for 198 retained historical objects; AUD-22 owns their source reconciliation and twelve pre-existing missing references. Native testing/distribution is deferred to future mobile launch by owner. [Current handover](handovers/b02v-b02w-web-release.md).

The following paragraphs preserve dated release history; their former pending gates are superseded by the current handover.

**B02t/B02u #155/#156 merged `59cf8d5`, exactly matching tested `62a7de4` tree. Bearer owner edit API and mobile normal/grouped/bulk-review adoption live-verified, including atomic grapes, lost-response retry, conflicts and the corrected focus-loss navigation bug. 557 isolated/30 schema checks, types/lint/exports/CI/primary builds pass. No SQL/native distribution; QC-01 physical/direct/native and broader AUD-13/15 remain Partial. [Release/resume](handovers/b02t-b02u-release.md).**

**B02r/B02s are merged through #152/#153, product main `05f912d`, exact tested tree `db3225f`.** Owner Library/Events now use a validated bearer API with owner scores, projected grouped bands, required metadata and stable chronology/ID pagination. Actual desktop/phone Expo/browser controls/photos/events/failure/retry/session checks and web counterparts pass on final primary. **509 isolated / 30 schema checks**, types/lint/exports, primary builds and CI pass. No SQL/native distribution. [Release/resume](handovers/b02r-b02s-release.md).

Final production has zero page exceptions; only five intentional 400s and three injected 503s. Separate web photo/rating run has zero page/HTTP failures and one recurring owner fetch console diagnostic (AUD-50); bounded primary error logs zero. Exact fixture cleanup leaves zero session entries/groups/photos, 882 objects and four testers. Session servers stopped, user files preserved. QC-01 physical/direct/native and AUD-01 rollout/retirement remain Partial. AUD-35 progressive search/averages and broader QC-06 remain open; the new retry control is 44px and tested. One-session merge permission expires at handoff.

**B02o/B02p/B02q are merged through #148/#149/#150, product main `c8717ce`, exact tested tree `1561bbf`.** The consumer inventory and physical-isolation gates are documented. Home circle transport now uses public bands with null ratings; mobile Home and detail require validated projected bearer responses, with no raw entry fallback. Owner numbers/editing and crop/grapes/social interactions remain intact. **466 isolated / 30 schema checks**, web/mobile types/lint, all-platform exports, primary Vercel builds and CI pass. Final-primary desktop/phone Expo Home/detail and web detail/profile acceptance passed. No SQL or native release. [Release/resume](handovers/b02o-b02p-b02q-release.md).

Final live web profile/detail has zero page/console/HTTP failures. Home has two injected 503s; detail has three deliberate access-denial 404s and one injected 503; no page exceptions. Atomic normal/bulk failure/retry/conflict/grape regressions passed against the hosted command. Independent cleanup shows zero session entries/groups/comments, 882 photo objects and four testers; servers stopped and user files preserved. QC-01 remains Partial for physical/direct/native access; AUD-01 P0 photo cutoff/retirement remains deferred. This session's merge permission expires at handoff.

**B02m/B02n/B05f are merged through #144/#145/#146, product main `81a98e3`, exact tested tree.** Detail/profile/tagged responses keep numeric ratings only for the entry owner; web/mobile profile bands are preserved. Mobile feed now uses the projected bearer API with per-slide bands/notes/QPR, opaque pagination and stale-response rejection. Final-primary desktop/phone web and Expo-browser acceptance passed. **429 isolated / 30 schema / 3 tooling checks**, web/mobile types/lint/build/exports and all CI pass. No SQL change. [Release/resume](handovers/b02m-b02n-b05f-release.md).

**Previous B05f release — AUD-49 Closed:** six historical worktree metadata entries removed from the index only; real local paths/file bytes and nested checkout preserved. Fresh baseline reproduces exit 128, candidate and actual web/mobile CI checkout cleanup pass. QC-01 remains Partial for physical storage/privileges, direct Data API/mobile detail/other consumers and installed-native adoption. Final live web feed/profile have zero page/console/HTTP failures; Expo records only one injected feed 503 and seven photo 404s during deliberate test-author denial. Native unavailable; known QC-05/QC-12 remain B11. Zero fixtures/comments/groups remain, Storage is back to 882 objects, tester count four; session servers stopped. This session's merge/close permission expires at handoff.

**B02l is merged through #142, product main `33424d4`, with private SQL live and primary production verified.** Resumable entry-photo copy/hash/reference-CAS machinery passes 412 isolated / 30 schema tests, actual PostgreSQL races and desktop/phone web/Expo-browser photo/crop checks. Inventory anomalies were triaged without historical repair/deletion. Successful swaps stop at pending_revocation; native adoption, legacy-signing cutoff, late-write fencing, avatars/external consumers and retirement remain P0/Partial. [Latest release](handovers/b02l-release.md).

**B02i/B02j/B02k are merged through #138/#139/#140, product main `c7dcfd2`.** Adopted server photo payloads authorize existing objects without minting Storage signatures; the additive invoker RPC is live and full-catalog verified. Read-only inventory tooling covers all nine canonical path fields and original siblings. Web feed JSON now transports qualitative bands with `rating: null`, preserving owner inputs elsewhere. [Release and resume steps](handovers/b02i-b02j-b02k-release.md).

**412 isolated checks, 21 schema tests**, actual PostgreSQL 17.6 replay/catalog/races and inventory CLI, types/lint/build and CI passed. Actual desktop/phone web and unchanged Expo browser photo compatibility plus final-primary feed interaction/visual checks passed. Final live feed had zero page/console/HTTP failures; deliberate photo faults and the recurring cookie/owner fetch diagnostic remain documented. Native runtimes/distribution are unavailable; fixtures and original state were restored. Inventory found 12 referenced keys without objects and 118 unreferenced non-original objects requiring review; no production rekey/deletion occurred.

**Next:** P0 AUD-01 retained historical photo capability retirement, coordinated with AUD-22 source reconciliation; preserve the verified backup and avoid deleting uncertain media. The current referenced web photo cutoff and QC-01 physical rating isolation are complete. Then continue AUD-13/15 atomic group/lifecycle commands and the remaining B07–B15 work. Native-only acceptance is a future launch obligation, not a current web blocker; historical Partial rows retain their original coverage details until individually reconciled. AUD-39 loading and AUD-50 diagnostics remain explicit. [Canonical backlog](backlog.md).

B04d dependency and B05a tooling scopes remain as documented in their [release](handovers/b04d-b05a-release.md): audits zero, no nested agent files in Metro; AUD-08 native acceptance/distribution remains Partial; AUD-49 watcher scope is retained and its Git-index residual is now closed by B05f. Existing QC-05/10/12 remain B11. OPS-01 duplicate hosting, AUD-01 cache revocation and AUD-06/QC-01 public projections remain separate.

B04a/AUD-05 and B04b/AUD-07 remain Closed for their stated scopes. PRs #94/#95 and release-doc PR #96 are merged; their [release handover](handovers/b04-release.md) retains SQL/checksums and live acceptance. B04c introduced no migration.

Prior released work remains documented: [B03 personal knowledge isolation](handovers/b03-release.md) closed AUD-04 while leaving broader AUD-26 retention/jobs open; [B02b metadata/Storage/share privacy](handovers/sql-rollout-b02b.md) preserves the AUD-01 revocation limitation; [B01/B02a](handovers/sql-rollout-b01-b02a.md) closed AUD-02/03. Do not replay their SQL to reconcile local/hosted timestamps. Exact versions and checksums live in those handovers.

The stack was originally reviewed against consolidated main `778e43c` from [PR #79](https://github.com/Bobanski/CellarSnap/pull/79); its implementation merge is `c22a45c`. Preserve the separate Champagne Daylight draft [PR #75](https://github.com/Bobanski/CellarSnap/pull/75), as explicitly chosen by the owner. Release coordination need not block independent investigation; keep branch dependencies and tested versions explicit.

## Priority and batch plan

P0 means an urgent privacy/authority exposure; P1 means material correctness, security, or loading defects; P2 means important performance/maintainability/UX work; P3 means evidence-based cleanup. Severity and execution order are separate: some P1 refactors depend on proven schema/lifecycle contracts. A newly confirmed exposure or regression can move ahead of this sequence; record the reason and affected dependencies in the backlog.

These are bounded planning groups, not a promise that each fits one session or one PR. Before implementation, select a small coherent slice and name it B02a, B02b, etc. Stop at a reviewable, tested boundary; write a handover after one or two slices, or sooner if context runs low. Do not attempt all work in a large group without checkpoints.

| Batch | Scope / finding IDs | Dependencies and exit evidence |
|---|---|---|
| B01 — initial repairs | AUD-02/03/10/17/27/33/44/48/49, partially | Existing PR #80; preserve 173-test baseline and browser/Expo results. Record merge, code deployment, and SQL deployment separately. Remaining work stays on its original ID. |
| B02 — entry and public-data privacy | AUD-01/02/03/06, QC-01 | Capture the affected live grants/policies first (targeted AUD-19 work). Define owner/friend/block/test/photo/shared-copy access matrix. Verify direct Data API, Storage, API and web/mobile surfaces; retain legitimate sharing and private ratings. Split policy and public-projection work if needed. |
| B03 — personal knowledge isolation | AUD-04; lifecycle portion of AUD-26 | Establish owner/entry references and search boundaries; test cross-user retrieval and update/delete propagation without losing curated knowledge. Do not wait for broad cleanup to contain exposure. |
| B04 — authentication, remote input, vulnerable dependencies | AUD-05/07/08; OPS-01 | Use separate small slices for contact-resolution, bounded URL fetches, and compatible dependency updates. Test login/recovery, redirects/body limits, scanning, and available mobile builds. Recheck advisories at implementation time. |
| B05 — schema and tooling contracts | AUD-19/21/49; contract portion of AUD-20 | Reconcile a reviewed schema baseline and replay on a disposable database; generate one database type source; record supported schema/mobile versions. Finish nested-worktree watcher boundaries. No replay of old scripts against production. |
| B06 — visible correctness and badges | AUD-09, QC-02/03 | Exhaustive badge trigger/authority tests, timezone-safe date-only display, and agreed count definitions across surfaces. Test browser/native counterpart with seeded fixtures. |
| B07 — one scoring contract | remaining AUD-10, AUD-11/12/29/30 | Use reviewed schema/types. Prove seeded/unseeded single/batch/refresh parity, cold/warm explanation parity and versioned materialized/reference reuse before removing duplicate paths. Resolve ai_notes_summary contract deliberately. |
| B08 — reliable entry mutations | AUD-13/14/15/16/18/22 | Atomic/idempotent cellar and multi-table commands, stable row IDs, supported import field types, partial-update schemas and explicit data ownership. Test retries/concurrency and web/mobile outcomes. Leave larger UI extraction for B13. |
| B09 — bounded reads and batches | remaining AUD-33, AUD-28/34/35; preserve AUD-27 | Bulk authorized entry/grape/photo hydration, complete search/totals, stable cursors. Record before/after request/query counts and payload bytes on representative fixtures; preserve ordering and per-item failures. |
| B10 — derived work off read/save paths | AUD-26/31/32/41 | Depends on lifecycle/scoring ownership. Bounded backfill/refresh/generation jobs with leases, retries and observable outcomes. Verify immediate save/read behavior and stale-data fallback. |
| B11 — client loading and mobile polish | AUD-36/37/38/39, QC-04/05/06 | One notification/session state owner, real lazy boundaries, existing fonts, private image delivery, Maps warnings, Expo routing and accessible controls. Measure representative startup/network behavior and test desktop/phone/native when available. |
| B12 — import pipeline consolidation | AUD-40; preserve AUD-16 | Normalize both formats, batch reference lookups, preserve custom types and distinct tastings, verify partial failures/retries. Depends on B08 contracts. |
| B13 — shared workflow/code consolidation | AUD-42/43/44/45/47 | Extract stable controllers, domain schemas, auth/error adapters and tokens after behavior contracts exist. Preserve native I/O, drafts, surveys, galleries, social shells and static marketing deployment. One feature at a time. |
| B14 — measured database tuning | AUD-23/24/25 | Access semantics and schema baseline first; representative query plans and role tests before/after. Preserve constraints and low-frequency operational indexes. A proven urgent index fix may be pulled forward. |
| B15 — retire verified baggage | retirement portion of AUD-20, AUD-46 | Minimum supported versions documented; fallback telemetry and dynamic/external-consumer checks justify each deletion. Run relevant regression and browser flows after deletion. No source-line target at the expense of features. |
| Every batch — regression and observability | AUD-48/50, OPS-02 intake | Add meaningful parity/contract tests where needed, instrument the path being changed, update docs and record new findings. Never defer all observability or regression work to a final cleanup batch. |

For remaining B02 work, start with policy/access fixtures, not a broad code deletion. B05's affected-schema/type work can be pulled forward when necessary for a security repair; record the split so the rest of AUD-19/21 stays visible. Fast, independent correctness fixes can also be pulled forward, but do not let P2/P3 polish displace unresolved P0 containment.

## Finding intake and local tickets

Each backlog ID is a repository-local ticket. AUD-01 through AUD-50 preserve the original numbering; QC-01 through QC-20 capture browser/mobile findings; OPS IDs track operational/reconciliation work. There is no dependency on creating dozens of GitHub issues. If a GitHub ticket is created, add its URL to the same finding, and put the local IDs in the PR description. The older closed issue #70 is a brand/design issue, **not** this backlog's umbrella.

When a session finds something new:

1. Search the backlog and original reports for the root cause. Reuse/reopen an ID for a recurrence; link a related ID rather than duplicating the same repair.
2. Allocate the next unused ID in the relevant series. Never renumber or reuse closed IDs. Uncertain findings enter **Needs triage**, not “confirmed.”
3. Add a backlog row immediately, plus a detail block using the template below. Include a sanitized reproduction and source/commit so a new session can act without chat history.
4. Assign priority, batch, dependencies and an owner/PR when known. Re-triage confirmed security/data-loss/regression findings immediately; otherwise keep the active slice scoped.
5. After implementation/QC, update the same record and link the handover, PR, migration and verification evidence. Keep deferred work explicit.

```markdown
### QC-07 — Short concrete problem title
- Priority / status: P2 / Needs triage
- Discovered: YYYY-MM-DD; branch and exact commit; browser/device/environment
- Source / reproduction: file:line or report section; minimal steps; synthetic fixture
- Expected / actual: user-visible behavior and observed result
- Impact / confidence: who is affected; confirmed or hypothesis; limits
- Related IDs / dependencies: none or IDs; duplicate/supersedes link if applicable
- Target batch / owner / GitHub issue / PR: Bxx / unassigned / none / none
- Acceptance: observable behavior plus appropriate automated/browser/mobile checks
- Deployment / rollback: affected components, migration/data effects, safe recovery
- Verification / residual work: evidence, dates, remaining coverage or blockers
```

Keep credentials, tokens, raw personal data, and full environment files out of repository tickets. Describe test fixtures or link sanitized evidence. Local-only evidence must have a textual reproduction in the repo.

## Status and completion rules

- **Open:** confirmed, not implemented. **Needs triage:** unverified or historical claim requiring reproduction.
- **In progress:** named slice/owner/branch; say what is actually being changed.
- **Partial:** some acceptance criteria met; remaining scope and target batch must be stated.
- **Implemented — QC pending:** code exists; validation incomplete.
- **QC passed — release pending:** relevant checks passed, but merge/deployment or live verification remains.
- **Blocked:** name the external prerequisite and the exact next action; missing a native runtime blocks native coverage, not all independent work.
- **Closed:** all stated acceptance criteria met in the intended environment, with linked evidence and applicable merge/deployment/live checks recorded. A migration in Git alone never qualifies.
- **Superseded / not reproducible:** retain the ID, reason, successor/evidence, and environment tested. Do not delete the record.

A partial finding can have completed substeps without being closed. Production remediation is separate from code verification. AUD-48/50 are ongoing program obligations; a batch passing tests does not close all future parity/observability work.

## Batch and fresh-session handovers

At the start: read this hub, the latest handover and relevant backlog rows; inspect Git/worktrees and open PR state; establish exact scope and fixtures. Review applicable skills before code/schema changes. Preserve existing local edits.

Before stopping: commit/push the authorized work to its branch, preserve unrelated changes, update the backlog, and write `handovers/batch-XX[-slice].md`. If work is incomplete, record the precise stopping point; a handover does not require pretending the batch passed. Update the **Latest handover** link and **Where we are now** section above. Do not open a new user task unless requested.

Use this template:

```markdown
# Batch XX handover — YYYY-MM-DD
## Objective and IDs
Scope completed, explicitly deferred and newly discovered IDs.
## Resume here
Next concrete action, required prerequisites, branch/commit/PR and base.
## State and decisions
Architecture/product decisions; user constraints; paths that matter.
## Verification
Exact tested commit and checks; pass/fail evidence; browser/device flows;
native coverage versus web fallback; untested behaviors and known risks.
## Release state
Merge/code deployment/migration/live verification, each explicit;
data changes, rollback/recovery notes and remaining release steps.
## Workspace and environment
Local changes/worktrees to preserve; running services/ports; temporary
config restored or still needed; evidence locations without secrets.
## Next slice
Ordered, actionable steps and acceptance criteria; blockers/owner;
backlog and hub links updated.
```

Browser QC is required for affected web flows, including visual desktop/phone checks and runtime errors. Use installed native simulators/emulators when relevant, and state unavailable coverage accurately. Automated tests complement these checks. Compare measurements using equivalent fixtures/build conditions; fewer source lines or a single dev-server timing is not proof of faster loading.
