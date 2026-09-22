import { distilledSeedForWineType, type PalateProfileRecord } from "./palateDistillation";
import { buildUserPreferenceVector, type PreferenceSourceEntry } from "./userPreferences";
import type { WineType } from "@/types/wine";

// One request-local contract for on-demand, refresh and list recommendations.
// Never retain a user's preferences in a process-global cache or generate a palate here.
export function createScoringPreferences(
  entries: PreferenceSourceEntry[],
  palate: PalateProfileRecord | null,
  build = buildUserPreferenceVector
) {
  const byType = new Map<WineType, ReturnType<typeof buildUserPreferenceVector>>();
  return (wineType: WineType) => {
    let preference = byType.get(wineType);
    if (!preference) {
      preference = build(entries, wineType, palate ? distilledSeedForWineType(palate, wineType) : null);
      byType.set(wineType, preference);
    }
    return preference;
  };
}
