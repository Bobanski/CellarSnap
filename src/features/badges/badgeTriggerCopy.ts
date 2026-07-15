import type { BadgeTriggerSpec } from "@shared";

/**
 * Human-readable "how you earn this" copy derived from a badge's trigger
 * spec. Used on the back face of a flipped badge tile (see BadgeCard) so a
 * locked badge's back reveals what to do instead of just a description.
 */
export function describeBadgeTrigger(trigger: BadgeTriggerSpec): string {
  switch (trigger.type) {
    case "entry_count":
      return `Log ${trigger.count} wine${trigger.count === 1 ? "" : "s"}.`;
    case "region_match":
      return `Log ${trigger.count} wine${trigger.count === 1 ? "" : "s"} from ${trigger.region}.`;
    case "country_match":
      return `Log ${trigger.count} wine${trigger.count === 1 ? "" : "s"} from ${trigger.country}.`;
    case "grape_match": {
      const rating =
        trigger.ratingFilter === "love"
          ? " you loved"
          : trigger.ratingFilter === "love_or_like"
            ? " you rated love or like"
            : "";
      const regions = trigger.minRegions
        ? ` across ${trigger.minRegions}+ regions`
        : "";
      return `Log ${trigger.count} ${trigger.grape} wine${trigger.count === 1 ? "" : "s"}${rating}${regions}.`;
    }
    case "wine_type_match": {
      const rating =
        trigger.ratingFilter === "love"
          ? " you loved"
          : trigger.ratingFilter === "love_or_like"
            ? " you rated love or like"
            : "";
      const producers = trigger.minProducers
        ? ` from ${trigger.minProducers}+ producers`
        : "";
      return `Log ${trigger.count} ${trigger.wineType} wine${trigger.count === 1 ? "" : "s"}${rating}${producers}.`;
    }
    case "rating_ratio":
      return `Keep ${Math.round(trigger.ratio * 100)}% of your ${trigger.filter} ratings above the line.`;
    case "cross_region_count":
      return trigger.minTerroirs
        ? `Log wines from ${trigger.count} regions across ${trigger.minTerroirs}+ terroirs.`
        : `Log wines from ${trigger.count} different regions.`;
    case "founding_member":
      return "Be one of Cluster's founding members.";
    case "social_compatibility":
      return `Reach a ${trigger.minScore}%+ palate match with a friend.`;
    case "social_tag_count":
      return `Tag friends in ${trigger.count} tasting${trigger.count === 1 ? "" : "s"}.`;
    case "sommelier_group_count":
      return `Complete ${trigger.count} sommelier-guided tasting${trigger.count === 1 ? "" : "s"}.`;
    case "compound":
      return trigger.all.map(describeBadgeTrigger).join(" And ");
    default:
      return "Keep tasting to unlock this one.";
  }
}
