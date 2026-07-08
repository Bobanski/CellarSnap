# Cluster — Design Audit (feat/overhaul)

**Auditor:** Design director, consulting review
**Build:** `feat/overhaul`, dark "Midnight Noir / Noir Refined" adaptation, tokens now real Tailwind utilities (`src/app/globals.css`)
**Method:** Real rendered screens, authenticated as E2E User A, Playwright @ 390×844 (+ 1440×900). 22 screenshots in `qa/overhaul-audits/design-shots/`.
**Bar:** Linear / Arc / Airbnb craft, while staying warm and unpretentious. Mission: *make wine fun again*, anti-gatekeeping, "knowledgeable but never condescending."

---

## TL;DR

Cluster already has the two hardest things to fake: **a real voice** (the editorial Cormorant headlines are genuinely charming) and **a real brand motif** (the overlapping-grape geometry, reused with discipline in the badge system). The Noir palette is coherent and distinctive. This is a B+ that is one focused pass away from an A.

What holds it back is **drift, not taste**: ~10 visually distinct button treatments, two different segmented-control styles, the "premium" gold spent on point scores and taxonomy chips, and — most importantly — **the app's single best asset, the 16-axis palate data, is presented as a plain text list**, and the entry-detail payoff screen shows a photo and a comment count but not the rating, the score, or any sensory data. The craft is in the chrome; the substance screens are under-designed.

---

## What's already excellent — PROTECT THIS

1. **Editorial headline voice.** `feed-390` "What the cluster is drinking.", `entries-390` "Your collection.", `friends-390` "Keep your cellar circle close.", `entries-new-390` "Record a new pour. / Capture the bottle, the moment, the people.", `explore-390` "Learn, discover, drink better." — Cormorant + this copy is the brand. Do not touch.
2. **Cormorant serif numerals** in stat cards (`entries-390`: 50 ENTRIES / 92.9 / 2 COUNTRIES) and ranked lists (`explore-grapes-390`: 1, 2). Elegant, ownable, cheap to extend.
3. **The badge system** (`badges-390`). Grape-cluster geometry, tier-colored rings (rose→Grenache→**gold Réserve**→black), silhouetted "???" locked states that still read as grapes. This is the one screen already at the target bar. Gold is used *correctly* here.
4. **Grape-of-the-day editorial copy** (`explore-grapes-390`): "Pinot Noir is like a whisper in the glass—soft, elusive, yet profoundly expressive…" — serif body, warm, specific, zero snobbery. This is the voice done right; it should set the standard.
5. **Eyebrow system** — 10px uppercase, ~3px tracking, rose/Grenache (`FEED`, `CELLAR ENTRY`, `NEW ENTRY`, `TASTE PROFILE`). Consistent and on-spec with the brand guide.
6. **Input styling** — Grenache-tint fill + 0.12 border + cream text is consistent across login, feedback, search fields. Leave it.
7. **Border discipline** — the `rgba(196,96,122,0.12)` card border is applied consistently. Keep the token locked.

---

## Screen-by-screen

### Login — `00-login-390.png`
- Card floats over the void; clean. Tagline "A private cellar journal with a social pour." + `BETA` chip = good.
- **Issue:** H1 "Cluster" is **DM Sans bold**, but the app wordmark everywhere else is the **serif lowercase "cluster"**. Two different brand-name lockups. Pick the serif wordmark.
- **Issue:** The Sign-In button renders in the *brighter* accent (`accent-hover` magenta) rather than the base Grenache — reads slightly hot/candy vs. the deep-wine brand.
- Huge empty void below the card — the single biggest "first impression" surface in the app has no brand presence (no mark, no texture, no grape-cluster motif).

### Feed — `feed-390.png`, `feed-1440.png`
- Header + segmented "All / My Circle" + card is strong. Copy sings.
- **Score color drift:** "89 Pts" is rendered in **gold (Viognier)**. Gold is the premium/Réserve signal — spending it on every feed score dilutes it.
- Segmented control here = outline-pill style (active = rose outline). This does **not** match the cellar/profile segmented style (filled active). See Components.
- **Desktop (`feed-1440`)** is a widened mobile column — the card stretches to ~1150px and the label photo becomes a giant letterbox; the mobile tab bar sits at the bottom of a desktop viewport. No true desktop layout. (App is clearly mobile-first; cap content width ~600px as a stopgap.)

### Cellar / Entries — `entries-390.png`
- Best "product" screen. Serif stat numerals, clean list rows, thumbnail + serif wine name + sans meta.
- **Score chips** (98 / 95 / 91) are rose-on-Grenache-tint — low contrast, and a **third** score treatment (gold on feed, rose here, absent on detail).
- One row (Côte-Rôtie) has no score chip → ragged alignment when scores are missing.
- Segmented "Opened / In My Cellar / My Events" = filled-active-text style (differs from feed).

### Entry detail — `entry-detail-390.png`, `entry-detail-full-390.png`
- **The single biggest information-design failure.** Full-page + scrolled capture shows: serif title, "CELLAR ENTRY" eyebrow, Share / Edit buttons, a big label photo carousel, and a "Comments 0" row. **That's the entire page.**
- **No rating. No score (this wine is "98" in the list). No enjoyment intent. No tasting notes. No sensory / 16-axis palate data. No match/palate-fit.** The emotional payoff of logging a wine is a photo and a comment count.
- Two different buttons in one row: "Share" (rose outline) + "Edit entry" (neutral outline).

### Log / New entry — `entries-new-390.png`
- Great copy. But: **nested card-in-card** (outer surface wraps an inner surface holding the upload CTA) reads muddy on a dark theme where surfaces are close in value.
- "UPLOAD IMAGES" is a **pink outline pill in UPPERCASE letter-spaced** — a button casing that appears nowhere else. "Manually enter details" below it is a neutral outline sentence-case pill. Two casings, two colors, stacked.
- Large empty void below the card.

### Palate — `palate-390.png`
- **The crown-jewel screen, under-designed.** 16-axis sensory engine → rendered as "TOP GRAPES: Pinot Noir (1) / Syrah (1)" and "TOP REGIONS: Rhône +1.6 pts" as plain lists.
- "+1.6 pts" is in **green (Verdot)** — brand green = natural-wine / sustainability, not "positive delta." Semantic collision.
- "Profile confidence: Emerging" + progress bar is a nice touch and good voice.
- No radar, no axis visualization, no taste-map. The gift is unwrapped as a spreadsheet.

### Badges — `badges-390.png`
- Already at target. Protect. (See keep-list.)

### Profile — `profile-390.png`
- Photo-grid wall is a nice Instagram-for-wine surface. But empty slots use a **generic image-placeholder icon** (no brand art). "No photo" avatar = flat tinted circle.
- Redundancy: a "MY PALATE / Your taste DNA" card here *and* the Palate tab *and* a taste-preferences CTA — three entry points to the same thing.
- Segmented "My wines / Tagged / Friends" = filled-active-text (yet another instance; at least matches cellar).

### Friends — `friends-390.png`
- Clean, consistent section cards, generous padding. Good voice ("cellar circle close").
- "No new requests right now." empty state = flat (see Voice).

### Explore + sub-pages — `explore-390.png`, `explore-regions-390.png`, `explore-grapes-390.png`
- Strong editorial surface. Category cards reuse the grape motif (good), but the icons are **very thin / low-contrast** — barely visible on dark.
- **Gold misuse:** trending "GRAPE" chip is gold, "REGION" chip is rose (`explore-390`) — arbitrary taxonomy coloring burning the premium accent.
- `explore-grapes`: the "Grape of the day" card has an **empty circle** top-right (intended illustration/photo missing → looks broken). `explore-regions`: "Region of the day" shows grey **placeholder bars** (skeleton or broken viz).
- **Data inconsistency:** "YOUR TOP GRAPES" here = Merlot 20 / Pinot Noir 19, but Palate says Pinot Noir 1 / Syrah 1. Two different computations of the same fact shown in two places.

### Taste survey — `taste-survey-390.png`
- Progress bar + "STEP 1 OF 7" + serif question + choice chips = clean onboarding. On-brand.
- "Next" disabled state = grey text on deep-Grenache fill → low contrast / reads broken rather than intentionally disabled.
- Big empty void below (top-weighted layout).

### Feedback — `feedback-390.png`
- Good form, good header copy ("Tell us what felt great and what broke").
- **Issue:** H1 is **DM Sans bold**, not Cormorant — same font-collapse as login and 404.

### 404 (reached via `/sommelier`, `/list-scan`) — `sommelier-real-390.png`, `list-scan-390.png`
- **Broken primary nav:** the **SOMM** bottom-tab (a headline feature, Pocket Sommelier) resolves to the 404 page — both via direct nav and via tab click. `/list-scan` too. Flag for engineering; may be gated/unbuilt in this build, but as rendered it is a dead primary tab.
- 404 page itself: H1 "Page not found." in **DM Sans bold** (font-collapse), and body "The page you're looking for doesn't exist or has been moved." is **generic** — the brand guide explicitly calls for warm, on-voice error copy.

### Alerts popover — `badge-detail-390.png` (opened inadvertently)
- Notification panel from the header grape button. "No new alerts yet." = flat empty state.

---

## Audit by dimension

### 1. Typography — *mostly disciplined; one collapse to fix*
- Cormorant is correctly reserved for editorial moments; DM Sans carries UI. Good instinct.
- **Failure:** page-level H1 randomly switches to DM Sans bold on login, feedback, and 404. When the same hierarchy level changes typeface, hierarchy reads as noise. **Rule: every page H1 is Cormorant.** Utilitarian screens can still be Cormorant at a smaller size.
- Display serif weight on entry titles reads ~500–600; the brand's "quiet confidence" spec is Light/Regular. Dial display weight to 400 for the whispered-luxury feel.
- Serif numerals are a latent signature — formalize a `numeric` type token and use it for every score, count, and stat.

### 2. Color discipline — *coherent base, leaky accents*
- The 60/30/10, inverted for dark, roughly holds: 60% wine-dark ground, 30% Grenache structure, 10% accents.
- **Gold (Viognier) is the leak.** Correct in badges (Réserve). Wrong on: feed point scores, "GRAPE" taxonomy chips. **Lock gold to: Réserve-tier, cellar-worthy/aging, genuine premium/value moments. Nothing else.**
- **Green (Verdot) misused** as a generic positive-delta color (palate "+1.6 pts"). Reserve for natural/organic/sustainability signals only.
- **Score has three colors** (gold / rose / none). Pick one.
- **Contrast:** rose-on-Grenache score chips, the disabled "Next" button, and `text-tertiary` (#5D5570) on the ground are all borderline/below AA for small text. Raise tertiary luminance or restrict it to large text.

### 3. Spacing / rhythm — *good on dense screens, wasteful on sparse ones*
- Card padding and the 0.12 border are consistent. Radii cluster into ~3 tiers (cards ~16–20, inner ~12, chips ~8) — acceptable, but formalize a radius token scale.
- Short screens (log, taste-survey, entry-detail) leave large bottom voids. Either center vertically, add a brand element (grape-cluster watermark), or bring secondary content up.
- Kill nested cards (log screen) — one surface level per context on a low-contrast dark theme.

### 4. Component consistency — *the core problem: ~10 button styles, 2 segmented controls*
Distinct button-like treatments counted in the wild:
1. Grenache solid pill (Sign In, Go home, Send feedback, Next, active filter)
2. Rose outline pill, sentence case (Share, feed "All")
3. Neutral/cream outline pill, sentence case (Edit entry, Create Account, Back home, My Circle, Manually enter, Skip)
4. **Pink outline pill, UPPERCASE tracked** (Upload Images) ← outlier
5. Thin small outline chip (Sort/Filter/Organize, BETA)
6. Text-only uppercase tracked link (SHOW, FORGOT PASSWORD?, EXPLORE →)
7. Ghost muted outline (Remove, Close)
8. Taxonomy chips, colored outline (REGION rose / GRAPE gold)
9. Score chips, filled-tint square (98 / 89 Pts)
10. Two segmented-control styles (outline-pill active vs filled-text active)

This is inventory drift, not intent. See canonical spec below.

### 5. Iconography & illustration — *motif reused; empty states abandoned*
- Grape-cluster geometry recurs in nav, badges, explore cards, header — good.
- Nav icons vary in weight; the Palate tab icon (an arch) has no obvious link to palate/grapes; explore category icons are too thin to read on dark.
- **Empty states have zero art direction:** placeholder image icons, flat tinted avatars, plain-text "No new alerts yet." The brand mark geometry — the one ownable visual — never appears in empty states. Biggest cheap win.

### 6. Motion — *effectively absent*
- Only evidence is `transition: background-color .2s` on buttons. No press states, no reveal, no shared-element transitions. A single motion-token set + a few signature animations would elevate everything (see spec).

### 7. Signature moments
Candidates, ranked by ownability:
1. **The Taste Map** (16-axis) — currently a list. This is *the* signature Cluster should own. Make it a radar/constellation built from the grape-circle motif.
2. **Badge unlock** — visuals already exist; add the reveal animation + toast (brand guide specifies it).
3. **Match / score reveal** — the number exists but is a tiny inconsistent label. Make scoring a ritual with the serif numeral and a count-up.
4. **Stat cards** — already good; extend the serif-numeral language.
5. **Cellar-entry detail** — turn the payoff screen into the showcase (rating + score + sensory + note, not photo + comments).

### 8. Information design — *worthy of the data? Not yet.*
- 16-axis sensory data → text lists. Entry detail → no data at all. This is the gap between the product's substance and its presentation.
- **Scale confusion:** UI shows a 1–5 rating (per project conventions), a 100-pt score ("89 Pts", "98"), and "92.9 avg" simultaneously. Users can't tell which number means what. Define one primary score, label it once, render it consistently.
- Same fact ("top grapes") computed two different ways on Palate vs Explore.

### 9. Voice in UI copy — *80% there; fix the edges*
- Editorial headers and grape descriptions are excellent.
- Off-brand: 404 body, "No new alerts yet.", "No new requests right now." — flat, database-adjacent. The guide gives the exact fix pattern ("No logs yet — every bottle has a story. Start with the last one you loved."). Rewrite every empty/error state to that standard.

---

## System-level spec (implementable)

### A. Typography tokens (add to `@theme` / a `type` scale)
| Token | Font | Size / line-height / weight / tracking | Use |
|---|---|---|---|
| `display` | Cormorant | 40–48 / 1.05 / 400 / -0.01em | Page H1 (all of them — no DM Sans H1s) |
| `title` | Cormorant | 28 / 1.15 / 400 | Card/section titles, wine names |
| `numeric` | Cormorant | contextual / 1 / 500 / tabular | **All** scores, counts, stats |
| `eyebrow` | DM Sans | 10 / 1 / 500 / 0.18em / uppercase | Section eyebrows (keep as-is) |
| `body` | DM Sans | 15 / 1.5 / 400 | UI text |
| `body-serif` | Cormorant | 17 / 1.6 / 400 | Editorial content (grape/region prose) |
| `caption` | DM Sans | 13 / 1.4 / 400 | Meta, helper |

Rule: **serif = brand & content & numbers; sans = interface.** No page H1 in sans.

### B. Canonical buttons (collapse 10 → 5)
- `Button/primary` — solid `--color-accent-primary` (#7B1D3A, **not** hover-magenta at rest), cream text, radius-pill, sentence case, weight 500. Hover → `--color-accent-hover`.
- `Button/secondary` — transparent, `--color-border-strong` outline, cream text, sentence case.
- `Button/ghost` — text only, `--color-accent-secondary`, optional `→`. (Absorbs SHOW / FORGOT PASSWORD / EXPLORE.)
- `Chip/filter` — small outline pill, sentence case; **selected** = solid Grenache. One style for Sort/Filter/Organize *and* segmented controls.
- `Chip/tag` — attribute/taxonomy; neutral tint by default. **Delete per-category colors** (no gold GRAPE). Gold only for premium tags.

Kill: the UPPERCASE tracked button (#4). Merge the two segmented-control styles into `Chip/filter`-selected. Never use `accent-hover` as a resting fill.

### C. Score system (one treatment)
- One canonical `ScoreBadge`: Cormorant `numeric`, cream on `--color-accent-soft`, radius-8, fixed min-width so missing scores reserve space (em-dash placeholder, not a gap).
- **Color encodes tier, not category:** ≥95 → subtle gold hairline ring (earns the premium accent); otherwise cream/rose. Never full-gold fill for ordinary scores.
- Pick ONE public scale and label it once ("92 / your match" or "92 pts"). Reconcile the 1–5 vs 100 vs avg display.

### D. Gold & green usage (hard rules, enforce in review)
- **Gold (`--color-accent-gold`)**: Réserve badges · cellar-worthy/aging · exceptional QPR/value · scores ≥95. Nothing else.
- **Green (`--color-natural`)**: natural/organic/biodynamic/sustainability signals only. Never a generic "positive" color — use cream/rose for deltas.

### E. Empty-state & illustration system
- Build 4–6 line illustrations from the **grape-cluster geometry** (the mark already in the badge SVGs): empty photo slot, no-alerts, no-requests, no-logs, no-photo avatar, 404.
- Every empty state: motif + one warm on-voice line. Replace generic image-placeholder icons and flat text.
- Rewrite 404 + all empty copy to the guide's warm standard.

### F. The Taste Map (signature #1)
- Replace the Palate top-grapes/regions lists with a **radar / constellation** over the 16 axes, nodes rendered as translucent grape-circles (the mark), Grenache fill, gold only where an axis is "Réserve-strong."
- Keep the list as a secondary "read the numbers" view. Lead with the picture.
- Reuse the exact same component, smaller, on the **entry detail** to show that wine's position vs. the user's palate.

### G. Entry-detail rebuild (signature #5)
Payoff order: serif wine name → **ScoreBadge + rating + enjoyment intent** → tasting note (serif) → **mini Taste Map** → photo carousel → comments. Data first, photo as support.

### H. Motion tokens
- `--ease-standard: cubic-bezier(.2,.8,.2,1)`; durations 120/200/320ms.
- Press: scale .98 + surface lighten on all interactive cards/buttons.
- Signature: score **count-up** on reveal; badge-unlock (ring draw + settle + toast); Taste-Map axes animate outward on load.
- One shared-element transition: list thumbnail → entry-detail hero.

---

## The 5 highest-leverage moves (ranked)

1. **Build the Taste Map.** Turn the 16-axis data from a list into a radar/constellation using the grape-circle motif, on Palate *and* entry detail. This is the product's soul and its most ownable visual. (Spec F.)
2. **Rebuild the entry-detail payoff screen** to actually show score, rating, enjoyment, note, and the mini Taste Map — not a photo and a comment count. (Spec G.) Highest ratio of "fixes a hole" to effort.
3. **Collapse the component set:** 5 canonical buttons, 1 segmented control, 1 ScoreBadge, and lock gold/green usage rules. Instantly reads as one system. (Specs B–D.)
4. **Fix the type collapse + formalize serif numerals:** every H1 → Cormorant, `numeric` token on all scores/stats. Cheap, systemic polish. (Spec A.)
5. **Empty-state & motion pass:** grape-cluster line illustrations + warm copy for every empty/error state, plus the motion-token set with score count-up and badge unlock. This is what pushes "nice" to "crafted." (Specs E, H.)

**Also flag to engineering (not design):** SOMM and list-scan primary routes 404; grape/region "of the day" cards render missing illustrations / placeholder bars; Palate vs Explore disagree on "top grapes"; score scale (1–5 vs 100 vs avg) is inconsistent across screens.
