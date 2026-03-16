export const DRINKING_NOW_WINDOW_MS = 2.5 * 60 * 60 * 1000;
export const DRINKING_NOW_REFRESH_INTERVAL_MS = 60 * 1000;

export function isDrinkingNowActive({
  drinkingNow,
  createdAt,
  now = Date.now(),
}: {
  drinkingNow: unknown;
  createdAt: string | null | undefined;
  now?: number;
}) {
  if (drinkingNow !== true || typeof createdAt !== "string" || createdAt.trim().length === 0) {
    return false;
  }

  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) {
    return false;
  }

  return now >= createdAtMs && now < createdAtMs + DRINKING_NOW_WINDOW_MS;
}
