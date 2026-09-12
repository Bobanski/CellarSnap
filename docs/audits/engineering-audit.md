# CellarSnap Engineering Baggage Audit

Repo: `/Users/esneider/Projects/Claude-OS/projects/cellarsnap`, branch `feat/overhaul` (== latest `main`).
Scope: read-only audit. Live prod DB (`rbmkypbqavmnuycznssv`) queried read-only via Supabase Management API for row counts, index coverage, RLS/grants, and `pg_stat_statements`. Does not re-report the perf pass that just landed (batched profile prefetch within a request, bulk cache writes, parallel OCR, parallelized entry post-processing) except where a related-but-distinct gap remains.

Current live scale, for context on all "at scale" claims below: `wine_entries` 339 rows, `profiles` 61 rows, `wine_notifications` 57 rows, `friend_requests` 54 rows, DB total size 99 MB. Everything here is about what breaks on the way from here to real usage, not what's already broken today.

---

## MUST-FIX (before serious users)

### M1. RLS disabled + `anon` role has INSERT/UPDATE/DELETE/TRUNCATE on 14 reference/taxonomy tables
**Where:** `aging_curve_baselines`, `appellation_grape_map`, `base_profiles`, `classification_tier_aging_modifiers`, `classification_tier_modifiers`, `grape_sensitivity_coefficients`, `producer_aliases`, `producer_modifiers`, `producer_region_crosswalk`, `region_aliases`, `taxonomy_classification_tiers`, `taxonomy_master_v2`, `taxonomy_price_ranges`, `vintage_weather_modifiers`. Confirmed via `pg_class.relrowsecurity = false` for all 14, and `information_schema.role_table_grants` shows `anon` and `authenticated` both hold `INSERT/UPDATE/DELETE/TRUNCATE` (not just `SELECT`) on every one.

**Why it matters:** the Supabase anon key is public by design (shipped in every client bundle as `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Right now anyone who extracts that key — trivial from the shipped JS — can `POST`/`PATCH`/`DELETE`/`TRUNCATE` directly against these tables via PostgREST, no auth required. These tables feed the just-shipped AI palate/scoring engine (`producer_modifiers`, `base_profiles`, `vintage_weather_modifiers`, taxonomy tiers). A malicious or careless anon-key request could corrupt or wipe the data the recommendation engine runs on for every user, silently, with no audit trail (see O-observability findings below — nothing would even notice).

**Fix:** these are curated/CSV-seeded reference tables (README: "prefer CSV uploads... never dozens of migration pushes for seed data") — the app has no legitimate client-side write path to them. Either (a) `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON <tables> FROM anon, authenticated;` and keep `SELECT` (simplest, matches actual usage), or (b) enable RLS with `SELECT`-only policies for `anon`/`authenticated` and no write policies. Writes stay service-role/migration-only, as they already are in practice.

**Effort:** S (one migration). **Risk:** Low — no app code path writes to these tables (grep confirms all app reads are `.select()`), so revoking write grants shouldn't break anything.

### M2. Three AI-cost routes call OpenAI/Anthropic with zero rate limiting
**Where:**
- `src/app/api/cellar/map-columns/route.ts:145-146` — `openai.chat.completions.create`
- `src/app/api/explore/[type]/[slug]/route.ts:278-295` and `:591-594` — `openai.images.generate` (image generation — the most expensive OpenAI call type) and `openai.chat.completions.create`
- `src/app/api/list-scan/recommendation-notes/route.ts:309,473` — both OpenAI and Anthropic (`anthropicToolCall`)

None of these are in README's documented rate-limited list, and none call the existing `applyRateLimit` helper (confirmed present and correctly used in `palate/distill/route.ts:61` and `sommelier/chat/handler.ts:75` — those two are just missing from the README, not missing rate limiting).

**Why it matters:** unbounded per-request AI spend on routes reachable by any authenticated user (or, depending on route, possibly unauthenticated — verify per-route). `openai.images.generate` in particular has no cheap floor.

**Fix:** apply the same `applyRateLimit` pattern already used elsewhere. Mechanical, ~30 min per route.

**Effort:** S. **Risk:** Low.

### M3. No crash reporting / error monitoring — failures are invisible in production
**Where:** repo-wide. No Sentry/Bugsnag/Rollbar/Datadog/LogRocket anywhere in `package.json` or code. No `@vercel/analytics` or `@vercel/speed-insights`. `next.config.ts` (12 lines) has no error-reporting wiring. Logging is 9 `console.error` + 7 `console.warn` + 21 `console.log` calls total across `src/`, no centralized logger, no log levels, no correlation IDs.

**Why it matters:** combined with M4 below, this means entire subsystems (badge awarding, the scoring engine) can silently break for all users and nobody finds out until a user complains. Pre-serious-users is exactly the point to fix this — it's cheap now, expensive to retrofit after an incident with no trail.

**Fix, in priority order:**
1. **(S)** Confirm Vercel's own Runtime Logs are actually being watched — already free, zero code changes, captures the existing `console.*` output.
2. **(S)** Add `@sentry/nextjs` via its Next.js 16 setup wizard — auto-instruments route handlers/middleware, catches unhandled exceptions immediately.
3. **(M)** Thin `src/lib/logger.ts` wrapping `console.*` + `Sentry.captureException`, retrofit the worst offenders in M4.
4. **(S)** Start actually using Supabase's own logs/advisors (`mcp__supabase__get_logs`/`get_advisors`) for DB-level errors (e.g. RLS denials) that never reach the app layer.

**Effort:** S for steps 1-2 (a day), M for full retrofit. **Risk:** Low.

### M4. Silent-swallow catch blocks that would mask systemic (not per-user) failures
The worst offenders — ones where a silent failure hides a bug affecting *everyone*, not just graceful degradation of an optional feature:
- `src/server/badges/evaluator.ts:56-64` (`loadBadgeDefinitions`) — a broken `require("@shared")` returns `[]` silently. **No badges would ever award, for any user, with zero signal anywhere.**
- `src/server/algorithm/persistEntryResolution.ts:181-185` — if the core sensory-resolution algorithm throws, it silently falls back to `createStubResolution(input)`. A systemic bug in the just-shipped scoring engine would degrade every score to a stub with no log line.
- `src/app/api/entries/handler.ts:731-734` — badge evaluation after entry creation, bare `catch { /* best-effort */ }`, not even a `console.error`.
- `src/server/algorithm/persistEntryResolution.ts:221-231` — the resolution audit-log write is also silently swallowed ("logging is best-effort"), so the one place you'd go to debug M4's other issues can itself silently go dark.

These aren't wrong to be best-effort/non-blocking — that's the right call for UX. The bug is zero visibility when they trip. Pair with M3: once a logger exists, these become one-line changes.

**Effort:** S once M3's logger exists. **Risk:** None (adding a log line to an existing catch).

### M5. `wine_notifications` unread-count query has no supporting index, and is polled every 25s per open tab
**Where:** `src/components/AlertsMenu.tsx:288` — `window.setInterval(() => refreshCount()..., 25000)`, backed by `src/app/api/notifications/route.ts`, which queries `wine_notifications WHERE user_id = ? AND seen_at IS NULL`.

**Grounded in live data, not speculation:** `pg_stat_statements` shows this exact query pattern at **223,016 + 26,177 + 15,471 ≈ 264,600 calls** already, against a table with only 57 rows today. `wine_notifications` has exactly two indexes — `pkey` and a `(user_id, entry_id, type)` uniqueness index — neither covers `(user_id, seen_at)`. It's cheap now (0.25ms mean) purely because the table is tiny; the access pattern (unindexed filter, hit every 25s by every open browser tab) does not scale with user count or notification volume.

**Fix:** add a partial index `CREATE INDEX ON wine_notifications (user_id) WHERE seen_at IS NULL;` (or `(user_id, seen_at)`). Separately, CLAUDE.md already says notifications have realtime subscriptions available — consider switching the 25s poll to realtime-primary with a much longer poll as a fallback (the code comment at `AlertsMenu.tsx:284` already says "Realtime is best-effort; polling/focus are the fallback" — worth checking whether realtime is actually wired up or whether polling is silently doing all the work).

**Effort:** S for the index, M for reducing poll reliance. **Risk:** Low (additive index); Medium for the realtime-primary switch (behavior change, needs testing).

### M6. Reference/taxonomy tables refetched via unfiltered `SELECT *` on every scoring request — no cross-request cache
**Where:** `src/server/algorithm/profileAssembly.ts:786-864` (`listBaseProfiles`, `listGrapeSensitivityCoefficients`, `listClassificationTaxonomy`, `listClassificationTierModifiers`, `listProducerModifiers`, `listProducerRegionCrosswalk` — all plain `.select("*")` with no caller-side memoization), invoked fresh via `createSupabaseProfileAssemblyDataSource` from **6 separate call sites**: `src/app/api/algorithm/score/handler.ts:308-309`, `src/app/api/algorithm/score/batch/handler.ts:326`, `src/server/algorithm/resolveEntrySensory.ts:118-120`, `src/server/algorithm/cacheRefresh.ts:69-74`, `src/app/api/list-scan/recommendation-notes/route.ts`, `src/server/listScan/parse.ts`.

**This is distinct from, not a re-report of, the July 7 perf pass.** Commits `090cea5` and `3472229` added `batchPrefetchProfileData`, which correctly deduplicates these reference-table fetches *within* a single request/batch (was previously N+1 per wine). What's still missing is caching *across* requests — every new HTTP request to any of the 6 call sites above pays the full fetch again, even though this data is static, CSV-seeded reference data that rarely changes.

**Grounded in live data:** `pg_stat_statements` currently shows the unfiltered `producer_modifiers` select as the **single largest query by cumulative DB time in the whole database** (excluding internal Realtime/session-setup queries): 13,338 calls, 146ms mean, **~32.5 minutes of cumulative execution time** — against a 705-row, 824KB table. `vintage_weather_modifiers`, `base_profiles`, `entry_photos`, `entry_primary_grapes` show the same shape at smaller magnitude. This is the top live cost signal in the DB today, on a nearly-empty dev/test dataset, feeding the feature the team just shipped.

**Fix:** wrap `createSupabaseProfileAssemblyDataSource`'s reference-table reads in a short-TTL in-process cache, or use `unstable_cache` from `next/cache` (already a known pattern in this codebase — `src/lib/shares.ts:388` uses it) with a tag-based invalidation path for the rare admin update.

**Effort:** M. **Risk:** Low-Medium (need a deliberate invalidation story if these tables are ever edited outside of migrations/CSV re-seed — worth confirming with the team whether that ever happens).

### M7. CLAUDE.md's rating-scale claim is wrong, not stale-in-part
**Claim:** CLAUDE.md: "Rating scale is 1–5 (not 1–100, not 10-point)."
**Reality, verified end to end, consistently:**
- DB: `supabase/sql/001_init.sql:10` — `rating int check (rating between 1 and 100)`
- Shared Zod schema: `packages/shared/src/entries.ts:109-129,165` — `requiredRatingSchema` is `.int().min(1).max(100)`
- Web form: `src/features/entries/new/NewEntryScreenContainer.tsx:4107` label `"Rating (1-100)"`, validated 1-100 at `:4117-4128`; same in `EditEntryScreenContainer.tsx:2138`
- Mobile form: `apps/mobile/src/screens/entries/NewEntryScreenContainer.tsx:2850-2851`, same shared schema
- Display: `src/components/RatingBadge.tsx:35,46` renders `"{n}/100"`
- Public share pages: `src/lib/shares.ts:159`, `src/app/s/[shareId]/page.tsx:242`, `opengraph-image.tsx:181`

No `/80`, `*20`, or `/100*5`-style conversion exists anywhere — there is no inconsistency in the running app. The genuinely separate 0-100 **algorithm match score** (`wine_entry_scores.match_score`, surfaced as "% match") is correctly not a "rating" and doesn't conflict with anything.

**Why MUST-FIX despite being "just docs":** this is exactly the kind of stale doc that causes real damage — an agent or dev asked to "make the rating scale 1-5 per CLAUDE.md" would break a fully-consistent, correctly-implemented 1-100 field across DB/shared/web/mobile/share surfaces. The blast radius of leaving it wrong is a bad future migration, not a bad audit.

**Fix:** edit `CLAUDE.md` line 52 to "Rating scale is 1-100 (int)" and note the separate 0-100 algorithm match score isn't a "rating." **Effort:** S (one doc line). **Risk:** None.

---

## SHOULD-FIX

### S1. Compatibility fallback paths — real cost, not uniformly dead code
`executeSelectWithFallback` (`src/server/db/compat.ts:107-152`) has **25 call sites across 11 files** (`api/home/route.ts` x3, `api/entries/handler.ts`, `api/comments/[id]/route.ts`, `api/entries/[id]/comments/route.ts` x4, `api/palate/route.ts`, `api/algorithm/score/handler.ts` x2, `api/users/[id]/route.ts`, `api/profile/route.ts`, `api/feed/route.ts` x3, `api/users/route.ts` x2, `server/algorithm/cacheRefresh.ts`, `server/listScan/parse.ts`), plus a write-path sibling `executeWithColumnFallback` in `entries/handler.ts:542` and `profile/route.ts:679`, plus the `can_view_entry(...,privacy text)` overload chain spread across `supabase/sql/004,015,019,027,029,030,034,041_*.sql`.

**Mapping each guarded column to its introducing migration shows they are not uniformly dead**: columns like `avatar_path`(013), `comments_scope`(029), `deleted_at`(030), `is_feed_visible`(025) predate the README's declared baseline (`036_apply_friend_transition.sql`) and so should be safe to prune now. But `drinking_now`(042), `entry_group_id`(045/090), `entry_status`(065), `classification`/`canonical_*`(049/050) postdate 036 — the code effectively treats the real baseline as closer to `090_collections.sql`, contradicting the README. Cost of keeping all of them: up to 3 sequential extra round-trips per cache-miss tier at some call sites (e.g. `feed/route.ts:271`), plus real code-complexity/readability tax.

**Fix path:** (1) prune the pre-036 fallback branches now — dead per the stated baseline; (2) fix the README to state the real effective baseline (~090); (3) before removing the post-036 branches, confirm via `/api/health/schema` (already exists, `src/app/api/health/schema/route.ts` → `src/lib/schemaHealth.ts`) run against every environment that still needs them — it currently isn't wired into CI or monitoring anywhere.

**Effort:** M. **Risk:** Medium (removing the wrong branch breaks any environment not yet on the real baseline — gate on evidence, not assumption).

### S2. API auth pattern inconsistency (not a hole, but a debt trap)
53/79 routes use the documented `requireRequestAuth`. **19/79 hand-roll `createSupabaseServerClient()` + `supabase.auth.getUser()` + manual 401** instead: `friends/route.ts:9`, `friends/suggestions/route.ts:14`, `friends/requests/route.ts:31`, `friends/requests/count/route.ts:8`, `notifications/route.ts:108`, `notifications/[id]/route.ts:13`, `notifications/mark-seen/route.ts:8`, `profile/route.ts:409`, `profile/avatar/route.ts:14`, `profile/badges/route.ts:10`, `grapes/route.ts:51`, `feed/route.ts:135`, `users/route.ts:34`, `algorithm/backfill-sensory/route.ts:19`, `entries/[id]/reactions/route.ts:15`, `entries/[id]/photos/route.ts:44`, `entries/[id]/photos/[photoId]/route.ts:29`, `entries/bulk-publish/handler.ts:30`. All still correctly reject unauthenticated requests, so this is consistency debt, not a live vulnerability — but it's the kind of pattern a future copy-paste route is most likely to get wrong by omission.

**Fix:** mechanical swap to `requireRequestAuth` across the 19 files. **Effort:** M. **Risk:** Low.

### S3. No shared error-response envelope
Dominant shape is `{ error: string }` (261 occurrences), but `entries/[id]/comments/route.ts:384` returns `{ error: payload.error.flatten() }` (an object, breaking any client code expecting a string), and a second `{ error, code }` shape appears in `friends/requests/*` and `feedback/route.ts:95-101`/`phone-check/route.ts:56-61`. `comments/[id]/route.ts:91,111,123,155,168` collapses nearly every failure mode — validation, not-found, DB error — to `status: 500`.

**Fix:** define one error envelope helper, migrate routes opportunistically. **Effort:** M. **Risk:** Low.

### S4. Unvalidated request bodies on at least one write path
`src/app/api/taste-survey/route.ts:53-81` — `request.json()` cast to a TS type with no runtime validation (zod or otherwise), fields spread with `??` defaults straight into a `.upsert()`. Most other routes without a local zod import actually delegate to a zod schema in a `server/*/schema.ts` handler (e.g. `entries/handler.ts:10,368` via `createEntrySchema.safeParse`), so this isn't as widespread as a raw "28/79 import zod" count suggests — but this specific route is a real gap.

**Fix:** add a zod schema for the taste-survey payload; audit for siblings. **Effort:** S per route. **Risk:** Low.

### S5. Testing has no CI gate at all, and the 3 known-failing tests are confirmed test-drift (not real bugs)
No `.github/workflows` exist anywhere — nothing blocks merging code that breaks any test. Ran `e2e/phase6-route-handlers.spec.ts` live against a running dev server: 8 pass, 3 fail deterministically, all from routes that legitimately gained fields/logic the hand-rolled Supabase mocks weren't updated for:
1. **share** (`e2e/phase6-route-handlers.spec.ts:56`) — asserts `select("id, user_id")`; route now selects `"id, user_id, entry_privacy"` (`src/app/api/share/handler.ts:109`) for the new `canManageEntryShare` privacy gate (`:124`).
2. **partial-save** (`:834-843`) — expects `persistEntryResolution` input without `primary_grapes`; route now passes `primary_grapes: []` (`src/app/api/entries/[id]/putHandler.ts:470-473`).
3. **bulk-group** (`:487`) — asserts `select("id, mode, title, anchor_entry_id")`; route added `event_type` (`src/app/api/entries/bulk-group/handler.ts:123`, schema at `:25`).

Fixes are one-line mock updates each. The deeper issue is the brittle exact-`select()`-string assertion pattern this whole file uses, which will keep breaking on every legitimate schema addition.

**Also:** CLAUDE.md's "Testing: Playwright (e2e), Vitest (unit)" is pure aspirational drift — vitest was never installed (no config, no dep, no CI reference, confirmed via `git log --all -S vitest -- package.json` returning nothing). The "unit tests" (`npm run test:routes`) are actually Playwright specs requiring a full browser + dev server boot — itself a smell (slow, heavyweight for what should be fast unit tests).

**Fix:** fix the 3 mocks (S), correct CLAUDE.md's testing claim (S), stand up a minimal CI workflow that at least runs lint + the route-handler suite on PRs (M-L, needs a way to boot a test DB/dev server in CI).

**Effort:** S (tests) / M-L (CI). **Risk:** Low.

### S6. E2E coverage gap on the two flows that matter most: photo-scan entry creation and signup
13 spec files exist, roughly half real browser E2E and half handler-level tests riding on Playwright. **Zero coverage** of: entry creation via photo → autofill → save (the only tested creation path is manual form-fill, `e2e/happy-paths.spec.mjs:128-134`; `label-autofill`, `photo-context`, `photo-crop` have zero references anywhere in `e2e/`), and signup/registration (only login is exercised, `e2e/happy-paths.spec.mjs:14-22`; `auth/resolve-identifier` also untested). List-scan and pocket-sommelier have solid handler-level coverage but no browser-level journey. **43 of ~94 route/handler files have zero test references anywhere**, including all of cellar import, collections, notifications, badges, explore, and palate.

**Fix:** prioritize one browser-level happy-path test for photo-scan entry creation and one for signup — these are the highest-value gaps given they're the core product loop and the security-sensitive account-creation path, respectively. **Effort:** L. **Risk:** Low (pure addition).

### S7. FK columns with no covering index
`wine_entries.cellared_from_id`, `wine_notifications.entry_id`, `wine_notifications.actor_id`, `entry_reactions.user_id`, `friend_notifications.friend_request_id`, `friend_notifications.actor_id`, `content_reports.entry_id`, `content_reports.comment_id`, `content_reports.target_user_id`, `user_collection_items.entry_id`, `user_collection_items.snapshot_entry_group_id`. Harmless at current row counts; will cost you on joins, cascading-delete checks, and moderation queries as tables grow. `entry_reactions.user_id` and the `content_reports` columns are the ones most likely to be hit by a real query pattern soon (reaction toggling, moderation review).

**Fix:** one migration adding standard btree indexes. **Effort:** S. **Risk:** Low.

### S8. RLS policies using unwrapped `auth.uid()` — the standard Supabase perf anti-pattern
56 of 82 policies call `auth.uid()` directly in the `USING`/`WITH CHECK` clause instead of `(select auth.uid())`, including on the hottest tables: `wine_entries` (view/update/delete), `wine_notifications` (view/update), `friend_requests` (view/update), `entry_photos`, `entry_reactions`. Unwrapped, Postgres re-evaluates the function per row instead of once per query (this is Supabase's own documented `auth_rls_initplan` advisory pattern). Negligible today at these row counts; becomes a real per-query tax as `wine_entries`/`entry_photos` grow into the thousands-per-user range.

**Fix:** mechanical rewrite of the 56 policies to wrap `auth.uid()` in a scalar subquery. Same semantics, meaningful win at scale. **Effort:** M (one migration, needs care not to change policy logic). **Risk:** Low.

### S9. Missing `updated_at` triggers on 7 tables
`api_rate_limits`, `entry_comments`, `entry_groups`, `palate_profiles`, `taste_survey_responses`, `user_collections`, `wine_entry_scores`. Note `wine_entry_scores` is actually fine in practice — `scoreCache.ts` sets `updated_at` manually on every write it performs — but that makes it fragile (any other write path, e.g. an admin backfill, silently skips it). The other 6 have no such app-level discipline visible.

**Fix:** standard `BEFORE UPDATE` trigger migration, applied uniformly. **Effort:** S. **Risk:** Low.

### S10. `src/proxy.ts` middleware DB query on (almost) every navigation
`src/proxy.ts:116-120` — `supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle()` runs on every request to `/`, `/feed`, `/friends`, or non-shared `/entries/*` for a logged-in user who isn't already on `/profile`, plus `supabase.auth.getUser()` (`:46`) on every matched request. Individually cheap (PK lookup), but it's an unconditional synchronous Postgres round-trip inserted into the middleware critical path of nearly every protected-route navigation for every user, forever — there's no caching once a user has completed onboarding.

**Fix:** cache "has completed username setup" as a short-lived cookie/session claim set once at profile completion, checked by middleware without a DB hit; fall back to the DB check only if the claim is missing. **Effort:** M. **Risk:** Low-Medium (needs correct invalidation if `display_name` can ever be cleared).

### S11. `packages/shared` boundary erosion on badge types (real drift, not just duplication)
Canonical types live at `packages/shared/src/badges.ts:3-25` (`BadgeCategory`, `BadgeTier`, `BadgeShape`, `BadgeColor`, `BadgeAccentColor`, strict string-literal unions). Web redeclares its own copies at `src/features/badges/BadgeIcon.tsx:5-25` (correctly typed but disconnected — a new badge added to `badges.ts` won't type-check here until manually mirrored). **Mobile is worse**: `apps/mobile/src/components/BadgeIcon.tsx:5,23-28` types `shape`/`color`/`accent`/`tier` as plain `string`, losing all compile-time safety entirely. CLAUDE.md's rationale for two separate `BadgeIcon.tsx` files (SVG can't be shared across React/RN) is sound — but the *type* definitions backing them don't need to be duplicated, only the rendering.

**Fix:** both `BadgeIcon.tsx` files import the type unions from `@shared`/`@cellarsnap/shared`, keep only the SVG-rendering logic local. **Effort:** S. **Risk:** Low.

### S12. `src/server/listScan/parse.ts` — 3,912-line monolith, decomposition proposed
Confirmed 3,912 lines via `wc -l`. Public API surface is narrow — only `src/app/api/list-scan/parse/handler.ts:5-8` imports from it in production code (`detectListScanSourceType`, `parseWineListSource`), plus a test-only `__listScanTestUtils` export (`:3878`) exercising 10 internal helpers from `e2e/ws3-list-scan.spec.ts`.

**Proposed decomposition** (natural seams by line range):
1. `1-277` — constants/regex/`responseSchema` (shared across all source types)
2. `374-932` — deterministic wine-type/varietal inference (`applyInferenceToWine` etc. — **name carefully**, there's already a separate DB-driven `server/listScan/inference.ts`, avoid collision)
3. `939-1358` — row normalization/cleanup/merge-split-title logic
4. `1606-1968` — enrichment/scoring + memoization helpers
5. `1985-2413` — OpenAI structured-response wrapper (`createStructuredResponse`, load-bearing shared dependency for PDF/image/URL paths — extract this interface first) + Cloud Vision OCR
6. `2429-2798` — PDF-specific extraction/recovery
7. `2798-3638` — HTML/URL extraction + heuristic fallback
8. `3769-3912` — thin orchestrator composing the above

No problematic module-level mutable state found (each OpenAI client is created fresh per call). This should be a pure move-and-re-import with no behavior changes, gated by the existing `e2e/ws3-list-scan.spec.ts` before/after.

**Effort:** M/L. **Risk:** Medium-High — it's the multi-bottle list-scan critical path; even a clean extraction risks import-order or regex-scoping regressions, so treat as one PR, no logic changes, tests must pass unchanged before/after.

### S13. Two ~4,000-6,000-line client components for the entry-creation/edit flow
`src/features/entries/new/NewEntryScreenContainer.tsx` (4,788 lines) and `src/features/entries/edit/EditEntryScreenContainer.tsx` (3,069 lines). Imports checked clean (no unexpectedly heavy libs pulled in statically), so this isn't a proven bundle-bloat issue today — Next.js code-splits per route — but it's a real maintainability risk on the app's most important screen, and worth a bundle-analyzer pass on the `/entries/new` and `/entries/[id]/edit` route chunks specifically.

**Fix:** decompose along the same lines as S12 — natural sub-form boundaries (photo capture, autofill review, tasting notes, rating, privacy/sharing) likely already exist as de facto sections within the file. **Effort:** L. **Risk:** Medium.

---

## NICE (low urgency, low effort)

### N1. `src/server/listScan/parse.ts` unconditional `console.log` timing prints
~20 of the repo's 21 total `console.log` calls live in this one file (e.g. lines 2301, 2342, 2350, 2408, 2775), unconditional in production. Gate behind a `DEBUG` env flag or remove once M3's logger exists. **Effort:** S.

### N2. Env var doc drift
README documents `GOOGLE_VISION_API_KEY` as an alternate name; code only ever reads `GOOGLE_CLOUD_VISION_API_KEY` (`src/server/listScan/parse.ts:2193`) — the documented alternate doesn't exist. Undocumented vars actually in use: `CELLARSNAP_RATE_LIMIT_BACKEND`, `NEXT_PUBLIC_AUTH_MODE`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`/`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_SITE_URL` (README only documents `PUBLIC_SITE_URL` — confirm these aren't meant to be the same var under two names), `SUPABASE_SERVICE_ROLE` (undocumented fallback alias for `SUPABASE_SERVICE_ROLE_KEY`, `src/lib/supabase/admin.ts:6`, `src/lib/rateLimit.ts:154`), `UNSPLASH_ACCESS_KEY`. No hardcoded secrets found anywhere. **Effort:** S (doc-only).

### N3. Duplicated boilerplate worth extracting
(a) rate-limit → `request.json()` → zod `.safeParse` → 429/400 response, near-identical in `phone-check/route.ts:16-38`, `username-check/route.ts:30-52`, `auth/resolve-identifier/route.ts:30-55`. (b) `signPhotoUrls`/`signPhotoUrl` result-shaping repeated across `friends/route.ts`, `friends/suggestions/route.ts`, `friends/requests/route.ts`, `users/route.ts`. (c) duplicated (but currently identical, so low-risk) `privacyLevelSchema` Zod enum in `src/app/api/profile/route.ts:24-29` and `src/server/entries/schema.ts:16-20` — shared package exports the type but not the Zod schema. **Effort:** S-M.

### N4. `next/image` gap is real but the current approach is a considered tradeoff, not pure oversight
No `next/image` usage anywhere (`grep` for `from "next/image"` returns zero files); no `images` block in `next.config.ts`. All photo rendering goes through `src/components/AppImage.tsx:14-17`, which has an explicit code comment explaining why: images come from signed storage URLs and arbitrary remote origins, so raw `<img>` was chosen deliberately over scattering lint-disables. That reasoning is legitimate — `next/image`'s optimizer needs stable, allow-listed remote patterns, which doesn't trivially fit signed URLs that rotate per request. Top-traffic surfaces affected: feed (`src/app/feed/page.tsx:192,1207`), entries list (`src/app/entries/page.tsx:147,214,445`), profile (8 call sites in `src/app/profile/page.tsx`), the full-bleed `SwipePhotoGallery.tsx:169`. `Photo.tsx` does implement manual `loading="lazy"` + fade-in, so it's not naive — it's just not getting responsive `srcset`/format-negotiation.

**Fix, if pursued:** a custom `next/image` loader that proxies through a stable app route which redirects to a freshly-signed URL, or move to unsigned-but-obscure storage URLs if the privacy model allows it. Worth a deliberate design conversation, not a drive-by fix. **Effort:** M. **Risk:** Medium (touches every image surface).

---

## KEEP AS-IS

- **`wine_entry_scores` 6-hour TTL cache mechanic** (`src/server/algorithm/scoreCache.ts`) — clean design: cutoff computed in app code, correct supporting index (`wine_entry_scores_user_computed_at_idx` on `(user_id, computed_at DESC)`), proper `onConflict` upsert, and the recent perf pass added a real bulk-upsert path (`writeCachedEntryScoresBulk`). No debt here.
- **Existing index coverage on `wine_entries`, `entry_photos`, `user_badges`, `entry_group_slides`, `entry_comparison_feedback`, `list_scan_results`, `sommelier_messages`** — well-targeted composite/partial indexes already in place (e.g. `idx_wine_entries_cellar` is a partial index scoped to `entry_status = 'cellaring'`, `wine_entries_tasted_with_user_ids_gin` correctly uses GIN for an array column). This is good schema design, not baggage.
- **Dynamic imports for heavy client libraries** — `pdf-parse` is server-only; `papaparse`, `read-excel-file`, `exifreader` are all correctly lazy-loaded via `import()` at their call sites rather than shipped in the initial client bundle. Already done right.
- **No barrel `index.ts` re-export files anywhere in `src/`** — avoids a common tree-shaking failure mode. Nothing to fix.
- **Badge SVG rendering** (`src/features/badges/BadgeIcon.tsx`) — 11 shapes via a `switch`/inline JSX, tree-shakeable; the 85 badge *definitions* live server-side and are never shipped to the client. Fine as-is.
- **`packages/shared` alias resolution** — `@shared` (web, `tsconfig.json:24-28`) and `@cellarsnap/shared` (mobile, real workspace symlink) both resolve correctly; no relative-path imports found bypassing the alias. The boundary mechanism itself is sound — only the badge-type content inside it has drifted (see S11).
- **RLS-per-sensitivity pattern in general** — every genuine user-data table (`wine_entries`, `profiles`, `entry_*`, `friend_*`, `user_*`, `wine_notifications`, `palate_profiles`, etc.) correctly has RLS enabled. The gap (M1) is specifically the 14 reference/taxonomy tables — the overall pattern of "RLS on user data, not on static lookup tables" is the right instinct, it's just missing the "and lock down writes" half for the lookup tables.
- **`applyRateLimit` helper design** — reasonably built (confirmed correctly used by `palate/distill` and `sommelier/chat`); the gap is coverage (M2), not the mechanism.

---

## Summary

| Priority | Count | Theme |
|---|---|---|
| MUST-FIX | 7 | Public write access to reference data feeding the scoring engine; zero AI-cost rate limiting on 3 routes; zero production error visibility + specific silent-failure catch blocks; unindexed hot-polled notifications query; uncached reference-table refetch on every score request; wrong rating-scale doc |
| SHOULD-FIX | 13 | Fallback-path cleanup gated on evidence; auth/error-shape/validation consistency; no CI + confirmed test-drift (not real bugs) in 3 tests; E2E gaps on the two highest-value flows; FK index gaps; RLS `auth.uid()` perf pattern; missing `updated_at` triggers; middleware DB round-trip; shared-package type drift; `parse.ts` and entry-screen decomposition |
| NICE | 4 | Debug logging noise, doc drift on env vars, boilerplate extraction, `next/image` (real gap, but the current tradeoff is defensible) |
| KEEP AS-IS | 8 | Score-cache TTL design, existing index coverage, dynamic-import discipline, no barrel files, badge rendering, shared-package alias mechanics, RLS-per-sensitivity pattern, rate-limit helper design |

The single most consequential finding is **M1** (public write access to the scoring engine's reference data) — it's a live security gap, not a future scalability concern, and it's cheap to fix. The single most consequential *scale* finding is **M6** (uncached reference-table refetch), because it's already the top line item in `pg_stat_statements` by cumulative DB time on a dataset with 339 wine entries total — it will not get better on its own as usage grows.
