# B02a database and browser QC — September 12, 2026

Tested implementation: `50f9fc6d6ac9288f2cc0a5cdc4bfd7d314466afd`, based on B01 `37f183d`. Later commits update evidence/handover only. Scope is AUD-01 entry-row policy, with targeted AUD-19 and AUD-48 work. [Access contract and live baseline](../remediation/b02a-access-contract.md).

## Automated checks

- `npx playwright test --config playwright.unit.config.mjs e2e/entry-access-policy.spec.ts`: **8 passed**.
- `npm run test:unit`: **181 passed**, including the existing 173-test B01 baseline. Isolated PGlite fixtures reproduce the pre-fix leak and verify the actual migration against the captured live helper definitions.
- `npm run lint:web`: passed; `npx tsc --noEmit`: passed; `git diff --check`: passed.
- No web/mobile runtime source or dependencies changed. A new production build/mobile lint was not repeated for this SQL/test-only slice. CI results belong to the exact PR SHA and must be checked separately.

## Interactive browser baseline

Local Next dev server, `http://localhost:3001`, connected to the existing live Supabase configuration. **Neither B01 nor B02a SQL was applied.** Therefore these checks establish current app behavior; they are not post-migration integration acceptance.

Used only designated `e2e_user_a`, existing synthetic `Proof Private Wine` fixtures. No entry/profile/relationship/photo changes were saved; no upload, delete, sharing or social interaction was submitted. Normal page-triggered scoring/palate/notification work can still occur.

| Flow | Actual result |
|---|---|
| Sign in | Passed in the Codex in-app browser and Chrome; reached Feed. |
| Feed → menu → My Palate → Library | Passed in the in-app browser. |
| Library search `Proof Private` | Six existing synthetic entries; desktop layout inspected at 1365×900. |
| Owner private detail | Loaded with `YOUR RATING PRIVATE 85/100`, disabled Share and explanatory hint, Edit entry control. |
| Phone layout | In-app browser confirmed actual 390px document/viewport width, no horizontal overflow; private detail visually inspected at 390×844. |
| Editor hydration | Existing notes and rating 85 loaded. In-app disclosure actions did not expand Visibility; Chrome's native click did, showing Post/Reactions/Comments all Private. No product change was made for this testing limitation. |
| Cancel | Passed in Chrome, returned to private detail with rating intact. |
| Chrome narrow layout | Visually inspected after Cancel. Requested 390px override produced actual `innerWidth=487`, `scrollWidth=487` in this browser; do not label that screenshot exact 390px. Exact 390px coverage comes from the in-app browser. |
| Logout/protected redirect | Chrome Sign out reached Login; direct navigation to the same private entry redirected to Login. In-app session also reached Login after reload. |

Screenshots (local only; synthetic entries) are in `/Users/esneider/.codex/visualizations/2026/09/12/01a09736-bd34-70b1-b2b7-c37ce71b72c2/b02a-qc/`: desktop-library, desktop-private-entry, phone-private-entry, phone-private-editor, chrome-expanded-editor, chrome-phone-private-entry. Browser viewport overrides were reset; test tabs are temporary.

Known issues reconfirmed: QC-02 (Library July 7 versus detail July 8 for the date-only fixture), QC-03 (profile one country/menu two), QC-04 (Maps async-loader/legacy Places warnings). No unrelated fixes were added. Chrome also logged browser-extension ObjectMultiplex/listener warnings; their source was not established as application code. No application console exception or unexpected server 5xx was observed. The server returned expected 200s for owner detail/photos/editor and expected 401 for the unauthenticated API probe; ordinary Next dev reload warnings were present. Do not commit raw logs containing provider keys/URLs.

## Read-only HTTP baseline

A temporary Node client loaded existing E2E credentials without printing them, resolved the designated username through the existing local login endpoint, signed in to Supabase, and asserted the user ID matched `E2E_USER_A_ID`. It read only the known owned synthetic fixture `c612f602-8fa2-41e6-987a-aed43b3599c8`:

- Owner direct Data API: success, owner ID matches, privacy private, rating 85.
- Local GET `/api/entries/:id` with the same bearer token: 200, rating 85 retained.
- Local GET without authentication: 401.
- Anonymous direct Data API for that fixture ID: no rows, no error.
- Temporary client session signed out. No production schema/data writes.

Non-owner ordinary-account denial is proven only in the isolated role fixtures. Existing E2E users have the special tester contract, so their access is not evidence of ordinary-user denial. Storage signing/download was not repaired or exercised with a cross-user matrix in this slice.

## Native and integration limitations

No Xcode simulator runtime, simctl, Android SDK/adb, or Docker command was available. `xcode-select -p` points to CommandLineTools. No native iOS/Android test was possible. Expo web was not rerun for this SQL-only slice; responsive web and bearer API checks are not native acceptance.

A disposable Supabase environment with the targeted schema and reviewed fixtures is still needed for real PostgREST/Storage/browser/Expo integration after applying B01 then B02a. PGlite tests PostgreSQL policies, not the PostgREST/Storage services. Production has not been remediated by this branch; do not close AUD-01/02/03 from these results.
