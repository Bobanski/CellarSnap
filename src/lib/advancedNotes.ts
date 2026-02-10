export const ACIDITY_LEVELS = [
  "low",
  "medium_minus",
  "medium",
  "medium_plus",
  "high",
] as const;

export const TANNIN_LEVELS = [
  "low",
  "medium_minus",
  "medium",
  "medium_plus",
  "high",
] as const;

export const ALCOHOL_LEVELS = ["low", "medium", "high"] as const;

export const SWEETNESS_LEVELS = [
  "dry",
  "off_dry",
  "medium_sweet",
  "sweet",
] as const;

export const BODY_LEVELS = [
  "light",
  "medium_minus",
  "medium",
  "medium_plus",
  "full",
] as const;

export type AcidityLevel = (typeof ACIDITY_LEVELS)[number];
export type TanninLevel = (typeof TANNIN_LEVELS)[number];
export type AlcoholLevel = (typeof ALCOHOL_LEVELS)[number];
export type SweetnessLevel = (typeof SWEETNESS_LEVELS)[number];
export type BodyLevel = (typeof BODY_LEVELS)[number];

export type AdvancedNotes = {
  acidity: AcidityLevel | null;
  tannin: TanninLevel | null;
  alcohol: AlcoholLevel | null;
  sweetness: SweetnessLevel | null;
  body: BodyLevel | null;
};

export type AdvancedNotesFormValues = {
  acidity: AcidityLevel | "";
  tannin: TanninLevel | "";
  alcohol: AlcoholLevel | "";
  sweetness: SweetnessLevel | "";
  body: BodyLevel | "";
};

type AdvancedNoteKey = keyof AdvancedNotes;

type AdvancedNoteOption = {
  value: string;
  label: string;
};

export const ADVANCED_NOTE_OPTIONS: Record<AdvancedNoteKey, readonly AdvancedNoteOption[]> = {
  acidity: [
    { value: "low", label: "Low" },
    { value: "medium_minus", label: "Medium-" },
    { value: "medium", label: "Medium" },
    { value: "medium_plus", label: "Medium+" },
    { value: "high", label: "High" },
  ],
  tannin: [
    { value: "low", label: "Low" },
    { value: "medium_minus", label: "Medium-" },
    { value: "medium", label: "Medium" },
    { value: "medium_plus", label: "Medium+" },
    { value: "high", label: "High" },
  ],
  alcohol: [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ],
  sweetness: [
    { value: "dry", label: "Dry" },
    { value: "off_dry", label: "Off-Dry" },
    { value: "medium_sweet", label: "Medium-Sweet" },
    { value: "sweet", label: "Sweet" },
  ],
  body: [
    { value: "light", label: "Light" },
    { value: "medium_minus", label: "Medium-" },
    { value: "medium", label: "Medium" },
    { value: "medium_plus", label: "Medium+" },
    { value: "full", label: "Full" },
  ],
};

export const ADVANCED_NOTE_FIELDS: readonly { key: AdvancedNoteKey; label: string }[] = [
  { key: "acidity", label: "Acidity" },
  { key: "tannin", label: "Tannin" },
  { key: "alcohol", label: "Alcohol" },
  { key: "sweetness", label: "Sweetness" },
  { key: "body", label: "Body" },
];

export const EMPTY_ADVANCED_NOTES_FORM_VALUES: AdvancedNotesFormValues = {
  acidity: "",
  tannin: "",
  alcohol: "",
  sweetness: "",
  body: "",
};

function normalizeFromAllowed<T extends readonly string[]>(
  value: unknown,
  allowed: T
): T[number] | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  return allowed.includes(value) ? (value as T[number]) : null;
}

export function normalizeAdvancedNotes(value: unknown): AdvancedNotes | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const input = value as Record<string, unknown>;
  const normalized: AdvancedNotes = {
    acidity: normalizeFromAllowed(input.acidity, ACIDITY_LEVELS),
    tannin: normalizeFromAllowed(input.tannin, TANNIN_LEVELS),
    alcohol: normalizeFromAllowed(input.alcohol, ALCOHOL_LEVELS),
    sweetness: normalizeFromAllowed(input.sweetness, SWEETNESS_LEVELS),
    body: normalizeFromAllowed(input.body, BODY_LEVELS),
  };

  const hasValue = Object.values(normalized).some((item) => item !== null);
  return hasValue ? normalized : null;
}

export function toAdvancedNotesFormValues(value: unknown): AdvancedNotesFormValues {
  const normalized = normalizeAdvancedNotes(value);
  if (!normalized) {
    return EMPTY_ADVANCED_NOTES_FORM_VALUES;
  }

  return {
    acidity: normalized.acidity ?? "",
    tannin: normalized.tannin ?? "",
    alcohol: normalized.alcohol ?? "",
    sweetness: normalized.sweetness ?? "",
    body: normalized.body ?? "",
  };
}

export function toAdvancedNotesPayload(
  value: AdvancedNotesFormValues
): AdvancedNotes | null {
  return normalizeAdvancedNotes(value);
}

export function formatAdvancedNoteValue(
  key: AdvancedNoteKey,
  value: AdvancedNotes[AdvancedNoteKey]
): string {
  if (value === null) {
    return "Not set";
  }

  const options = ADVANCED_NOTE_OPTIONS[key];
  const option = options.find((item) => item.value === value);
  return option?.label ?? "Not set";
}
