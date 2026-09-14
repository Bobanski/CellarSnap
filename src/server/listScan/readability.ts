export const UNREADABLE_WINE_LIST_MESSAGE =
  "We could not find any readable wines in this list. Upload a clear photo or PDF of the wine list, or try a webpage that displays the wines as text.";

export function assertReadableWineList(wines: readonly unknown[]): void {
  if (wines.length === 0) {
    throw new Error(UNREADABLE_WINE_LIST_MESSAGE);
  }
}
