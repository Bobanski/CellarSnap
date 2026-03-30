import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  EntryGroup,
  EntryGroupMode,
  EntryPhotoType,
  GroupedEntrySlide,
} from "@/types/wine";
import { signPhotoUrls } from "@/server/storage/signedUrls";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type GroupAnchorEntry = {
  id: string;
  entry_group_id?: string | null;
};

type EntryGroupRow = {
  id: string;
  mode: EntryGroupMode;
  title: string;
  event_type: string | null;
  anchor_entry_id: string | null;
};

type EntryGroupSlideRow = {
  id: string;
  group_id: string;
  entry_id: string | null;
  photo_type: EntryPhotoType;
  path: string;
  position: number;
  created_at: string;
};

type SlideEntryRow = {
  id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  consumed_at: string;
  created_at: string;
};

type GroupedPostPayload = {
  entry_group: EntryGroup;
  group_slides: GroupedEntrySlide[];
  photo_gallery: Array<{ type: EntryPhotoType; url: string }>;
};

const CONTEXT_LABELS: Record<EntryPhotoType, string> = {
  label: "Wine",
  pairing: "Pairing",
  people: "People",
  place: "Place",
  lineup: "Lineup",
  other_bottles: "Other bottles",
};

function isMissingGroupedPostSchemaError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("entry_group") ||
    lower.includes("column") ||
    lower.includes("relation") ||
    lower.includes("does not exist")
  );
}

export async function resolveGroupedPostData(
  supabase: SupabaseClient,
  entries: GroupAnchorEntry[]
): Promise<Map<string, GroupedPostPayload>> {
  const entryGroupIdByEntryId = new Map<string, string>();
  entries.forEach((entry) => {
    if (typeof entry.entry_group_id === "string" && entry.entry_group_id.length > 0) {
      entryGroupIdByEntryId.set(entry.id, entry.entry_group_id);
    }
  });

  const groupIds = Array.from(new Set(entryGroupIdByEntryId.values()));
  if (groupIds.length === 0) {
    return new Map<string, GroupedPostPayload>();
  }

  const { data: groupRows, error: groupsError } = await supabase
    .from("entry_groups")
    .select("id, mode, title, event_type, anchor_entry_id")
    .in("id", groupIds);

  if (groupsError) {
    if (isMissingGroupedPostSchemaError(groupsError.message)) {
      return new Map<string, GroupedPostPayload>();
    }
    throw new Error(groupsError.message);
  }

  const { data: slideRows, error: slidesError } = await supabase
    .from("entry_group_slides")
    .select("id, group_id, entry_id, photo_type, path, position, created_at")
    .in("group_id", groupIds)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (slidesError) {
    if (isMissingGroupedPostSchemaError(slidesError.message)) {
      return new Map<string, GroupedPostPayload>();
    }
    throw new Error(slidesError.message);
  }

  const slideEntryIds = Array.from(
    new Set(
      (slideRows ?? [])
        .map((row) => row.entry_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );

  const { data: slideEntryRows, error: slideEntriesError } =
    slideEntryIds.length > 0
      ? await supabase
          .from("wine_entries")
          .select(
            "id, wine_name, producer, vintage, country, region, appellation, consumed_at, created_at"
          )
          .in("id", slideEntryIds)
      : { data: [] as SlideEntryRow[], error: null };

  if (slideEntriesError) {
    if (isMissingGroupedPostSchemaError(slideEntriesError.message)) {
      return new Map<string, GroupedPostPayload>();
    }
    throw new Error(slideEntriesError.message);
  }

  const signedUrlByPath = await signPhotoUrls(
    (slideRows ?? []).map((row) => row.path),
    supabase
  );

  const groupById = new Map<string, EntryGroupRow>(
    ((groupRows ?? []) as EntryGroupRow[]).map((row) => [row.id, row])
  );
  const slideEntryById = new Map<string, SlideEntryRow>(
    ((slideEntryRows ?? []) as SlideEntryRow[]).map((row) => [row.id, row])
  );
  const slidesByGroupId = new Map<string, EntryGroupSlideRow[]>();

  ((slideRows ?? []) as EntryGroupSlideRow[]).forEach((row) => {
    const current = slidesByGroupId.get(row.group_id) ?? [];
    current.push(row);
    slidesByGroupId.set(row.group_id, current);
  });

  const groupedPostByEntryId = new Map<string, GroupedPostPayload>();
  entryGroupIdByEntryId.forEach((groupId, entryId) => {
    const group = groupById.get(groupId);
    if (!group) {
      return;
    }

    const groupSlides = (slidesByGroupId.get(groupId) ?? [])
      .map((slide) => {
        const signedUrl = signedUrlByPath.get(slide.path) ?? null;
        if (!signedUrl) {
          return null;
        }
        const slideEntry =
          slide.entry_id && slideEntryById.has(slide.entry_id)
            ? slideEntryById.get(slide.entry_id) ?? null
            : null;

        const label =
          slide.photo_type === "label"
            ? slideEntry?.wine_name ??
              slideEntry?.producer ??
              slideEntry?.appellation ??
              slideEntry?.region ??
              "Wine"
            : CONTEXT_LABELS[slide.photo_type];

        return {
          id: slide.id,
          type: slide.photo_type,
          url: signedUrl,
          entry_id: slide.entry_id,
          label,
          wine_name: slideEntry?.wine_name ?? null,
          producer: slideEntry?.producer ?? null,
          vintage: slideEntry?.vintage ?? null,
          country: slideEntry?.country ?? null,
          region: slideEntry?.region ?? null,
          appellation: slideEntry?.appellation ?? null,
          consumed_at: slideEntry?.consumed_at ?? null,
          created_at: slideEntry?.created_at ?? null,
        } satisfies GroupedEntrySlide;
      })
      .filter((slide): slide is GroupedEntrySlide => slide !== null);

    groupedPostByEntryId.set(entryId, {
      entry_group: {
        id: group.id,
        mode: group.mode,
        title: group.title,
        event_type: group.event_type ?? null,
        anchor_entry_id: group.anchor_entry_id,
      },
      group_slides: groupSlides,
      photo_gallery: groupSlides.map((slide) => ({
        type: slide.type,
        url: slide.url,
      })),
    });
  });

  return groupedPostByEntryId;
}
