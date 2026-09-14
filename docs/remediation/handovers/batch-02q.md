# B02q handover — September 13, 2026 (EDT)
## Objective and IDs
QC-01 required projected mobile detail read, related AUD-48/50. Owners retain 1–100 inputs; non-owners receive the public band. No direct `wine_entries` detail read fallback.
## Resume here
Branch `codex/b02q-mobile-detail-projection`, parent B02p `66d3251`, issue #81. Implementation and focused checks complete; extended browser/crop/atomic-edit and final-release acceptance in progress. Use the final combined handover when published.
## State and decisions
Detail GET explicitly rejects invalid bearer identity without falling back to cookies, emits viewer identity, private/no-store and read-only CORS. Mobile uses the bounded projected-read transport introduced in B02p and rejects mismatched viewer/entry, raw public ratings, invalid owner numbers and raw group slides. Late results are invalidated on session/route/unmount and error paths clear the row. Existing independent authorized grape/photo/profile/reaction reads and owner mutation commands remain; this is not a lifecycle rewrite.
## Verification
466 isolated tests and web/mobile lint/types pass; all-platform exports pass. Desktop/phone Expo detail public bands, absence of numeric/edit controls for non-owners, decoded photos/grapes, no direct entry reads, comment persistence, denial/retry/raw/wrong-viewer rejection and delayed sign-out response acceptance have passed. Owner 92→93 save/reload passed. Crop fixture initially had only a legacy path (intentionally not editable); added its disposable editable photo record and reran. Extended QC and build/CI are not complete at this checkpoint. No native Xcode/Android runtimes; browser acceptance does not certify native distribution.
## Release state
No SQL/schema or production data migration. PR/merge/code deployment/live verification pending for this slice. B02o docs #148 merged as `435d488`; B02p #149 remains release pending. Preserve #81/#104/#112 and design draft #75.
## Workspace and environment
Private harnesses under `/tmp/cellarsnap-b02o-b02q`; active fixtures are removed in harness finally blocks. Next 3001/Expo 8083 running. Original user tsconfig/reports/nested checkout unchanged; generated Next AGENTS block will be restored after stopping the server.
## Next slice
Complete crop/atomic normal and bulk-owner regressions, rerun Home including reactions/stale signout and web detail/profile counterpart, build, review, CI and final-primary checks. Publish sanitized evidence and release handover, then continue physical rating/native/photo rollout gates from [inventory](../b02o-rating-consumers.md) and [backlog](../backlog.md).
