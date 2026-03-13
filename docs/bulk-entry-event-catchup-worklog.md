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

## 2026-03-13

- Continued work on `codex/ui-feature-preview`.
- Streamlined bulk review UI on web and mobile:
  - reduced the primary review surface to wine name, notes, rating, and QPR
  - moved secondary fields behind an `Add / edit details` toggle
  - removed per-entry event/catch-up switching from bulk review so group type is only set at the start of the bulk flow
  - updated bulk review action layout to use in-card progression and cancel controls
- Updated post-save survey behavior for bulk review:
  - bulk survey now captures only `How was it?` and `Would you drink it again?`
  - expectations remain in single-entry flow only
  - web survey overlay no longer hard-locks page scroll
- Added targeted regression coverage in `e2e/post-save-survey-bulk.spec.ts` for the bulk survey payload and comparison route contract.
- Fixed a malformed JSX block in the bulk review edit screen that was triggering a Turbopack parse failure in dev.
- Reduced repeated feed visibility lookups by precomputing test-account status for feed authors before per-entry access checks.
- Investigated repeated localhost failures on `/entries`, `/feed`, and `/profile`:
  - confirmed the current blocker was a Turbopack panic on `/entries/page`
  - panic log reported `Failed to write app endpoint /entries/page` with `Next.js package not found`
  - switched the default local dev script to webpack (`npm run dev -> next dev --webpack`) and kept `npm run dev:turbopack` as an explicit opt-in path
- Validation for this pass:
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npx playwright test e2e/post-save-survey-bulk.spec.ts e2e/phase6-route-handlers.spec.ts`
- As of this log entry, these changes are intended to live on and be pushed from `codex/ui-feature-preview`.
