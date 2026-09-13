# Remediation hub

This is the starting point for continuing the September 2026 audit. The plan preserves features and the dark Noir Refined theme while repairing correctness/privacy issues and reducing repeated work. It does not authorize feature removal or a theme replacement.

- **Work queue and current finding status:** [canonical backlog](backlog.md).
- **Latest handover and release:** [B05b/B05c merged and live-verified](handovers/b05b-b05c-release.md). [Schema/replay](handovers/batch-05b.md), [type adoption](handovers/batch-05c.md), [combined QC](../audits/b05b-b05c-qc-2026-09-13.md). Prior releases: [B04d/B05a](handovers/b04d-b05a-release.md), [B04c](handovers/b04c-release.md), [B04a/B04b](handovers/b04-release.md), [B03](handovers/b03-release.md), [B02b](handovers/sql-rollout-b02b.md), [B01/B02a](handovers/sql-rollout-b01-b02a.md).
- **Original evidence:** [50-finding audit](../audits/codebase-backend-audit-2026-09-12.md), [supporting evidence](../audits/codebase-backend-audit-2026-09-12-evidence.md).
- **Implementation/QC history:** [progress log](../audits/remediation-progress.md), [batch-one browser/mobile QC](../audits/batch-1-browser-mobile-qc-2026-09-12.md).

The backlog is the source of truth for work status. Original reports remain dated evidence. Handovers describe a particular stopping point; always recheck Git, PR, and deployment state before continuing. No existing chat, local screenshot, or untracked file is required to understand the queue.

## Where we are now

**B05b and B05c are merged and live-verified on cellarsnap.app at `c93e172` through PRs #105/#106**, issue #104. Primary Vercel `dpl_2gPei8pUJzvNFQDFXLEscxf6AxnT` is Ready. B05b establishes the reviewed public/private app schema baseline, disposable PostgreSQL 17.6/PGlite replay, permission/trigger/function drift checks and a checksum-locked historical manifest boundary. B05c adds one shared generated public Database source and a bounded typed web/mobile factory/query adoption. [Release and resume steps](handovers/b05b-b05c-release.md).

**271 checks**, database compile contracts, whole web/mobile types/lint, Next build and all Expo exports passed. Desktop/phone web grape browse/search and Expo producer browse/search were exercised visually, including a private fixture and verified cleanup. Live login/feed/grapes/search/sign-out and four HTTP checks passed. No SQL deployment. Native tooling/distribution remains unavailable; Expo web is not native acceptance.

**Next: B05d / QC-13 typed request-auth and grape-search cookie/bearer parity.** The new finding reproduces on pre-B05c production: valid native bearer-only grape requests get 401 while a control endpoint gets 200. Preserve web auth and missing-table 503s, and avoid same-host cookies masking native tests. Then continue bounded AUD-21 adoption; full managed provisioning and reviewed corpus/seed restoration remain AUD-19 work. Both findings stay Partial. No historical baseline SQL should run against production; AUD-20 fallback/native retirement prerequisites remain open. The merge permission was one-session only.

B04d dependency and B05a tooling scopes remain as documented in their [release](handovers/b04d-b05a-release.md): audits zero, no nested agent files in Metro; AUD-08 native acceptance/distribution remains Partial and AUD-49 Closed. Existing QC-05/10/12 remain B11. OPS-01 duplicate hosting, AUD-01 cache revocation and AUD-06/QC-01 public projections remain separate.

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

Each backlog ID is a repository-local ticket. AUD-01 through AUD-50 preserve the original numbering; QC-01 through QC-13 capture browser/mobile findings; OPS IDs track operational/reconciliation work. There is no dependency on creating dozens of GitHub issues. If a GitHub ticket is created, add its URL to the same finding, and put the local IDs in the PR description. The older closed issue #70 is a brand/design issue, **not** this backlog's umbrella.

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
