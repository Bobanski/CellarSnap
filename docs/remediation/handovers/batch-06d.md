# B06d handover — September 13, 2026

## Objective and IDs
QC-08: selected event wine controls its own caption and detail navigation on web/mobile. Stacked on B06c/#114 and B06b/#113, issue #112. A small B06c review refinement preserves the loaded profile identity when summary loading fails. No unrelated feature removal.

## Resume here
Branch `codex/b06d-event-navigation`, base `626ee60`. Finish final candidate checks and coordinated release. All three slices have implementation checkpoints; publish combined release evidence after merge/SQL/live acceptance.

## State and decisions
Shared `resolveEventSelection` keeps selection by stable photo ID through reorder and falls back only within the authorized slide set. Web gallery is optionally controlled so its visible image and parent caption/link cannot diverge. Context slides say “Event context” and “Select a wine to open its details,” with no unrelated detail link. Events with no photos retain representative-entry navigation. Mobile retains swipe scrolling and adds labeled, 44px photo-selection controls; controls wrap for larger groups.

## Verification
385 isolated checks pass, including four new event selection contracts for A/B targets, reorder, context/empty and restricted siblings. Five schema/source contracts, web/mobile types, whole lint, Next production build and Expo web/iOS/Android Hermes exports pass; final layout refinements are being rechecked before release.

Hands-on web 1440×1000 and 390×844: disposable mixed-privacy event, second wine → private owner detail, first wine → public detail, context without detail link; inspected screenshots. Authenticated HTTP owner gets all three slides; designated other user gets public/context only. Reordered hosted fixture to private/context/public and checked Expo selection: context caption/prompt match the green image; public/private selections reach the matching entry detail. Expo badges show the three new fixture awards, their detail opens, and menu/profile/Library counts agree at 88 tastings, three countries, two friends (includes the two new event fixtures). Cookies are removed by the Expo proxy; bearer presence logged for summary/badge APIs. Existing Expo `(app)` header and profile settings glyph remain QC-05/10; detail Back returns through the existing navigation stack and was not redesigned. No captured app warning/errors on the affected tab.

Native simulators/emulators remain unavailable. Expo web is not native runtime/distribution acceptance. Local summary-outage reverse-proxy experiment did not hydrate the Next client, so no browser error-state acceptance is claimed from it; isolated query-failure contracts pass. Screenshots/build/logs in `/tmp/cellarsnap-b06b` and `/tmp/cellarsnap-b06d`.

## Release state
Not yet merged, SQL not yet applied. B06b migration is the only SQL. Two additional disposable group entries, one group, three slides/photos/objects were created with designated accounts; exact cleanup manifest `/tmp/cellarsnap-b06d-fixtures.json`. Preserve original rows and clean only recorded fixtures after live checks. B06b's 15 entry/three badge fixture IDs also remain pending cleanup.

## Workspace and environment
Next 3001; rebuilt Expo static/API proxy 8083; temporary fault proxy 3017. Port 3002 was already occupied and was left untouched. Existing user files and separate design draft #75 remain preserved. No environment files changed. Restore Next-generated AGENTS additions and original tsconfig on final cleanup.

## Next slice
After releasing these three slices, continue AUD-09's 32 deferred definitions and featured-profile award authority. QC-03/QC-08 stay Partial for native delivery. B05e/QC-14 alias repair remains separately queued; broader AUD-35/39 statistics/loading, privacy and duplicate hosting remain distinct.
