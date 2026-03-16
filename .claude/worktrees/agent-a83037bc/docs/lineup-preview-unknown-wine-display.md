# Lineup Preview Unknown Wine Fallback

## Why this note exists

The old branch `fix/lineup-preview-unknown-wine-display` is not safe to merge as-is.
It bundles one small lineup-preview bug fix together with a much larger, unrelated
palate-profiles dataset pipeline commit.

## The actual bug

In the bulk lineup preview, a scanned bottle card can show `Unknown wine` as the
title even when we already have better fallback metadata such as producer,
appellation, region, or grape suggestions.

## Desired behavior

The lineup preview card title should use the same fallback chain already defined in
the shared lineup helper:

1. explicit `wine_name` when it is present and not an "unknown" placeholder
2. `producer`
3. `appellation`
4. `region`
5. first `primary_grape_suggestions` value
6. `Unknown wine`

## Minimal fix to reapply later

In `src/features/entries/new/NewEntryScreenContainer.tsx`, the lineup preview title
was using:

- `wine.wine_name || "Unknown wine"`

The correct fix is to import and use:

- `resolveLineupWineDisplayName(wine)`

That helper already lives in `packages/shared/src/entry-flow/lineup.ts`.

## Relevant commit

If we want to recover just the UI fix later, the clean commit to reference is:

- `b02f5a9` `fix: use producer/appellation fallback in lineup preview card title`

Do not revive or merge the whole deleted branch blindly, because it also contains:

- `eb6ea34` `Add palate profiles dataset pipeline and docs`

That second commit is unrelated to the lineup-preview bug and should be triaged
separately.
