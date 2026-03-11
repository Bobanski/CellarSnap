export type PublicProfileLike = {
  display_name?: string | null;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  name_display_preference?: "real_name" | "username" | null;
};

function clean(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function formatPreferredRealName(
  firstName: string | null,
  lastName: string | null
) {
  if (!firstName) {
    return null;
  }

  const lastInitial = lastName?.charAt(0).toUpperCase() ?? "";
  return lastInitial ? `${firstName} ${lastInitial}.` : firstName;
}

export function getPublicProfileName(
  profile: PublicProfileLike | null | undefined,
  fallback = "Unknown"
) {
  const displayName = clean(profile?.display_name);
  const username = clean(profile?.username) ?? displayName;
  const firstName = clean(profile?.first_name);
  const lastName = clean(profile?.last_name);
  const preferredRealName = formatPreferredRealName(firstName, lastName);
  const prefersUsername = profile?.name_display_preference === "username";

  if (displayName && clean(profile?.username) && displayName !== clean(profile?.username)) {
    return displayName;
  }

  if (!prefersUsername && preferredRealName) {
    return preferredRealName;
  }

  if (username) {
    return username;
  }

  if (preferredRealName) {
    return preferredRealName;
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
