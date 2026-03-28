# Cluster Onboarding Survey — Specification

## Overview

A 7-step taste profile quiz that runs once after account creation. Seeds the algorithm's preference vectors so new users get meaningful match scores on their very first list scan — no need to log 5+ wines first.

Answers are stored in a dedicated `taste_survey_responses` table and remain editable. The "My Palate" screen (planned) will surface a button to re-take or edit responses. As users log more real wines, the algorithm naturally down-weights survey seeds via the existing shrinkage mechanism.

---

## Architecture

### Data flow

```
Survey UI → taste_survey_responses table → algorithm cold-start path
                                         ↓
                              buildUserPreferenceVector()
                              checks for survey data when
                              event_count < SURVEY_FADE_THRESHOLD
```

### Database table: `taste_survey_responses`

```sql
create table taste_survey_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  wine_types text[] not null default '{}',
  varietals text[] not null default '{}',
  regions text[] not null default '{}',
  countries text[] not null default '{}',
  sensory_loves text[] not null default '{}',
  sensory_avoids text[] not null default '{}',
  budget_restaurant text null,
  budget_retail text null,
  adventurousness int not null default 5,
  free_text text null,
  completed_at timestamptz null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id)
);
```

Each column stores the raw survey answers. The algorithm layer interprets them into sensory vectors and categorical weights — the survey table itself stays dumb/flat.

### Algorithm integration

In `buildUserPreferenceVector()` (file: `src/server/algorithm/userPreferences.ts`):

1. When `event_count` is 0, load survey data and build the entire preference vector from it.
2. When `event_count` is between 1 and `SURVEY_FADE_THRESHOLD` (suggested: 15), blend survey seeds with real entry data. The blend ratio is `survey_weight = max(0, 1 - event_count / SURVEY_FADE_THRESHOLD)`.
3. When `event_count` >= `SURVEY_FADE_THRESHOLD`, survey data is ignored entirely — real entries have full authority.

#### Sensory vector seeding

Each "love" and "avoid" chip maps to one or more sensory axes with a seeded value. These values initialize the user's sensory preference vector. The mapping table is below in Step 5.

#### Categorical vector seeding

- `wine_types` → `categorical.classifications` (each selected type gets affinity 1.0)
- `varietals` → `categorical.varietals` (each selected varietal gets affinity 1.0)
- `regions` → `categorical.regions` (each selected region gets affinity 1.0)
- `countries` → `categorical.countries` (each selected country gets affinity 1.0)

#### Adventurousness

The adventurousness value (1–10) modulates how much the algorithm diversifies recommendations:
- Low values (1–3, "I know what I like"): categorical bonus weight is increased by up to 30%, making the algorithm stick closer to known varietals/regions.
- Mid values (4–7): no modification (default behavior).
- High values (8–10, "Always trying new things"): categorical bonus weight is decreased by up to 30%, letting sensory similarity drive matches even when the varietal/region is unfamiliar.

This is applied as a multiplier on the categorical bonus in `computeCategoricalBonus()`.

#### Budget

Budget selections are stored but do NOT affect the match scoring algorithm — they're metadata for future features (e.g., filtering list scan results by price comfort, Pocket Somm price-aware recommendations). The algorithm should never penalize a wine for being outside budget.

---

## Survey steps

### Step 1: Wine types
**Eyebrow**: TASTE PROFILE  
**Title**: What do you drink?  
**Subtitle**: Tap every type you enjoy.

Multi-select chips:
- Red
- White
- Sparkling
- Rosé
- Orange / Skin Contact
- Dessert / Fortified

**Required**: At least 1 selection.  
**Algorithm mapping**: Each selected type seeds `categorical.classifications` with affinity 1.0.

---

### Step 2: Favorite grapes
**Title**: Grapes you love  
**Subtitle**: Pick the varietals you always reach for.

**UX**: Show 8 popular starter chips that can be tapped. Below the chips, a type-to-search field that queries the validated varietal list (same autocomplete as the entry creation varietal field). Selected varietals appear as chips above the search field.

Starter chips:
- Pinot Noir
- Cabernet Sauvignon
- Chardonnay
- Sauvignon Blanc
- Syrah / Shiraz
- Nebbiolo
- Riesling
- Grenache

**Required**: No — user can skip if unsure.  
**Algorithm mapping**: Each selected varietal seeds `categorical.varietals` with affinity 1.0.

---

### Step 3: Regions you gravitate toward
**Title**: Regions  
**Subtitle**: Where does your favorite wine come from?

**UX**: Same pattern as Step 2 — popular chips + type-to-search from the validated region/country list. The search should match both countries ("France") and sub-regions ("Burgundy", "Willamette Valley", "Barossa Valley").

Starter chips:
- France
- Italy
- California
- Spain
- Oregon
- Australia
- Argentina
- Germany

**Required**: No — user can skip.  
**Algorithm mapping**: Each selection is classified as either a country or a region (using the existing `normalizeListScanCountryLabel` logic) and seeds the appropriate categorical vector.

---

### Step 4: Your palate — what you love
**Title**: What do you love in a wine?  
**Subtitle**: Tap the styles that speak to you.

Multi-select chips:

| Chip label | Sensory axis mapping | Seeded value |
|---|---|---|
| Big and full-bodied | `body` | 4.2 |
| Light and delicate | `body` | 2.0 |
| High acidity, crisp | `acidity` | 4.0, `freshness` | 4.0 |
| Smooth and round | `tannin` | 2.0, `acidity` | 2.5 |
| Rich and oaky | `oak_presence` | 4.0 |
| Fruit-forward | `fruit_ripeness` | 4.2 |
| Earthy and funky | `earthy` | 4.0 |
| Mineral-driven | `mineral` | 4.0 |
| Complex and layered | `complexity` | 4.5 |
| Long, lingering finish | `finish_length` | 4.2 |
| Aromatic and perfumed | `aromatic_intensity` | 4.2 |
| Savory, umami notes | `savory` | 4.0 |

**Conflict handling**: If a user selects both "Big and full-bodied" AND "Light and delicate", the later selection wins (or average to 3.1 — the population mean). The UI should visually toggle these as mutually exclusive pairs where applicable.

**Required**: No — skip seeds population means for all axes.  
**Algorithm mapping**: Selected chips set initial values in `UserPreferenceVector.sensory`. Unselected axes default to population means from `POPULATION_AXIS_MEANS`.

---

### Step 5: What you avoid
**Title**: What do you avoid?  
**Subtitle**: The styles that never quite work for you.

Multi-select chips:

| Chip label | Sensory axis mapping | Seeded value |
|---|---|---|
| Overly oaky | `oak_presence` | 1.5 |
| Very tannic / grippy | `tannin` | 1.8, `bitterness_phenolic_grip` | 1.8 |
| Too acidic / sour | `acidity` | 1.8 |
| Jammy / overripe fruit | `fruit_ripeness` | 1.8 |
| Hot / high alcohol | `alcohol_perception` | 1.8 |
| Very sweet | `sweetness_perception` | 1.5 |
| Too bitter / astringent | `bitterness_phenolic_grip` | 1.5 |
| Thin and watery | `body` | 4.0, `concentration` | 4.0 |

**Required**: No — skip is fine.  
**Algorithm mapping**: Same as Step 4. "Avoid" values override "love" values for the same axis if both are selected (avoid is a stronger signal).

---

### Step 6: Budget & adventurousness
**Title**: A few more details  
**Subtitle**: This helps us fine-tune recommendations.

**Budget — Restaurant** (single-select chips):  
*What do you typically spend on a bottle at a restaurant?*
- Under $50
- $50 – $80
- $80 – $120
- $120 – $200
- $200+
- Skip

**Budget — Retail** (single-select chips):  
*What about at a wine shop?*
- Under $15
- $15 – $25
- $25 – $40
- $40 – $75
- $75+
- Skip

**Adventurousness** (slider, 1–10):  
*How adventurous are you with wine?*

Left label: "I know what I like"  
Right label: "Always exploring"  
Default: 5

**Required**: None — all skippable.

---

### Step 7: Review & confirm
**Eyebrow**: REVIEW & CONFIRM  
**Title**: Your taste profile  
**Subtitle**: Here's what we heard. You can always edit this later.

Show a summary card with:
- **Types**: Red, White, Sparkling
- **Go-to grapes**: Pinot Noir, Nebbiolo, Chardonnay
- **Favorite regions**: France, California
- **You love**: Complex and layered, Earthy and funky, High acidity
- **You avoid**: Overly oaky, Very sweet
- **Budget**: $80–$120 (restaurant), $25–$40 (retail)
- **Adventurousness**: 7/10

**Optional free text field**:  
*"Anything else we should know?"*  
Placeholder: "e.g., I prefer natural wines, or I'm allergic to sulfites"

This free text gets stored in `free_text` and is processed by the existing NLP pipeline (`extractFromNotes`) for additional sensory hints.

**Button**: "Lock in my profile" → writes to `taste_survey_responses`, sets `completed_at`, navigates to feed.

---

## Editability

Survey responses are editable at any time. The entry point for editing should live on the **My Palate** screen (planned next feature). Suggested UX:

- A card or button labeled "Edit Taste Profile" on the My Palate screen
- Tapping it opens the same 7-step flow, pre-populated with existing answers
- Saving overwrites the `taste_survey_responses` row and updates `updated_at`
- The algorithm immediately reflects changes on the next scoring run

Even after `event_count` exceeds `SURVEY_FADE_THRESHOLD`, the survey data is preserved in the table — it just stops influencing scores. If a user edits their survey answers after logging many wines, the answers update in the DB but won't affect scoring unless they also reset their preference vector (which could be a future "Reset my palate" feature).

---

## UI development instructions

The survey UI should be built in Expo (mobile-first). Claude Code should handle the UI implementation using these guidelines:

### File structure
```
apps/mobile/app/(app)/taste-survey/
  _layout.tsx          — step navigator (no tab bar visible)
  index.tsx            — redirects to step 1 or review if already completed
  step-types.tsx       — Step 1: Wine types
  step-grapes.tsx      — Step 2: Grapes (chips + search)
  step-regions.tsx     — Step 3: Regions (chips + search)
  step-loves.tsx       — Step 4: Sensory loves
  step-avoids.tsx      — Step 5: Sensory avoids
  step-details.tsx     — Step 6: Budget + adventurousness
  step-review.tsx      — Step 7: Review & confirm

apps/mobile/src/lib/api/tasteSurvey.ts    — API client
apps/mobile/src/lib/tasteSurvey/types.ts  — shared types
```

### Shared state
Use a React context or zustand store to hold in-progress survey answers across steps. Only persist to the database on Step 7 confirmation. Allow back-navigation between steps without losing state.

### Visual style
- Match Cluster's dark theme (`colors.screenBg`, `colors.textPrimary`, etc.)
- Chips: rounded pill shape, outline when unselected, filled accent when selected (use `colors.accentPrimary` for selected state)
- Progress bar at the top showing step N of 7
- Each step is a full-screen card with title, subtitle, and content area
- "Next" button at bottom, "Back" arrow at top-left
- Step 7 has "Lock in my profile" as the primary CTA

### Type-to-search fields (Steps 2 and 3)
Reuse the same autocomplete data source and component pattern from the entry creation varietal/region fields. The search should:
- Show results in a dropdown as the user types
- Tapping a result adds it as a selected chip
- Chips can be removed by tapping the X
- The starter chips above the search field work the same way (tap to select/deselect)

### Navigation
- After account creation → redirect to `/taste-survey` before `/feed`
- If user dismisses mid-survey → answers are NOT saved, next app open prompts again
- If user completes survey → `completed_at` is set, never prompted again
- "Edit Taste Profile" from My Palate → opens survey pre-populated with saved answers

---

## API endpoints

### `POST /api/taste-survey`
Save or update the user's survey responses. Body matches the `taste_survey_responses` column shape. Returns the saved row.

### `GET /api/taste-survey`
Retrieve the user's existing survey responses (for pre-populating the edit flow). Returns null if no survey exists.

Both endpoints use `requireRequestAuth` for bearer + cookie auth.

---

## Algorithm integration checklist

These changes will be made by the orchestrator (Perplexity Computer) after the UI is built and tested:

- [ ] Create `taste_survey_responses` migration
- [ ] Add `loadTasteSurveyForUser()` helper in `src/server/algorithm/`
- [ ] Modify `buildUserPreferenceVector()` to check for survey data
- [ ] Implement sensory vector seeding from love/avoid chip mappings
- [ ] Implement categorical vector seeding from types/varietals/regions
- [ ] Implement adventurousness multiplier in `computeCategoricalBonus()`
- [ ] Implement survey fade: blend ratio based on `event_count / SURVEY_FADE_THRESHOLD`
- [ ] Add API routes (`GET` and `POST /api/taste-survey`)
- [ ] Wire post-signup redirect to survey flow
- [ ] Add "Edit Taste Profile" entry point on My Palate screen
