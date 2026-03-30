type ShareableEntryPrivacy = string | null | undefined;

export function canManageEntryShare(entryPrivacy: ShareableEntryPrivacy) {
  return entryPrivacy === "public";
}
