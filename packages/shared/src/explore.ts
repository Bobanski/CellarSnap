export function toExploreSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function grapeProfileUrl(name: string): string {
  return `/explore/grape/${toExploreSlug(name)}`;
}

export function regionProfileUrl(name: string): string {
  return `/explore/region/${toExploreSlug(name)}`;
}

export function producerProfileUrl(name: string): string {
  return `/explore/producer/${toExploreSlug(name)}`;
}
