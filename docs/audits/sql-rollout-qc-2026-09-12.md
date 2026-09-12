# Live B01/B02a migration QC — September 12, 2026

Both reviewed migrations were applied to `rbmkypbqavmnuycznssv` after explicit owner authorization. This report supplements the [merge review](merge-readiness-qc-2026-09-12.md), not a replacement for its history. The [rollout handover](../remediation/handovers/sql-rollout-b01-b02a.md) maps repository files to deployment-time migration versions and records next work.

## Preflight and deployment

The project was ACTIVE_HEALTHY, PostgreSQL 17.6. All 24 affected live policies and six access helpers matched the tested baseline; the initial policy comparison needed only PostgreSQL array-string normalization. There were 384 entries and zero invalid/null privacy values. All 64 profile flags were fingerprinted without exporting profile contents; four trusted testers existed. The test-account creation RPC remained unavailable to anon/authenticated and available to service_role.

Applied the exact B01 file, verified its enabled SECURITY INVOKER trigger, removal of the two PUBLIC asset write policies and retention of public read, then applied B02a. The only entry SELECT is now `Users can view allowed wine entries`, targeted to authenticated and calling `can_view_entry((select auth.uid()), user_id, entry_privacy)`. Owner write policies remain unchanged.

| File | Remote version | SQL MD5 | File SHA-256 |
|---|---|---|---|
| `20260912185640_protect_profile_capabilities_and_public_assets.sql` | `20260912211719` | `4f690c3fb41c060a1bc41add57207abb` | `e5897ec8f79e1bd6d09ee2b1e0285dcb6bb841039d515e6b2df47fbaee9c9b4e` |
| `20260912200417_enforce_entry_read_privacy.sql` | `20260912211747` | `50fb651cc4595d5980b048a34568b7a8` | `5ca7d7451183c0819d8bbb9652f828adf019ec2a43deb760150531d312c5a1c8` |

The MD5 of each migration-history SQL value matches the exact local file bytes. The remote tool assigns versions at application time; this mapping prevents mistaken reapplication or history repair. No original migration was renamed or rewritten.

## Live API and Storage verification

Used existing designated E2E A/B accounts, both ordinary non-test-privileged accounts. Created four disposable A-owned entries (public/friends/friends-of-friends/private), hidden from feed, rating 92, with synthetic notes. Added two white 1px PNG label photos to the private entry and one separately named public-asset fixture. No new auth users or real-user entries were created/edited.

Thirty-five checks passed through actual Supabase HTTP and the deployed `https://cellarsnap.app` API:

- Owner reads all four entries and rating 92; B cannot read the private entry but retains public access; anonymous Data API sees none; backend sees all four.
- Ten concurrent owner/non-owner requests retain identity isolation. Owner sees two private photo metadata rows; B sees neither.
- Production owner entry API returns 200 and private rating 92; B private request returns 404, B public returns 200, anonymous returns 401.
- Owner can update a private fixture. B cannot update public or delete private fixtures. Owner cannot transfer ownership.
- Own-profile no-op name update succeeds; real authenticated capability escalation returns 42501 and leaves the flag false. Backend same-value update is allowed. Actual field-change behavior is separately verified in rolled-back SQL below.
- Both anon and authenticated clients can download the public asset but cannot upload, replace or upsert it. The backend can upload/replace it; public HTTP delivery remains 200.
- Owner bulk wine-photo signing returns two URLs, both actual downloads return 200, and owner wine-photo upsert remains available.

The first HTTP test pass mistakenly expected the production API's rating at the top level instead of its documented `entry` wrapper. Corrected this test-harness assertion and reran all 35 successfully; no application/migration change was needed. Temporary harness import setup was also corrected before any fixture creation. Neither was a production failure.

Eight additional assertions ran against the real database inside transactions ending in ROLLBACK: unblocked trusted tester reads the private fixture; tester capability revocation and privileged insert are denied; both owner→tester and tester→owner blocks deny that read; an authenticated profile name change succeeds; service_role can assign and revoke the capability. Actual field/relationship test changes were rolled back. Existing profiles, flags and relationships were not persistently altered.

Full friend/two-hop/copied-original permutations were already exercised in the isolated test suites. This live pass checked the actual unchanged helper definitions and the behaviors listed above; it does not pretend to have reconstructed every relationship graph over live HTTP.

## Hands-on web and mobile fallback

The web browser used the deployed `cellarsnap.app`, not a local Next server. The earlier production Expo web export used actual live Supabase plus an HTTPS proxy to the production API. No code or environment file was changed. Requested viewport settings were calibrated against actual CSS dimensions.

| Environment / flow | Actual result |
|---|---|
| Web Chrome 1365×900, account A | Login/feed and private fixture detail passed. Both signed PNGs loaded, carousel advanced, rating 92 stayed private and Share was disabled. |
| Web Chrome 390×844, account A | Notes edit/save succeeded; saved notes, private visibility, photos and 92/100 retained. No horizontal document overflow. |
| Web account B | Same private URL shows “Entry not found.” Public fixture opens normally; no owner editor is offered. |
| Expo production web 390×844 / 320×750, account A | Private detail opens, both signed photos load and web-saved notes/rating are visible. Layout inspected without horizontal overflow. |
| Expo account B | Private URL shows “Entry unavailable.” Public fixture opens normally. |
| Cleanup/session handling | Both browser sessions signed out, overrides reset, loopback Expo server stopped. |

No native iOS simulator or Android emulator/adb runtime is installed; Xcode selection remains CommandLineTools. This is Expo web fallback coverage, not native camera/filesystem/permissions/gesture acceptance.

Screenshots: `/Users/esneider/.codex/visualizations/2026/09/12/01a09736-bd34-70b1-b2b7-c37ce71b72c2/live-rollout/`:
`owner-desktop.png`, `owner-phone-after-save.png`, `nonowner-private-denied.png`, `expo-owner-320.png`, `expo-nonowner-denied.png`. The plain white label images are deliberate synthetic PNGs; loaded-image dimensions and HTTP downloads independently confirmed successful delivery.

## Errors, advisors and residual work

Production Vercel error-level logs from 21:17 UTC through the query returned zero records. Inspected Expo app logs had no app-origin warnings/errors. Web logged the existing Google Maps async/deprecation warnings (QC-04), plus two browser asynchronous message-channel listener errors on `/feed` with no corresponding server/request failure; their source was not established. Do not label this an entirely silent console.

Security advisor observations were identical before and after (44 across seven types): existing [definer view](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view), [mutable search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [extension placement](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), exposed definer functions, [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No new advisor observation was introduced. Existing findings stay in their planned batches.

This closes AUD-02/03's bounded defects. AUD-01 remains Partial: wine Storage SELECT and photo-specific/group authorization are not repaired by the entry policy. Existing public raw ratings (QC-01), identity projections, personal embeddings, missing mobile grape table and alias column remain separate work. Do not claim complete privacy remediation or infer private-object protection from a denied parent-row query.

## Cleanup and preservation

The owner deleted all four disposable entries after browser QC. Both photo records and all uploaded wine/public-asset objects were removed and verified absent through API and an independent database count. The entry count returned to 384; profile count remained 64 with four testers. The flags fingerprint remained `1732f025b055f58143ed175770ddbdff` before deployment, after deployment and after QC. Normal app-derived score-cache refreshes can occur during reads/edits; existing entry data and test-account settings were preserved.

No additional build or unit run was necessary for this deployment/documentation-only session: the exact SQL had already passed 181 unit/route/PGlite tests and 41 real PostgreSQL/PostgREST checks, and no product/test code was changed. Live checks above supply the previously missing production evidence.
