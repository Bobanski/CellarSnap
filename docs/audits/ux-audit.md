# Cluster (CellarSnap) — UX Audit
**Branch:** `feat/overhaul` (830aca4) · **Theme:** Noir Refined
**Date:** 2026-07-08 · **Viewports:** 390×844 (mobile, primary) + 1440×900 (desktop, spot-check)
**Method:** Playwright (Python), headless Chromium, authenticated as `E2E_USER_A` (50 seeded cellar entries), plus a throwaway signup account for unauthenticated screens.
**Screenshots:** `/Users/esneider/Projects/Claude-OS/qa/overhaul-audits/ux-shots/*.png` (referenced by filename below)

## Setup notes (read before triaging)

- **Dev server contention:** this checkout is shared with other concurrent agents also running `next dev` against the same directory (`.claude/worktrees/agent-*`, branches `fix/perf-plumbing`, `fix/ios-submission`, `design/noir-refined`, `design/champagne-daylight`). To get a stable, unambiguous target, I created an isolated detached git worktree at `feat/overhaul@830aca4` and ran the dev server there instead of directly in `projects/cellarsnap`. All findings below are against that exact commit, not against whatever the other agents' servers happened to be serving.
- **Private-beta gate:** `/sommelier` and `/list-scan` are gated by `assertPrivateBetaFeatureAccessAsync` (`src/lib/access/privateBetaFeatures.ts`), which allowlists 3 hardcoded personal emails or an `is_test_account` DB flag. `E2E_USER_A` had `is_test_account=false`, so both routes 404'd outright. I temporarily set `is_test_account=true` via the Supabase REST API (service role key from `.env.local`) to test these flows, then **reverted it to `false`** immediately after (confirmed via a follow-up read). No other data was modified except one throwaway cellar entry I created and deleted as part of testing the Log-a-Wine flow (cellar count verified back to 50/92.9 avg after cleanup).
- I could not reach a true zero-data "brand new user" state for every authed tab (the E2E account has 50 entries), so empty-state judgments for Cellar/Feed/Palate lean on the account's existing near-empty sub-states (e.g., "Incoming requests: No new requests right now", first-run copy on Somm/List Scan) rather than a fully blank account.

---

## Flow 1 — First-run / Signup / Empty states

| # | Sev | Finding | Screenshot | Fix |
|---|-----|---------|------------|-----|
| 1.1 | P2 | Invalid email on Signup triggers the **browser's native validation tooltip** (white box, yellow warning icon) — completely breaks the dark, custom-styled UI immersion. | `01_signup_invalid_email_mobile.png` | Use `noValidate` + a custom inline error styled like the rest of the form (the app already has this pattern elsewhere, e.g. the `wine_name` required error should look like this too — see 2.1). |
| 1.2 | P3 | Signup/Login cards float in a large sea of empty dark space on both mobile and especially desktop (1440px card is same width as mobile, centered with ~750px of empty space on both sides). | `01_signup_unauth_desktop.png`, `01_login_unauth_desktop.png` | Add a hero visual, brand pattern, or testimonial panel on desktop; not required on mobile but worth tightening vertical rhythm. |
| 1.3 | Resolved | Hamburger/account menu is now well-organized: profile summary card, grouped "Account"/"More" sections with descriptions, Sign out. This directly fixes the prior review's P2 #12 ("excessive empty space, only 5 links"). | `05_hamburger_menu_mobile.png` | — (keep) |

**Signup → finish-signup step:** the combined "enter code + pick username + set password" screen (`02b_signup_otp_immediately_after_click.png`) is a genuinely good pattern — it avoids a separate wizard step. No issues found there.

---

## Flow 2 — Log a Wine (highest-severity findings in the audit)

| # | Sev | Finding | Screenshot | Fix |
|---|-----|---------|------------|-----|
| **2.1** | **P0** | **Saving an entry with only Rating filled in silently fails.** The UI marks only "RATING (1-100) *" as required; the "WINE DETAILS" section is explicitly subtitled **"Optional identity details for this bottle."** But `POST /api/entries` returns `400 {"fieldErrors":{"wine_name":["Wine name is required"]}}`, and the client shows **zero feedback** — no toast, no inline error, no scroll-to-field. The form just sits there unchanged; the user has no way to know the save failed or why. This directly breaks the task's own "photo-less, minimal-friction" logging path. | `16_survey_filled.png` (form reverted to blank-looking state after failed save), `17_save_rating_only_result.png` | Either (a) make Wine Name genuinely optional server-side (fill a placeholder like "Unnamed wine"), or (b) mark it required in the UI (asterisk, remove "Optional" copy) — and in all cases, render `fieldErrors` from any 4xx response as inline errors + a toast. |
| 2.2 | P0 (root cause of 2.1) | Confirmed via a network-abort test that the client **does** have a friendly error path for network failures ("Unable to create entry. Check your connection.") — so the save handler has a catch branch for fetch failures, but no branch for handling non-2xx JSON error responses. This is a precise, scoped bug. | `29_network_abort_result.png` (compare to 2.1 — same action, different failure mode, wildly different UX) | Add a shared "handle API error response" path that surfaces `fieldErrors`/`formErrors` the same way the network-failure path already surfaces its message. |
| 2.3 | P1 | The **mandatory "REQUIRED SURVEY"** ("Quick check-in": how was it / vs. expectations / would you seek it out again) appears immediately after every save with **no visible skip option** — unlike the onboarding Taste Survey, which explicitly offers "Skip survey for now" and "Skip to next step" on every step. This is inconsistent within the app's own design language and adds mandatory friction to the core loop, working against the "zero gatekeeping, fun" promise. | `15_after_save_3s.png` vs. `04_taste_survey_mobile.png` | Add the same skip affordance used in onboarding, or make it explicitly optional/dismissible. |
| 2.4 | P2 | The "Quick check-in" survey's 3 questions render as **plain native `<select>` dropdowns** — the only place in the entire entry flow that doesn't use the app's custom pill/chip button pattern (used for QPR, wine type, etc.). Reads as a bolted-on afterthought. | `15_after_save_3s.png` | Rebuild as pill/chip selectors matching QPR styling. |
| 2.5 | P2 | "DRINKING NOW" toggle is a **bare, unstyled native OS checkbox** (small white square) — the only native form control on an otherwise fully custom-styled screen. Also a marginal touch target (~16px) on mobile. | `12_manual_entry_form_top.png` | Replace with the app's switch/toggle component (used for "Visibility" section per the field list) and size to ≥32px. |
| 2.6 | P2 (open from prior review) | RATING (1-100) — the single required field — is still a small, narrow text input with no visual weight. Prior review flagged this (P2 #16); still unresolved. | `12_manual_entry_form_top.png` | Give it real prominence: larger box, or a stepper/slider with the numeric field as a fallback. |
| 2.7 | P2 (partially improved) | QPR pills now do show a selected state (gold outline + gold text on the active pill) — this **improves** on the prior review's P2 #15 ("no visual distinction"), but it's subtle at a glance since unselected pills use nearly the same background. | `14_qpr_selected_and_details_expanded.png` | Consider a filled/inverted background for the selected pill for faster scanning. |
| 2.8 | P3 | Collapsible section headers (WINE DETAILS, LOCATION & DATE, etc.) use a static "•" dot that doesn't visibly change between collapsed/expanded — no rotating chevron. Prior review flagged a similar issue with a different indicator (P3 #25); still unresolved in a new form. | `13c_log_wine_after_wheel.png`, `14_qpr_selected_and_details_expanded.png` | Swap for a chevron that rotates 90° on expand. |
| 2.9 | P3 | Large empty space (~55% of viewport) below the Photos/Drinking-Now/Notes/Rating block on initial load of `/entries/new`, before scrolling. | `12_manual_entry_form_top.png` | Low priority; consider surfacing recent entries or a tip here. |

---

## Flow 3 — Cellar / Library

| # | Sev | Finding | Screenshot | Fix |
|---|-----|---------|------------|-----|
| 3.1 | Resolved | Entry detail page is now single-column and well-balanced — fixes prior review's P1 #5 ("massive left-column empty space"). | `19_entry_detail_loaded_top.png` | — (keep) |
| 3.2 | Resolved | Delete flow uses a proper confirm dialog ("Delete this entry? This action can't be undone...") with clear Cancel/Delete actions; deletion works correctly and stats (50 entries / 92.9 avg / 2 countries) recompute correctly afterward. | `22_delete_confirm_dialog.png`, `24_cellar_final_state.png` | — (keep) |
| 3.3 | P2 | **Same field, two different controls:** QPR is a custom pill selector on `/entries/new` but a plain native `<select>` dropdown on `/entries/[id]/edit`. | `21_edit_loaded.png` vs `14_qpr_selected_and_details_expanded.png` | Reuse the same QPR component in both create and edit forms. |
| 3.4 | P2 | Edit-entry page briefly shows **bare "Loading entry..." text** (no skeleton), inconsistent with the skeleton used on the read-only Entry Detail page one tap away. | `20_entry_edit_form.png` | Reuse the Entry Detail skeleton on the Edit route. |
| 3.5 | P2 | Right after deleting an entry, `/entries` flashes **"0 ENTRIES" + plain-text "Loading your library..."** before the real count/list renders — a misleading "your cellar is empty" flash for a fraction of a second. | `23_after_delete.png` | Use a skeleton or keep the last-known count visible while refetching instead of zeroing state first. |
| 3.6 | P3 | Entry detail's "PALATE MATCH" card shows two conflicting explanations at once: "Match score not ready yet" (implies insufficient data) directly above "Unable to load the palate match right now" (implies a transient failure). Confusing, pick one framing. | `19_entry_detail_loaded_top.png` | Clarify copy based on actual cause (low profile confidence vs. real fetch error). |
| 3.7 | P3 | Minor/edge case: wine name "UX Audit Test Cuvee" was auto-rendered as "**Ux** Audit Test Cuvee" — CSS `text-transform: capitalize` mangles intentional all-caps acronyms. Low real-world impact. | `19_entry_detail_loaded_top.png` | Store/display casing as typed rather than force-capitalizing. |

---

## Flow 4 — List Scan

| # | Sev | Finding | Screenshot | Fix |
|---|-----|---------|------------|-----|
| 4.1 | P1 | List Scan has **no entry point in the bottom nav or hamburger menu at all** — the only way in is a suggestion pill inside Pocket Sommelier chat, which is itself private-beta gated. For any user without beta access, this feature is completely undiscoverable, even though the route exists and is well-built. | `04_sommelier_mobile.png` (pill), `09_list_scan_intake.png` | Once out of private beta, give it a real nav entry (e.g. inside the LOG flow as an alternate path, matching its "instant recommendations" pitch). |
| 4.2 | P1 | On failure, the error surfaces as a **raw, unstyled technical string: "fetch failed"** — no explanation, no retry CTA, just the bare JS error message in a red pill. | `11_list_scan_final_state.png` | Map known failure modes (unreachable URL, timeout, parse failure) to friendly copy + a "Try again" button. |
| 4.3 | Keep | The scanning **progress UI is genuinely good**: staged status copy ("Fetching the page" → "Parsing wines" → "Scoring matches" → "Still working, taking a little longer...") with a live percentage and progress bar. This is one of the best-designed loading states in the app. | `10_list_scan_loading.png` | — (keep; consider reusing this pattern for other long-running actions, e.g. label photo processing) |
| 4.4 | P2 (open from prior review) | Photo/PDF/URL intake cards have no hover/selected visual state — still open from prior review P3 #24. | `09_list_scan_intake.png` | Add active/selected outline + hover elevation. |

---

## Flow 5 — Pocket Sommelier chat

| # | Sev | Finding | Screenshot | Fix |
|---|-----|---------|------------|-----|
| **5.1** | **P0** | The **"SOMM" bottom-nav tab is a primary, always-visible nav item**, but tapping it 404s for any account without private-beta access (only 3 hardcoded emails are allowlisted app-wide). A user tapping a permanent tab-bar icon and landing on a bare "404 — Page not found" is one of the most disorienting things an app can do — it reads as broken, not "not yet available." | `06_sommelier_via_click_mobile.png` (confirmed via both client-nav and hard reload) | Either hide/gray the nav item + link to a waitlist for ungated users, or ship a branded "Pocket Sommelier is in private beta — join the waitlist" screen instead of the generic 404. |
| 5.2 | Keep | Once access is granted, the actual **chat quality is excellent**: a 3-dot typing indicator, then a well-formatted response (bold wine names, bullet list) that's genuinely personalized — it referenced the user's actual cellar entries (Hermitage La Chapelle, Alban REVA) by name to justify its recommendations. | `07_somm_chat_response_done.png` | — (keep) |
| 5.3 | P1 | **No persistence** — reloading `/sommelier` wipes the entire conversation back to the empty suggestion-pill state. This is surprising given the UI has an explicit "Clear Chat" button, which implies the conversation should otherwise persist until the user deliberately clears it. | `08_somm_after_reload.png` | Persist conversation server-side (or at least in localStorage) keyed to the user, matching the implied contract of having a manual "Clear" action. |
| 5.4 | P3 (open from prior review) | Empty/greeting state still has a large amount of unused vertical space between the suggestion pills and the greeting — open from prior review P3 #23. | `04_sommelier_mobile.png` | Fill with recent cellar highlights or example prompts. |

---

## Flow 6 — Palate + Taste Survey

| # | Sev | Finding | Screenshot | Fix |
|---|-----|---------|------------|-----|
| 6.1 | Keep | Palate page is clean and informative: stat header (wines/friends/badges/countries), Top Grapes/Regions cards, and an honest "Profile confidence: Emerging" progress indicator that sets expectations rather than pretending to be authoritative on thin data. | `04_palate_mobile.png` | — (keep) |
| 6.2 | Keep | Taste survey (7 steps) has a clear top progress bar and, notably, **both** "Skip survey for now" and "Skip to next step" on every screen — exactly the kind of low-pressure, no-gatekeeping pattern the post-save entry survey (2.3) should also use. | `04_taste_survey_mobile.png` | — (keep; replicate this pattern elsewhere) |
| 6.3 | P3 | Recurring pattern: primary "Next" CTA sits directly under the last option near the top of the screen, leaving the bottom ~55% of the viewport empty — on a tall phone this means the CTA isn't in the natural one-handed thumb zone. | `04_taste_survey_mobile.png` | Anchor primary CTA to the bottom of the viewport (sticky footer) instead of inline right after the content. |

---

## Flow 7 — Feed + Social

| # | Sev | Finding | Screenshot | Fix |
|---|-----|---------|------------|-----|
| 7.1 | Resolved | Feed is single-column at 390px width — fixes prior review's P1 #6 ("still two columns at mobile width"). | `03_home_after_login_mobile.png` | — (keep) |
| 7.2 | Resolved | Card "..." (kebab) menu now closes on Escape and shows a clear focus ring — fixes prior review's P1 #8. | `25_feed_kebab_menu_open.png`, `25_feed_kebab_after_escape.png` | — (keep) |
| 7.3 | Keep | Desktop feed layout is the one page that actually uses desktop width well — large cinematic photo cards, generous padding, no dead margins. | `04_home_root_desktop.png` | — (keep; use as the template for other desktop layouts, see cross-cutting) |
| 7.4 | Keep | Friend search correctly shows "Already friends" for existing connections rather than a generic "Add" button; "Incoming requests: No new requests right now" is a clean, low-anxiety empty state. | `30_friend_search_results.png` | — (keep) |

*(Comment posting and reaction interactions were spot-checked via the entry detail "Comments" affordance but not exhaustively driven end-to-end within the time budget — flagging as a gap rather than a finding.)*

---

## Flow 8 — Badges

| # | Sev | Finding | Screenshot | Fix |
|---|-----|---------|------------|-----|
| 8.1 | Keep | Badges grid clearly differentiates earned vs. locked ("???") badges with tier-colored dots (rose/gold/etc.). | `04_badges_mobile.png` | — (keep) |
| 8.2 | P3 | Badge detail page is functional but thin: icon, title, tier tag, one-line description, and then ~60% empty space. No earned date, no progress toward next tier, no "wines that earned this," no related badges. | `28_badge_detail_earned.png` | Add earned-on date and a link back to the entry/entries that triggered it. |

---

## Flow 9 — Explore

| # | Sev | Finding | Screenshot | Fix |
|---|-----|---------|------------|-----|
| 9.1 | Keep | Explore hub (search + Regions/Grapes/Producers cards + Trending + Featured Region) is well laid out. | `04_explore_mobile.png` | — (keep) |
| 9.2 | **Keep — best page in the app** | Region detail (`/explore/region/sicily`) is genuinely excellent: hero photo, flavor radar chart, editorial "Story," grape chips, notable winemakers, key appellations, "Community Pulse," food pairings, "Did You Know" facts, and "Explore Similar Regions" — rich, on-brand, and fun. This is the clearest example in the app of the "learn, discover, drink better" promise being delivered. | `27_explore_region_loaded.png` | — (keep; use as the design bar for Badge detail, Sommelier empty state, etc.) |
| 9.3 | P2 | React console warning fires repeatedly on `/explore`: *"Encountered two children with the same key, `null`"* (visible to devs as a "1 Issue" Next.js dev-overlay badge). This is a real list-rendering correctness bug in the Trending/Featured lists (duplicate or missing `key` props), not just console noise — it can cause silent item duplication/omission on re-render. | `04_explore_mobile.png` (dev overlay badge visible bottom-left) | Find the `.map()` in the Trending/Featured components using a `null` or non-unique field as `key` and switch to a stable unique id. |

---

## Cross-cutting findings

| # | Sev | Finding | Evidence | Fix |
|---|-----|---------|----------|-----|
| X.1 | P0 | **Silent failure on non-2xx API responses** during the core "Log a Wine" save action (see 2.1/2.2) — the single highest-impact bug found. | `17_save_rating_only_result.png` | See 2.1/2.2. |
| X.2 | P0 | **Primary nav tab (SOMM) dead-ends into a generic 404** for the vast majority of accounts (private beta gate applies to ~3 emails). | `06_sommelier_via_click_mobile.png` | See 5.1. |
| X.3 | P1 | **Raw technical error strings** surfaced to users in at least one place ("fetch failed" on List Scan) vs. friendly copy elsewhere ("Unable to create entry. Check your connection." on network-abort) — inconsistent error-message quality across the app. | `11_list_scan_final_state.png` vs `29_network_abort_result.png` | Standardize on one error-formatting utility/component app-wide. |
| X.4 | P2 | **Inconsistent loading-state treatment**: Feed and Entry Detail use proper skeletons; Edit Entry and post-delete Cellar refresh still show bare "Loading X..." text. Explore sub-pages use a plain spinner. Three different loading patterns coexist. | `20_entry_edit_form.png`, `23_after_delete.png`, `26_explore_region_detail.png` | Consolidate on one skeleton/loading component used everywhere. |
| X.5 | P2 | **Native, unstyled form controls leak through** in three places (Drinking Now checkbox, post-save survey selects, Edit-entry QPR select) despite the app otherwise having a fully custom pill/chip/toggle design language. | `12_manual_entry_form_top.png`, `15_after_save_3s.png`, `21_edit_loaded.png` | Audit for any remaining bare `<input type=checkbox>` / `<select>` and replace with the existing custom components. |
| X.6 | P2 | **Desktop layouts mostly don't use desktop width.** Cellar, Sommelier, Badges, and Explore all render as a narrow ~670-720px column centered in a 1440px viewport, leaving roughly half the screen as unused dark space on both sides. Feed is the one page that genuinely earns its desktop layout (full-width hero cards). | `04_entries_desktop.png`, `04_sommelier_desktop.png` | Either lean into a deliberate "centered reading column" design system-wide (fine, but should feel intentional — e.g. add a subtle side rail/pattern) or give Cellar/Explore real multi-column desktop layouts like Feed got. |
| X.7 | P2/P3 | **Recurring "dead space below the fold" pattern** on single-purpose mobile screens: New Entry top, Taste Survey steps, Badge detail, Sommelier empty state, Signup/Login. CTAs cluster near the top rather than the natural mobile thumb-zone at the bottom. | Multiple screenshots above | Anchor primary actions to a sticky bottom bar on short-content screens instead of leaving them inline. |
| X.8 | Resolved | Escape/click-outside dismissal on dropdowns (Feed kebab menu) now works correctly — prior review's P1 #8 is fixed. | `25_feed_kebab_after_escape.png` | — (keep) |
| X.9 | P3 | Native browser validation tooltip on Signup breaks the dark theme (see 1.1) — the one place native browser chrome leaks into an otherwise fully custom UI outside the form-control issues in X.5. | `01_signup_invalid_email_mobile.png` | See 1.1. |

*(Contrast, alt-text, and precise touch-target auditing were done by inspection of the captured screenshots rather than an automated axe-core pass; no obvious contrast failures were observed against the dark burgundy palette, and most tap targets look ≥40px except the native checkbox noted in 2.5.)*

---

## Top 10 changes that would most raise perceived quality

1. **Fix silent save failures on the entry form** (2.1/2.2) — surface `fieldErrors` from any failed API call the same way network failures are already handled. This alone can silently block the core "log a wine" loop for any minimal/photo-less entry.
2. **Never let a primary nav tab 404** (5.1) — replace the Pocket Sommelier private-beta 404 with a branded "coming soon" state, or hide the tab for ungated users.
3. **Give List Scan and Pocket Sommelier real, discoverable entry points** (4.1) once out of private beta — right now List Scan is only reachable through a chat suggestion pill inside a gated feature.
4. **Persist Pocket Sommelier chat across reloads** (5.3) — the existing "Clear Chat" button implies this should already be true.
5. **Replace "fetch failed" and other raw technical errors with friendly, actionable copy** (4.2, X.3) — standardize error messaging app-wide.
6. **Standardize loading states on the existing skeleton pattern** (X.4) — kill the remaining plain-text "Loading X..." states on Edit Entry and post-mutation Cellar refresh.
7. **Add a skip option to the mandatory post-save survey** (2.3) — match the onboarding Taste Survey's existing, better pattern; protects the "zero gatekeeping" promise.
8. **Unify custom vs. native form controls** (X.5) — the checkbox, post-save survey, and Edit-entry QPR dropdown are the only native-looking controls in an otherwise fully custom UI.
9. **Fix the duplicate/null React key warning on Explore** (9.3) — a real correctness bug, not just console noise, on the app's best page.
10. **Design real desktop layouts for Cellar/Sommelier/Badges/Explore** (X.6) — use Feed's full-width approach as the template instead of a narrow centered column with ~50% dead space.

## Keep-list — flows that already feel right

- **Feed**: single-column responsive layout, working Escape/click-outside dismissal, and a genuinely great full-width desktop hero-card layout.
- **Entry Detail page**: rebalanced single-column layout, proper skeleton loading, clean Share/Edit/Delete actions.
- **Delete-entry flow**: textbook confirmation modal, correct data recalculation afterward.
- **Explore region/grape detail pages**: the best-designed page in the app — rich, editorial, on-brand, genuinely fun to read.
- **Hamburger/account menu**: well-organized, grouped, descriptive — directly fixes a real complaint from the prior review.
- **Taste Survey onboarding**: clear progress, and — unlike the post-save survey — real skip affordances at every step.
- **Friends page**: clean connected/incoming/search states, correct "Already friends" handling.
- **Pocket Sommelier's actual conversation quality** (once reachable): typing indicator, well-formatted and genuinely personalized responses.
- **List Scan's staged progress UI**: the best loading-state design in the app — worth reusing elsewhere.
