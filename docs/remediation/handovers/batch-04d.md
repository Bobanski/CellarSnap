# B04d handover — September 13, 2026 UTC

> Historical implementation checkpoint. B04d is now merged as `3527208`; current release state and next steps are in the [combined B04d/B05a release handover](b04d-b05a-release.md).

## Objective and IDs
AUD-08 decoder and Xcode tooling compatibility repair, issue #97 / [PR #100](https://github.com/Bobanski/CellarSnap/pull/100). Both remaining advisory roots repaired in repository code. AUD-08 remains Partial for native acceptance and distributing rebuilt clients. New QC-12 and additional QC-10 evidence stay B11.

## Resume here
Product `bd40acd` on `codex/b04d-mobile-dependency-contracts`, based on main `05d9e7b`. [QC report](../../audits/b04d-mobile-dependency-qc-2026-09-13.md) records actual results and initial failures/retests. Check final PR CI and primary preview before merging. This session has explicit one-session merge authorization; it does not carry to later sessions.

## State and decisions
Retain SDK 56. Patched decoder 0.5.0 is packaged locally with a callable CommonJS export and a literal replacement fix for long-input regex limits; provenance/license and reversible source-hash test are committed. Direct local dependency plus npm override is required for correct linking. Scoped xcode → uuid 11.1.1 passes actual PBX consumer tests. Retire both compatibility measures when upstream parents adopt compatible repaired dependencies. Root/mobile full npm audit zero; local-source correctness depends on the explicit tests/review, not the audit count.

## Verification
263 checks passed (256 isolated plus 7 mobile dependency contracts); web/mobile type/lint, Next build, Expo web/iOS/Android Hermes export, SDK 56 disposable iOS prebuild. GitHub run `34736183698` both jobs passed on product head; primary preview passed, duplicate hosting failure remains OPS-01. Interactive Next and Expo desktop/phone login/feed/navigation/sign-out and malformed Expo callback passed within stated scope. Existing blank Expo photos reproduced on previous B04c export as QC-12; recovery overflow under QC-10. One unclassified Expo console Event; no captured Next browser/server errors. See report for precise limitations.

## Release state
At this checkpoint: code/QC complete; final PR merge/deployment verification pending. No migration, account changes, native binary/OTA, or actual native acceptance. Local audit remediation is not distribution to installed users. Reverting this slice restores vulnerable dependencies and removes its tests; no data/SQL rollback.

## Workspace and environment
Preserved modified `tsconfig.json`, untracked personal plans/reports, existing nested `.claude` worktree and draft PR #75. No environment-file changes. Local Next 3001 and Expo proxy 8083 remain available for next slice; both browser sessions signed out. Evidence `/tmp/cellarsnap-b04d/`; no persisted data mutations. Temporary iOS output is outside the repo.

## Next slice
B05a: finish AUD-49 Metro and scan/watch boundaries with actual file-map exclusion and normal shared-source refresh checks. Do not silently absorb full AUD-19/21 schema/type baseline or B11 UI fixes. Continue handover/status updates at that checkpoint. Broader B05 reviewed schema replay/type contract follows; AUD-01 cache revocation and AUD-06 public projection stay separate.
