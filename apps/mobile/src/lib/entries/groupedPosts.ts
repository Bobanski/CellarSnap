import { signPhotoUrls } from "@/src/lib/storage/signedUrls";
import { supabase } from "@/src/lib/supabase";

type MobileSupabaseClient = typeof supabase;

export type MobileEntryGroupMode = "event" | "catch_up";

export type MobileEntryGroup = {
  id: string;
  mode: MobileEntryGroupMode;
  title: string;
  event_type: string | null;
};

export type MobileGroupedEntrySlide = {
  id: string;
  type: string;
  url: string;
  entry_id: string | null;
  label: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  consumed_at: string | null;
  created_at: string | null;
};

type EntryWithGroupId = {
  id: string;
  entry_group_id?: string | null;
};

const GROUP_SLIDE_LABELS: Record<string, string> = {
  label: "Wine",
  pairing: "Pairing",
  people: "People",
  place: "Place",
  lineup: "Lineup",
  other_bottles: "Other bottles",
};

export async function resolveMobileGroupedPostData(
  entries: EntryWithGroupId[],
  options?: { supabaseClient?: MobileSupabaseClient }
) {
  const supabaseClient = options?.supabaseClient ?? supabase;
  const entryGroupIdByEntryId = new Map<string, string>();

  entries.forEach((entry) => {
    if (
      typeof entry.entry_group_id === "string" &&
      entry.entry_group_id.length > 0
    ) {
      entryGroupIdByEntryId.set(entry.id, entry.entry_group_id);
    }
  });

  const groupIds = Array.from(new Set(entryGroupIdByEntryId.values()));
  if (groupIds.length === 0) {
    return new Map<
      string,
      { entry_group: MobileEntryGroup; group_slides: MobileGroupedEntrySlide[] }
    >();
  }

  const [groupsResponse, slidesResponse] = await Promise.all([
    supabaseClient
      .from("entry_groups")
      .select("id, mode, title, event_type")
      .in("id", groupIds),
    supabaseClient
      .from("entry_group_slides")
      .select("id, group_id, entry_id, photo_type, path, position, created_at")
      .in("group_id", groupIds)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (groupsResponse.error || slidesResponse.error) {
    return new Map<
      string,
      { entry_group: MobileEntryGroup; group_slides: MobileGroupedEntrySlide[] }
    >();
  }

  const groupRows = (groupsResponse.data ?? []) as Array<{
    id: string;
    mode: string;
    title: string;
    event_type: string | null;
  }>;
  const slideRows = (slidesResponse.data ?? []) as Array<{
    id: string;
    group_id: string;
    entry_id: string | null;
    photo_type: string;
    path: string;
    position: number;
    created_at: string;
  }>;

  const slideEntryIds = Array.from(
    new Set(
      slideRows
        .map((row) => row.entry_id)
        .filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0
        )
    )
  );

  const slideEntryMap = new Map<
    string,
    {
      id: string;
      wine_name: string | null;
      producer: string | null;
      vintage: string | null;
      country: string | null;
      region: string | null;
      appellation: string | null;
      consumed_at: string;
      created_at: string;
    }
  >();

  if (slideEntryIds.length > 0) {
    const { data: slideEntryRows } = await supabaseClient
      .from("wine_entries")
      .select(
        "id, wine_name, producer, vintage, country, region, appellation, consumed_at, created_at"
      )
      .in("id", slideEntryIds);

    ((slideEntryRows ?? []) as Array<{
      id: string;
      wine_name: string | null;
      producer: string | null;
      vintage: string | null;
      country: string | null;
      region: string | null;
      appellation: string | null;
      consumed_at: string;
      created_at: string;
    }>).forEach((row) => {
      slideEntryMap.set(row.id, row);
    });
  }

  const slideSignedUrls = await signPhotoUrls(
    slideRows.map((row) => row.path),
    { supabaseClient }
  );

  const groupById = new Map(groupRows.map((row) => [row.id, row]));
  const slidesByGroupId = new Map<string, typeof slideRows>();

  slideRows.forEach((row) => {
    const current = slidesByGroupId.get(row.group_id) ?? [];
    current.push(row);
    slidesByGroupId.set(row.group_id, current);
  });

  const groupedPostByEntryId = new Map<
    string,
    { entry_group: MobileEntryGroup; group_slides: MobileGroupedEntrySlide[] }
  >();

  entryGroupIdByEntryId.forEach((groupId, entryId) => {
    const group = groupById.get(groupId);
    if (!group) {
      return;
    }
    if (group.mode !== "event" && group.mode !== "catch_up") {
      return;
    }

    const slides = (slidesByGroupId.get(groupId) ?? [])
      .map((slide) => {
        const signedUrl = slideSignedUrls.get(slide.path) ?? null;
        if (!signedUrl) {
          return null;
        }

        const slideEntry =
          slide.entry_id && slideEntryMap.has(slide.entry_id)
            ? slideEntryMap.get(slide.entry_id) ?? null
            : null;

        const label =
          slide.photo_type === "label"
            ? slideEntry?.wine_name ??
              slideEntry?.producer ??
              slideEntry?.appellation ??
              slideEntry?.region ??
              "Wine"
            : GROUP_SLIDE_LABELS[slide.photo_type] ?? slide.photo_type;

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
        } satisfies MobileGroupedEntrySlide;
      })
      .filter((slide): slide is MobileGroupedEntrySlide => slide !== null);

    groupedPostByEntryId.set(entryId, {
      entry_group: {
        id: group.id,
        mode: group.mode as MobileEntryGroupMode,
        title: typeof group.title === "string" ? group.title : "",
        event_type:
          typeof group.event_type === "string" ? group.event_type : null,
      },
      group_slides: slides,
    });
  });

  return groupedPostByEntryId;
}
