type QueryError = {
  message: string;
  code?: string | null;
};

type SelectQueryBuilder = {
  select: (columns: string) => SelectQueryBuilder;
  ilike: (column: string, value: string) => SelectQueryBuilder;
  limit: (count: number) => SelectQueryBuilder;
  maybeSingle: () => Promise<{
    data: unknown;
    error: QueryError | null;
  }>;
};

export type ResolverSupabaseClient = {
  from: (table: string) => unknown;
};

export type RegionMatch = {
  canonical_region: string | null;
  canonical_sub_region: string | null;
  canonical_country: string | null;
  alias_type: string;
  matched: true;
};

export type ProducerMatch = {
  canonical_producer_name: string | null;
  alias_type: string;
  matched: true;
};

export type GrapeMatch = {
  canonical_name: string | null;
  variety_id: string | null;
  alias_type: string;
  matched: true;
};

type RegionAliasRow = {
  canonical_region: string | null;
  canonical_sub_region: string | null;
  canonical_country: string | null;
  alias_type: string | null;
};

type ProducerAliasRow = {
  canonical_producer_name: string | null;
  alias_type: string | null;
};

type GrapeAliasRow = {
  variety_id: string | null;
  alias_type: string | null;
  grape_varieties:
    | {
        name: string | null;
      }
    | {
        name: string | null;
      }[]
    | null;
};

function normalizeOptionalString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeAliasText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function unwrapGrapeVariety(value: GrapeAliasRow["grape_varieties"]) {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

export async function lookupRegionAlias(
  supabase: ResolverSupabaseClient,
  rawRegion: string | null | undefined
): Promise<RegionMatch | null> {
  const region = normalizeOptionalString(rawRegion);
  if (!region) {
    return null;
  }

  const { data, error } = await (supabase
    .from("region_aliases") as SelectQueryBuilder)
    .select("canonical_region, canonical_sub_region, canonical_country, alias_type")
    .ilike("alias", region)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as RegionAliasRow | null;
  if (!row) {
    return null;
  }

  return {
    canonical_region: normalizeOptionalString(row.canonical_region),
    canonical_sub_region: normalizeOptionalString(row.canonical_sub_region),
    canonical_country: normalizeOptionalString(row.canonical_country),
    alias_type: normalizeOptionalString(row.alias_type) ?? "exact",
    matched: true,
  };
}

export async function lookupProducerAlias(
  supabase: ResolverSupabaseClient,
  rawProducer: string | null | undefined
): Promise<ProducerMatch | null> {
  const producer = normalizeOptionalString(rawProducer);
  if (!producer) {
    return null;
  }

  const { data, error } = await (supabase
    .from("producer_aliases") as SelectQueryBuilder)
    .select("canonical_producer_name, alias_type")
    .ilike("alias", producer)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as ProducerAliasRow | null;
  if (!row) {
    return null;
  }

  return {
    canonical_producer_name: normalizeOptionalString(row.canonical_producer_name),
    alias_type: normalizeOptionalString(row.alias_type) ?? "exact",
    matched: true,
  };
}

async function lookupGrapeAliasByColumn(
  supabase: ResolverSupabaseClient,
  column: "alias" | "alias_normalized",
  value: string
) {
  const { data, error } = await (supabase
    .from("grape_aliases") as SelectQueryBuilder)
    .select("variety_id, alias_type, grape_varieties(name)")
    .ilike(column, value)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as GrapeAliasRow | null;
  if (!row) {
    return null;
  }

  const variety = unwrapGrapeVariety(row.grape_varieties);
  return {
    canonical_name: normalizeOptionalString(variety?.name ?? null),
    variety_id: normalizeOptionalString(row.variety_id),
    alias_type: normalizeOptionalString(row.alias_type) ?? "exact",
    matched: true as const,
  };
}

export async function lookupGrapeAlias(
  supabase: ResolverSupabaseClient,
  rawGrape: string | null | undefined
): Promise<GrapeMatch | null> {
  const grape = normalizeOptionalString(rawGrape);
  if (!grape) {
    return null;
  }

  const directMatch = await lookupGrapeAliasByColumn(supabase, "alias", grape);
  if (directMatch) {
    return directMatch;
  }

  const normalized = normalizeAliasText(grape);
  if (!normalized) {
    return null;
  }

  return lookupGrapeAliasByColumn(supabase, "alias_normalized", normalized);
}
