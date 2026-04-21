/**
 * Midnight Noir — Mobile theme tokens
 * Deep editorial theme with purple-wine undertones (Nebbiolo influence)
 * Moody, magazine-like feel — Spotify dark meets wine bar meets editorial luxury
 * Implementation date: March 2026
 */
export const colors = {
  // ─── SCREEN & SURFACE HIERARCHY ────────────────────────
  // Surfaces have warm wine-red undertones
  screenBg:         "#1A0A10",      // Scroll void — deeper than card surface to create hierarchy
  surfacePrimary:   "#2E1420",      // Cards visibly sit above the void
  surfaceRaised:    "#3A1020",      // Modals, sheets, dropdowns lift above cards
  surfaceHover:     "#3E1828",      // Hover state above raised
  surfaceMuted:     "#3A1020",      // Alternate surface
  surfaceTinted:    "rgba(74,48,96,0.12)",  // Nebbiolo wash for special sections

  // ─── TEXT HIERARCHY ────────────────────────────────────
  textPrimary:      "#F5EDD6",      // Champagne — warm brand white
  textSecondary:    "#A08878",      // Dust — warm muted supporting text
  textTertiary:     "#5D5570",      // Muted purple — placeholders
  textOnAccent:     "#F5EDD6",      // Text on accent buttons
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
  border:           "rgba(196,96,122,0.12)",  // Rose-tinted card border (Round 4 lock)
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
  white:            "#F5EDD6",
  black:            "#1A0A10",
  
  barolo:           "#4A0E1F",
  grenache:         "#7B1D3A",
  rose:             "#C4607A",
  nebbiolo:         "#4A3060",
  champagne:        "#F5EDD6",      // Warm brand white
  limestone:        "#A08878",      // Maps to textSecondary (Dust)
  terroir:          "#3A1020",      // Maps to surfaceRaised
  fog:              "#A08878",      // Maps to textSecondary (Dust)
  viognier:         "#C9A84C",

  // ─── DERIVED / UI helpers ──────────────────────────────
  cardBg:           "#2E1420",      // Card backgrounds (surfacePrimary)
  inputBg:          "#3A1020",      // Input field backgrounds (surfaceRaised)
  inputBorder:      "rgba(196,96,122,0.10)",  // Rose-tinted input borders
  surfaceDark:      "#1A0A10",      // Deep backgrounds (screenBg)
} as const;

export type ColorToken = keyof typeof colors;