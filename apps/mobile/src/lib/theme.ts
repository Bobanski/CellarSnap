/**
 * Midnight Noir — Mobile theme tokens
 * Deep editorial theme with purple-wine undertones (Nebbiolo influence)
 * Moody, magazine-like feel — Spotify dark meets wine bar meets editorial luxury
 * Implementation date: March 2026
 */
export const colors = {
  // ─── SCREEN & SURFACE HIERARCHY ────────────────────────
  // Surfaces have subtle purple undertones — felt, not seen
  screenBg:         "#0C0810",      // Deep purple-black — midnight sky
  surfacePrimary:   "#151020",      // Cards — barely purple-tinted
  surfaceRaised:    "#1E1830",      // Elevated elements — more purple shows through
  surfaceHover:     "#261E3A",      // Hover — nebbiolo influence visible
  surfaceMuted:     "#1E1830",      // Alternate surface
  surfaceTinted:    "rgba(74,48,96,0.12)",  // Nebbiolo wash for special sections

  // ─── TEXT HIERARCHY ────────────────────────────────────
  textPrimary:      "#F0ECE4",      // Slightly cooler off-white (less yellow than champagne)
  textSecondary:    "#9B93A8",      // Lavender-gray — secondary text
  textTertiary:     "#5D5570",      // Muted purple — placeholders
  textOnAccent:     "#F0ECE4",      // Text on accent buttons
  textHighlight:    "#C4607A",      // Rose — for highlighted text, links

  // ─── ACCENTS ──────────────────────────────────────────
  accentPrimary:    "#7B1D3A",      // Grenache — primary CTAs
  accentHover:      "#9B2449",      // Brighter grenache hover
  accentSoft:       "rgba(123,29,58,0.18)",  // Grenache background tint
  accentSecondary:  "#C4607A",      // Rose — secondary buttons, tags, links (bigger role here)
  accentRose:       "rgba(196,96,122,0.12)", // Rose tint for pills/badges
  accentGold:       "#C9A84C",      // Viognier — premium only
  accentPurple:     "#6B4D8A",      // Lighter nebbiolo for accents (more vibrant)
  purpleGlow:       "rgba(74,48,96,0.25)",   // Subtle purple glow effects

  // ─── BORDERS & DIVIDERS ────────────────────────────────
  border:           "rgba(196,96,122,0.10)",  // Rose-tinted subtle borders
  borderStrong:     "rgba(196,96,122,0.22)",  // Emphasized borders with rose
  borderAccent:     "rgba(196,96,122,0.18)",  // Rose border accent

  // ─── SEMANTIC COLORS ───────────────────────────────────
  success:          "#2D7D46",
  error:            "#C0392B",
  warning:          "#C4607A",
  info:             "#7C8FE6",      // Softer blue to match purple palette

  // ─── OVERLAY & SHADOWS ─────────────────────────────────
  overlay:          "rgba(12,8,16,0.75)",    // Purple-tinted overlay
  shadowColor:      "rgba(74,48,96,0.3)",    // Purple-tinted shadows
  shadowColorWarm:  "rgba(74,48,96,0.25)",

  // ─── LEGACY / COMPATIBILITY ────────────────────────────
  white:            "#F0ECE4",
  black:            "#0C0810",
  
  barolo:           "#4A0E1F",
  grenache:         "#7B1D3A",
  rose:             "#C4607A",
  nebbiolo:         "#4A3060",
  champagne:        "#F0ECE4",      // Cooler off-white in this direction
  limestone:        "#9B93A8",      // Maps to textSecondary (lavender-gray)
  terroir:          "#1E1830",      // Maps to surfaceRaised
  fog:              "#9B93A8",      // Maps to textSecondary
  viognier:         "#C9A84C",

  // ─── DERIVED / UI helpers ──────────────────────────────
  cardBg:           "#151020",      // Card backgrounds (surfacePrimary)
  inputBg:          "#1E1830",      // Input field backgrounds (surfaceRaised)
  inputBorder:      "rgba(196,96,122,0.10)",  // Rose-tinted input borders
  surfaceDark:      "#0C0810",      // Deep backgrounds (screenBg)
} as const;

export type ColorToken = keyof typeof colors;