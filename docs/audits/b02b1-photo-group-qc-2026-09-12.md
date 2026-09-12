# B02b1 photo/group QC — September 12, 2026

Implementation: `256a76f09fd7d22b604af8c66f59e8f53dbca22a`; base main `a122d70`; [PR #86](https://github.com/Bobanski/CellarSnap/pull/86), issue #81. [Contract](../remediation/b02b1-photo-group-contract.md), [handover](../remediation/handovers/batch-02b1.md).

## Result and boundaries

The application and targeted isolated database/Data API checks passed. AUD-01 remains Partial. The migration is **not deployed**, and the browser runs did not use the new SQL. They verify the changed application filtering against the existing production database using disposable fixtures. Post-rollout live metadata and complete Storage/anonymous-share acceptance remain required. No native acceptance is claimed.

## Automated checks

| Check | Result |
|---|---|
| `npm run test:unit` | 189 passed, including eight new photo/group policy and pre-sign tests. |
| `node scripts/qc/postgrest-photo-group-access.mjs /tmp/cellarsnap-review-runtime` | 54 HTTP assertions passed against temporary PostgreSQL 17.10 + PostgREST 16.3. Actual migration replayed; database removed afterward. |
| `npm run lint:web`; `npx tsc --noEmit` | Passed. Final web lint also includes the new integration runner. |
| `npm run lint:mobile`; `npm run typecheck --prefix apps/mobile` | Passed. |
| `npm run build` | Next production build passed. Built server starts; signed-out `/entries` redirects to `/login`. |
| Expo production web export | Passed with changed shared/mobile code. Only the existing NO_COLOR/FORCE_COLOR command warning. |
| `git diff --check` | Passed. Existing unrelated tsconfig formatting preserved. |

The SQL tests exercise captured policy definitions with real PostgreSQL roles/RLS rather than mocked authorization. Coverage: parent-plus-photo privacy; public/friends/two-hop/private entry rules; owner, ordinary, pending, tester, anonymous, missing-subject and backend roles; blocks in both directions; hidden anchors and members; null-anchor drafts; entry-less context; forged member/group/root/prefix references; owner updates/inserts/deletes and denied foreign writes; transactional rollout guards and replay; immediate anchor privacy revocation and pooled request isolation.

The shared filter regression proves that missing groups/entries never reach the signing request while permitted null-entry context and order are retained. The web resolver test verifies that only allowed/context paths are actually passed to the signer.

Remote implementation checks at `256a76f`: GitHub Web and Mobile jobs passed, as did the primary Vercel preview. Duplicate `Vercel – cellarsnap` failed (OPS-01); its new deployment logs were not fetched, so the prior missing-environment diagnosis is not represented as freshly reverified.

## Hands-on browser and Expo checks

Used the Codex in-app browser, Next development server on loopback 3001 and a freshly exported Expo production web app on loopback 8083. Expo API calls proxied to the local Next server; Supabase Auth/Data API/Storage used the existing live project. Only the existing designated ordinary E2E accounts A and B were used. No auth users, friendship graphs or capability flags were created/changed.

Fixtures: two synthetic entries owned by A (public anchor and private sibling), one event group, two entry photo rows and three slide/object paths. A null-entry place slide supplies context. The public anchor alone was temporarily feed-visible for the non-owner feed check; the private sibling stayed hidden. No messages, comments, reactions, notifications or shares were deliberately created. White 1px PNGs are synthetic delivery fixtures, not failed photo loads.

| Flow | Actual result |
|---|---|
| Web owner login, library, My Events search | Passed. Filtered to the synthetic group. Owner sees all three slides, including the private sibling. |
| Owner desktop carousel, 1365×900 | Passed. Next advances from the public wine to the private sibling with `2 of 3`. |
| Owner phone carousel, 390×844 | Passed. Dot navigation reaches the context photo with `3 of 3`; controls remain usable and layout fits the viewport. |
| Web non-owner feed, 390×844 | Passed. Only public wine and context images are rendered. No private wine image or third dot. Dot navigation advances `1 of 2` → `2 of 2`. |
| Web non-owner feed, 1365×900 | Passed with measured viewport and screenshot dimensions. Two photos only; Next advances to `2 of 2`. |
| Local API owner/non-owner group payload | Passed. A gets three slides; B gets two and no private sibling reference. |
| Expo owner Cellar → My Events, 390×844 | Passed for loading/rendering. DOM image checks found all three fixture photos, including the owner-only sibling; first wine caption and three dots visible. |
| Expo non-owner feed, 390×844 | Passed for loading/rendering. `1 of 2`; DOM image counts for public/private/context paths were `[1, 0, 1]`. |
| Direct private entry as B | Passed. Web says “Entry not found.” Expo says “Entry unavailable.” |
| Logout / protected redirect | Passed. Expo returned to sign-in. Web logout confirmed afterward against the built server: `/entries` redirects to `/login`. |

Gallery browser error/warning queries returned no records in the observed tab logs. Next server logs had no 5xx; the two 404 responses were the deliberately denied private entry and its photo endpoint. No source changes were required by these checks, so there was no implementation fix to retest.

## Coverage limits and existing findings

- `xcrun simctl list devices available` fails because `simctl` is not installed; no Android `adb`/emulator tool or installed Xcode/Android runtime was found. No native camera, permissions, storage, device rendering or touch acceptance.
- Expo grouped galleries use touch/horizontal scrolling with non-interactive dot indicators. The available desktop drag and horizontal-scroll attempts did not advance the owner event gallery. Rendering and filtered image counts passed; gesture behavior remains **unverified**, not passed and not a confirmed native defect.
- SQL role/HTTP tests use a targeted schema. The full migrated Supabase Auth + Storage + application stack was not run. New SQL remains unapplied live.
- Storage currently still grants broad authenticated read/sign access; anonymous share code signs through a service client; legacy fields and copied references remain AUD-01/B02b2. Do not interpret omitted gallery slides as complete object privacy or revocation of previously signed URLs.
- Existing QC-01 (raw mobile public ratings), QC-05 (Expo router group titles) and QC-06 (missing roles on controls) were visible. No fixes to those were inserted here.
- New **QC-08**: the web My Events card's `Open details` link uses the representative row ID even while another wine slide is selected. In the synthetic group, the public first slide's link targets the private sibling's detail. The context slide also falls back to that representative wine's caption. Source is unchanged `src/app/entries/page.tsx:299` / `:384`. See the canonical backlog for reproduction and acceptance. Mobile has a similar source pattern, but a selected-slide navigation mismatch was not interactively confirmed there.

## Evidence and cleanup

Screenshots (local-only, intentionally not committed):

- `/tmp/cellarsnap-b02b1-qc/web-owner-desktop.png` — 1365×900, private sibling selected.
- `/tmp/cellarsnap-b02b1-qc/web-owner-phone.png` — 390×844, context selected and `3 of 3`.
- `/tmp/cellarsnap-b02b1-qc/web-viewer-desktop.png` — 1365×900, non-owner two-photo feed.
- `/tmp/cellarsnap-b02b1-qc/web-viewer-phone.png` — 390×844, non-owner `2 of 2`.
- `/tmp/cellarsnap-b02b1-qc/expo-owner-phone.png` — 390×844, owner event gallery.
- `/tmp/cellarsnap-b02b1-qc/expo-viewer-phone.png` — 390×844, non-owner `1 of 2`.

The textual fixture/matrix description and checked-in SQL/tests preserve reproducibility if temporary screenshots/logs disappear. No credentials, tokens, private signed URLs or environment files were committed.

Cleanup was verified by exact fixture IDs and object downloads: both entries, group, three slides, two photo records and three uploaded objects were removed. Live aggregate counts returned to 384 entries, 34 groups, 107 slides, 64 profiles and four trusted testers. Normal app-derived caches/account activity can update during reads; no existing user content or privilege flags were edited. Browser tabs were closed, viewport overrides reset, and all temporary 3001/8083 servers stopped. Environment files were never changed.
