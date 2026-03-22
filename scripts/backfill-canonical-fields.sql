-- ============================================================
-- FULL BACKFILL: wine_type + canonical_region + canonical_country
-- Run in Supabase SQL Editor (bypasses RLS)
-- ============================================================

-- ==========================================
-- STEP 1: wine_type from grape consensus
-- ==========================================
WITH test_users AS (
  SELECT unnest(ARRAY[
    '44c3c814-4413-4401-987c-1a959502cad1',
    '926b7418-3308-4fc7-a72f-f7ecf0501f76',
    '76cd3e28-ffde-49bb-8c61-561a25576088',
    '09382106-988d-4833-a84f-71d0ef074b03',
    '94b36d25-5a06-4466-a97d-216af38812e7',
    '5ebe3838-1a96-4642-b34a-3b21b885bf20'
  ]::uuid[]) as user_id
),
grape_type_map(grape_name, wine_type) AS (
  VALUES
    ('Cabernet Franc', 'red'),
    ('Cabernet Sauvignon', 'red'),
    ('Carignan', 'red'),
    ('Corvina', 'red'),
    ('Grenache', 'red'),
    ('Merlot', 'red'),
    ('Nerello Mascalese', 'red'),
    ('Pinot Noir', 'red'),
    ('Sagrantino', 'red'),
    ('Sangiovese', 'red'),
    ('Saperavi', 'red'),
    ('Syrah', 'red'),
    ('Tempranillo', 'red'),
    ('Zinfandel', 'red'),
    ('Carricante', 'white'),
    ('Chardonnay', 'white'),
    ('Chenin Blanc', 'white'),
    ('Riesling', 'white'),
    ('Sauvignon Blanc', 'white'),
    ('Moscato Bianco', 'white')
),
entry_grape_consensus AS (
  SELECT 
    epg.entry_id,
    array_agg(DISTINCT gtm.wine_type) as types,
    count(DISTINCT gtm.wine_type) as type_count
  FROM entry_primary_grapes epg
  JOIN grape_varieties gv ON gv.id = epg.variety_id
  JOIN grape_type_map gtm ON lower(trim(gv.name)) = lower(trim(gtm.grape_name))
  GROUP BY epg.entry_id
)
UPDATE wine_entries we
SET wine_type = egc.types[1]::public.wine_type
FROM entry_grape_consensus egc
WHERE we.id = egc.entry_id
AND we.wine_type IS NULL
AND egc.type_count = 1
AND we.user_id NOT IN (SELECT user_id FROM test_users);
-- ==========================================
-- STEP 2: wine_type from keyword inference
-- For the ~31 entries without grapes
-- ==========================================

-- Champagne / sparkling
UPDATE wine_entries
SET wine_type = 'sparkling'
WHERE wine_type IS NULL
AND (
  lower(coalesce(classification, '')) LIKE '%champagne%'
  OR lower(coalesce(classification, '')) LIKE '%prosecco%'
  OR lower(coalesce(classification, '')) LIKE '%cava%'
  OR lower(coalesce(classification, '')) LIKE '%cremant%'
  OR lower(coalesce(classification, '')) LIKE '%brut%'
  OR lower(coalesce(region, '')) LIKE '%champagne%'
);

-- Sweet / dessert / fortified
UPDATE wine_entries
SET wine_type = 'sweet'
WHERE wine_type IS NULL
AND (
  lower(coalesce(classification, '')) LIKE '%sauternes%'
  OR lower(coalesce(classification, '')) LIKE '%tokaji%'
  OR lower(coalesce(classification, '')) LIKE '%port%'
  OR lower(coalesce(classification, '')) LIKE '%vin santo%'
  OR lower(coalesce(classification, '')) LIKE '%ice wine%'
  OR lower(coalesce(classification, '')) LIKE '%eiswein%'
  OR lower(coalesce(classification, '')) LIKE ANY(ARRAY['%sélection de grains nobles%', '%selection de grains nobles%'])
  OR lower(coalesce(classification, '')) LIKE '%junmai%'
);

-- Known red regions/classifications
UPDATE wine_entries
SET wine_type = 'red'
WHERE wine_type IS NULL
AND (
  lower(coalesce(classification, '')) LIKE '%amarone%'
  OR lower(coalesce(classification, '')) LIKE '%barolo%'
  OR lower(coalesce(classification, '')) LIKE '%brunello%'
  OR lower(coalesce(region, '')) LIKE '%barolo%'
  OR lower(coalesce(region, '')) LIKE '%montalcino%'
  OR lower(coalesce(region, '')) LIKE '%priorat%'
  OR lower(coalesce(region, '')) LIKE '%toro%'
  -- Bordeaux without further info is almost always red
  OR lower(coalesce(region, '')) = 'bordeaux'
  -- Burgundy reds based on wine name containing typical red appellations
  OR lower(coalesce(region, '')) = 'burgenland'
);

-- Known white regions/classifications
UPDATE wine_entries
SET wine_type = 'white'
WHERE wine_type IS NULL
AND (
  lower(coalesce(classification, '')) LIKE '%chablis%'
  OR lower(coalesce(classification, '')) LIKE '%muscadet%'
  OR lower(coalesce(classification, '')) LIKE '%sancerre%'
  OR lower(coalesce(region, '')) LIKE '%chablis%'
  OR lower(coalesce(region, '')) LIKE '%jura%'
);

-- Orange wine
UPDATE wine_entries
SET wine_type = 'orange'
WHERE wine_type IS NULL
AND (
  lower(coalesce(classification, '')) LIKE '%ramato%'
  OR lower(coalesce(classification, '')) LIKE '%orange%'
  OR lower(coalesce(wine_name, '')) LIKE '%naranja%'
  OR lower(coalesce(wine_name, '')) LIKE '%orange%'
);

-- Check what's still unresolved
SELECT id, wine_name, region, country, classification
FROM wine_entries
WHERE wine_type IS NULL
AND user_id NOT IN (
  '44c3c814-4413-4401-987c-1a959502cad1',
  '926b7418-3308-4fc7-a72f-f7ecf0501f76',
  '76cd3e28-ffde-49bb-8c61-561a25576088',
  '09382106-988d-4833-a84f-71d0ef074b03',
  '94b36d25-5a06-4466-a97d-216af38812e7',
  '5ebe3838-1a96-4642-b34a-3b21b885bf20'
)
ORDER BY wine_name;
-- ==========================================
-- STEP 3: Populate canonical_region, canonical_country, canonical_sub_region
-- from region_aliases table
-- ==========================================

UPDATE wine_entries we
SET 
  canonical_region = ra.canonical_region,
  canonical_country = ra.canonical_country,
  canonical_sub_region = ra.canonical_sub_region
FROM region_aliases ra
WHERE lower(trim(we.region)) = lower(trim(ra.alias))
AND we.canonical_region IS NULL
AND we.region IS NOT NULL
AND we.user_id NOT IN (
  '44c3c814-4413-4401-987c-1a959502cad1',
  '926b7418-3308-4fc7-a72f-f7ecf0501f76',
  '76cd3e28-ffde-49bb-8c61-561a25576088',
  '09382106-988d-4833-a84f-71d0ef074b03',
  '94b36d25-5a06-4466-a97d-216af38812e7',
  '5ebe3838-1a96-4642-b34a-3b21b885bf20'
);

-- For entries that still don't have canonical_country but have raw country,
-- do a pass-through (raw country is usually good enough)
UPDATE wine_entries
SET canonical_country = trim(country)
WHERE canonical_country IS NULL
AND country IS NOT NULL
AND trim(country) != ''
AND user_id NOT IN (
  '44c3c814-4413-4401-987c-1a959502cad1',
  '926b7418-3308-4fc7-a72f-f7ecf0501f76',
  '76cd3e28-ffde-49bb-8c61-561a25576088',
  '09382106-988d-4833-a84f-71d0ef074b03',
  '94b36d25-5a06-4466-a97d-216af38812e7',
  '5ebe3838-1a96-4642-b34a-3b21b885bf20'
);

-- For entries that still don't have canonical_region but have raw region
-- and it didn't match any alias, pass through the raw value
UPDATE wine_entries
SET canonical_region = trim(region)
WHERE canonical_region IS NULL
AND region IS NOT NULL
AND trim(region) != ''
AND user_id NOT IN (
  '44c3c814-4413-4401-987c-1a959502cad1',
  '926b7418-3308-4fc7-a72f-f7ecf0501f76',
  '76cd3e28-ffde-49bb-8c61-561a25576088',
  '09382106-988d-4833-a84f-71d0ef074b03',
  '94b36d25-5a06-4466-a97d-216af38812e7',
  '5ebe3838-1a96-4642-b34a-3b21b885bf20'
);
