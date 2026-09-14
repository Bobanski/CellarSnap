import type { SupabaseClient } from "@supabase/supabase-js";

export type ShareRow = {
  id: string;
  post_id: string;
  expires_at: string | null;
  mode: string | null;
};

export type EntryRow = {
  id: string;
  user_id: string;
  entry_privacy: string | null;
  label_photo_privacy: string | null;
  place_photo_privacy: string | null;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  rating: number | null;
  notes: string | null;
  consumed_at: string;
  country: string | null;
  region: string | null;
  appellation: string | null;
  qpr_level: string | null;
  label_image_path: string | null;
  entry_group_id: string | null;
};

type PublicProfileRow = {
  display_name: string | null;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  name_display_preference?: "real_name" | "username" | null;
};

export const SHARE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Current anonymous-share authority. The supplied client is server-only service
 * role; every query error, absent profile and non-public source fails closed. */
export async function resolvePublicShareSource(supabase: SupabaseClient, shareId: string) {
  if (!SHARE_ID_PATTERN.test(shareId)) return null;
  const {data: share, error: shareError} = await supabase.from("post_shares")
    .select("id, post_id, expires_at, mode").eq("id", shareId).is("revoked_at", null).maybeSingle();
  if (shareError || !share) return null;
  if (share.expires_at && (!Number.isFinite(Date.parse(share.expires_at)) || Date.parse(share.expires_at) <= Date.now())) return null;
  const {data: entry, error: entryError} = await supabase.from("wine_entries_with_ratings")
    .select("id, user_id, entry_privacy, label_photo_privacy, place_photo_privacy, wine_name, producer, vintage, rating, notes, consumed_at, country, region, appellation, qpr_level, label_image_path, entry_group_id")
    .eq("id", share.post_id).maybeSingle();
  if (entryError || !entry || entry.entry_privacy !== "public") return null;
  const {data: profile, error: profileError} = await supabase.from("public_profiles")
    .select("display_name, username, first_name, last_name, email, name_display_preference, is_test_account")
    .eq("id", entry.user_id).maybeSingle();
  if (profileError || !profile || profile.is_test_account !== false) return null;
  return {share: share as ShareRow, entry: entry as EntryRow, profile: profile as PublicProfileRow};
}
