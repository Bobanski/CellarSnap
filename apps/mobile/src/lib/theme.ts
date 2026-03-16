/**
 * Midnight Noir — Mobile theme tokens
 * Deep editorial theme with purple-wine undertones, Nebbiolo influence
 * Implementation date: March 2026
 */
export const colors = {
  // ─── SCREEN & SURFACES ──────────────────────────────────
  screenBg:         "#0C0810",      // Deep purple-black — screen background
  surfacePrimary:   "#151020",      // Card backgrounds — barely-purple tint
  surfaceRaised:    "#1E1830",      // Modals, popovers — more purple visible
  surfaceHover:     "#261E3A",      // Interactive hover states
  surfaceTinted:    "rgba(74,48,96,0.12)",  // Special sections (learn, pocket somm)

  // ─── TEXT ───────────────────────────────────────────────
  textPrimary:      "#F0ECE4",      // Main body text — cool off-white
  textSecondary:    "#9B93A8",      // Secondary/muted text — lavender-gray
  textTertiary:     "#5D5570",      // Placeholders, very subtle UI
  textHighlight:    "#C4607A",      // Links, emphasized text — Rose color
  textOnAccent:     "#F0ECE4",      // Text on primary action buttons

  // ─── ACCENT & ACTION ────────────────────────────────────
  accentPrimary:    "#7B1D3A",      // Grenache — primary CTAs, bold actions
  accentHover:      "#9B2449",      // Grenache hover — brighter variant
  accentSoft:       "rgba(123,29,58,0.18)",  // Grenache tint for bg, pills
  accentSecondary:  "#C4607A",      // Rose — secondary buttons, tags, links
  accentRose:       "rgba(196,96,122,0.12)", // Rose-tinted backgrounds
  accentGold:       "#C9A84C",      // Viognier — premium badges, awards only
  accentPurple:     "#6B4D8A",      // Nebbiolo bright — accent accents

  // ─── BORDERS & EFFECTS ──────────────────────────────────
  border:           "rgba(196,96,122,0.10)",   // Subtle Rose-tinted borders
  borderStrong:     "rgba(196,96,122,0.22)",   // Emphasized/interactive borders
  purpleGlow:       "rgba(74,48,96,0.25)",     // Subtle purple glow effects
  overlay:          "rgba(12,8,16,0.75)",      // Modal/fullscreen overlay
  shadowColor:      "rgba(74,48,96,0.3)",      // Purple-tinted shadows

  // ─── SEMANTIC / INTENT ──────────────────────────────────
  success:          "#2D7D46",      // Positive/confirmation signals
  error:            "#C0392B",      // Errors, destructive actions
  info:             "#7C8FE6",      // Informational — softer blue for dark

  // ─── UTILITY ─────────────────────────────────────────────
  white:            "#FFFFFF",      // Pure white (text, very rare)
  black:            "#000000",      // Pure black (non-theme moments)

  // ─── LEGACY COMPAT (remove after migration) ─────────────
  barolo:           "#4A0E1F",
  grenache:         "#7B1D3A",
  rose:             "#C4607A",
  nebbiolo:         "#4A3060",
  champagne:        "#F5EDD6",      // OLD LIGHT THEME — do not use
  limestone:        "#E8E0D0",      // OLD LIGHT THEME — do not use
  terroir:          "#2C1A0E",      // OLD LIGHT THEME — do not use
  fog:              "#8A8078",      // OLD LIGHT THEME — do not use
  viognier:         "#C9A84C",

  // ─── DERIVED / UI helpers ────────────────
  cardBg:           "#151020",      // Card backgrounds (now surfacePrimary)
  inputBg:          "#1E1830",      // Input field backgrounds (now surfaceRaised)
  inputBorder:      "rgba(196,96,122,0.10)",  // Input borders (Rose-tinted)
  surfaceDark:      "#0C0810",      // Dark surfaces (screenBg)
  shadowColorWarm:  "rgba(74,48,96,0.25)",    // Purple shadow for compatibility
  warning:          "#C4607A",      // Rose for warnings
  borderAccent:     "rgba(196,96,122,0.18)",  // For compatibility
  surfaceMuted:     "#1E1830",      // For compatibility
} as const;

export type ColorToken = keyof typeof colors;
