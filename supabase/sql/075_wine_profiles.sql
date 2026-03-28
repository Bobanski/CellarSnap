-- Cached educational content for grape, region, and producer profile pages.
-- Content is GPT-generated on first visit and cached for reuse.

CREATE TABLE IF NOT EXISTS wine_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_type text NOT NULL CHECK (profile_type IN ('grape', 'region', 'producer')),
  slug text NOT NULL,
  display_name text NOT NULL,
  content jsonb DEFAULT NULL,
  hero_image_url text DEFAULT NULL,
  hero_image_attribution text DEFAULT NULL,
  sensory_data jsonb DEFAULT NULL,
  related_slugs jsonb DEFAULT NULL,
  last_refreshed timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_type, slug)
);

ALTER TABLE wine_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read wine profiles" ON wine_profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_wine_profiles_type_slug ON wine_profiles(profile_type, slug);
