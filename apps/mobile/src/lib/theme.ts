/**
 * Smoke & Stone — Mobile theme tokens
 * Matte, textural, architectural dark theme with extreme color restraint
 * Wine colors (Grenache, Rose) appear sparingly — only on primary CTAs and key moments
 * Implementation date: March 2026
 */
export const colors = {
  // ─── SCREEN & SURFACE HIERARCHY ────────────────────────
  // All surfaces are close in value (flat, matte, architectural)
  screenBg:         "#141312",      // Charcoal stone — base, the "wall"
  surfacePrimary:   "#1C1B19",      // Stone slab — cards, containers, primary surfaces
  surfaceRaised:    "#252422",      // Lighter stone — modals, dropdowns, elevated
  surfaceHover:     "#2E2D2A",      // Warm highlight — interactive surfaces on hover
  surfaceMuted:     "#1F1E1C",      // Subtle alternate — sections, dividers

  // ─── TEXT HIERARCHY ────────────────────────────────────
  textPrimary:      "#E8E2D9",      // Warm stone white — primary body & headlines
  textSecondary:    "#A89B8A",      // Sandstone — secondary labels, descriptions
  textTertiary:     "#6B6358",      // Dark stone — placeholders, disabled text
  textOnAccent:     "#F5EDD6",      // Champagne — text ON wine-colored buttons

  // ─── ACCENTS (USED SPARINGLY) ──────────────────────────
  accentPrimary:    "#7B1D3A",      // Grenache — CTAs, logo, key actions ONLY
  accentHover:      "#9B2449",      // Grenache hover (lighter)
  accentSoft:       "rgba(123,29,58,0.10)",  // Very subtle Grenache wash (10% opacity)
  accentSecondary:  "#A89B8A",      // Stone itself as "accent" for secondary buttons
  accentGold:       "#C9A84C",      // Viognier — ONLY premium badges, awards
  accentRose:       "#C4607A",      // Rose — important interactive text (links, small accents)

  // ─── BORDERS & DIVIDERS ────────────────────────────────
  border:           "rgba(168,155,138,0.10)",  // Stone dust borders (subtle)
  borderStrong:     "rgba(168,155,138,0.20)",  // Emphasized borders, focus states
  borderAccent:     "rgba(123,29,58,0.18)",    // Grenache border accent (rare)

  // ─── SEMANTIC COLORS (Muted, Non-Competing) ────────────
  success:          "#5A8A62",      // Sage green — less saturated than other themes
  error:            "#A85444",      // Terracotta red — warm, not aggressive
  warning:          "#B8860B",      // Muted gold — use sparingly
  info:             "#6B89A8",      // Slate blue — calm, not bright

  // ─── OVERLAY & SHADOWS ─────────────────────────────────
  overlay:          "rgba(20,19,18,0.75)",    // Dark overlay at 75% opacity
  shadowColor:      "rgba(0,0,0,0.25)",       // Shadow base

  // ─── LEGACY / COMPATIBILITY ────────────────────────────
  // These preserve backward compatibility during migration from previous theme
  white:            "#F5EDD6",      // Warm white (champagne tone)
  black:            "#141312",      // Near-black (charcoal stone)
  
  // Old theme references (deprecated, for gradual migration)
  barolo:           "#7B1D3A",      // Maps to accentPrimary
  grenache:         "#7B1D3A",      // Maps to accentPrimary
  rose:             "#C4607A",      // Maps to accentRose
  nebbiolo:         "#A89B8A",      // Maps to accentSecondary
  champagne:        "#F5EDD6",      // Maps to textOnAccent
  limestone:        "#E8E2D9",      // Maps to textPrimary
  terroir:          "#252422",      // Maps to surfaceRaised
  fog:              "#A89B8A",      // Maps to textSecondary
  viognier:         "#C9A84C",      // Maps to accentGold

  // ─── DERIVED / UI helpers (for compatibility) ──────────
  cardBg:           "#1C1B19",      // Card backgrounds (surfacePrimary)
  inputBg:          "#252422",      // Input field backgrounds (surfaceRaised)
  inputBorder:      "rgba(168,155,138,0.10)",  // Input borders (stone dust)
  surfaceDark:      "#141312",      // Dark surfaces (screenBg)
  shadowColorWarm:  "rgba(0,0,0,0.25)",       // Shadow (neutral)
  purpleGlow:       "rgba(168,155,138,0.15)", // Subtle stone glow (not purple)
  accentPurple:     "#A89B8A",      // No purple in Smoke & Stone; mapped to stone
} as const;

export type ColorToken = keyof typeof colors;
