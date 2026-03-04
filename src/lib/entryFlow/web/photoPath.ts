export function buildOriginalPhotoPath(path: string) {
  const extensionMatch = path.match(/(\.[a-z0-9]+)$/i);
  if (!extensionMatch) {
    return `${path}__original`;
  }
  return path.replace(/(\.[a-z0-9]+)$/i, "__original$1");
}
