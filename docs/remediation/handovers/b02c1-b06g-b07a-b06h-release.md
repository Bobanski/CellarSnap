# B02c1 / B06g / B07a / B06h release — September 13, 2026

## Objective and IDs
Four bounded slices merged: qualitative mobile feed ratings (QC-01), reachable Expo feature/unfeature/clear controls (QC-16), grape resolver schema/provenance (AUD-10), and grouped-feed scroll/control repair discovered during QC (QC-08, scoped QC-06). All existing awards/features/theme retained. No migrations. [Implementation/QC checkpoint](b02c1-b06g-b07a-b06h.md), [sanitized evidence](../evidence/b02c1-b06g-b07a-b06h-qc.json).

## Resume here
Final product source on main is `1b3dff3`; all four PRs are merged and closed. The primary production deployment is successful; scoped live checks are recorded below. Mobile source is merged and exported, but native runtime/distribution is not complete. User permission to merge/close was **this session only**, and does not carry into the next session. Preserve design draft #75 and open issues #81/#104/#112.

Next: prioritize AUD-01 cache/delivery revocation and AUD-06/QC-01 public projections. For another bounded client correctness slice, QC-07's canonical grape read/retention is still open and can affect unrelated mobile edits. Do not treat the small presentation repair as privacy containment.

## State and decisions
- B02c1 reuses established enjoyment bands for ordinary/grouped mobile feed labels. Owner 1–100 input and storage remain. Numeric public Data API/feed payloads still require coordinated projection/privilege work; QC-01 stays Partial. AUD-06 remains Open: read-only hosted view definition still returns raw first/last names and test capability with no viewer filter.
- AUD-01 stays P0/Partial. Re-triage confirmed current [Smart CDN documentation](https://supabase.com/docs/guides/storage/cdn/smart-cdn) warns cached responses may outlive signed-token expiry until CDN cache expiry. Earlier measured cached-hit reproduction still applies. No immediate/global revocation claim, key rotation, object purge or policy relaxation. Define the intended revocation window and measure supported SDK/signed/transformed/old-client behavior before a delivery change.
- B06g preserves ordered modern selection while appending/removing one earned badge. Clear, cap five, write serialization, visible failure and load retry all work; failed writes retain confirmed state and server responses determine persistence. Both modern/legacy server authority remain unchanged; no award edits.
- B07a's actual typed grape join uses existing fields and derives exact/synonym provenance from canonical spelling. Raw ILIKE wildcard input is escaped; normalized aliases use equality. Missing ai_notes_summary, automatic mobile OCR and broad scoring parity remain AUD-10/B07.
- B06h fixes the separately reproduced feed case: wheel scrolling moved the photo without updating counter/caption/rating, and a second decorative dot row blocked the real controls. One named 44×44 control row and normal scroll tracking repair those paths. Native momentum/tap handling retained. Earlier B06d event-list fixes remain; broader feed-to-event detail routing was not certified here.

## Verification
- **388 isolated checks**, **12 schema checks**, database query compile contracts, web/mobile types/lint, Next production build, and Expo web/iOS/Android exports passed. Final B06h adds fresh mobile types/lint and exports. All four PRs' web/mobile CI passed; CI also includes dependency/tooling contracts. Exact application candidate `7fd0634`; final mobile candidate `4c0383f`; docs-only checkpoint `cc404bb` passed CI before merge.
- Desktop **1440×1000** and phone **390×844** actual Chromium UI: web/Expo login and public feed bands, All/My Circle, Expo wheel to slide 2, dot to slide 3, Enter to slide 1, updated displayed selection/caption/rating. Screenshots reviewed after visible photos loaded. Some offscreen/lazy images remained pending; measured completed images had no failures. This is not full gallery-loading acceptance. Existing Expo router titles (QC-05), single-photo gaps (QC-12) and broader control work (QC-06) stay open.
- Expo badge feature/append/reload, injected 503 retention, retry, remove preserving another pick, all five selected, clear/reload, detail/back, load failure/retry all passed at both sizes. Delayed writes disable other controls; one request observed. Loopback proxy strips cookies; bearer headers observed. Original complete badge response, featured selection and historical awards restored and compared. Only four deliberately injected 503 console errors; no page exceptions.
- Hosted actual resolver: old query 42703 reproduced; five canonical/provenance cases and four unmatched cases passed, including wildcard inputs. Local and **production** desktop/phone private-fixture edit/save/reload returned 200, retained 92 and Syrah, and wrote exact-resolution logs rather than stub fallback. Production save verification ran on `ed28bbd`, whose web source is unchanged by mobile-only B06h. Temporary entries, grape links and resolution logs removed; exact award IDs/timestamps unchanged. Final aggregate query finds zero editor fixtures.
- Existing Maps loader/legacy Places warnings remain QC-04. WebSocket close warnings occurred during route/context transitions; no final editor page exceptions. Native inventory still has no Xcode/simctl or Android SDK/emulator. Exports/Expo web do not establish native runtime or binary/OTA acceptance.

## Release state
| Slice / PR | Source | Merge / UTC |
|---|---|---|
| B02c1 / [#121](https://github.com/Bobanski/CellarSnap/pull/121) | `2fafda2` | `6c28498` / 18:37:03 |
| B06g / [#122](https://github.com/Bobanski/CellarSnap/pull/122) | `e8e9cc0` | `668dcc3` / 18:37:20 |
| B07a / [#123](https://github.com/Bobanski/CellarSnap/pull/123) | `7fd0634` | `ed28bbd` / 18:37:40 |
| B06h / [#124](https://github.com/Bobanski/CellarSnap/pull/124) | `4c0383f`, docs `cc404bb` | `1b3dff3` / 18:39:30 |

Primary final product [deployment](https://cellar-snap-i3p13tuqn-eitan-sneiders-projects.vercel.app), GitHub deployment `6425046728`, success **18:39:52 UTC**, [live site](https://cellarsnap.app). Final source is `1b3dff365fc8ec4e2117ef1035b763a0b3a70c40`. Separate release documentation follows in a docs-only PR; a docs-only deployment does not change the tested application source.

Final production smoke after `1b3dff3`: cookie-authenticated badges, profile summary and Shiraz→Syrah lookup return 200; badge response matches the original baseline; phone feed and sign-out pass with no page exceptions. Bounded error-log query since 18:39:52 UTC returned zero records, not a claim about unrelated flows.

Both web/mobile CI and primary previews passed. Duplicate Vercel project remains OPS-01; current failed preview logs explicitly show Missing Supabase environment variables. No routing/deployment project changes were made. No SQL, native binary or OTA deployed. Rollback is source-only and should retain all previously deployed database privacy/award authority; avoid restoring numeric public labels or resolver stub fallback.

## Workspace and environment
Original tsconfig.json and user untracked reports preserved byte-for-byte; AGENTS.md and nested `.claude` worktree untouched. No environment files changed. Temporary Next 3001 and Expo/proxy 8083 are session-only and stopped at handoff; authenticated QC states removed after cleanup. Optional screenshots/logs/scripts under `/tmp/cellarsnap-next-batches` are not prerequisites for resumption. Credentials and raw personal data are excluded from repository evidence.

## Next slice
1. AUD-01: specify/measure a real cache/delivery revocation contract; previous signed/CDN capabilities cannot be called revoked by a fresh RLS denial.
2. AUD-06/QC-01: deliberate public identity and rating projection/access fixtures, owner/friend/block/test/anonymous and supported clients, then coordinated code/SQL. Raw identity and numeric payload issues remain open despite presentation improvements.
3. QC-07: typed canonical mobile grape reads, explicit failure handling and notes-only edit retention, verified with disposable multi-grape fixtures. Then continue B07 scoring/ai_notes_summary, supported schema/type adoption and deferred badge semantics/history as separate slices.
4. Native acceptance/distribution remains a real outstanding requirement for the mobile/date/count/badge/dependency changes. No finding is closed based on exports alone.
