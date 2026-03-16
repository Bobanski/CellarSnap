import { signPhotoUrls } from "@/src/lib/storage/signedUrls";
import { supabase } from "@/src/lib/supabase";

type MobileSupabaseClient = typeof supabase;

type EntryPhotoRow = {
  entry_id: string;
  path: string;
  position: number;
  created_at: string;
};

export type EntryLabelSource = {
  id: string;
  label_image_path: string | null;
};

export type ResolvedEntryLabel = {
  path: string | null;
  signedUrl: string | null;
};

export async function resolveEntryLabelPhotos(
  entries: Iterable<EntryLabelSource>,
  options?: {
    supabaseClient?: MobileSupabaseClient;
  }
) {
  const rows = Array.from(entries);
  const supabaseClient = options?.supabaseClient ?? supabase;
  const entryIds = rows.map((row) => row.id);
  const labelPathByEntryId = new Map<string, string>();

  if (entryIds.length > 0) {
    const { data, error } = await supabaseClient
      .from("entry_photos")
      .select("entry_id, path, position, created_at")
      .eq("type", "label")
      .in("entry_id", entryIds)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (!error && data) {
      (data as EntryPhotoRow[]).forEach((photo) => {
        if (!labelPathByEntryId.has(photo.entry_id)) {
          labelPathByEntryId.set(photo.entry_id, photo.path);
        }
      });
    }
  }

  const signedUrlByPath = await signPhotoUrls(
    rows.map((row) => labelPathByEntryId.get(row.id) ?? row.label_image_path ?? null),
    { supabaseClient }
  );

  const resolvedByEntryId = new Map<string, ResolvedEntryLabel>();
  rows.forEach((row) => {
    const path = labelPathByEntryId.get(row.id) ?? row.label_image_path ?? null;
    resolvedByEntryId.set(row.id, {
      path,
      signedUrl: path ? signedUrlByPath.get(path) ?? null : null,
    });
  });

  return resolvedByEntryId;
}
