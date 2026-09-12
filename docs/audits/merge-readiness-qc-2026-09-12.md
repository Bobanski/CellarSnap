# PR stack merge review and QC — September 12, 2026

## Recommendation and scope

The changed code in [B01 PR #80](https://github.com/Bobanski/CellarSnap/pull/80) and [B02a PR #82](https://github.com/Bobanski/CellarSnap/pull/82) is ready for the owner's final review and ordered merge. No merge was performed; the owner explicitly reserved approval. This is not a claim that all application defects are fixed, every deployment check is green, or either SQL repair is live.

Reviewed the complete stack against main `778e43c3105f23b791153eb290091de4a6960de0`, including application/shared adapters, cache branches, migrations, manifest, tests, CI/tooling changes and documentation. B01 product code is at `37f183deaa5011ddcafe043ed15c223172f9f7cf`; B02a product SQL is at `50f9fc6d6ac9288f2cc0a5cdc4bfd7d314466afd`. Final local test changes are committed at `d6a6da7fef138e70559e3cb55640375eaa004e17`; subsequent readiness edits are documentation only.

No changed-product-code blocker was found. Added a reproducible, local-only real PostgreSQL/PostgREST integration runner and shared schema/seed fixtures. Preserved unrelated workspace changes. No new package dependency or production configuration was added.

## Review conclusions

- Score entry loading removes the invalid `quality_tier` selection while retaining wine type and classification fallback. Batch cache hits/terminal inputs avoid preference construction; explicit overrides cannot accidentally consume a sibling's cached score. Existing broader scoring parity/response-shape gaps remain AUD-10/11/12/29/30.
- Shared photo signing deduplicates paths, filters pending values, chunks by 100, retains per-object denial/missing results, and falls back individually on a batch-level error. Both adapters use the installed Supabase SDK's actual result shape. Lazy/unmounted images were not counted as failures.
- Explore uses the real variety relationship. Positive personal statistics, not only an empty state, passed with an owner-scoped disposable Cabernet fixture.
- The profile trigger is SECURITY INVOKER and evaluates the current database role. Read-only live ACL inspection found `create_test_account` executable only by postgres/service_role, not anon/authenticated; other inspected definer profile writers do not accept a caller-controlled test flag. Existing test flags/admin operations are preserved.
- The entry migration uses the captured deployed helper contract, checks the B01 guard, rejects unknown permissive SELECT/ALL policy drift, preserves ownership mutations and fails closed on malformed privacy. Copy/group/tag references do not confer original-row access. Trusted-test access is intentional current behavior, not an accidental new exception.
- Neither migration is a full schema replay. Photo-specific, Storage-object and group privacy plus public identity/rating projection remain later B02 work. The table policy protects rows, not individual columns on a visible row.

## Automated and build results

| Check | Actual result |
|---|---|
| `npm run test:unit` after final fixture refactor | 181 passed, including eight entry-policy tests and 56 app/database comparisons |
| `npm run lint` | Web and mobile passed with zero warnings |
| `npx tsc --noEmit` | Passed |
| `npm --prefix apps/mobile run typecheck` | Passed |
| `npm run build` with configured local environment | Production Next build passed; no placeholder-only build claim |
| `EXPO_PUBLIC_WEB_API_BASE_URL=http://localhost:8083 npx expo export --platform web --output-dir /tmp/cellarsnap-review-expo` in `apps/mobile` | Production Expo web export passed |
| `LC_ALL=C node scripts/qc/postgrest-entry-access.mjs /tmp/cellarsnap-review-runtime` | 41 HTTP integration assertions passed on native PostgreSQL 17.10 and PostgREST 16.3 |
| `git diff --check` | Passed |

The real HTTP runner starts its own loopback database/API, generates only synthetic users/JWTs, uses a two-connection pool, applies the actual B01 and B02a migrations twice, and tears down its processes/data. It accepts a runtime directory, never a database URL, and never reads project credentials. The PGlite and HTTP tests share fixtures whose `auth.uid()`/`auth.role()` understand the captured JWT claim settings.

HTTP assertions reproduce the pre-migration stranger leak, then verify owner, friend, friend-of-friend, stranger, pending friend, trusted tester, other tester, anon and service-role reads; missing subject and invalid token handling; 20 concurrent identities; both block directions; retained private ratings; parent-filtered photo metadata; copied-entry isolation; own-profile edits, capability insert/escalation/revocation denial and backend updates; own entry create/edit/delete, ownership-transfer denial and foreign mutation denial; public asset metadata reads, client write denial and backend writes.

**Coverage boundary:** this runs the affected schema/grants/helpers on real PostgreSQL/PostgREST, not the entire deployed Supabase schema or Auth/Storage service stack. Live is PostgreSQL 17.6; local replay is 17.10. Storage assertions exercise RLS on `storage.objects` through PostgREST, not Storage upload/sign/download HTTP. Browsers below use the unchanged live database through local production builds. Thus post-rollout full Supabase/Storage and app verification remain release checks.

## Hands-on browser and mobile fallback

Used the designated `E2E_USER_A` account. Production Next ran on 3001; a temporary loopback static server on 8083 served the production Expo export and proxied its API calls to Next. No environment files changed. There is no installed iOS simulator or Android emulator/adb runtime; Xcode selection is CommandLineTools. No native camera, filesystem, permissions or gesture acceptance is claimed.

Chrome's viewport override has a scaling factor on this host. Dimensions below are **measured CSS `innerWidth`/`innerHeight`**, not just requested settings. Screenshots include the host's scaled capture canvas.

| Flow/environment | Result |
|---|---|
| Web login and feed | Passed; real signed images loaded and Next photo control exercised. A full DOM includes lazy images; the visible card's carousel was tested. |
| Web Explore → Cabernet detail, 1365×900 | Passed empty state, then exactly 1 wine / 92.0 personal average from disposable fixture; community content rendered. |
| Web grape/private detail, 390×844 | Visually inspected; no horizontal document overflow. Correct private 92/100 rating and disabled Share. |
| Web editor privacy disclosure and save | Expanded privacy controls; Private selected. Saved only fixture notes; private visibility, rating and grape association retained. |
| Web Library search → owner detail | Filtered to one fixture and navigated successfully. Existing 50-row library count versus Expo's 72 during the fixture remains QC-03/AUD-34. |
| Web fixture deletion | Confirmation and deletion succeeded; navigated to library. Follow-up database counts confirm zero fixture entry, grape links, score rows and resolution logs. Grape page returned to empty state. |
| Expo production web login/feed at 390×844 | Passed signed-photo loading and Next photo; 32 loaded Storage images at inspected point. |
| Expo Cellar search → same fixture | One result, rating 92, saved web notes visible on mobile detail. |
| Expo entry detail at 320×750 | Visually inspected, no document overflow. Owner rating retained; missing grape details found (QC-07 below). |
| Logout/session recovery | Expo and web returned to sign-in; protected web navigation redirects. Expo's global sign-out invalidated the simultaneous web test session; library recovered after explicit reauthentication. |

Local screenshots: `/Users/esneider/.codex/visualizations/2026/09/12/01a09736-bd34-70b1-b2b7-c37ce71b72c2/merge-review-qc/` — `web-desktop-grape.png`, `web-phone-grape.png`, `web-phone-private.png`, `expo-phone-search.png`, `expo-320-private.png`. Screenshots are supporting evidence; these textual reproductions do not depend on them surviving.

The disposable fixture was private, hidden from feed, contained no real personal data and had no uploaded files. Created with the owner's authenticated client, edited/deleted via browser. Existing fixtures were not edited. Derived score refreshes are normal app behavior; no production policy or administrative flag mutation occurred.

## Errors, new evidence and residual findings

- **QC-07 / P1, new evidence in unchanged mobile detail code:** `apps/mobile/app/(app)/entries/[id].tsx:1029` queries `wine_entry_primary_grapes`. Live catalog has no such relation; direct authenticated request returns PGRST205. The canonical `entry_primary_grapes` fixture link exists and web displays it, while Expo detail says `PRIMARY GRAPES: Not set`. The same screen initializes its editor from this empty read and writes the canonical table, so unrelated mobile saves may discard existing grapes; this risk is source-confirmed but was not exercised against existing data. File is identical to main. Recorded separately for B08; not silently added to this privacy batch.
- **AUD-10 / additional resolver drift:** the fixture's web save succeeded but logged a fallback to stub resolution. The unchanged `aliasLookup.ts:164` selects nonexistent `grape_aliases.alias_type`; authenticated reproduction returns 42703, and live column catalog confirms its absence. Preserve the history of the fixed score-loader portion and keep this resolver/schema gap open in B07/B05. The sparse fixture's match display is an appropriate low-confidence state, not evidence of a successful full resolver.
- **QC-01/03/05/06 remain:** Expo publicly displays numeric ratings, count definitions differ, `(auth)`/`(app)` headers are visible, and several pressables lack button semantics. No native claim. Known QC-04 Google Maps async/deprecation warnings occurred in web editor. Chrome extension warnings/errors were attributed to extension URLs and excluded from app findings.
- Browser app console had Maps warnings, and the intentionally invalidated web session produced 401s until reauthentication. Server log had the resolver fallback above; no unreported clean-console claim. Expo app console had no app-origin errors in the inspected log; missing-table query errors are swallowed by its loader.
- **OPS-01:** the duplicate project `cellarsnap` (`prj_gmWfsDsFQ2AlcPhBH5myZdyzxUAr`) fails at `/entries/new` prerender with `Missing Supabase environment variables.` Confirmed from deployment `Dtt79wpzaCQPy9hZzu193dahWLo9` build logs. Working primary project is `cellar-snap`. Duplicate ownership/domain/rollback disposition is still open; no secrets were copied, project disabled or domain altered. This is a known failing deployment check, so the stack is not literally all-green.

## Release boundary

Approve and merge #80 before #82, retarget/rebase #82 as needed, and recheck the resulting head. Keep SQL manifest order: `20260912185640_protect_profile_capabilities_and_public_assets.sql` before `20260912200417_enforce_entry_read_privacy.sql`. Neither has been applied live. Code merge, code deployment, SQL deployment and live acceptance must be recorded separately. Prefer a targeted forward repair over restoring broad authenticated entry reads if rollout exposes a regression. See the [current handover](../remediation/handovers/merge-readiness.md).
