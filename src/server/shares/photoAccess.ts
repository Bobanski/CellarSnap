import type { SupabaseClient } from "@supabase/supabase-js";

type SourceEntry = {
  id: string;
  user_id: string;
  entry_group_id: string | null;
  label_image_path: string | null;
  entry_privacy: string | null;
  label_photo_privacy: string | null;
  place_photo_privacy: string | null;
};
type Photo = { path: string; type: string };
type Slide = { path: string; entry_id: string | null; photo_type: string };
function publicPhoto(entry: Pick<SourceEntry, "entry_privacy" | "label_photo_privacy" | "place_photo_privacy">, type: string) {
  return entry.entry_privacy === "public" &&
    (type === "label" ? entry.label_photo_privacy ?? entry.entry_privacy :
      type === "place" ? entry.place_photo_privacy ?? entry.entry_privacy : entry.entry_privacy) === "public";
}

/** Service-role callers must explicitly use the database's public-only gate.
 * Missing migration, RPC errors and missing source metadata all fail closed.
 */
export async function resolvePublicSharePhotoPaths(
  supabase: SupabaseClient,
  entry: SourceEntry
) {
  const { data: rawPhotos } = await supabase.from("entry_photos")
    .select("path, type").eq("entry_id", entry.id)
    .order("position", { ascending: true }).order("created_at", { ascending: true });
  const ownPrefix = `${entry.user_id}/${entry.id}/`;
  const photos = ((rawPhotos ?? []) as Photo[]).filter(p =>
    p.path.startsWith(ownPrefix) && publicPhoto(entry, p.type));
  let groupedPaths: string[] = [];
  if (entry.entry_group_id) {
    const { data: group } = await supabase.from("entry_groups")
      .select("id, user_id, anchor_entry_id").eq("id", entry.entry_group_id).maybeSingle();
    if (group?.anchor_entry_id && group.user_id === entry.user_id) {
      const { data: anchor } = await supabase.from("wine_entries")
        .select("id").eq("id", group.anchor_entry_id).eq("user_id", group.user_id)
        .eq("entry_group_id", group.id).eq("entry_privacy", "public").maybeSingle();
      if (anchor) {
        const { data: slides } = await supabase.from("entry_group_slides")
          .select("path, entry_id, photo_type").eq("group_id", group.id)
          .order("position", { ascending: true }).order("created_at", { ascending: true });
        const candidates = (slides ?? []) as Slide[];
        const ids = [...new Set(candidates.map(s => s.entry_id ?? group.anchor_entry_id))];
        const { data: members } = ids.length ? await supabase.from("wine_entries")
          .select("id, entry_privacy, label_photo_privacy, place_photo_privacy").in("id", ids).eq("user_id", group.user_id)
          .eq("entry_group_id", group.id).eq("entry_privacy", "public") : { data: [] };
        const visibleMembers = new Map((members ?? []).map(m => [m.id, m]));
        groupedPaths = candidates.filter(s => {
          const id = s.entry_id ?? group.anchor_entry_id;
          const member = visibleMembers.get(id);
          return member && publicPhoto(member, s.photo_type) && s.path.startsWith(`${group.user_id}/${id}/`);
        }).map(s => s.path);
      }
    }
  }
  // Paths are opaque, never whitespace-normalized into another object's name.
  const legacyLabel = publicPhoto(entry, "label") && entry.label_image_path?.startsWith(ownPrefix) ? entry.label_image_path : null;
  const labels = [...photos.filter(p => p.type === "label").map(p => p.path), legacyLabel];
  const previews = [...groupedPaths, ...photos.map(p => p.path), ...labels];
  const candidates = [...new Set([...labels, ...previews].filter((p): p is string => Boolean(p && p !== "pending")))];
  const allowed = new Set<string>();
  await Promise.all(candidates.map(async path => {
    const { data, error } = await supabase.rpc("can_access_wine_photo", { object_name: path });
    if (!error && data === true) allowed.add(path);
  }));
  return {
    labelPath: labels.find((p): p is string => Boolean(p && allowed.has(p))) ?? null,
    previewPath: previews.find((p): p is string => Boolean(p && allowed.has(p))) ?? null,
  };
}
