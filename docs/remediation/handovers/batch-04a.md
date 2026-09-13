# B04a handover — September 12, 2026

## Objective and IDs
AUD-05 contact-resolution containment, with targeted AUD-19/48/50 evidence. Issue #93. Separate next slice: AUD-07/B04b remote wine-list fetching. AUD-08 and OPS-01 are deferred.

## Resume here
Branch `codex/b04a-identifier-privacy`, base main `73e1bb3`. Review final PR #94 checks before merge; deploy the backend code before restricting RPCs. Discover current PR/commit rather than assuming this checkpoint is released.

## State and decisions
Web and mobile use the server password API. A separate service client resolves contacts; the public auth client verifies credentials and issues only the user's session. The retired resolver returns constant HTTP 410, requiring old web pages to reload. Recovery returns the same result for absent accounts and provider delivery errors; phone responses echo only the number supplied by the caller. Username recovery uses email, matching the existing mobile contract; SMS recovery requires entering one's phone number. No resolved email is sent to the reset form.

All four mapping RPCs and the two deliberately public availability RPCs become service-only. Availability remains accessible through bounded web APIs. Anonymous limiter buckets no longer include user-agent. Auth/availability refuse requests when shared limiting is unavailable; explicit memory mode is local/test-only. Hosting must overwrite forwarded IP headers, as Vercel does. Account existence remains deliberately observable through availability booleans; this is not a promise that every auth-system timing side channel disappears.

## Verification
219 isolated tests passed, including actual captured-function replay and migration grants/behavior, credential selection, known/unknown recovery, provider errors, retired resolver, stable user-agent bucket and missing limiter. Web/mobile lint and TypeScript, web production build passed. Hosted migration rehearsal rolled back: all six RPCs denied anon/authenticated, retained service execution. Live local API email/username login, username/phone availability, resolver 410 and unknown recovery passed.

Hands-on desktop 1440×1000 and phone 390×844: generic invalid login, successful designated account email and username login, sign-out, unknown username recovery to reset form without disclosed/prefilled email, visual layout passed. Initial stale browser refresh tokens cleared on normal fresh sign-in. No subsequent web console warning/error. Expo QC passed after fresh export and same-origin proxy: desktop username sign-in, phone sign-out and unknown-username recovery to blank-email reset form. See [QC report](../../audits/b04a-auth-privacy-qc-2026-09-12.md). No installed simctl/adb/emulator; native binaries/OTA and live email/SMS delivery/password changes are not tested. Provider delivery is mocked in tests; no messages sent to designated accounts.

## Release state
Not merged/deployed/migrated at this checkpoint. Migration `20260913014834_restrict_contact_resolution.sql` changes grants/search paths and normalizes the phone regex, not source rows. Apply only after API deployment; forward-correct issues without restoring anonymous contact access. Existing mobile login/recovery API contracts remain compatible. Native copy changes need a later native release.

## Workspace and environment
Preserve original `tsconfig.json`, two untracked historical reports and nested Claude worktree; PR #75 remains untouched. Task Next 3001, Expo same-origin proxy 8083; task-local export/screenshots/logs under `/tmp/cellarsnap-b04*` and `/tmp/b04a-*`. Temporary Expo environment override is restored by the export harness. No source data fixtures were created.

## Next slice
Finish release/QC evidence for B04a, then AUD-07/B04b: one DNS-pinned destination-checked HTTP utility, every redirect checked, total deadline and decoded body caps, malicious destinations/redirects/slow streams plus legitimate menu browser/Expo flows. Update backlog/hub at release boundary.
