-- Backfill: map old drink_again to new enjoyment_intent
-- yes → happily_again (conservative default, we can't know how enthusiastic)
-- no → pass
UPDATE public.wine_entries
SET survey_enjoyment_intent = CASE
  WHEN survey_drink_again = 'yes' THEN 'happily_again'::public.entry_survey_enjoyment_intent
  WHEN survey_drink_again = 'no' THEN 'pass'::public.entry_survey_enjoyment_intent
  ELSE NULL
END
WHERE survey_enjoyment_intent IS NULL
  AND survey_drink_again IS NOT NULL;
