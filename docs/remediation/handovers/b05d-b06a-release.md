# B05d / B06a release handover — September 13, 2026

## Objective and IDs
Two bounded slices completed: **B05d / QC-13 and AUD-21** typed request-auth/grape parity ([PR #108](https://github.com/Bobanski/CellarSnap/pull/108), issue #104), then **B06a / QC-02** shared tasting calendar dates ([PR #110](https://github.com/Bobanski/CellarSnap/pull/110), issue #109). Both PRs merged and web is live-verified at `d4e5cd2`. QC-13 is Closed for the server repair; QC-02 is Partial for native acceptance/distribution. New QC-14 records an existing seed normalization defect.

## Resume here
Start from current main and the [canonical backlog](../backlog.md). Latest product merge is `d4e5cd21970c520b73cb2b0c7c0ff76810b71e39`. This release documentation is published from `codex/b05d-b06a-release` based on that merge; a later docs-only merge can redeploy the same product tree.

**Next B06b / AUD-09:** choose a bounded badge trigger/authority slice, inspect current evaluator/query/DB contracts, test legitimate and denied awards against designated fixtures, and perform browser/available-native QC. Then take **QC-03** count semantics and **QC-08** selected event-slide detail navigation as separate slices. QC-14/B05e needs a reviewed forward-only seed/data repair; do not silently add it to badge work. AUD-19 full managed bootstrap/corpus restoration and broader AUD-21 typed feature adoption stay Partial; keep #104 open. #109 tracks remaining native date-source delivery/acceptance. Unresolved privacy findings are unchanged.

## State and decisions
- **B05d:** reviewed head `e7241610e8042a9ecba47907f799c10fd6872170`; merged `719ad1d221865e2ecc166dcf4aa6676823420981` at 06:00:47 UTC. `requireTypedRequestAuth` returns typed cookie/bearer clients via one shared resolver; legacy callers retain an explicit compatibility bridge, precedence and fallback flags. Grapes use this typed auth path and preserve ranking/DTOs/missing-table 503s. Omitted limit now correctly means eight. [Implementation checkpoint](batch-05d.md).
- **B06a:** reviewed head `863fab8186f0b4d2caff9a85d86122fe04dcd888`; merged `d4e5cd21970c520b73cb2b0c7c0ff76810b71e39` at 06:03:16 UTC. Shared calendar-day formatter used by Library, web date helper and mobile entry list/detail. UTC formatting prevents viewer-zone shifts; invalid dates retain original text; legacy ISO values preserve their written calendar prefix. Activity/comment timestamps are not converted. [Implementation checkpoint](batch-06a.md).
- **QC-14:** old seed SQL strips uppercase letters before lowercasing. Hosted keys such as `abernet auvignon` confirm it; ordinary Shiraz search lacks its intended alias hit. The successful alias-only auth control uses an actually stored key and does not certify seed correctness. Next repair must review collisions, normalization/accent policy and preserve IDs/joins. No old SQL was edited/replayed and no hosted alias data changed.
- Preserve Noir features and separate Champagne Daylight draft #75. AUD-01 cache revocation, AUD-06/QC-01 public projections, OPS-01 duplicate hosting and native acceptance remain distinct. The owner's merge/close permission was explicitly for this session only, not standing permission.

## Verification
[Full QC report](../../audits/b05d-b06a-qc-2026-09-13.md) and [sanitized release evidence](../evidence/b05d-b06a-release.json).

- **279 isolated unit/route/policy checks**, five schema/source checks, database compile contracts, whole web/mobile TypeScript/lint, Next production build and Expo web/iOS/Android Hermes exports passed. CI also retained seven dependency and three tooling contracts. No schema was changed, so no production catalog recapture or SQL rollout was required.
- Six process timezone runs test opposite UTC offsets, DST boundaries, leap/year dates, Samoa's skipped local day, ISO offset prefixes and invalid inputs. These are formatter tests, not six physical browser/native environments.
- Local Next desktop 1440×1000 and phone 390×844 autocomplete selection/empty behavior and Library/detail dates passed. Before the date repair, existing Proof Private fixtures showed Jul 7 in Library; afterward they show Jul 8, matching detail. Rebuilt Expo web desktop/phone entry list/detail shows Jul 8. Screenshots visually inspected.
- Expo grape search/detail and cellar-add autocomplete passed through a proxy that strips cookies on every API request and logs bearer presence. This eliminates same-host cookie masking. No entry was submitted.
- CI runs `34741425769` (B05d) and `34741673071` (B06a) passed. Both primary `cellar-snap` previews succeeded. Duplicate `cellarsnap` previews failed; inspected build logs show missing Supabase environment variables on prerender, reproducing OPS-01. No project reconfiguration or approval/CI bypass.
- **Production / `d4e5cd2`:** fresh designated-account login → feed; phone cellar-add Nebbiolo suggestion and selection; Library Proof Private search at desktop/phone → Jul 8 results → selected entry detail Date consumed Jul 8; explicit sign-out reached login. Screenshots inspected, no captured warning/errors on the affected live tab before cleanup. Cookie-free bearer and separate cookie requests matched for canonical names, actual alias-only key, empty/punctuation and unknown input; invalid/anonymous 401 and configured fallback/limits passed. This HTTP suite also passed on B05d's preceding production deployment.
- Bounded Vercel error-level query for the exact final deployment since 06:03:48 UTC returned zero records (limit 100). It is not evidence about all production traffic. After sign-out, directly revisiting the palate shell can show existing empty-profile/loading fallback while API requests correctly deny 401; recorded under AUD-39/QC-03. Final sign-out navigation was verified on login.
- No working `xcrun simctl` or Android emulator found. Expo exports/web do not establish native runtime, OS auth/gesture, binary/OTA distribution or native release acceptance. QC-02 remains Partial/#109 open for that boundary. Existing QC-03/05/07/10/12 are not closed by these checks.

## Release state
- **Merged:** #108 and #110, commits above. `git diff origin/main 863fab8 -- src apps/mobile packages/shared` confirmed matching product source after the second merge.
- **Primary production:** B05d `dpl_Ec7tY7R4FaeXjjENrugdHkW5Mz85`, then final `dpl_32qQaMVqVsFmAffYh6nCLkiv35kP` Ready, URL `https://cellar-snap-1mbdkrhip-eitan-sneiders-projects.vercel.app`, aliased to cellarsnap.app. GitHub deployment `6418291004` binds that URL to `d4e5cd2`, success at 06:03:48 UTC.
- **Migration/data:** none. No intentional entry/profile/reference-data mutations. Existing designated fixtures were read only; ordinary app reads may maintain their normal derived caches. No fixture deletion required.
- **Native release:** none. **Live verification:** completed for the web/server scope above. **Rollback:** revert/redeploy the relevant source change; no persistent-data rollback. Do not apply baseline/historical SQL.

## Workspace and environment
Original modified `tsconfig.json` and untracked `cellarsnap-fix-plan.md` / `cellarsnap-qa-report.md` preserved. Nested `.claude` checkout preserved. Next-generated AGENTS additions restored after stopping Next 3001; Expo proxy 8083 stopped. Original tsconfig and AGENTS files compared byte-for-byte to session-start copies. No environment-file changes; Expo API origin override/cookie stripping were test-process only. Local web, Expo and production sessions signed out; agent browser tabs closed and viewport reset. Optional logs/screenshots/builds remain in `/tmp/cellarsnap-b05d` and `/tmp/cellarsnap-b06a`; no credentials committed.

## Next slice
1. B06b/AUD-09 badge trigger and authority contract, with current schema and explicit fixtures; then QC-03 counts and QC-08 selected-slide navigation.
2. B05e/QC-14 collision-reviewed alias repair and fresh reference-seed contract; separately finish AUD-19 managed provisioning/corpus restoration. No historical replay.
3. Continue bounded AUD-21 typed query adoption, retain explicit legacy bridges until their consumers are migrated, and retain AUD-20 native/fallback retirement prerequisites.
4. Native runtime/distribution follow-through for QC-02 and AUD-08 when infrastructure exists; do not equate Hermes exports with deployed native acceptance.
