export function resolveSharedTastingCopyTastedWithUserIds({
  viewerUserId,
  rootAuthorId,
  rootTaggedUserIds,
}: {
  viewerUserId: string;
  rootAuthorId: string | null | undefined;
  rootTaggedUserIds: readonly string[] | null | undefined;
}) {
  const result: string[] = [];
  const seen = new Set<string>();

  const pushIfEligible = (candidate: string | null | undefined) => {
    if (!candidate || candidate === viewerUserId || seen.has(candidate)) {
      return;
    }
    seen.add(candidate);
    result.push(candidate);
  };

  pushIfEligible(rootAuthorId);

  (rootTaggedUserIds ?? []).forEach((taggedUserId) => {
    pushIfEligible(taggedUserId);
  });

  return result;
}

export function shouldSuppressSharedCopyTagNotification({
  tagUserId,
  rootAuthorId,
  rootTaggedUserIds,
}: {
  tagUserId: string | null | undefined;
  rootAuthorId: string | null | undefined;
  rootTaggedUserIds: readonly string[] | null | undefined;
}) {
  if (!tagUserId) {
    return false;
  }

  if (rootAuthorId && tagUserId === rootAuthorId) {
    return true;
  }

  return (rootTaggedUserIds ?? []).includes(tagUserId);
}
