export type PublicProfileLike = {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

function clean(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getPublicProfileName(
  profile: PublicProfileLike | null | undefined,
  fallback = "Unknown"
) {
  const displayName = clean(profile?.display_name);
  if (displayName) {
    return displayName;
  }

  const fullName = [clean(profile?.first_name), clean(profile?.last_name)]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  if (fullName) {
    return fullName;
  }

  return fallback;
}

export function getPublicProfileInitial(
  profile: PublicProfileLike | null | undefined,
  fallback = "?"
) {
  const name = getPublicProfileName(profile, fallback);
  const initial = name.trim().charAt(0);
  return initial ? initial.toUpperCase() : fallback;
}
