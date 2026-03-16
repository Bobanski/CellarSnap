/**
 * Dark Cellar — Mobile theme tokens
 * Warm dark theme — wine cellar at night, candlelit dinners, barrel rooms
 * Champagne becomes primary text, Grenache is hero accent
 * Implementation date: March 2026
 */
export const colors = {
  // ─── SCREEN & SURFACE HIERARCHY ────────────────────────
  // Layered depth: darkest base → lighter cards → subtle borders
  screenBg:         "#0D0A08",      // Deep warm black — the cellar
  surfacePrimary:   "#1A1210",      // Cards, main content areas
  surfaceRaised:    "#241C17",      // Elevated cards, modals, dropdowns
  surfaceHover:     "#2C2018",      // Hover state for interactive surfaces
  surfaceMuted:     "#1A1210",      // Alternate surface (same as primary)

  // ─── TEXT HIERARCHY ────────────────────────────────────
  textPrimary:      "#F5EDD6",      // Champagne — primary text (was background, now text!)
  textSecondary:    "#A89B8A",      // Warm muted — secondary text
  textTertiary:     "#6B5E52",      // Muted brown — placeholders, hints
  textOnAccent:     "#F5EDD6",      // Text on grenache buttons

  // ─── ACCENTS ──────────────────────────────────────────
  accentPrimary:    "#7B1D3A",      // Grenache — CTAs, active nav, primary buttons
  accentHover:      "#9B2449",      // Lighter grenache for hover
  accentSoft:       "rgba(123,29,58,0.15)",  // Grenache tint for backgrounds
  accentSecondary:  "#C4607A",      // Rose — tags, secondary highlights
  accentGold:       "#C9A84C",      // Viognier — badges only
  accentRose:       "#C4607A",      // Rose (alias for accentSecondary)
  accentPurple:     "#4A3060",      // Nebbiolo — depth moments

  // ─── BORDERS & DIVIDERS ────────────────────────────────
  border:           "rgba(245,237,214,0.08)",  // Subtle warm borders
  borderStrong:     "rgba(245,237,214,0.15)",  // Emphasized borders
  borderAccent:     "rgba(123,29,58,0.20)",    // Grenache border accent

  // ─── SEMANTIC COLORS ───────────────────────────────────
  success:          "#2D7D46",
  error:            "#C0392B",
  warning:          "#C9A84C",
  info:             "#3B82F6",

  // ─── OVERLAY & SHADOWS ─────────────────────────────────
  overlay:          "rgba(13,10,8,0.7)",       // Modal overlays
  shadowColor:      "rgba(0,0,0,0.4)",         // Shadows

  // ─── LEGACY / COMPATIBILITY ────────────────────────────
  white:            "#F5EDD6",
  black:            "#0D0A08",
  
  barolo:           "#4A0E1F",
  grenache:         "#7B1D3A",
  rose:             "#C4607A",
  nebbiolo:         "#4A3060",
  champagne:        "#F5EDD6",      // Now used as TEXT, not background
  limestone:        "#A89B8A",      // Maps to textSecondary
  terroir:          "#241C17",      // Maps to surfaceRaised
  fog:              "#A89B8A",      // Maps to textSecondary
  viognier:         "#C9A84C",

  // ─── DERIVED / UI helpers ──────────────────────────────
  cardBg:           "#1A1210",      // Card backgrounds (surfacePrimary)
  inputBg:          "#241C17",      // Input field backgrounds (surfaceRaised)
  inputBorder:      "rgba(245,237,214,0.08)",  // Input borders
  surfaceDark:      "#0D0A08",      // Deep backgrounds (screenBg)
  shadowColorWarm:  "rgba(0,0,0,0.4)",
  purpleGlow:       "rgba(74,48,96,0.15)",
} as const;

export type ColorToken = keyof typeof colors;
