# B04f–B04g iOS privacy handover — September 22, 2026

## Objective and IDs

Continue the iOS launch push with QC-22 (AI permission/disclosures) and a fresh AUD-08 dependency recurrence. Issue [#166](https://github.com/Bobanski/CellarSnap/issues/166), dependency issue [#97](https://github.com/Bobanski/CellarSnap/issues/97), PR [#168](https://github.com/Bobanski/CellarSnap/pull/168). Branch `fix/ios-review-privacy`, application commit `2fd2c00`, stacked on #167 / `fix/ios-launch-readiness` at `d65e659`. Two bounded slices completed in source; no production or native acceptance claimed. Queue remains **76 records / 15 Closed**. QC-22 and AUD-08 are Partial.

## Resume here

1. Review #167 then #168 together. #168 needs its backend/web deployed before the matching mobile candidate; verify cookie and bearer opt-in/revocation on that deployment. Existing users default to AI off, including users on older clients. Do not distribute an older client without access to the permission setting.
2. Complete Apple authentication/2FA and production provisioning in `apps/mobile`, then build the final reviewed source. The previous attempt stopped before upload at Apple credentials; this session produced no store build, IPA, upload or review submission. Candidate remains version 1.0.1/build 3. See [release gates](../ios-launch-readiness.md) and [submission runbook](../../IOS_SUBMISSION_RUNBOOK.md).
3. Finish installed-iPhone acceptance, actual App Store Connect privacy answers, support/reviewer access/artwork and the current age questionnaire. The source-grounded [App Privacy draft](../../APP_PRIVACY_LABELS.md) explicitly identifies unresolved provider settings, logs and native EXIF/location questions.
4. Resolve AUD-01 historical-photo privacy separately via [#165](https://github.com/Bobanski/CellarSnap/pull/165) and its B02y handover. Its archive migration/copies/retirement remain unperformed here; do not claim this P0 exposure resolved by policy wording.

## State and decisions

- Shared `packages/shared/src/aiConsent.ts` defines a versioned account-wide choice, recipient/data/purpose disclosure and 12 personal-AI POST paths. Existing accounts have no permission by default. Web first-session dialog/settings and mobile modal/settings offer Allow, Continue without AI, Decide later and revocation. Manual logging, cellar and social use remain available.
- `requireRequestAuth` and its typed variant enforce consent after fresh Supabase `getUser()`, using server-owned `app_metadata`, never editable user metadata or cached JWT claims. All 12 affected catches preserve the 403/helpful message. The consent route only changes its authenticated caller's one metadata key, validates the version/boolean, rejects cross-origin cookie mutation and returns no-store responses. Bearer mobile calls omit cookies.
- Personal-entry operator embedding checks **each source owner's** fresh permission per page. An operator cannot grant permission on someone else's behalf. All-denied pages still advance their cursor; subsequent pages observe revocation. Reference-only Explore generation remains separate.
- Shared consent transport has bounded token/fetch/body work; a timed-out token lookup cannot later write. Mobile checks expected account identity after refresh; mounted-card guards prevent late account changes from updating UI.
- One shared policy renders web `/privacy`, `/privacy/more` and mobile `/privacy`. It identifies OpenAI, Anthropic, Google Vision, Supabase/Vercel and web Maps/EXIF processing, request-authorized photo delivery and real retention limits. It promises neither zero retention nor no training without provider evidence. Revocation cannot recall in-flight/prior processing. AUD-01/22 historical media, AUD-26 cleanup retries and AUD-50 diagnostics remain separate.
- Fresh npm install found high-severity ExifReader GHSA-pj96-35fp-cfcc (HEIC/AVIF memory exhaustion), added to the advisory database September 17 after the earlier zero-audit release. B04g pins **ExifReader 4.41.1** only; no broad dependency upgrade. Actual JPEG GPS extraction and a bounded malformed HEIC child-process test preserve behavior and cover the advisory.
- Final visual review also caught initial dialog focus scrolling past the title on phones while its buttons loaded. `2fd2c00` focuses the heading without scrolling and resets the dialog to the top. Both sizes pass title/focus/scroll/decline checks; the full settings suite passes again after a fresh production build.
- Browser QC caught a real cookie-consent failure: Next rewrites the internal request URL host to localhost. The final same-origin guard compares the submitted Origin to the request Host (and protocol), not the rewritten URL host or an arbitrary forwarded header. Regression tests and actual production-build browser retests pass.

## Verification

Application `2fd2c00` (base permission/dependency implementation `5a2d9a4`); [sanitized evidence](../evidence/b04f-b04g-ios-privacy.json):

- **597 isolated tests pass**, including absent/declined/stale/forged permission, cookie/bearer parity, unchanged-JWT revocation, strict current-caller mutation, CSRF with Next's internal host, bounded transport and per-owner/mid-job embedding denial. Seven installed mobile dependency and three tooling contracts pass.
- Web production build, web/mobile lint and mobile types pass. Expo iOS/Android/web JavaScript exports pass. Root and mobile dependency audits report **zero vulnerabilities**. These are not native compilation or device acceptance.
- Real Chromium at **1440×1000 and 390×844**, both production Next and Expo web: disclosure layout, off state, intentional save failure, retained off state, keyboard retry, allow, reload persistence and revoke. An unchanged access token is accepted past the permission gate while allowed and denied after revocation. Expo uses a cookie-stripping local proxy and bearer auth. Public policy/Terms navigation also exercised manually in the in-app browser.
- Additional phone journeys passed: initial prompt/decline, real manual entry saves on web and Expo with AI off, JPEG photo intake/preview on web, then Expo opt-in and a real public URL scan returning **48 wines**. Four photo-enrichment calls correctly returned 403 while permission was off. Scan/save page exceptions: zero; their console errors were not separately persisted.
- Settings tests captured **zero page exceptions**; the only four HTTP/console errors were intentionally injected 503 consent-save responses, one per platform/size. Server logs inspected during local acceptance; no unexpected exception recorded. Full-path coverage and cleanup are recorded in the evidence file.
- Reviewed screenshots: [web prompt phone](../evidence/b04f-web-prompt-phone.png), [web disclosure desktop](../evidence/b04f-web-privacy-desktop.png), [Expo choice phone](../evidence/b04f-expo-choice-phone.png), [Expo initial prompt](../evidence/b04f-expo-prompt-phone.png), [allowed scan](../evidence/b04f-allowed-scan-phone.png).
- Native runtimes checked: only CommandLineTools, no Xcode/simctl, adb or Android emulator. Expo web cannot prove native Apple login, safe-area/VoiceOver behavior, camera/picker, native EXIF handling or installed account deletion. These remain explicit release gates.
- Setup failures retained: Turbopack rejected the old node_modules symlink outside the worktree; local `npm ci` fixed the environment and final production build passed. Early browser selectors collided with Next's route announcer and collapsed/required form labels. The extra save harness initially omitted the required survey and expected case-sensitive wine names even though the app normalizes their capitalization; those harness assumptions were corrected before acceptance. No failed run is counted as a pass.

## Release state

- Implementation/local QC: complete for these source slices; release acceptance remains pending.
- CI: [application run](https://github.com/Bobanski/CellarSnap/actions/runs/35739976856) passes Web and Mobile. Primary `cellar-snap` preview succeeds. Duplicate `cellarsnap` preview fails under existing OPS-01; its prior missing-Supabase-environment diagnosis was not re-investigated here.
- Merge/deployment: #167/#168 remain open; production remains #164 / `421f244`. No production deploy/live verification this session.
- SQL: no migration. Hosted mutations were confined to designated tester permission state and disposable QC fixtures, with cleanup evidence recorded separately.
- Native: no new signed binary, native acceptance, TestFlight upload or App Review submission.
- Recovery: source revert through PR requires no SQL rollback. Reverting the backend removes enforcement, so do not silently do so while retaining a policy that promises permission gating. Metadata is preserved unless explicitly changed. Released mobile changes require a replacement binary.

## Workspace and environment

Worktree `/tmp/cellarsnap-ios-launch` retained on `fix/ios-review-privacy`. Original workspace's modified `tsconfig.json`, untracked QA/fix-plan docs, original branch and unrelated servers remain untouched. #165 worktree and design PR #75 are preserved. Root dependencies now installed locally; no cross-worktree symlink. Source env files untouched; the earlier local mobile QC env remains local only. Production-target all-platform export explicitly used the production API URL; do not ship the loopback proxy.

Cleanup verified five disposable entries (including early harness attempts), eight photo/original paths and one scan removed; zero fixture entry/photo/scan rows or current Storage objects remain. All four designated testers remain. Original account metadata restored exactly, and only the generated QC session signed out. Local servers 3013/8089 stopped and manual browser viewport reset at handoff.

Private scripts, tokens, metadata snapshot, logs and exports are in `/tmp/cellarsnap-privacy-qc` and `/tmp/ios-privacy-*.log`; do not commit those secrets/raw records. Repo evidence contains sanitized counts and reviewed screenshots. Native signing requires the owner's Apple authentication, not credentials in chat.

## Next slice

Release/deploy the reviewed backend and verify permission on the intended host; complete Apple provisioning and a store-signed build from the exact final commit; install/test on iPhone and capture genuine native screenshots; reconcile actual App Store metadata/provider settings; complete historical-photo retirement; upload the exact store build and separately submit it for review. [Backlog](../backlog.md) and [hub](../README.md) retain remaining launch risks.
