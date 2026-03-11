# Bulk Entry Event/Catch-up Worklog

## 2026-03-11

- Switched implementation target to `codex/ui-feature-preview`.
- Confirmed current bulk lineup flow creates multiple hidden entries, then relies on bulk review to publish them.
- Confirmed grouped bulk posts are not currently modeled in the database.
- Confirmed `root_entry_id` cannot be reused for same-user grouped bulk posts because the existing partial unique index would block multiple siblings for one owner.
- Confirmed Playwright is already installed and `npx playwright --version` returns `1.58.2`.
- Confirmed Supabase CLI is not installed in the environment.
- Confirmed the repo does not yet have a local Supabase CLI config directory or linked project metadata.
- Identified required implementation areas:
  - SQL migration for grouped bulk posts
  - server route to finalize grouped bulk creation
  - bulk publish logic update
  - new-entry lineup UI changes
  - edit-flow group metadata and shared date behavior
  - Home and Feed grouped-post rendering

## Validation notes

- Supabase CLI installed locally via `npm install --save-dev supabase`
- Supabase CLI initialized with `npx supabase init`
- Remote link attempt against project ref `rbmkypbqavmnuycznssv` failed because no Supabase access token is configured on this machine
- User chose the fallback environment strategy: keep using the existing Supabase project and rely on test-account isolation for now
- Targeted static validation passed:
  - `npx eslint ...` on touched files
  - `npx tsc --noEmit`
- Executable regression validation passed:
  - `npx playwright test e2e/phase6-primitives.spec.ts e2e/phase6-route-handlers.spec.ts`
  - result: `24 passed`
- Added route coverage for:
  - grouped bulk post creation
  - grouped bulk publish anchor behavior

## Remaining external dependency

- No staging project will be created for this phase
- If we want CLI-driven remote migration/linking later, the repo still needs the remote database password for `supabase link`
