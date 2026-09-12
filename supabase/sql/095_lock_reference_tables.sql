-- Security hotfix (overhaul engagement, eng-audit M1): the anon and
-- authenticated roles held INSERT/UPDATE/DELETE/TRUNCATE on all 14
-- reference/taxonomy tables with RLS disabled — meaning the public anon key
-- could rewrite the data the scoring/palate engine runs on. These tables are
-- curated via CSV/migrations only; every app code path is read-only against
-- them (service-role or anon SELECT). Revoke writes, enable RLS with a
-- read-only policy so PostgREST reads keep working for all roles.

do $$
declare
  t text;
begin
  foreach t in array array[
    'aging_curve_baselines',
    'appellation_grape_map',
    'base_profiles',
    'classification_tier_aging_modifiers',
    'classification_tier_modifiers',
    'grape_sensitivity_coefficients',
    'producer_aliases',
    'producer_modifiers',
    'producer_region_crosswalk',
    'region_aliases',
    'taxonomy_classification_tiers',
    'taxonomy_master_v2',
    'taxonomy_price_ranges',
    'vintage_weather_modifiers'
  ] loop
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Reference data is readable" on public.%I', t);
    execute format('create policy "Reference data is readable" on public.%I for select using (true)', t);
  end loop;
end $$;
