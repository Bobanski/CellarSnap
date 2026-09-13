# B04a auth privacy QC — September 12, 2026

Product head: `4870c37` ([PR #94](https://github.com/Bobanski/CellarSnap/pull/94), issue #93). Scope AUD-05. Captured live RPC definitions: `docs/remediation/evidence/b04a-live-catalog.json`.

## Passed
- 219 isolated tests in 22.1s (two workers), including seven new auth-security tests. Actual PGlite migration replay verifies all 12 anon/authenticated denials and backend mapping/availability semantics. Username/email/phone credential selection, known/unknown recovery/provider-error parity, no contact output, constant retired endpoint, user-agent bucket stability and fail-closed shared-limiter absence passed.
- Web/mobile lint, web/mobile TypeScript, production Next build and Expo web export passed.
- Hosted SQL rehearsal of the exact migration rolled back: six functions retain backend EXECUTE and deny both client roles. All referenced table names are qualified with an empty function search path.
- Local API connected to hosted Supabase: designated account email and username sign-in returned user sessions; taken username and unused synthetic phone availability returned booleans; retired resolver HTTP 410; unknown recovery HTTP 200 `{channel:email}`. No recovered contact was exposed.
- Hands-on in-app browser: desktop 1440×1000 invalid sign-in and successful designated account email login; sign-out; phone 390×844 successful username login; recovery link, unknown-username submission and reset continuation with blank email. Layout and actionable controls inspected; password/OTP updates deliberately not submitted.
- Fresh Expo export: desktop username login reaches feed, phone-size sign-in/sign-out, recovery submit and reset continuation with blank email. The existing `(auth)`/`(app)` headings, public numeric ratings and date mismatch remain QC-05/QC-01/QC-02, outside this slice.

## Harness corrections and limits
Initial Playwright top-level await was incompatible with its CJS transform; moved the catalog read inside the test and reran all 219 successfully. TypeScript caught Promise versus PromiseLike on Supabase RPC injection; corrected before passing checks.

An old browser session produced invalid refresh-token errors at initial startup. Normal sign-in restored a valid session. Expo development requests initially used a cross-origin/stale compiled API origin; exported with a temporary task-local same-origin 8083 API origin and restored the exact original environment file afterward. Clean export login/recovery passed; no new console error/warning after that boundary. Earlier dev-only shadow-style/Metro warnings are not production-export failures. Screenshots/logs are optional local evidence under `/tmp/cellarsnap-b04-qc/` and `/tmp/b04a-*`; this document contains the reproducible outcomes.

No simctl, adb or emulator installed. Expo is browser fallback, not native binary/OTA acceptance. No live email/SMS delivery or password changes tested; delivery calls and error branches are tested with injected providers, phone credential/SQL behavior in isolation. No real-account contact fields, credentials, ratings or entries changed. No timing-side-channel guarantee: availability deliberately exposes bounded booleans, auth-provider timing remains outside response-shape containment.

## Release gate
Code must deploy before the migration revokes legacy RPC access. The main Vercel `cellar-snap` preview is Ready. Duplicate `cellarsnap` fails again (existing OPS-01); do not weaken the working production project to make that duplicate pass. Final release/migration/live results belong in the current handover and backlog, not inferred from this implementation report.
