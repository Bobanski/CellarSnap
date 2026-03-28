import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import Slider from "@react-native-community/slider";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";
import { useTasteSurvey } from "@/src/lib/tasteSurvey/context";
import { surveyStyles as s } from "@/src/lib/tasteSurvey/styles";
import { fetchTasteSurvey } from "@/src/lib/api/tasteSurvey";
import {
  WINE_TYPE_OPTIONS,
  STARTER_GRAPES,
  STARTER_REGIONS,
  WINE_REGIONS,
  COMMON_GRAPES,
  SENSORY_LOVE_OPTIONS,
  SENSORY_AVOID_OPTIONS,
  BUDGET_RESTAURANT_OPTIONS,
  BUDGET_RETAIL_OPTIONS,
  ADVENTUROUSNESS_MIN,
  ADVENTUROUSNESS_MAX,
  TASTE_SURVEY_STEP_COUNT,
  describeAdventurousness,
} from "@cellarsnap/shared";
import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";

// ─── helpers ─────────────────────────────────────────────────
function toggleInArray(arr: string[], item: string): string[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

// ─── Chip multi-select ───────────────────────────────────────
function ChipSelect({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (item: string) => void;
}) {
  return (
    <View style={s.chipWrap}>
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <Pressable
            key={opt}
            style={[s.chip, active && s.chipActive]}
            onPress={() => onToggle(opt)}
          >
            <AppText style={[s.chipText, active && s.chipTextActive]}>
              {opt}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Chip single-select ──────────────────────────────────────
function ChipSingleSelect({
  options,
  selected,
  onSelect,
}: {
  options: readonly string[];
  selected: string | null;
  onSelect: (item: string | null) => void;
}) {
  return (
    <View style={s.singleChipWrap}>
      {options.map((opt) => {
        const active = selected === opt;
        return (
          <Pressable
            key={opt}
            style={[s.chip, active && s.chipActive]}
            onPress={() => onSelect(active ? null : opt)}
          >
            <AppText style={[s.chipText, active && s.chipTextActive]}>
              {opt}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Grape search (API with local fallback) ─────────────────
function searchGrapesLocal(query: string): string[] {
  const lowerQ = query.toLowerCase();
  return COMMON_GRAPES.filter((g) => g.toLowerCase().includes(lowerQ)).slice(0, 8);
}

async function searchGrapesApi(query: string): Promise<string[]> {
  const baseUrl = getWebApiBaseUrl();
  const accessToken = await getAccessTokenForApi();
  if (!baseUrl || !accessToken) return searchGrapesLocal(query);
  try {
    const res = await fetch(
      `${baseUrl}/api/grapes?q=${encodeURIComponent(query)}&limit=8`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return searchGrapesLocal(query);
    const data = await res.json();
    const results = (data.grapes ?? []).map((g: { name: string }) => g.name);
    return results.length > 0 ? results : searchGrapesLocal(query);
  } catch {
    return searchGrapesLocal(query);
  }
}

// ─── Region local search ─────────────────────────────────────
function searchRegionsLocal(query: string): string[] {
  const lowerQ = query.toLowerCase();
  return WINE_REGIONS.filter((r) => r.toLowerCase().includes(lowerQ)).slice(0, 8);
}

// ─── Search + chip combo for grapes/regions ──────────────────
function SearchChipSelect({
  starterOptions,
  selected,
  onToggle,
  onAdd,
  placeholder,
  onSearch,
}: {
  starterOptions: readonly string[];
  selected: string[];
  onToggle: (item: string) => void;
  onAdd: (item: string) => void;
  placeholder: string;
  onSearch?: (query: string) => Promise<string[]> | string[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const applyResults = (matched: string[]) => {
      matched = matched.filter((item) => !selected.includes(item));
      if (matched.length === 0 && query.trim()) {
        setResults([query.trim()]);
      } else {
        setResults(matched.slice(0, 8));
      }
    };

    // If onSearch returns a Promise, debounce. If sync (local list), run instantly.
    if (onSearch) {
      const result = onSearch(query);
      if (result instanceof Promise) {
        let cancelled = false;
        const timer = setTimeout(() => {
          result.then((matched) => { if (!cancelled) applyResults(matched); });
        }, 150);
        return () => { cancelled = true; clearTimeout(timer); };
      }
      applyResults(result);
      return;
    }

    // Local filter — instant
    const lowerQ = query.toLowerCase();
    const matched = [...starterOptions].filter(
      (item) => item.toLowerCase().includes(lowerQ)
    );
    applyResults(matched);
  }, [query, starterOptions, selected, onSearch]);

  return (
    <View style={{ gap: 12 }}>
      {/* Selected pills */}
      {selected.length > 0 && (
        <View style={s.selectedChipWrap}>
          {selected.map((item) => (
            <Pressable
              key={item}
              style={s.selectedChip}
              onPress={() => onToggle(item)}
            >
              <AppText style={s.selectedChipText}>{item}</AppText>
              <AppText style={s.selectedChipRemove}>x</AppText>
            </Pressable>
          ))}
        </View>
      )}

      {/* Starter chips */}
      <ChipSelect
        options={starterOptions}
        selected={selected}
        onToggle={onToggle}
      />

      {/* Search */}
      <TextInput
        style={s.searchInput}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="words"
        autoCorrect={false}
      />

      {/* Results dropdown */}
      {results.length > 0 && (
        <View style={s.searchResults}>
          {results.map((item) => (
            <Pressable
              key={item}
              style={s.searchResultItem}
              onPress={() => {
                onAdd(item);
                setQuery("");
                setResults([]);
              }}
            >
              <AppText style={s.searchResultText}>{item}</AppText>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Step components ─────────────────────────────────────────

function StepWineTypes() {
  const { draft, updateDraft } = useTasteSurvey();
  return (
    <>
      <View style={s.headerBlock}>
        <AppText style={s.eyebrow}>TASTE PROFILE</AppText>
        <AppText style={s.title}>What do you typically drink?</AppText>
        <AppText style={s.subtitle}>Select the types of wine you enjoy most often.</AppText>
      </View>
      <ChipSelect
        options={WINE_TYPE_OPTIONS}
        selected={draft.wineTypes}
        onToggle={(item) =>
          updateDraft({ wineTypes: toggleInArray(draft.wineTypes, item) })
        }
      />
    </>
  );
}

function StepGrapes() {
  const { draft, updateDraft } = useTasteSurvey();
  const toggle = (item: string) =>
    updateDraft({ varietals: toggleInArray(draft.varietals, item) });
  const add = (item: string) => {
    if (!draft.varietals.includes(item)) {
      updateDraft({ varietals: [...draft.varietals, item] });
    }
  };
  return (
    <>
      <View style={s.headerBlock}>
        <AppText style={s.title}>What are your favorite grapes?</AppText>
        <AppText style={s.subtitle}>
          Pick all the varietals you tend to reach for.
        </AppText>
      </View>
      <View style={s.chipWrap}>
        {(["Cabernet Sauvignon", "Merlot", "Pinot Noir", "Grenache", "Syrah / Shiraz", "Chardonnay", "Sauvignon Blanc", "Riesling"] as const).map((grape) => {
          const active = draft.varietals.includes(grape);
          return (
            <Pressable
              key={grape}
              style={[s.chipSmall, active && s.chipActive]}
              onPress={() => (active ? toggle(grape) : add(grape))}
            >
              <AppText style={[s.chipSmallText, active && s.chipTextActive]}>
                {grape}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <SearchChipSelect
        starterOptions={[]}
        selected={draft.varietals}
        onToggle={toggle}
        onAdd={add}
        placeholder="Search for more grapes..."
        onSearch={searchGrapesApi}
      />
    </>
  );
}

function StepRegions() {
  const { draft, updateDraft } = useTasteSurvey();
  const toggle = (item: string) =>
    updateDraft({ regions: toggleInArray(draft.regions, item) });
  const add = (item: string) => {
    if (!draft.regions.includes(item)) {
      updateDraft({ regions: [...draft.regions, item] });
    }
  };
  return (
    <>
      <View style={s.headerBlock}>
        <AppText style={s.title}>Regions</AppText>
        <AppText style={s.subtitle}>
          Where does your favorite wine come from?
        </AppText>
      </View>
      <SearchChipSelect
        starterOptions={STARTER_REGIONS}
        selected={draft.regions}
        onToggle={toggle}
        onAdd={add}
        placeholder="Search countries or regions..."
        onSearch={async (q) => searchRegionsLocal(q)}
      />
    </>
  );
}

function StepLoves() {
  const { draft, updateDraft } = useTasteSurvey();
  return (
    <>
      <View style={s.headerBlock}>
        <AppText style={s.title}>What styles of wine do you love most?</AppText>
        <AppText style={s.subtitle}>Tap the styles that speak to you.</AppText>
      </View>
      <ChipSelect
        options={SENSORY_LOVE_OPTIONS}
        selected={draft.sensoryLoves}
        onToggle={(item) =>
          updateDraft({
            sensoryLoves: toggleInArray(draft.sensoryLoves, item),
          })
        }
      />
    </>
  );
}

function StepAvoids() {
  const { draft, updateDraft } = useTasteSurvey();
  return (
    <>
      <View style={s.headerBlock}>
        <AppText style={s.title}>And what styles of wine do you tend to avoid?</AppText>
        <AppText style={s.subtitle}>
          The styles that never quite work for you.
        </AppText>
      </View>
      <ChipSelect
        options={SENSORY_AVOID_OPTIONS}
        selected={draft.sensoryAvoids}
        onToggle={(item) =>
          updateDraft({
            sensoryAvoids: toggleInArray(draft.sensoryAvoids, item),
          })
        }
      />
    </>
  );
}

function StepDetails() {
  const { draft, updateDraft } = useTasteSurvey();
  return (
    <>
      <View style={s.headerBlock}>
        <AppText style={s.title}>A few more details</AppText>
        <AppText style={s.subtitle}>
          This helps us fine-tune recommendations.
        </AppText>
      </View>

      <AppText style={s.sectionLabel}>
        Restaurant bottle budget
      </AppText>
      <ChipSingleSelect
        options={BUDGET_RESTAURANT_OPTIONS}
        selected={draft.budgetRestaurant}
        onSelect={(v) => updateDraft({ budgetRestaurant: v })}
      />

      <AppText style={s.sectionLabel}>
        Retail bottle budget
      </AppText>
      <ChipSingleSelect
        options={BUDGET_RETAIL_OPTIONS}
        selected={draft.budgetRetail}
        onSelect={(v) => updateDraft({ budgetRetail: v })}
      />

      <AppText style={s.sectionLabel}>
        How adventurous are you?
      </AppText>
      <View style={s.sliderSection}>
        <Slider
          minimumValue={ADVENTUROUSNESS_MIN}
          maximumValue={ADVENTUROUSNESS_MAX}
          step={1}
          value={draft.adventurousness}
          onValueChange={(v) => updateDraft({ adventurousness: v })}
          minimumTrackTintColor={colors.accentSecondary}
          maximumTrackTintColor={colors.surfaceRaised}
          thumbTintColor={colors.accentSecondary}
        />
        <View style={s.sliderLabelRow}>
          <AppText style={s.sliderLabelBold}>I know what I like</AppText>
          <AppText style={s.sliderLabelBold}>Always exploring</AppText>
        </View>
      </View>
    </>
  );
}

function StepReview() {
  const { draft, updateDraft } = useTasteSurvey();

  const summaryRows: { label: string; value: string }[] = [
    { label: "Types", value: draft.wineTypes.join(", ") },
    { label: "Go-to Grapes", value: draft.varietals.join(", ") },
    { label: "Regions", value: draft.regions.join(", ") },
    { label: "You Love", value: draft.sensoryLoves.join(", ") },
    { label: "You Avoid", value: draft.sensoryAvoids.join(", ") },
    {
      label: "Budget",
      value: [
        draft.budgetRestaurant ? `${draft.budgetRestaurant} (restaurant)` : null,
        draft.budgetRetail ? `${draft.budgetRetail} (retail)` : null,
      ]
        .filter(Boolean)
        .join(", "),
    },
    { label: "Adventurousness", value: describeAdventurousness(draft.adventurousness) },
  ];

  return (
    <>
      <View style={s.headerBlock}>
        <AppText style={s.eyebrow}>REVIEW & CONFIRM</AppText>
        <AppText style={s.title}>Your taste profile</AppText>
        <AppText style={s.subtitle}>
          Here's your taste profile for now. You can always come back and edit this later.
        </AppText>
      </View>

      <View style={s.reviewCard}>
        {summaryRows.map((row) => (
          <View key={row.label} style={s.reviewRow}>
            <AppText style={s.reviewRowLabel}>{row.label}</AppText>
            {row.value ? (
              <AppText style={s.reviewRowValue}>{row.value}</AppText>
            ) : (
              <AppText style={s.reviewRowEmpty}>Skipped</AppText>
            )}
          </View>
        ))}
      </View>

      <AppText style={s.sectionLabel}>Anything else?</AppText>
      <TextInput
        style={s.textArea}
        placeholder="e.g., I prefer natural wines, or I'm allergic to sulfites"
        placeholderTextColor={colors.textTertiary}
        multiline
        value={draft.freeText}
        onChangeText={(t) => updateDraft({ freeText: t })}
      />
    </>
  );
}

// ─── Step validation ─────────────────────────────────────────
function useStepValid(step: number, draft: { wineTypes: string[] }) {
  if (step === 1) return draft.wineTypes.length > 0;
  return true; // all other steps are optional
}

// ─── Main screen ─────────────────────────────────────────────
export default function TasteSurveyScreen() {
  const router = useRouter();
  const ctx = useTasteSurvey();
  const { step, canGoNext, canGoBack, goNext, goBack, progress, submit, errorMessage, isSubmitting, draft, prefill } = ctx;
  const [loading, setLoading] = useState(true);

  const isValid = useStepValid(step, draft);
  const isLastStep = step === TASTE_SURVEY_STEP_COUNT;

  // Load existing survey for editing
  useEffect(() => {
    (async () => {
      try {
        const result = await fetchTasteSurvey();
        if (result.ok && result.survey) {
          prefill(result.survey);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [prefill]);

  const handleNext = async () => {
    if (isLastStep) {
      const ok = await submit();
      if (ok) {
        router.replace("/(app)/feed");
      }
    } else {
      goNext();
    }
  };

  if (loading) {
    return (
      <View style={[s.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.accentSecondary} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Skip survey */}
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <Pressable
            style={s.skipButton}
            onPress={() => router.replace("/(app)/feed")}
          >
            <AppText style={s.skipText}>Skip survey for now</AppText>
          </Pressable>
        </View>

        {/* Progress */}
        <View style={s.progressWrap}>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <AppText style={s.progressLabel}>
            Step {step} of {TASTE_SURVEY_STEP_COUNT}
          </AppText>
        </View>

        {/* Step content */}
        {step === 1 && <StepWineTypes />}
        {step === 2 && <StepGrapes />}
        {step === 3 && <StepRegions />}
        {step === 4 && <StepLoves />}
        {step === 5 && <StepAvoids />}
        {step === 6 && <StepDetails />}
        {step === 7 && <StepReview />}

        {/* Error */}
        {errorMessage && <AppText style={s.errorText}>{errorMessage}</AppText>}

        {/* Navigation */}
        <View style={s.navRow}>
          {canGoBack && (
            <Pressable style={s.backButton} onPress={goBack}>
              <AppText style={s.backButtonText}>Back</AppText>
            </Pressable>
          )}
          <Pressable
            style={[
              s.nextButton,
              (!isValid || isSubmitting) && s.nextButtonDisabled,
            ]}
            onPress={handleNext}
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.textOnAccent} />
            ) : (
              <AppText style={s.nextButtonText}>
                {isLastStep ? "Save my profile" : "Next"}
              </AppText>
            )}
          </Pressable>
        </View>

        {/* Skip to next step — centered below navigation */}
        {!isLastStep && (
          <Pressable style={s.skipStepButton} onPress={goNext}>
            <AppText style={s.skipStepText}>Skip to next step</AppText>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
