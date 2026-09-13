# B05e grape-alias repair handover — September 13, 2026

**Released:** This historical checkpoint is superseded by the [combined release handover](b06e-b06f-b05e-release.md); implementation PRs #117/#118/#119 are merged, both migrations applied, primary production verified. Native gaps remain explicit.

## Objective and IDs
QC-14 / AUD-19 reference contract, issue #104. Repair uppercase-loss alias keys and prove normal alias search across cookie/bearer/web/mobile. Preserve canonical variety and entry references. Broader fresh-product bootstrap and OCR/scoring resolver work remain AUD-19/AUD-10.

## Resume here
Branch `fix/b05e-grape-alias-keys`, base B06f merge `4eb7df8`. Implementation, migration and scoped QC pass; PR/source merge pending. Native installation/distribution remains unavailable; Expo source must ship through the normal mobile release process.

## State and decisions
131 hosted aliases were all damaged ASCII spellings for 93 varieties. `lower` formerly ran after the uppercase-stripping regex. New keys match current lookup normalization (lowercase ASCII first, punctuation runs become a space, trim). No accent transliteration added: non-ASCII seed/repair input requires review.

One collision: `Xarel-lo` / `Xarel Lo`, same variety and resulting key. Retain canonical spelling and its original row; both input spellings still resolve. Zero alias-ID FK consumers; app lookup consumers use variety IDs. Lock, fail-closed preflight and transactional intermediate keys prevent partial or uniqueness-conflicting repair. Surviving alias IDs/timestamps and all varieties/entry joins preserved. Historical SQL/baseline unmodified. [Reviewed seed contract](../../../supabase/reference/README.md) contains all source spellings and a deterministic generator (130 distinct keys, canonical-variety prerequisite, conflicts/missing slugs reject). No seed was applied to production.

Expo manual typeahead previously searched canonical names only, reproduced as no Shiraz match after the data repair. It now uses the existing authenticated `/api/grapes` endpoint, validates the bounded response, filters selected IDs, ignores stale results and shows a retryable failure. This is required QC-14 cross-client acceptance. Automatic OCR suggested-grape selection remains a separate AUD-10/B07 contract and was not changed.

## Verification
- 385 isolated tests, 12 schema tests, web/database/mobile types and web/mobile lint pass. PostgreSQL 17.6 forward replay matches catalog, including four real badge lock cases. PGlite full 131-row repair preserves exact surviving identity/timestamps, consolidates only equivalent spelling, and repeats safely. Cross-variety, unexpected and non-ASCII failures roll back without changes. Fresh seed repeatability/ownership conflicts tested.
- Next build already passed for identical web product source in B06f. Fresh Expo web/iOS/Android exports pass after the mobile picker fix. No native simulator/emulator installed; no native runtime/binary/OTA acceptance.
- Local and production HTTP: ten query cases in cookie/bearer modes agree, including Shiraz/SHIRAZ→Syrah, PX→Pedro Ximenez, Garnacha→Grenache, Cab Sauv→Cabernet Sauvignon, both Xarel-lo spellings, apostrophe and no-match inputs. Unauthorized/invalid token and limit/fallback contracts pass (16 recorded cases each). Two-letter PX is HTTP-tested; existing UI minimum is four characters.
- Hands-on Chrome local desktop (actual CSS 1800×1250) and phone (390×844): Shiraz/Garnacha suggestions, canonical chip selection/removal and Cancel pass. Production phone fresh sign-in, native disclosure, Xarel Lo suggestion/select/remove/cancel pass. In-app browser native `<details>` activation failed, while Chrome worked locally and live; recorded as a tool/coverage observation, not a confirmed new product bug.
- Updated cookie-stripped Expo web 390×844: Shiraz→Syrah, selected chip retained through injected 503, useful error, GARNACHA recovery→Grenache, remove/cancel pass. Proxy confirms bearer requests without cookies. Initial focus changed during automated entry; refocusing the visible field exercised its intentional focus gate. No entry was saved.
- Existing Google Maps loading/legacy warnings remain QC-04. Additional Chrome warnings originate from installed extension scripts, not app source. No new captured app error or server exception; injected grape 503 was local-only. Screenshots/logs in `/tmp/cellarsnap-b05e`; sanitized release evidence will be committed with the release handover.

## Release state
Forward SQL `20260913075619_repair_grape_alias_keys.sql` applied once as hosted `20260913080026`, `repair_grape_alias_keys`. Local/hosted statement SHA-256 `a749e087d2df016efbd4095ee60057881b7b81d497cf288b2752a541595f35d9`. 130 valid keys, zero invalid. Counts and full-row fingerprints for all 93 varieties and 271 entry/grape joins unchanged. Every surviving alias row matches its recorded initial row except normalized key; exactly `Xarel Lo` removed as redundant. Hosted schema drift matches and security advisory metadata unchanged. B06e original profile and five award timestamps rechecked unchanged after browser restoration. Source merge/deployment pending; database lookup behavior is already live.

Rollback: forward repair preserving normalized keys/ownership. Do not restore broken keys or replay historical SQL. Original alias snapshot is local supporting evidence; the checked-in spellings/contract explain the only consolidation. Source rollback of the mobile picker would lose alias lookup, not reverse canonical data. Native delivery pending.

## Workspace and environment
Preserve original tsconfig, two user reports, nested worktree and design #75. Next3001 runs B06f web product source, Expo8083 serves latest B05e export, proxy3017 is normal (no fault). Dev3004 stopped. No env files modified. Browser sessions still active pending final release/cleanup; generated AGENTS/tsconfig must be restored before handoff.

## Next slice
B06g/QC-16: accessible feature/clear controls for the existing Expo badge handler. Then resume the canonical priority queue: unresolved privacy/public projection and cache-revocation contracts, deferred badge facts/history and B07 scoring. Native acceptance/distribution remains explicit across completed source slices. [Backlog](../backlog.md), [hub](../README.md).
