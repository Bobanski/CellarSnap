export function canManageEntryShare(viewerUserId: string, ownerUserId: string) {
  return viewerUserId === ownerUserId;
}
