# B06b / B06c / B06d release handover — September 13, 2026

## Objective and IDs

Three bounded slices under [issue #112](https://github.com/Bobanski/CellarSnap/issues/112) are merged and web/server live-verified: **B06b/AUD-09** badge triggers and award writes ([#113](https://github.com/Bobanski/CellarSnap/pull/113)), **B06c/QC-03** shared owner summary ([#114](https://github.com/Bobanski/CellarSnap/pull/114)), **B06d/QC-08** selected event-photo navigation ([#115](https://github.com/Bobanski/CellarSnap/pull/115)). These findings remain Partial for explicitly deferred badge/native scope; #112 stays open. No theme or feature removal. Separate design draft #75 is preserved.

## Resume here

Start from current main and the [canonical backlog](../backlog.md). Latest product merge is **`b51ae782bfd941afeb8c954d58927b9f58965263`**. This release documentation branch, `codex/b06b-b06d-release`, starts there; a later docs-only merge can redeploy the same product source.

**Next bounded slice:** AUD-09 featured-profile authority. Its API checks earned badges, but direct editable profile fields can still display an unearned badge. Inspect both single/array featured fields and compatibility clients, define an earned-only database mutation contract, preserve existing legitimate features and historical awards, and test direct Data API denial plus web/mobile editing. Keep this separate from the 32 deferred trigger definitions, which need reviewed rating/sensory/social/manual facts and semantic decisions; do not invent thresholds. [Badge contract and deferred inventory](../b06-badge-contract.md).

B05e/QC-14 remains a separate forward-only alias repair with collision/normalization review; never replay old SQL. B07 scoring, AUD-35 statistics, AUD-39 session ownership, privacy findings and OPS-01 hosting remain independently queued. QC-03 still needs a working browser summary-outage harness as well as native acceptance. See the ordered next steps below.

## State and decisions

| Slice | Reviewed head | Merge / time UTC |
|---|---|---|
| B06b #113 | `640338eef47fc7cc8095235c756fdf42be8f9339` | `f06fd7f1c6b0029464f454ba0309772a227e041c`, 06:48:08 |
| B06c #114 | `626ee6057414f52587ac1a486887094257d06cec` | `a75cb89e6860f727c79327170f6a7b21f5dac526`, 06:49:05 |
| B06d #115 | `a4f20ebca2db88a0c0febb03338a5be006192f94` | `b51ae782bfd941afeb8c954d58927b9f58965263`, 06:53:23 |

- Badges load authenticated owner's stored consumed-entry facts and canonical primary grapes once with keyset pagination. Exhaustive trigger decisions support **53/85 definitions** and explicitly defer 32; all definitions and historical awards remain. Exact normalized matches do not infer regional hierarchies or synonym semantics. Submitted eligibility/owner hints are ignored. Checked admin upserts return only actual newly inserted awards, avoiding concurrent duplicate toasts. `challenge-winner` and `cellar-master` remain deferred because their stored count specs conflict with their descriptions.
- Typed admin factory added while preserving an explicit legacy compatibility bridge. One forward migration removes direct client award writes while retaining authenticated reads and service-role writes. The reviewed schema contract accounts for that delta without rewriting the historical baseline.
- Shared own-summary counts all consumed tasting rows, normalized countries with canonical preference/raw fallback, distinct accepted friends in either direction, incoming pending requests and known owner badges. Short API page caps cannot truncate counts; failure rejects instead of fabricated zero. Cookie/bearer endpoint is own-only/no-store. Web menu/palate/profile and mobile menu/profile/Library consume it. Broader top/average statistics remain separate.
- Event gallery selection is keyed by stable authorized slide ID. Visible image, caption and details target agree; removed/restricted slides fall back within the remaining authorized set. Context explicitly has no wine-detail action; zero-photo events retain representative-entry navigation. Mobile supports swipe plus labeled 44px wrapping photo controls. The final slice also isolates summary failure from profile identity loading.

## Verification

[Full QC report](../../audits/b06b-b06d-qc-2026-09-13.md), [sanitized evidence](../evidence/b06b-b06d-release.json), and implementation checkpoints [B06b](batch-06b.md), [B06c](batch-06c.md), [B06d](batch-06d.md).

**385 isolated checks**, five schema/source checks, database compile contracts, web/mobile types/lint, Next build and Expo web/iOS/Android Hermes exports passed. All three GitHub web/mobile CI runs passed; primary previews succeeded. The duplicate target again failed missing Supabase environment variables (OPS-01); no bypass/reconfiguration.

Hands-on local Next desktop/phone and cookie-stripped Expo web exercised badge/category/detail, complete menu/profile/Library totals and A/B/context event navigation. Reordered mixed-privacy fixtures passed, with separate authenticated owner/other-account API checks. Production fresh login, badge detail/filter, count parity, desktop/phone event selection and matching detail, context behavior and explicit sign-out passed. Production cookie/bearer summaries agree; unauthorized requests deny. Direct award writes deny after SQL, while concurrent legitimate server evaluations award exactly once and preserve historical timestamps. Zero captured affected-tab warnings/errors and zero records in a bounded error-level final-deployment query; these are scoped observations.

Native iOS/Android simulators/emulators are unavailable. Expo web/export success is not native runtime or distribution acceptance; no native binary/OTA was deployed. The failed local summary-outage proxy experiment did not hydrate Next, so browser error-state acceptance is unverified. Existing session/bootstrap/loading and Expo UI findings remain separate.

## Release state

- **Merge:** #113/#114/#115 merged, exact commits above; affected product/schema/test source matches final reviewed head.
- **Web deployment:** primary **`dpl_2mmNXsfTW4ztLghCRgmVDoUuCiJ7`** Ready, URL `https://cellar-snap-ivfglhy88-eitan-sneiders-projects.vercel.app`, aliased to cellarsnap.app. GitHub deployment **6418650956** binds it to `b51ae78`, success **06:53:56 UTC**.
- **SQL:** `supabase/sql/20260913061822_server_authoritative_badge_awards.sql` applied once as hosted version **20260913064845**, name `server_authoritative_badge_awards`. Local/remote statement SHA-256 **`535ab04b29381ed7af478d0a54610e6be4cd9a3bc3257a0251ee271089444846`**. Existing authenticated SELECT policy and service grants retained; authenticated SELECT is the only client table privilege; client insert policy removed. Do not replay/reapply to reconcile timestamp differences.
- **Live verification:** completed for scoped web/server behavior above. Security advisory names/counts/metadata unchanged; existing public projection/function/auth advisories remain, not a clean bill of health.
- **Data cleanup:** exact recorded disposable fixtures removed: 15 private badge tastings and only three QC awards; two event entries, one group, three slides, two entry-photo rows and three Storage objects. Original five badge rows/timestamps remain identical; own-summary returns baseline 71 entries/two countries/two friends/five badges. No existing relationships/profile/reference rows intentionally changed; ordinary reads may maintain derived caches.
- **Rollback:** prefer a forward source fix. Source rollback must preserve the backend award writer and server-only privileges; do not reopen client inserts to make an old writer work. Counts/navigation source can be reverted independently if needed. Historical award correctness was deliberately not reclassified. No baseline replay and no native rollout rollback required.

## Workspace and environment

Preserved original modified `tsconfig.json`, untracked `cellarsnap-fix-plan.md` / `cellarsnap-qa-report.md`, and nested `.claude` worktree. Existing port 3002 untouched. Session-owned Next 3001, Expo proxy 8083 and unsuccessful fault proxy 3017 stopped; generated AGENTS changes/original tsconfig restored byte-for-byte. No environment files changed; Expo API origin/cookie stripping were process-only. Browser QC sessions signed out, agent tab closed and viewport reset. Optional screenshots/logs/builds remain under `/tmp/cellarsnap-b06b` and `/tmp/cellarsnap-b06d`; exact fixture manifests remained local, with no credentials committed.

## Next slice

1. B06e/AUD-09 featured-profile earned-award authority, preserving all supported client contracts; separate follow-up decisions for the 32 deferred definitions and historical award correctness. Keep #112 open.
2. QC-03 browser outage visual test with a working harness; QC-03/QC-08 native runtime and supported binary/OTA acceptance. Native date/dependency scope (#109/AUD-08) remains pending too.
3. B05e/QC-14 collision-reviewed forward alias repair plus correct fresh-seed contract; broader AUD-19/21 stays under #104. Keep aliases separate from badge work.
4. Follow the hub queue for remaining privacy, scoring and lifecycle work; retain OPS-01 and the separate design #75. Merge/close authority was explicitly one-session only and is not standing permission for a future session.
