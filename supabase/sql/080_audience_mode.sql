ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS audience_mode text NOT NULL DEFAULT 'explorer'
    CHECK (audience_mode IN ('explorer', 'enthusiast', 'connoisseur'));

COMMENT ON COLUMN profiles.audience_mode IS 'User-selected audience mode. Affects Pocket Somm voice, copy tone, and feature surfacing.';
