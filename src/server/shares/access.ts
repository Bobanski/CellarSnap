import { normalizePrivacyLevel } from "@shared";

type ShareableEntryPrivacy = string | null | undefined;

export function canManageEntryShare(entryPrivacy: ShareableEntryPrivacy) {
  return normalizePrivacyLevel(entryPrivacy, "public") === "public";
}
