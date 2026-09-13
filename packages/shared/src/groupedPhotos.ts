/** Defense in depth: never sign/render a slide whose parent lookup was denied.
 * Entry-less context slides are authorized by the group's database policy.
 * This is not a substitute for photo or Storage RLS.
 */
export function filterVisibleGroupSlides<T extends { group_id: string; entry_id: string | null }>(
  slides: readonly T[],
  visibleGroupIds: ReadonlySet<string>,
  visibleEntryIds: ReadonlySet<string>,
): T[] {
  return slides.filter((slide) =>
    visibleGroupIds.has(slide.group_id) &&
    (slide.entry_id === null || visibleEntryIds.has(slide.entry_id))
  );
}

export type EventSlideIdentity = {
  id: string;
  entry_id: string | null;
  wine_name: string | null;
  producer: string | null;
};

/** Selection follows a stable photo ID through reordering. If access changes
 * remove that slide, select the first remaining authorized slide. Context has
 * no wine target; a photo-less event can still open its representative entry.
 */
export function resolveEventSelection<T extends EventSlideIdentity>(
  slides: readonly T[], selectedId: string | null,
  fallback: { id: string; wine_name: string | null; producer?: string | null },
) {
  const found = selectedId ? slides.findIndex(slide => slide.id === selectedId) : -1;
  const index = found >= 0 ? found : 0;
  const slide = slides[index] ?? null;
  return {
    index, slide,
    entryId: slide ? slide.entry_id : fallback.id,
    title: slide ? (slide.entry_id ? slide.wine_name || slide.producer || 'Unnamed wine' : 'Event context')
      : fallback.wine_name || fallback.producer || 'Unnamed wine',
  };
}
