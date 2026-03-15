# TASK: Algorithm UI (feature/algorithm-ui)

> **Read this file at the start of every session and after every context compaction.**

## Branch Info
- **Branch**: `feature/algorithm-ui`
- **Base**: `main` (includes entry normalization + algorithm core)

## Goal
Build the user-facing UI for the wine scoring algorithm. Users should see how well a wine matches their palate, understand why, and explore the sensory breakdown.

## Context

### Algorithm Core (already on main)
The scoring engine is fully implemented in `src/server/algorithm/`:

**Profile Assembly** (`profileAssembly.ts` — 969 lines):
- Assembles a wine's expected sensory profile from Supabase reference data
- Cascading resolution: exact region+grape match → region-only → grape-only → wine-type fallback
- Applies modifiers: classification tier, vintage weather, producer, aging curve, grape sensitivity
- Returns `EffectiveWineProfile` with 16 sensory axes + metadata

**Scoring Engine** (`scoringEngine.ts`):
- Cosine similarity between wine profile vector and user preference vector
- Axis-weighted scoring (user can weight axes they care about more)
- Returns 0–100 match score + per-axis breakdown

**User Preferences** (`userPreferences.ts`):
- Aggregates user's past entries (enjoyment ratings, re-drink, expectations) into a preference vector
- Cross-category preference blending (e.g., liking French whites informs French red preferences)
- Shrinkage toward population mean for sparse data

**Types** (`types.ts`):
- 16 sensory axes: body, acidity, tannin, alcohol_perception, fruit_ripeness, oak_presence, earthy, mineral, savory, aromatic_intensity, sweetness_perception, bitterness_phenolic_grip, finish_length, concentration, complexity, freshness
- `AssembleWineProfileInput`, `EffectiveWineProfile`, `SensoryVector`

**API endpoint**: `POST /api/algorithm/score` (handler.ts + route.ts)

### Supabase Data
- 13 algorithm tables with 5,909 total rows
- `base_profiles` — region-grape-winetype sensory profiles
- `wine_entries` — user entries with canonical_country, canonical_sub_region, wine_type enum

### Design Language (from existing app)
- Dark theme: `bg-[#0f0a09]`, zinc-100 text, amber-300/400 accents
- Rounded corners: `rounded-2xl`, `rounded-3xl`
- Glass cards: `border border-white/10 bg-white/5 backdrop-blur`
- Amber accent chips: `accent-soft-chip`, `accent-solid-button`
- Font: system sans-serif stack
- Mobile-first responsive

## Step-by-Step Plan

### Phase 1: Score Display on Wine Entries
1. On each wine entry card/detail page, show the match score:
   - Large circular score indicator (0–100) with color coding:
     - 90–100: Emerald/green — "Perfect match"
     - 75–89: Amber — "Great match"
     - 60–74: Zinc/neutral — "Decent match"
     - Below 60: Rose/red — "Not your style"
   - Label below: "XX% match to your palate"
2. Call `POST /api/algorithm/score` when viewing entry detail
3. Cache scores in component state (no re-fetch on tab switch)
4. If user has < 5 entries, show "Build your palate profile" prompt instead of score

### Phase 2: Sensory Axis Breakdown
1. Below the score, show a collapsible "Why this score?" section
2. Radar/spider chart showing the wine's 16-axis profile vs. user preferences:
   - Wine profile line (amber)
   - User preference line (emerald)
   - Overlap = match areas
3. Below the chart, list the top 3 axes driving the score (positive) and top 2 dragging it down:
   - "You love high acidity — this wine delivers (4/5)"
   - "Lower oak than you usually prefer (2/5 vs your 4/5)"
4. Use axis labels that are human-readable (per user instruction: "Most numeric scales should have labels associated"):
   - 1 = "Very Low", 2 = "Low", 3 = "Moderate", 4 = "High", 5 = "Very High"

### Phase 3: Match Bands on Feed/Home
1. On the home page wine feed, add a small match badge to each entry card:
   - Pill-shaped: `92%` with color coding
   - Only show for entries that have been scored
2. Add a "Best Matches" section at the top of the feed showing top 3 highest-scored recent entries
3. Add sort option: "Sort by: Recent | Best Match"

### Phase 4: Palate Profile Page
1. New route: `/palate` or `/profile/palate`
2. Shows the user's current preference vector as a full radar chart
3. Summary cards:
   - "Your style": top 3 style families they gravitate toward
   - "Favorite regions": top regions by average enjoyment
   - "Preference strength": how many entries inform the profile (confidence indicator)
4. "Your palate is based on X entries" with progress bar toward richer profile
5. Optional: compare your palate with a friend's (if friends feature exists)

### Phase 5: Score API Enhancements
1. Batch scoring endpoint: `POST /api/algorithm/score/batch` — score multiple wines at once (for feed)
2. Response caching: store computed scores in a `wine_entry_scores` table:
   - `wine_entry_id`, `user_id`, `match_score`, `axis_breakdown` (jsonb), `computed_at`
   - Invalidate when user adds new entries (preference vector changes)
3. Background recomputation: when a new entry is saved, queue re-scoring of recent entries

## Quality Checklist
- [ ] Score display works on entry detail page
- [ ] Radar chart renders correctly on mobile and desktop
- [ ] Graceful degradation when < 5 entries (no score, prompt to log more)
- [ ] Batch scoring doesn't cause N+1 queries
- [ ] Build passes (`npm run build`)
- [ ] All existing tests pass
- [ ] New tests for score display components
- [ ] New tests for batch scoring endpoint
- [ ] Accessible: score colors have sufficient contrast, chart has aria labels

## Files to Create/Modify
**New:**
- `src/components/WineMatchScore.tsx` — circular score indicator component
- `src/components/SensoryRadarChart.tsx` — radar chart (use canvas or SVG, no heavy chart lib)
- `src/components/ScoreBreakdown.tsx` — "why this score" breakdown
- `src/components/MatchBadge.tsx` — small pill for feed cards
- `src/app/palate/page.tsx` — palate profile page
- `src/app/api/algorithm/score/batch/route.ts` — batch endpoint
- `supabase/sql/052_wine_entry_scores.sql` — score cache table
- `e2e/ws3-algorithm-ui.spec.ts`

**Modify:**
- Entry detail page — add score display + breakdown
- Home page / feed — add match badges + "Best Matches" section
- NavBar — add "Palate" link

## Technical Notes
- For the radar chart, prefer lightweight SVG over chart libraries (bundle size matters for mobile web)
- The 16 sensory axes are a lot for a radar chart — consider grouping into 6–8 meta-categories for display:
  - Structure: body, tannin, acidity, alcohol_perception
  - Flavor: fruit_ripeness, sweetness_perception, bitterness_phenolic_grip
  - Aromatics: aromatic_intensity, oak_presence
  - Earth: earthy, mineral, savory
  - Quality: finish_length, concentration, complexity, freshness
- Axis labels must be human-readable (user instruction): "Very Low" through "Very High" on 1–5

## ⚠️ Branch Safety — READ THIS FIRST

This branch may be running concurrently with `feature/list-scan-v2` and `feature/pocket-sommelier`. Mistakes here can silently corrupt other branches.

**MANDATORY checks — do ALL of these:**
1. **At session start**: Run `git branch` and confirm you see `* feature/algorithm-ui`. If not, run `git checkout feature/algorithm-ui`.
2. **After every context compaction**: Re-read this file AND re-run `git branch` to confirm you're still on the right branch.
3. **Before every commit**: Run `git branch` again. Verify the output shows `* feature/algorithm-ui`.
4. **Before every push**: Run `git branch` one more time. Then `git log --oneline -3` to confirm the commits look right.
5. **Never run** `git checkout main` or switch branches unless you are explicitly told to by the user.
6. **Never run** `git merge main` or `git rebase main` without explicit user approval — this can introduce conflicts with concurrent branches.
7. **If using worktrees**: Confirm your working directory path includes `algorithm-ui` before any git operation.

**If you are unsure what branch you're on, STOP and check. Do not guess.**

- Never run `git commit` or `git push` without explicit user approval
