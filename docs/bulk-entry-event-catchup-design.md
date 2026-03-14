# Bulk Entry Event/Catch-up Design Log

## Goal

Implement grouped bulk-entry posts on `codex/ui-feature-preview` so:

- bulk lineup creation requires a mode: `Event` or `Catch-up`
- bulk lineup creation requires a title
- each wine remains an individual library entry
- Home and Feed show one grouped post for the bulk set
- grouped posts use a swipeable gallery with slide-aware metadata

## Decisions

### 2026-03-11

- Surface scope is web-first.
- Backend environment decision for this phase: use the existing Supabase production project with test accounts, not a separate staging project.
- Grouping uses a dedicated `entry_groups` model plus `entry_group_id` on `wine_entries`.
- `root_entry_id` will remain reserved for shared tasting copies. It cannot safely group same-user bulk entries because the existing `wine_entries_user_root_unique` index would reject multiple siblings with the same `root_entry_id`.
- Feed/Home visibility for grouped bulk posts will use:
  - one visible anchor entry per group
  - sibling entries hidden with `is_feed_visible = false`
  - dedupe keyed by `entry_group_id` when present, then `root_entry_id`, then `id`
- Group gallery order will be stored explicitly in `entry_group_slides`.
- Grouped post slide metadata will distinguish wine slides from context slides:
  - wine slide: show wine-specific details and consumed date
  - context slide: show tag label and hide wine details
- `Event` uses one shared consumed date across the group.
- `Catch-up` keeps per-entry consumed dates.
- Group mode and title remain editable later in the entry edit flow.
- Bulk review publish behavior needs to change:
  - grouped bulk entries should not individually publish as each wine is saved
  - publish should happen when the bulk review flow completes or exits early
  - only the group anchor should become feed-visible

## Open implementation notes

- Deleting a grouped anchor entry must promote another group member so the grouped post remains valid.
- Home currently does not dedupe the viewer's own recent entries by feed visibility, so it needs the same grouped-post treatment as Feed.
- Supabase CLI is installed locally in the repo and initialized with `supabase/config.toml`.
- Remote Supabase linking still requires a Supabase access token or an authenticated `supabase login` on this machine.
- For this phase, remote staging creation is deferred. Testing will use the existing project plus test-account isolation.
- Playwright is already installed in the repo and exposed through `package.json`.

## Implemented shape

- SQL migration `045_entry_groups.sql` adds:
  - `entry_group_mode`
  - `entry_groups`
  - `wine_entries.entry_group_id`
  - `entry_group_slides`
- Bulk lineup creation now:
  - requires a group title
  - defaults to `Event`
  - stores grouped post metadata after entry/photo creation
- Entry edit now:
  - loads group metadata
  - allows mode/title edits
  - syncs consumed date across the group in `Event` mode
- Home and Feed now:
  - attach grouped post metadata when an anchor entry belongs to a group
  - render grouped galleries with slide-aware title/date metadata
  - keep individual entries separate in the library
