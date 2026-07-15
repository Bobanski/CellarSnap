# Cluster Overhaul — Master Plan (amateur → legacy)

**Engagement:** July 2026 · four audits (marketing/product, engineering, UX, design) run against
`feat/overhaul` with live-app access. Full reports + screenshots: `Claude-OS/qa/overhaul-audits/`.
This plan is the synthesis — what we keep, what we overhaul, and the build order.

## The one-paragraph diagnosis

Cluster has a real moat (the palate engine), a killer wedge (restaurant list-scan), genuine
voice, and a badge system already at the quality bar. It is held back by four things, none of
them taste: (1) everything valuable is invisible — behind a login wall, a beta gate, or a text
list; (2) the product contradicts its own brand with a Vivino-style public 1–100 score;
(3) first-run lands in an empty room; (4) drift — components, type, error handling, and docs
each have 2–10 competing patterns where one should exist.

## Protected keep-list (do not touch)

Badge system (visuals + copy) · editorial Cormorant headline voice + eyebrow system · grape-circle
brand motif · Explore region detail page (best page in the app) · Noir Refined palette + 0.12
border token · input styling · wine_entry_scores TTL cache design · dynamic-import discipline ·
list-scan staged-progress UX · privacy model.

## Decisions (made now, applied everywhere)

1. **Rating stays 1–100 as private input; it leaves every public surface.** Public cards, feed,
   share/OG show qualitative bands + match-% instead. CLAUDE.md corrected (it claims 1–5; the
   product is consistently 1–100 — eng audit M7).
2. **The wedge ungates.** `/list-scan` and `/sommelier` drop the private-beta gate (auth-only);
   the SOMM tab must never 404.
3. **The front door inverts: value before commitment.** Real landing page at `/` with a no-auth
   scan demo; signup asks for less, sooner.
4. **The palate becomes visible.** Taste Map radar (built from the grape-circle motif),
   entry-detail rebuilt around the data, "your palate, read by the somm" as the returning-user
   moment.
5. **One design system.** 5 canonical buttons + 1 segmented control; gold = premium moments only;
   green = natural-wine only; serif for H1s always; serif `numeric` token; motion tokens
   (score count-up, badge unlock).

## Build waves (single integration branch: `feat/overhaul`)

### Wave 1 — Trust + front door (parallel, disjoint domains)
**W1a Reliability (server/API/forms):**
- Fix silent save failure: server 4xx validation surfaced in the entry form (UX P0-1); align the
  "Optional" label with actual server requirements
- Rate limits on cellar/map-columns, explore/[type]/[slug], list-scan/recommendation-notes (eng M2)
- Central logger + un-swallow the failure-hiding catches (badges evaluator, persistEntryResolution)
  (eng M3/M4); optional @sentry/nextjs wired behind SENTRY_DSN (no-op without)
- Migration 096: wine_notifications unread partial index (eng M5) + missing updated_at triggers
- Per-instance TTL cache for reference-table reads (producer_modifiers etc., eng M6)
- Fix the 3 drifted route tests (share / partial-save / bulk-group)
- CLAUDE.md rating-scale correction

**W1b Front door (new/auth surfaces):**
- Landing page at `/` (signed-out): hero = the restaurant moment, live no-auth scan demo,
  palate story, manifesto footer; authed users redirect to /feed
- Login/signup: retire "private cellar journal" tagline; de-dominate the SMS/legal wall;
  make the taste survey the default post-signup path (skippable, never forced)
- Ungate list-scan + sommelier (auth-only); branded 404/coming-soon page
- First-run: replace "No entries yet." dead end with a 3-card checklist
  (log first wine → scan a list → meet your somm)

### Wave 2 — The crown jewels (sequential after W1 merges)
**W2a Design system pass:** canonical button/control set, gold/green hard rules, H1 serif fixes,
ScoreBadge component (one score presentation everywhere), empty-state pattern + motion tokens.
**W2b Palate visible:** Taste Map radar component (SVG, grape-circle geometry, 16-axis data),
entry-detail rebuild (lead with match/rating/sensory/mini-map), palate page upgrade,
somm-narrative surfaced on home/palate for returning users.

### Wave 3 — Growth + wedge sharpening
- Public-surface score replacement (bands + match-%), share/OG card redesign leading with match
- "What should I order?" one-tap pick + reason on scan results
- Mini-palate (3-tap) seeding inside the no-auth scan demo + results
- Share flow: first-class button, native share sheet where available

### Deferred (conscious, revisit post-launch)
Invite/referral loop + tasting-night non-user invites (L, needs invite-token auth model) ·
badge count reduction (marketing says cut 70/85 — needs Eitan's call, it's his badge collection) ·
monetization scaffolding · parse.ts 8-module decomposition (eng: SHOULD, big, low user impact) ·
fallback-path removal (needs staged evidence per eng audit) · CI workflow (lives on
fix/ios-submission, blocked on token scope) · full Sentry setup (needs account/DSN).

### QA loop protocol (every wave)
tsc + lint + route tests green → Playwright screenshot sweep of affected flows at 390×844 →
orchestrator visually reviews every screenshot → fix round if needed → merge wave branch into
feat/overhaul. Final: full-app sweep + preview deploy for Eitan.
