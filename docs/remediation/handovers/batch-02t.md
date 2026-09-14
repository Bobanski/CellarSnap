# B02t handover — September 14, 2026

## Objective and IDs
QC-01 P1/Partial; related AUD-13/15/48/50, issue #81. Add an explicit owner edit source contract before physical rating isolation. No SQL or physical rating transfer. B02u adopts this contract in the mobile editor.

## Resume here
Base `fdc168d`, branch `fix/b02t-owner-edit-api`. Implementation and isolated checks pass; combined B02t/B02u browser QC and release verification are in progress. See the eventual combined release handover for exact tested commit and release state.

## State and decisions
`POST /api/entries/[id]/details` is an additive bearer-only command. Cookies cannot authorize it, including when invalid Authorization is supplied. It bounds streamed request bytes, validates an allowlisted edit and matching raw expected keys, and requires paired unique ordered grape arrays. Nullable 1–100 owner ratings remain supported. It invokes the deployed owner-only `save_entry_details` transaction, preserving conflict/no-op retry and grape rollback semantics. Grouped entries can edit their own details as before; group metadata/lifecycle is not included.

Only `{entry_id, viewer_user_id, replayed}` is serialized after verifying RPC row identity and ownership. Raw row/rating/error diagnostics are never returned. Failures are no-store, CORS permits bearer POST/OPTIONS without credentials, and stage-only logs exclude source data. Existing web PUT and old RPC consumers remain compatible.

## Verification
29 added route/contract tests (combined with 19 mobile tests: 48), full combined 557 isolated and 30 schema checks, canonical query types, web/mobile types, lint and all-platform exports pass. The initial mobile type command used root TypeScript 5.9 against a TypeScript 6 config; rerunning with the mobile workspace's compiler passes without changing configuration.
Hosted catalog read confirms invoker command, authenticated execution, anon denial, owner predicate, PT409 and friends-of-friends support. Current Supabase changelog and relevant official API docs reviewed; no applicable API break. Browser/hosted transaction evidence is being completed in B02u.

## Release state
Not merged/deployed at this checkpoint. No migration, backfill, native release or ordinary data mutation. API is additive; keep it available once adopted clients ship. Production photo retirement and legacy cutoff remain unauthorized by their prerequisite contracts.

## Workspace and environment
Preserve original tsconfig, user reports and nested worktree. Only a stale zero-byte Git lock (no Git process) was removed to create the branch. Next's generated AGENTS block is session output to restore. Session Next 3001 and Expo browser 8083; private evidence `/tmp/cellarsnap-b02t-b02u`. Disposable designated E2E fixtures only; no tester flags changed.

## Next slice
B02u mobile normal/bulk review adoption, failure/conflict/retry/session checks and desktop/phone browser acceptance. Physical rating/direct Data API exposure, create/import/server/operator source transfer and installed-client rollout remain QC-01 Partial. AUD-01 P0 client rollout/rekey/signing-cutoff prerequisites remain unmet. [Backlog](../backlog.md), [hub](../README.md).
