import type { SupabaseClient } from "@supabase/supabase-js";
import { BADGE_DEFINITIONS, type BadgeDefinition, type Database } from "@shared";
import { createTypedSupabaseAdminClient } from "@/lib/supabase/admin";
import { log } from "@/server/log";
import { loadBadgeEntryFacts } from "./queries";
import { evaluateBadgeDefinition } from "./triggers";

export type EarnedBadge = Pick<BadgeDefinition, "id" | "name" | "tier" | "color" | "accent" | "shape" | "toastText">;

/** Call only after server authentication. Facts are read using the authenticated
 * client; the privileged client writes awards only for that same verified ID.
 * Request bodies and entry hints are deliberately not award evidence.
 */
export async function evaluateAndAwardBadges({ supabase, userId, createAwardWriter = createTypedSupabaseAdminClient }: {
  supabase: SupabaseClient<Database>;
  userId: string;
  createAwardWriter?: typeof createTypedSupabaseAdminClient;
}): Promise<{ newlyEarned: EarnedBadge[] }> {
  const { data: earnedRows, error: earnedError } = await supabase
    .from("user_badges").select("badge_id").eq("user_id", userId);
  if (earnedError || !earnedRows) throw new Error("Unable to load existing badges.");
  const earnedIds = new Set(earnedRows.map(row => row.badge_id));
  const candidates = BADGE_DEFINITIONS.filter(badge => !earnedIds.has(badge.id));
  if (!candidates.length) return { newlyEarned: [] };
  const facts = await loadBadgeEntryFacts(supabase, userId);
  const evaluated = candidates.map(badge => ({badge, decision: evaluateBadgeDefinition(badge, facts)}));
  const eligible = evaluated.filter(result => result.decision === "earned").map(result => result.badge);
  log.debug("Badge evaluation", { evaluated: evaluated.length, eligible: eligible.length,
    deferred: evaluated.filter(result => result.decision === "deferred").length });
  if (!eligible.length) return { newlyEarned: [] };

  const { data: inserted, error } = await createAwardWriter().from("user_badges")
    .upsert(eligible.map(badge => ({user_id: userId, badge_id: badge.id})),
      { onConflict: "user_id,badge_id", ignoreDuplicates: true }).select("badge_id");
  if (error || !inserted) throw new Error("Unable to persist earned badges.");
  // RETURNING contains only inserts that actually won a concurrent award race.
  const insertedIds = new Set(inserted.map(row => row.badge_id));
  return { newlyEarned: eligible.filter(badge => insertedIds.has(badge.id)).map(badge => ({
    id: badge.id, name: badge.name, tier: badge.tier, color: badge.color,
    accent: badge.accent, shape: badge.shape, toastText: badge.toastText,
  })) };
}
