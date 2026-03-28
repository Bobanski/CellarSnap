-- Custom field definitions per user (e.g., "Parker Score", "Jancis Rating")
CREATE TABLE IF NOT EXISTS cellar_custom_field_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  field_type text NOT NULL DEFAULT 'text'
    CHECK (field_type IN ('text', 'number', 'date')),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, field_name)
);

-- Custom field values per entry
CREATE TABLE IF NOT EXISTS cellar_custom_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES wine_entries(id) ON DELETE CASCADE,
  field_def_id uuid NOT NULL REFERENCES cellar_custom_field_defs(id) ON DELETE CASCADE,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, field_def_id)
);

ALTER TABLE cellar_custom_field_defs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cellar_custom_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own field defs" ON cellar_custom_field_defs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own field values" ON cellar_custom_field_values
  FOR ALL USING (
    EXISTS (SELECT 1 FROM wine_entries WHERE wine_entries.id = entry_id AND wine_entries.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM wine_entries WHERE wine_entries.id = entry_id AND wine_entries.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_custom_field_defs_user ON cellar_custom_field_defs(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_entry ON cellar_custom_field_values(entry_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_def ON cellar_custom_field_values(field_def_id);

COMMENT ON TABLE cellar_custom_field_defs IS 'User-defined custom columns for cellar entries';
COMMENT ON TABLE cellar_custom_field_values IS 'Custom field values per wine entry';
