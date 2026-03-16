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
