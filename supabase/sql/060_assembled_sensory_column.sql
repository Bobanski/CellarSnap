-- Add materialized sensory profile to wine_entries.
-- Populated by resolveEntrySensoryProfile() on entry create/update.
-- Stores the full 16-axis EffectiveWineProfile.sensory vector as JSONB.
-- sensory_resolved_at tracks when the profile was last computed.

ALTER TABLE wine_entries
  ADD COLUMN IF NOT EXISTS assembled_sensory jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sensory_resolved_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN wine_entries.assembled_sensory IS
  'Materialized 16-axis sensory vector from base_profiles + modifiers. Recomputed on entry save and bulk refresh.';
COMMENT ON COLUMN wine_entries.sensory_resolved_at IS
  'When assembled_sensory was last computed. NULL = never resolved.';
