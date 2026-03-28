import { StyleSheet } from "react-native";
import { colors } from "@/src/lib/theme";
import { fonts } from "@/src/lib/typography";

export const surveyStyles = StyleSheet.create({
  // ─── Screen ────────────────────────────────────────────────
  screen: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 48,
    gap: 20,
  },

  // ─── Progress bar ──────────────────────────────────────────
  progressWrap: {
    gap: 8,
    paddingTop: 8,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.surfaceRaised,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: colors.accentSecondary,
  },
  progressLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  // ─── Header ────────────────────────────────────────────────
  headerBlock: {
    gap: 6,
  },
  eyebrow: {
    color: colors.accentSecondary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.serif.light,
    fontSize: 30,
    lineHeight: 36,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },

  // ─── Chips (multi-select) ──────────────────────────────────
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTinted,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipActive: {
    borderColor: colors.accentPrimary,
    backgroundColor: colors.accentRose,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  chipTextActive: {
    color: colors.accentSecondary,
  },
  chipSmall: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTinted,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipSmallText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },

  // ─── Selected chip pills (removable) ──────────────────────
  selectedChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  selectedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accentRose,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  selectedChipText: {
    color: colors.accentSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  selectedChipRemove: {
    color: colors.accentPrimary,
    fontSize: 14,
    fontWeight: "700",
  },

  // ─── Search input ──────────────────────────────────────────
  searchInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
    color: colors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  searchResults: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    overflow: "hidden",
    marginTop: 4,
  },
  searchResultItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchResultText: {
    color: colors.textSecondary,
    fontSize: 13,
  },

  // ─── Single-select chips (budget) ──────────────────────────
  singleChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  // ─── Slider (adventurousness) ──────────────────────────────
  sliderSection: {
    gap: 12,
  },
  sliderLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sliderLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "600",
  },
  sliderLabelBold: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  sliderValue: {
    color: colors.accentSecondary,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  sliderTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceRaised,
  },

  // ─── Section label ─────────────────────────────────────────
  sectionLabel: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 8,
  },

  // ─── Free text (step 7) ────────────────────────────────────
  textArea: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
    color: colors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },

  // ─── Review card (step 7) ──────────────────────────────────
  reviewCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTinted,
    padding: 16,
    gap: 14,
  },
  reviewRow: {
    gap: 4,
  },
  reviewRowLabel: {
    color: colors.textTertiary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  reviewRowValue: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  reviewRowEmpty: {
    color: colors.textTertiary,
    fontSize: 13,
    fontStyle: "italic",
  },

  // ─── Navigation row ────────────────────────────────────────
  navRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  backButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceTinted,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  backButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  nextButton: {
    flex: 2,
    borderRadius: 12,
    backgroundColor: colors.accentPrimary,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    color: colors.textOnAccent,
    fontSize: 14,
    fontWeight: "700",
  },
  skipButton: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  skipButtonCentered: {
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  skipStepButton: {
    alignSelf: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  skipStepText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  skipText: {
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },

  // ─── Error ─────────────────────────────────────────────────
  errorText: {
    color: colors.error,
    fontSize: 13,
    textAlign: "center",
  },
});
