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
