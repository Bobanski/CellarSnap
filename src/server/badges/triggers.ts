import type { BadgeDefinition, BadgeTriggerSpec } from "@shared";
import type { BadgeEntryFact } from "./queries";

export type BadgeDecision = "earned" | "not_earned" | "deferred";
const canonicalWineTypes = new Set(["red", "white", "rose", "sparkling", "sweet", "orange"]);
export const normalizeBadgeValue = (value: string | null) => (value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
const matches = (value: string | null, expected: string) =>
  normalizeBadgeValue(value) === normalizeBadgeValue(expected);
const countResult = (count: number, threshold: number): BadgeDecision =>
  count >= threshold ? "earned" : "not_earned";

/** Exhaustive shared-union dispatch. Deferred means the source/meaning is not
 * established yet, never permission to award. All 85 definitions stay intact.
 */
export function evaluateBadgeTrigger(trigger: BadgeTriggerSpec, facts: readonly BadgeEntryFact[]): BadgeDecision {
  switch (trigger.type) {
    case "entry_count": return countResult(facts.length, trigger.count);
    case "country_match": return countResult(facts.filter(f => matches(f.country, trigger.country)).length, trigger.count);
    case "region_match": return countResult(facts.filter(f =>
      matches(f.region, trigger.region) || matches(f.appellation, trigger.region)).length, trigger.count);
    case "grape_match": {
      // 'love' is not a documented numeric band on the 1–100 rating scale.
      if (trigger.ratingFilter) return "deferred";
      const matching = facts.filter(f => f.grapes.some(g => matches(g, trigger.grape)));
      const regions = new Set(matching.map(f => normalizeBadgeValue(f.region)).filter(Boolean));
      return countResult(matching.length, trigger.count) === "earned" &&
        regions.size >= (trigger.minRegions ?? 0) ? "earned" : "not_earned";
    }
    case "wine_type_match": {
      // Natural, oak, terroir and structure aren't values of the wine_type enum.
      if (trigger.ratingFilter || !canonicalWineTypes.has(trigger.wineType)) return "deferred";
      const matching = facts.filter(f => matches(f.wine_type, trigger.wineType));
      const producers = new Set(matching.map(f => normalizeBadgeValue(f.producer)).filter(Boolean));
      return countResult(matching.length, trigger.count) === "earned" &&
        producers.size >= (trigger.minProducers ?? 0) ? "earned" : "not_earned";
    }
    case "compound": {
      if (!trigger.all.length) return "not_earned";
      const decisions = trigger.all.map(t => evaluateBadgeTrigger(t, facts));
      if (decisions.includes("deferred")) return "deferred";
      return decisions.every(d => d === "earned") ? "earned" : "not_earned";
    }
    case "rating_ratio":
    case "cross_region_count":
    case "founding_member":
    case "social_compatibility":
    case "social_tag_count":
    case "sommelier_group_count": return "deferred";
    default: {
      const exhaustive: never = trigger;
      throw new Error(`Unknown badge trigger: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** These definitions currently encode tasting counts for unrelated actions.
 * Preserve their published identities while AUD-09 establishes real sources.
 */
export function evaluateBadgeDefinition(badge: BadgeDefinition, facts: readonly BadgeEntryFact[]): BadgeDecision {
  if (badge.id === "challenge-winner" || badge.id === "cellar-master") return "deferred";
  return evaluateBadgeTrigger(badge.trigger, facts);
}
