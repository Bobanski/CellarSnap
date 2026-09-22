# B11d–B11f / B04e iOS launch handover — September 22, 2026

## Objective and IDs

Owner asked for another substantial push toward iOS launch/App Review. Implemented six concrete repairs: QC-20 recommendation-note authentication/retry, QC-05 nested headers, QC-10 auth viewport containment, QC-12 single-photo sizing, new QC-21 Apple nonce exchange and new QC-23 scan foreground contrast. Scoped QC-06 controls gained roles/names. OPS-03 tracks native signing/submission gates; QC-22 records stale privacy disclosures. No new finding is Closed because the native candidate is not installed/released.

Issue [#166](https://github.com/Bobanski/CellarSnap/issues/166), PR [#167](https://github.com/Bobanski/CellarSnap/pull/167). Source commits `1a06fd0` and `4dd13f5`, branch `fix/ios-launch-readiness`, base `421f244`. Current queue: **76 records / 15 Closed**. The AUD-11/28 closures from the prior session's verified #164 release are reconciled into this backlog; they are not new closures from this push.

## Resume here

1. Complete Apple account authentication/2FA and production provisioning via `eas credentials --platform ios` in `apps/mobile`, then build the final #167 head with production profile. Prior cached login expired; the attempted store build failed before upload and interactive setup was canceled at 2FA. No new EAS build ID or IPA exists. The user was asked to complete this locally, without sharing passwords/codes in chat.
2. Review #167 and the [release gate record](../ios-launch-readiness.md). Native acceptance is now required: previous owner deferral applied to a web-only product, not the newly requested iOS launch. No Xcode or simulator is installed here; use a physical iPhone/TestFlight or install a runtime.
3. Address QC-22 privacy disclosures and finish AUD-01 historical-photo privacy work. [PR #165](https://github.com/Bobanski/CellarSnap/pull/165) remains open; its [B02y handover](https://github.com/Bobanski/CellarSnap/blob/codex/b02y-protected-photo-archive/docs/remediation/handovers/b02y-release-archive.md) is the continuation for that separate work. No archive migration/copy/retirement was performed here.

## State and decisions

- Recommendation notes use the configured API host and current bearer token, with cookies omitted. Token/fetch/body deadlines, cancellation, malformed-response rejection and user-visible retry are bounded. Filter changes clear old notes; inactive requests cannot overwrite a new selection. Scanning/results remain usable during optional-note failure.
- Apple login uses Expo Crypto's random UUID and SHA-256; Apple receives the hash, Supabase receives the raw nonce. Removed the Apple authorization code incorrectly passed as an access token. Installed Expo's Swift bridge forwards nonce unchanged, while Supabase's verifier hashes the supplied raw nonce. No provider validation was weakened and no provider settings were changed.
- Root Stack hides `(auth)`/`(app)`/index headers while retaining legal/detail routing. Six auth screens clip off-screen decorations without replacing their ScrollViews. Sign-in fields/toggle/actions, Log, photo navigation and notes retry have scoped accessibility improvements.
- Single-photo Pressable fills the existing aspect-ratio frame; multiple-photo/grouped implementations remain separate. Keyboard checks allow the existing 220ms feed-scroll guard to settle before activation.
- Visual QC found dark background ink on scan controls/warnings. Warning text now uses textPrimary; action/selected text uses textOnAccent. Noir colors/features are preserved. Primary action contrast improves **1.90:1 → 8.64:1**. Other pre-existing subtle text/accent styles are not claimed fully audited.
- Candidate stays version **1.0.1**, iOS build **3**, Android code 2. Production explicitly uses store distribution and pins `prebuild --template expo-template-bare-minimum@56.0.36`. Installed Expo 56.0.21's bundled template identifies itself as 57.0.9 / RN 0.86; default disposable prebuild emitted mismatch warnings. Explicit official SDK56 template generates cleanly. No broad SDK upgrade or generated native directory committed.
- Production EAS public hosts resolve to cellarsnap.app and the existing Supabase project. Local proxy configuration was removed before both EAS attempts and restored afterward. Do not ship the loopback QC host.

## Verification

[Sanitized evidence](../evidence/b11d-b11f-ios-launch.json), application source `4dd13f5`:

- **582 isolated tests**, including 11 notes transport/deadline/failure/cancellation tests and three Apple credential protocol tests; web/mobile types and lint; seven mobile dependency and three tooling contracts pass. Expo iOS/Android/web exports pass. Mobile install audit reported zero vulnerabilities. No claim of native compilation from export/prebuild.
- Disposable iOS project generation with the explicit SDK56 template passes, retaining Apple sign-in entitlement. No CocoaPods/Xcode compile, installed binary, native Apple login, native camera/photo picker, password recovery delivery or native account deletion acceptance.
- Actual Chromium at **1440×1000 and 390×844**: sign-in, recovery and signup viewport checks; age gate, password sign-in with configured credentials; no raw group headers; protected feed photo loads at nonzero height and Enter opens the correct detail after scroll settles. Final base flow has **zero page exceptions, HTTP failures and console errors**.
- Fresh baseline: 390px sign-in/recovery document width is 450px, route-group labels appear, and the loaded synthetic single-photo image has **height 0**. Candidate fixes retested at both widths. Screenshots include [sign-in phone](../evidence/b11d-signin-phone.png), [recovery desktop](../evidence/b11d-recovery-desktop.png) and [synthetic photo](../evidence/b11e-photo-phone.png).
- Cookie-stripped Expo proxy targets live primary APIs. Real URL scan returned **48 wines**; notes POST is 200 with bearer and no cookies. New tester initially had insufficient qualifying history, correctly returning empty notes; five disposable private advanced-note fixtures unlocked generated notes. Saved scan's warning still represents its initial history snapshot. No production profile was overwritten to force output.
- Notes injection at both sizes returns 503, retains recommendations, announces failure and exposes a 44px keyboard retry; Enter recovers to live 200/generated notes. Final scan captures zero page exceptions and only **two intentional 503 HTTP failures**. Scan console messages were not separately persisted; base-flow console and bounded server logs were checked. [Generated notes](../evidence/b11d-notes-phone.png), [retry state](../evidence/b11d-notes-error-phone.png).
- Intake/results/history navigation/layout and warning/action foregrounds retested at both sizes after the contrast fix. [Phone contrast](../evidence/b11f-contrast-phone.png). Native accessible navigation remains unverified.
- A 30-second primary runtime log tail overlapping notes requests emitted zero records. This is a bounded observation, not a historical error audit. The earlier request-log CLI syntax was unsupported by installed Vercel 41.6; retried using its supported runtime stream.
- Harness corrections: initial photo fixture was attached to the viewer but feed deliberately excludes self; moved to designated tester owner/viewer. Screenshot/focus scrolling initially triggered the existing navigation guard; settled keyboard retest passed. Cleanup initially used `id` instead of the scan table's `scan_id`, corrected and independently verified. Initial root-level npx export attempt was canceled; all accepted exports use the installed mobile SDK CLI. All failures above are preserved as setup limitations, not hidden passes.

## Release state

- **Implementation:** `4dd13f5` plus subsequent documentation/evidence only.
- **Merge:** #167 open; no merge or issue closure performed. #165 remains independent and unchanged.
- **Web deployment:** primary preview Ready. Production application remains #164 / `421f244`; this mobile branch has no web runtime changes or migration. No new production deployment claimed.
- **CI:** source `1a06fd0` and final application `4dd13f5` pass Web/Mobile. [Final source run](https://github.com/Bobanski/CellarSnap/actions/runs/35699133121). Duplicate `cellarsnap` preview still fails (OPS-01); inspected logs again confirm missing Supabase env, while primary `cellar-snap` succeeds.
- **SQL/data:** no migration; only disposable test rows/photo, all cleaned. Historical storage/ratings remain untouched.
- **Native build/distribution:** attempted store build blocked on credentials; Apple 2FA required. Existing September 14 build 2 is INTERNAL/preview, not a store binary. No upload, TestFlight distribution or App Review submission this session.
- **Recovery:** revert application source through PR; no schema rollback. A replacement native binary is needed if released mobile code must be reverted.

## Workspace and environment

Worktree `/tmp/cellarsnap-ios-launch` retained; original workspace's `tsconfig.json`, untracked QA/fix-plan docs and nested worktree untouched. #165 worktree `/tmp/cellarsnap-progress` and design PR #75 preserved. Root dependency symlink is local only; mobile installed from its lockfile.

Private fixtures, browser harnesses/logs/session and disposable prebuild live under `/tmp/cellarsnap-ios-qc` and `/tmp/cellarsnap-ios-prebuild`; never commit their credentials or raw profile data. Existing `.env.local` E2E IDs were discovered not to be marked testers. Initial disposable source/photo was removed; subsequent mutable acceptance used two existing `is_test_account=true` users via a local token exchange with no email sent. No test-account flags/passwords/profile values changed; only the generated tester session was signed out after QC. Final independent checks: **zero fixture entries, scan results, scan wines and current fixture photo objects; four designated testers remain**.

Local Expo servers on 8087/8088 and Apple setup prompt are stopped at handoff. Temporary local mobile env is retained only in this worktree for reproduction and restored after EAS attempts; source environment files were untouched. Server log listener ended. Native prebuild directory is disposable and outside Git.

## Next slice

Ordered launch path: Apple provisioning/store build → installed iPhone acceptance and native screenshots → QC-22 disclosures/required consent and App Store metadata → AUD-01/#165 preservation and historical retirement → exact-build upload/review. These are distinct gates; a green build or uploaded TestFlight binary does not establish App Review submission. Broader AUD-13/15 lifecycle and remaining backlog remain visible; this push did not resolve all launch risks by renaming statuses.
