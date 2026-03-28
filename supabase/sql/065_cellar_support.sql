-- Cellar support: allow wine entries to represent wines the user is holding
-- (not yet consumed). When a user "drinks" a cellared wine, a new consumed
-- entry is cloned from it, cellared_from_id links back, and cellar_quantity
-- decrements.

ALTER TABLE wine_entries
  ADD COLUMN IF NOT EXISTS entry_status text NOT NULL DEFAULT 'consumed'
    CHECK (entry_status IN ('consumed', 'cellaring')),
  ADD COLUMN IF NOT EXISTS cellar_quantity integer DEFAULT NULL
    CHECK (cellar_quantity IS NULL OR cellar_quantity >= 0),
  ADD COLUMN IF NOT EXISTS bottle_format text DEFAULT NULL
    CHECK (bottle_format IS NULL OR bottle_format IN (
      '375ml', '750ml', '1.5L', '3L', '5L', '6L', 'other'
    )),
  ADD COLUMN IF NOT EXISTS cellared_from_id uuid DEFAULT NULL
    REFERENCES wine_entries(id) ON DELETE SET NULL;

COMMENT ON COLUMN wine_entries.entry_status IS
  'consumed = drank it, cellaring = still holding in cellar';
COMMENT ON COLUMN wine_entries.cellar_quantity IS
  'Bottles remaining in cellar. NULL for consumed entries.';
COMMENT ON COLUMN wine_entries.bottle_format IS
  'Bottle size format. NULL defaults to 750ml in UI.';
COMMENT ON COLUMN wine_entries.cellared_from_id IS
  'If this consumed entry was created by drinking a cellared wine, links to the cellar entry.';

CREATE INDEX IF NOT EXISTS idx_wine_entries_cellar
  ON wine_entries (user_id, entry_status)
  WHERE entry_status = 'cellaring';
