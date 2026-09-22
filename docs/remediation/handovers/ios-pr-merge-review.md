# PR review checkpoint — September 22, 2026

## Objective and IDs

Owner authorized merging reviewed PRs when green and QC passed. Reviewed #165 (AUD-01/AUD-22), #167 (B11d–B11f/B04e, #166), #168 (QC-22/AUD-08, #166/#97). Design draft #75 remains deliberately separate. No code blocker found in the reviewed changes. Queue remains 76 / 15 Closed; native acceptance and production archive operations are not inferred from source approval.

## Resume here

The application CI and primary `cellar-snap` preview pass. Every candidate also has a failing duplicate `cellarsnap` check. Logs independently confirm missing Supabase environment variables on all three old heads; this is the existing OPS-01 configuration defect, not a candidate regression. Because the owner explicitly conditioned merging on green checks, a question is pending whether to treat this known duplicate check as nonblocking. No merge performed while that choice remains unanswered.

If the owner grants that exception, merge #167 with a merge commit (preserve ancestry), retarget #168 to main and verify the resulting tree/checks, then update #165 from main and reconcile overlapping remediation documentation without discarding either history. Run combined schema/application checks if integration changes the tested tree. Merge #165's dormant archive source separately from applying its migration. Finish production deployment/consent verification and publish a release handover; merging alone does not satisfy App Store or hosted archive acceptance. Do not use admin/bypass flags to override branch protections.

## State and decisions

- #165 `365773a` / implementation `225c0ee`: reviewed private archive SQL/grants, restrictive role denial, source/backup identity checks, bounded no-overwrite copy, failure recovery and locked final CAS. No source deletion or retirement authority. The original review comment asking for a runbook/handover was already addressed; the thread is now resolved.
- #167 `c00448c` (application unchanged from `d65e659`): reviewed nonce hashing/raw nonce exchange, notes bearer transport/deadline/cancellation/retry, route/header and image layout, token contrast and EAS template/profile. Fixed the outstanding review finding: detailed QC-21/QC-23/OPS-03 statuses now match their canonical rows; clarified native acceptance remains pending. Review thread resolved. No runtime code changed during review.
- #168 `148ba4b` (application `2fd2c00`): reviewed fresh server-owned consent enforcement, endpoint coverage, caller-only metadata writes/CSRF, per-owner operator embedding, transport and mobile account identity checks, shared disclosures and dependency patch. Integrated #167's documentation correction; the only conflict was adjacent backlog additions and both were preserved. No runtime difference from the previously tested application.

## Verification

- Previous source evidence remains applicable: #167 582 isolated tests and real desktop/phone Expo flows; #168 597 isolated tests, build, audits and desktop/phone web/Expo flows. Both explicitly lack installed-native coverage. Exact source/evidence is linked from the prior handovers; this review did not substitute builds for browser QC.
- CI after the documentation correction/integration: [#167 run](https://github.com/Bobanski/CellarSnap/actions/runs/35742079741) and [#168 run](https://github.com/Bobanski/CellarSnap/actions/runs/35742207678) pass Web/Mobile. Both primary previews are Ready. [Sanitized review evidence](../evidence/ios-pr-merge-review.json).
- Fresh #165 validation: **47 schema/tool tests**, PostgreSQL **17.6** replay/catalog equality, all four archive concurrency races (late reference, source, destination, bucket privacy) plus existing rekey/cutoff/edit/badge races pass. Isolated loopback database only; zero production writes.
- Fresh #168 hosted-preview browser acceptance on `45db8f9` (same application tree as `148ba4b`): Chromium 1440×1000 and 390×844. Cookie consent save, intentional 503 failure retaining off, keyboard retry, persisted allow, reload, revoke and unchanged-bearer-token denial pass. Manual editor still opens with AI off. Layout visually inspected at both widths: [desktop](../evidence/ios-review-preview-desktop.png), [phone](../evidence/ios-review-preview-phone.png). Zero page exceptions; only two intentionally injected HTTP/console 503s. Hosted runtime logs were not independently captured; API responses and browser errors were checked.
- Hosted tester metadata restored byte-for-structure exactly and generated session signed out. No fixture entries/photos created. No ordinary account/profile/password or historical Storage changes.
- Native iPhone Apple login, camera/picker, native EXIF/VoiceOver and store-signed acceptance remain pending. Archive hosted migration/copy/access acceptance remains pending.

## Release state

All three PRs remain open; no production code deployment, SQL migration, historical copy/deletion, native binary, upload or App Review submission in this checkpoint. Source review does not close QC-21/QC-22/OPS-03/AUD-01. Duplicate hosting stays OPS-01. Merge permission is conditional on the owner's pending red-check choice and fresh CI; do not silently reinterpret it in a new session.

## Workspace and environment

Original workspace's modified tsconfig and two untracked QA/fix-plan files are untouched. `/tmp/cellarsnap-ios-launch` remains on #168; `/tmp/cellarsnap-pr167-review` is a clean #167 review worktree; `/tmp/cellarsnap-progress` remains on #165. Existing worktrees and design PR preserved. Private scripts/session/logs are under `/tmp/cellarsnap-merge-review`; never commit raw sessions/metadata. The PostgreSQL replay cluster stopped and cleaned itself. No new local app servers or environment edits.

## Next slice

Resolve the pending duplicate-check exception, then follow the merge order above. Preserve native signing, App Store metadata and historical-photo retirement as distinct release gates. Continue from the canonical backlog and handovers, not this conversation alone.
