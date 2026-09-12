# Batch 1 browser and mobile QC — September 12, 2026

**Follow-up tracking:** the issues below are registered as QC-01 through QC-06 in the [canonical backlog](../remediation/backlog.md). See the [remediation hub](../remediation/README.md) for priorities, batches and fresh-session handovers.

## Result and scope

Targeted interactive QC completed on `codex/audit-remediation`, implementation commit `0e7acb0caad26f6d88e384b07ab563e5b394848f` (PR #80). No regression attributable to batch one was identified in the exercised flows. This is not full application or native-device acceptance: existing inconsistencies were found, and production policy validation remains outstanding.

Actual UI interactions used the computer-use browser tools, including rendered screenshots and DOM inspection. The run used the existing `e2e_user_a` account against the configured Supabase backend. Existing entries were read; no entries, photos, comments, reactions, friendships, or profile fields were deliberately created/edited/deleted. Opening Explore and palate/score pages can perform the application's normal background generation and cache writes.

## Environments

- Next.js development server on `localhost:3001`, running batch-one source with the existing local configuration.
- Chrome desktop, measured CSS viewport 2447 × 1294; responsive web at 390 × 844.
- React Native/Expo **web runtime**, authenticated at 390 × 844; owner entry and menu also inspected at 320 × 710. This exercises mobile React code in Chromium, not iOS/Android rendering or native modules.
- The Chrome profile's zoom affected requested versus actual viewport sizes. Sizes above were verified using DOM `innerWidth`/`innerHeight`, and horizontal document width was checked. Viewport overrides were reset afterward.
- No Xcode installation/simulator runtime, `simctl`, Android SDK/AVD, or `adb` was available. `xcode-select -p` points to CommandLineTools; `xcrun simctl` fails because the utility is missing. Native simulator testing was therefore unavailable.

Expo initially failed sign-in because its saved API URL pointed to an old LAN host on port 3000. A temporary local proxy on port 8083 routed `/api/` to Next and other paths to Metro on 8082. The mobile local environment was temporarily updated to that origin, Metro restarted, and login then succeeded. The environment file was restored byte-for-byte, temporary diagnostic code removed, and all three local servers stopped. No production CORS/auth configuration was changed.

## Interactive coverage

| Flow | Observed result |
|---|---|
| Web sign-in | Existing E2E credentials entered through the form; authenticated feed loaded. |
| Desktop feed photos | Signed photos rendered; photo carousel and navigation exercised. Lazy-loaded offscreen images were not counted as failures. |
| Phone feed | All/My Circle switched the heading and entries; dark theme and bottom navigation fit a 390px document without horizontal overflow. |
| Explore grape | Cabernet Sauvignon rendered its profile, photo, producers, and community pulse: 20 logs with nonempty QPR statistics. The repaired grape endpoint returned 200. Personal history correctly rendered its empty state for this account; a positive personal-grape fixture was not established in this run. |
| Phone Explore | Grape sections, chart, chips, and back navigation rendered at 390px; Small Growers loaded after its loading state. |
| Populated entry score | Public entry detail resolved to 18% match, 61% confidence, with sensory fingerprint and label photos. Reload reproduced those displayed values; score POSTs returned 200. This demonstrates presentation/reload consistency, not numerical calibration of the scoring algorithm. |
| Phone entry score | Same displayed score and confidence, readable stacked cards, no horizontal overflow. |
| Low-confidence owner entry | Existing synthetic private entry loaded with rating 85/100, disabled public sharing hint, Sparkling wine type, and the explicit “Match not ready yet” state. |
| Library search | Search for `Proof Private` narrowed the library to six matching existing entries. |
| Existing entry editor | Correct notes, rating, and private visibility hydrated; Cancel returned to the detail without saving. |
| Collections/menu | Collections empty state loaded; account navigation opened and routed correctly. |
| Expo authentication | Sign-in succeeded after correcting the temporary local API target. |
| Expo signed photos | All 28 image elements in the initial loaded feed had completed with nonzero natural width. Next-photo interaction visibly changed the first card's bottle photo; screenshots capture both states. This exercises the mobile shared-signing path with real storage. |
| Expo cellar/search/detail | Cellar loaded 71 entries; the same search returned six; an existing private entry opened with rating, no-photo fallback, and low-confidence match state. |
| Expo narrow layout | Private-entry content and bottom navigation fit 320px with document width equal to viewport width. |
| Sign-out/protected routes | Web and Expo returned to login. Navigating to web `/feed` and reloading a previously open private detail after logout both redirected to `/login`. |

## Findings outside the first patch

1. **P1 — Mobile social feed still displays numeric ratings.** The same public card showed the qualitative “Loved it” in web and `92/100` in Expo. The project's rating convention says raw ratings are private inputs and public surfaces should use qualitative bands. `apps/mobile/app/(app)/feed/index.tsx` uses `getFeedDisplayRatingLabel` from `packages/shared/src/feed.ts`. These files were unchanged by batch one. Unify the public display contract and review server projections as part of the pending privacy work.
2. **P2 — Web library shifts date-only consumed dates.** A synthetic entry appeared as July 7 in the web library but July 8 in both its detail and Expo. `src/components/palate/LibraryTab.tsx:48` constructs `new Date(iso)` then formats in the local timezone; a midnight-UTC date-only string shifts to the previous day in New York. The same implementation exists on consolidated main. Reuse a shared date-only formatter and verify in positive and negative UTC offsets.
3. **P2 — Profile/menu statistics disagree across surfaces.** For the test account, web profile showed one country while the menu/Expo cellar showed two; web menu showed two friends while the Expo menu showed zero. These are observed display inconsistencies, not a demonstrated backend data-loss issue. Reconcile count definitions and loading/fallback behavior before presenting the counts as equivalent.
4. **Existing warnings and Expo-web limitations.** Opening the web editor emits Google Maps synchronous-loading and legacy AutocompleteService warnings. Expo emits the deprecated `shadow*` style warning and displays router-group titles such as `(app)`/`(auth)`. Several mobile pressables lack explicit accessible button roles on web. These did not prevent the tested flows; native presentation remains unverified.

The “Their take / Seeking more” entry chip and the feed's “Loved it” label represent different fields (enjoyment intent versus rating), so their different wording was not classified as a scoring regression.

## Automated and backend coverage boundary

The implementation commit already passed 173 unit/route/PGlite tests, web/mobile lint and TypeScript, and a Next production build. GitHub web/mobile CI and the primary Vercel preview had passed. This UI-only follow-up made no lasting application-code changes, so those unchanged automated checks were not rerun merely to duplicate their results.

The batch-score helper currently has no active UI callers found in `src`; its all-hit early return, dependency-call suppression, direct-field precedence, and mixed/error cases remain covered by the route regression suite. A visible UI reload is not proof that a particular internal cache branch executed. Similarly, real signed-image loading complements, but does not replace, unit tests for duplicate paths, >100-path chunks, and partial/batch signing failures.

The profile capability/public-assets migration has **not been applied to production**. Its PGlite policy/role tests passed previously, but the browser session cannot validate an undeployed trigger or policy. Apply through the normal migration process and perform post-deployment checks before declaring the security findings remediated live.

No native camera/photo-picker, touch gesture, haptic, SecureStore, push notification, Safari/WebKit, physical device, production load benchmark, or complete CRUD/AI scan/chat acceptance suite was performed. Development timings include compilation and a browser profile with extensions; they are not production performance measurements.

## Runtime evidence and cleanup

Relevant authenticated API requests returned 200, including grape details, entry/photos, collections lookup, profile, and score. An expected notification 401 occurred while signing out. Browser logs also included extension-related warnings and message-channel closure errors; these were distinguished from the Google Maps/Expo warnings rather than claiming a completely clean browser console.

Local screenshots and sanitized HTTP status evidence are stored under:

`/Users/esneider/.codex/visualizations/2026/09/12/01a096dd-98d0-7153-ad28-a634fabd87fe/batch1-qc/`

Files: `grape-mobile.png`, `owner-entry-desktop.png`, `entry-mobile.png`, `web-feed-mobile.png`, `expo-feed.png`, `expo-carousel.png`, `expo-entry-small-phone.png`, and `http-statuses.txt`. Screenshots remain local rather than committing other users' visible feed content into the repository. Credentials and raw environment files are excluded from the report and retained evidence.

Both clients were signed out, viewport overrides reset, local servers stopped, and temporary mobile settings restored. Preexisting workspace changes and the separate nested worktree were preserved. The future-QC preference is saved in project `CLAUDE.md` and global `/Users/esneider/.codex/AGENTS.md`, using the [documented global instruction mechanism](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
