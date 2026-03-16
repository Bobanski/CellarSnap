# CODEX — Cluster Brand Reskin

## Goal
Rebrand the app from **CellarSnap** to **Cluster** — new color palette, typography, app name, and icon. The current app uses a dark theme with zinc grays and amber accents. The new brand uses a warm light theme with wine-inspired colors.

---

## 1 — Create `apps/mobile/src/lib/theme.ts`

This is the single source of truth for every color in the app. No raw hex values anywhere else.

```ts
/**
 * Cluster brand tokens — derived from style guide v0.2 (March 2026)
 */
export const colors = {
  // ─── Brand ───────────────────────────────
  barolo:     "#4A0E1F",  // Deep backgrounds, strong text moments
  grenache:   "#7B1D3A",  // Brand primary — logo, CTAs, key UI
  rose:       "#C4607A",  // Accent — hover states, tags, energy
  nebbiolo:   "#4A3060",  // Depth accent — section moments, illustration

  // ─── Surfaces ────────────────────────────
  champagne:  "#F5EDD6",  // Primary background — warm white
  limestone:  "#E8E0D0",  // Cards, dividers, secondary surfaces

  // ─── Text ────────────────────────────────
  terroir:    "#2C1A0E",  // Body text — warmer than pure black
  fog:        "#8A8078",  // Secondary text, placeholders, subtle UI

  // ─── Accent ──────────────────────────────
  viognier:   "#C9A84C",  // Premium moments only — awards, badges

  // ─── Semantic ────────────────────────────
  success:    "#2D7D46",  // Confirmations, positive signals
  error:      "#C0392B",  // Errors, destructive actions
  info:       "#3B82F6",  // Informational highlights
  white:      "#FFFFFF",
  black:      "#000000",

  // ─── Derived / UI helpers ────────────────
  cardBg:     "#F5EDD6",  // Card backgrounds (same as champagne on light)
  inputBg:    "#FFFFFF",  // Input field backgrounds
  inputBorder:"#E8E0D0",  // Input borders
  overlay:    "rgba(44,26,14,0.5)",  // Modal overlays (terroir @ 50%)
  shadowColor:"#2C1A0E",  // Shadow base

  // ─── Compatibility shims (old → new) ─────
  // These map old semantic roles to new tokens.
  // Remove once migration is verified.
  screenBg:   "#F5EDD6",  // was #0f0a09
  surfaceDark:"#4A0E1F",  // was #171210 — for any remaining dark surfaces
} as const;

export type ColorToken = keyof typeof colors;
```

---

## 2 — Update `apps/mobile/src/lib/typography.ts`

Replace the entire file. Install fonts first:

```bash
cd apps/mobile
npx expo install expo-font @expo-google-fonts/cormorant-garamond @expo-google-fonts/dm-sans
```

Then rewrite `typography.ts`:

```ts
export const fonts = {
  /** Display / headlines — Canela approximation */
  serif: {
    light:      "CormorantGaramond_300Light",
    regular:    "CormorantGaramond_400Regular",
    lightItalic:"CormorantGaramond_300Light_Italic",
    italic:     "CormorantGaramond_400Regular_Italic",
  },
  /** UI / body / navigation — Sohne approximation */
  sans: {
    light:   "DMSans_300Light",
    regular: "DMSans_400Regular",
    medium:  "DMSans_500Medium",
  },
} as const;

// Keep this export for backward compat with AppText / DoneTextInput.
// After fonts load, set this to fonts.sans.regular.
export let APP_SANS_FONT_FAMILY: string | undefined = undefined;

export function activateFonts() {
  APP_SANS_FONT_FAMILY = fonts.sans.regular;
}
```

---

## 3 — Load fonts at app root

In `apps/mobile/app/_layout.tsx` (or wherever the root layout lives):

```ts
import {
  useFonts,
  CormorantGaramond_300Light,
  CormorantGaramond_400Regular,
  CormorantGaramond_300Light_Italic,
  CormorantGaramond_400Regular_Italic,
} from "@expo-google-fonts/cormorant-garamond";
import {
  DMSans_300Light,
  DMSans_400Regular,
  DMSans_500Medium,
} from "@expo-google-fonts/dm-sans";
import { activateFonts } from "@/src/lib/typography";

// Inside the component:
const [fontsLoaded] = useFonts({
  CormorantGaramond_300Light,
  CormorantGaramond_400Regular,
  CormorantGaramond_300Light_Italic,
  CormorantGaramond_400Regular_Italic,
  DMSans_300Light,
  DMSans_400Regular,
  DMSans_500Medium,
});

if (fontsLoaded) activateFonts();

// Keep the splash screen visible until fonts load:
// import * as SplashScreen from "expo-splash-screen";
// SplashScreen.preventAutoHideAsync();
// ... hide after fontsLoaded === true
```

---

## 4 — Color mapping (old → new)

The current app uses ~50 unique hex values. Here is the mapping. The intent is to shift from a dark zinc/amber palette to the warm light Cluster palette.

### Screen & surface backgrounds (DARK → LIGHT)
| Old (dark) | Count | New | Token |
|---|---|---|---|
| `#0f0a09` | 3 | `#F5EDD6` | `colors.champagne` — main screen bg |
| `#171210` | 8 | `#F5EDD6` | `colors.champagne` — screen bg |
| `#18110f` | 2 | `#E8E0D0` | `colors.limestone` — card bg |
| `#191513` | 2 | `#E8E0D0` | `colors.limestone` — card bg |
| `#14100f` | 1 | `#E8E0D0` | `colors.limestone` — card bg |
| `#140f08` | 1 | `#E8E0D0` | `colors.limestone` — card bg |
| `#1a1412` | 1 | `#E8E0D0` | `colors.limestone` — pill bg |
| `#1d1f26` | 2 | `#FFFFFF` | `colors.white` — modal/overlay surface |
| `#000000` / `#000` | 3 | `#2C1A0E` | `colors.terroir` — shadow or deepest bg |

### Primary accent (AMBER → GRENACHE)
| Old | Count | New | Token |
|---|---|---|---|
| `#fbbf24` (amber-400) | 23 | `#7B1D3A` | `colors.grenache` — primary buttons, CTAs |
| `#fcd34d` (amber-300) | 3 | `#C4607A` | `colors.rose` — lighter accent |
| `#fde68a` (amber-200) | 12 | `#C4607A` | `colors.rose` — highlights, tags |
| `#fef3c7` (amber-100) | 10 | `#F5EDD6` | `colors.champagne` — softest highlight |

### Text colors (LIGHT-ON-DARK → DARK-ON-LIGHT)
| Old | Count | New | Token |
|---|---|---|---|
| `#fafafa` (zinc-50) | 22 | `#2C1A0E` | `colors.terroir` — primary text |
| `#f4f4f5` (zinc-100) | 15 | `#2C1A0E` | `colors.terroir` — primary text |
| `#e4e4e7` (zinc-200) | 24 | `#2C1A0E` | `colors.terroir` — primary/secondary text |
| `#d4d4d8` (zinc-300) | 24 | `#8A8078` | `colors.fog` — secondary text |
| `#a1a1aa` (zinc-400) | 21 | `#8A8078` | `colors.fog` — placeholder text |
| `#71717a` (zinc-500) | 19 | `#8A8078` | `colors.fog` — muted text |
| `#09090b` (zinc-950) | 14 | `#F5EDD6` | `colors.champagne` — text on primary buttons |

### Semantic colors
| Old | Count | New | Token |
|---|---|---|---|
| `#34d399` (emerald) | 4 | `#2D7D46` | `colors.success` |
| `#86efac` (green-300) | — | `#2D7D46` | `colors.success` |
| `#bbf7d0` (green-200) | — | `#2D7D46` | `colors.success` (lighter usage: reduce opacity) |
| `#d1fae5` (green-100) | 5 | `#2D7D46` | `colors.success` at 15% opacity |
| `#a7f3d0` | 2 | `#2D7D46` | `colors.success` at 30% opacity |
| `#3b82f6` (blue) | 2 | `#3B82F6` | `colors.info` — keep as-is |
| `#fb7185` (rose-400) | 1 | `#C0392B` | `colors.error` |
| `#fda4af` (rose-300) | 2 | `#C4607A` | `colors.rose` — soft warning |
| `#fca5a5` (red-300) | 1 | `#C0392B` | `colors.error` |
| `#fecdd3` | 1 | `#C0392B` | `colors.error` at 30% opacity |
| `#007aff` (iOS blue) | 2 | `#7B1D3A` | `colors.grenache` — "Done" button tint |

### Specialty / keep or map
| Old | Count | New | Notes |
|---|---|---|---|
| `#4A3060` (nebbiolo) | 2 | `#4A3060` | Already Cluster brand — keep |
| `#f5e8bc`, `#f2c78f`, `#e7d491` | 2 each | Keep or map to `colors.viognier` | Gold/badge tones |
| `#fde6c7`, `#fde5ec`, `#f1bfd0`, `#f3eef8`, `#dbcfe7` | 2 each | Context-dependent | Wine-type indicator colors — review individually |
| `#e0f2fe`, `#dbeafe`, `#f8fafc` | 1-3 each | Keep or lighten | Info/blue tones |

---

## 5 — Migration approach (file by file)

Work through these files in order (most color references first):

| # | File | Color refs | Notes |
|---|---|---|---|
| 1 | `src/components/entries/newEntryStyles.ts` | 101 | The big one — all entry form styles |
| 2 | `src/screens/listScan/ListScanResultsScreen.tsx` | 57 | List scan results |
| 3 | `src/components/AppTopBar.tsx` | 26 | Top navigation bar |
| 4 | `src/screens/listScan/FacetMultiSelect.tsx` | 20 | Filter UI |
| 5 | `src/screens/listScan/ListScanIntakeScreen.tsx` | 18 | List scan intake |
| 6 | `src/screens/entries/NewEntryScreenContainer.tsx` | 12 | Entry form container |
| 7 | `src/screens/listScan/RegionFilterSelect.tsx` | 10 | Region filter |
| 8 | `src/screens/listScan/MatchThresholdSlider.tsx` | 5 | Slider component |
| 9 | `src/lib/entryFlow/newEntryUtils.ts` | 4 | Utility (wine-type colors) |
| 10 | `src/components/ReactionSummaryPills.tsx` | 3 | Reaction pills |
| 11 | `src/components/entries/newEntryFormParts.tsx` | 1 | Placeholder color |
| 12 | `src/components/entries/PostSaveSurveyModal.tsx` | 1 | Activity indicator |
| 13 | `src/components/KeyboardDoneAccessory.tsx` | 1 | "Done" button |
| 14 | `src/components/DoneTextInput.tsx` | 1 | "Done" button |

**For each file:**
1. Add `import { colors } from "@/src/lib/theme";` at the top
2. Replace every raw hex with the corresponding `colors.xxx` token using the mapping above
3. Verify no raw hex values remain: search for `#` in the file

---

## 6 — Update app name

### `apps/mobile/app.json`
```json
{
  "expo": {
    "name": "Cluster",
    "slug": "cellarsnap-mobile",  // keep slug for EAS continuity
    "scheme": "cluster",
    ...
  }
}
```

### UI strings — find and replace:
| File | Line | Old | New |
|---|---|---|---|
| `src/components/AppTopBar.tsx` | 450 | `CellarSnap` | `Cluster` |
| `src/screens/entries/NewEntryScreenContainer.tsx` | 1966 | `CellarSnap` | `Cluster` |

> **Do NOT rename** the `@cellarsnap/shared` package imports or the `com.cellarsnap.mobile` bundle ID — those are infrastructure, not user-facing.

---

## 7 — App icon & splash screen

### App icon
- Replace `apps/mobile/assets/icon.png` with the Cluster logo mark (1024×1024 PNG, no transparency, no rounded corners — Apple adds those)
- Background: `#F5EDD6` (Champagne) or `#4A0E1F` (Barolo) — whichever you prefer

### Splash screen
Add to `app.json`:
```json
{
  "expo": {
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#F5EDD6"
    }
  }
}
```
Create `splash.png` — the Cluster logo centered on Champagne background.

### Adaptive icon (Android)
```json
{
  "expo": {
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#F5EDD6"
      }
    }
  }
}
```

---

## 8 — StatusBar

Since we're moving from dark to light background, update the status bar style anywhere a screen renders. In the root layout or in individual screens:

```tsx
import { StatusBar } from "expo-status-bar";

<StatusBar style="dark" />  // dark text on light background
```

---

## 9 — Button contrast check

The biggest risk with this reskin is **button text legibility**. The old scheme used `#09090b` (near-black) text on `#fbbf24` (amber) buttons. The new scheme uses `#F5EDD6` (Champagne) text on `#7B1D3A` (Grenache) buttons.

**Verify these combinations pass WCAG AA (4.5:1 ratio):**
| Foreground | Background | Expected ratio | Pass? |
|---|---|---|---|
| `#F5EDD6` on `#7B1D3A` | Button text | ~8.2:1 | ✅ Yes |
| `#2C1A0E` on `#F5EDD6` | Body text | ~13.5:1 | ✅ Yes |
| `#8A8078` on `#F5EDD6` | Secondary text | ~3.2:1 | ⚠️ Borderline — OK for large text, check small |
| `#7B1D3A` on `#F5EDD6` | Links/CTAs | ~7.5:1 | ✅ Yes |

---

## 10 — QA checklist

After all replacements, open every screen on device and check:

- [ ] **Auth screens** — sign in, sign up, age gate
- [ ] **Entry flow** — all steps from scan to save
- [ ] **List scan** — intake, results, filters
- [ ] **Top bar** — brand name, menu, notifications
- [ ] **Reaction pills** — legible on new backgrounds
- [ ] **Modals / overlays** — survey, selects, pickers
- [ ] **Error states** — validation messages visible
- [ ] **Loading indicators** — spinners visible on new bg
- [ ] **Keyboard accessories** — "Done" button tint
- [ ] **StatusBar** — dark text on light bg, not invisible
- [ ] **App icon** — renders correctly at all sizes
- [ ] **Splash screen** — correct colors, logo centered

---

## Files touched (summary)

**New:**
- `src/lib/theme.ts`

**Modified:**
- `src/lib/typography.ts` (rewrite)
- `app/_layout.tsx` (font loading)
- `app.json` (name, splash, icon)
- 14 files with color replacements (see §5)
- 2 files with "CellarSnap" → "Cluster" string replacements (see §6)
- Asset files: `icon.png`, `splash.png`, `adaptive-icon.png`
