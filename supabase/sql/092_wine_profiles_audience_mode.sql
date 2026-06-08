-- Make wine_profiles cache mode-aware so Explore content can vary by audience.
-- Existing rows are backfilled to 'enthusiast' — that's the voice they were
-- authored in (the explore route's prompts hardcoded "Cluster Enthusiast voice"
-- before this change). Other modes will be lazily generated on first view.

ALTER TABLE wine_profiles
  ADD COLUMN IF NOT EXISTS audience_mode text NOT NULL DEFAULT 'enthusiast'
    CHECK (audience_mode IN ('explorer', 'enthusiast', 'connoisseur'));

ALTER TABLE wine_profiles
  DROP CONSTRAINT IF EXISTS wine_profiles_profile_type_slug_key;

ALTER TABLE wine_profiles
  ADD CONSTRAINT wine_profiles_profile_type_slug_audience_mode_key
    UNIQUE (profile_type, slug, audience_mode);

DROP INDEX IF EXISTS idx_wine_profiles_type_slug;
CREATE INDEX IF NOT EXISTS idx_wine_profiles_type_slug_mode
  ON wine_profiles(profile_type, slug, audience_mode);

COMMENT ON COLUMN wine_profiles.audience_mode IS
  'Audience register the content was generated for. Cache key is (profile_type, slug, audience_mode).';
