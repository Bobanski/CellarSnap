# B06a — tasting calendar date contract

## Objective and IDs
QC-02, issue #109; branch `codex/b06a-consumed-dates`, stacked on B05d `e724161` / PR #108. B06 badge/count/event-card work remains separate. New QC-14 records damaged historical grape aliases discovered during B05d QC.

## State and decisions
One shared `formatConsumedDate` reads the recorded calendar-day prefix and formats it explicitly in UTC. It preserves invalid input instead of rolling impossible dates forward. Web helper re-exports it; Library and mobile entry list/detail adopt it. Legacy ISO consumed values retain their written day, including timezone offsets. Activity/comment timestamps and date storage are not rewritten. Mobile date presentation aligns with the existing English web/detail contract.

## Verification
279 isolated unit/route/policy checks passed (256 baseline + 16 B05d + 7 B06a); five schema/source checks and database compile contracts passed. Whole web/mobile TypeScript/lint, Next production build and Expo web/iOS/Android Hermes exports passed. Six actual process timezone settings cover New York, Los Angeles, UTC, Tokyo, Kiritimati and Apia, with instant-date controls, DST dates, leap days, year boundaries, Samoa's skipped local day, legacy timestamp offsets and invalid dates.

Hands-on web desktop 1440×1000 and phone 390×844 Library search found the existing designated-account Proof Private fixtures. Before: Jul 7. After: Jul 8; clicking the first result shows Date consumed Jul 8 in entry detail. Screenshots inspected. Rebuilt Expo web desktop/phone list search and entry detail show Jul 8. Existing fixtures only, no saved edits. Positive-offset coverage is the formatter regression suite, not a claim of a Tokyo browser/native run. iOS simctl and Android emulator unavailable; native runtime/distribution remains unverified.

Combined final QC and release details are recorded in the following release handover. Existing QC-03 counts, QC-05 route labels, QC-07 grape detail query and QC-12 images are not certified by this date slice.

## Release state
Implementation and available-runtime QC passed; merge/deployment/live verification pending at this checkpoint. No SQL or data migration. Revert/redeploy source to roll back. No native binary or OTA release is performed.

## Workspace and environment
Original tsconfig changes and two untracked local reports preserved. Next 3001 and rebuilt Expo cookie-stripping proxy 8083 running; process-only API override. Evidence under `/tmp/cellarsnap-b05d` and `/tmp/cellarsnap-b06a`, with durable final report to follow.

## Next slice
Finish current PR review/CI and authorized release. Next B06b should take bounded AUD-09 badge trigger/authority contracts, then QC-03 count definitions and QC-08 selected-slide navigation. B05e/QC-14 alias seed repair is a separately scoped follow-up; AUD-19 managed bootstrap and broader AUD-21 adoption remain Partial. Unresolved privacy findings stay visible in the canonical backlog.
