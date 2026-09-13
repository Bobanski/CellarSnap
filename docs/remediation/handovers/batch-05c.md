# Batch B05c handover — 2026-09-13

## Objective and IDs
AUD-21 first generated type-source/client/query adoption; issue #104. B05b PR #105 is the dependency. New QC-13 records preexisting bearer-only grape-search rejection. [Type adoption contract](../b05-type-adoption.md), [combined QC report](../../audits/b05b-b05c-qc-2026-09-13.md).

## Resume here
Branch `codex/b05c-database-types`, base B05b `e52caf0`. Implementation and scoped QC complete; release checkpoint records exact PR/merge/deployment state. Next bounded slice is QC-13/B05d typed request auth and cookie/bearer grape lookup parity. Do not count Expo web with shared cookies as native bearer acceptance.

## State and decisions
One shared generated public Database source, type-only re-exports. Typed browser/server/mobile factories preserve prior session/cookie/persistence options and share existing browser/mobile instances with clearly named legacy bridges. Adopted grape browser relationship, grape API lookups and Expo producer browse now infer query results. Public DTOs/validators remain distinct; no scoring fields or user data were invented to satisfy TypeScript. AUD-21 remains Partial for unadopted legacy/admin/bearer/feature queries; AUD-20 retains supported-client/telemetry retirement prerequisites. AUD-19 remains Partial for full managed bootstrap and reviewed corpus/seed restore.

## Verification
271 passing tests plus the compile-only database contract, web/mobile types/lint, Next build, and all three Expo platform exports. Whole PostgreSQL 17.6/PGlite replay and read-only production drift checks passed in B05b. Desktop/phone web grape browse/search/empty/expand and Expo producer browse/search passed with visually inspected screenshots and logs. One scoped private fixture and grape join were removed; absence including derived knowledge verified. Native simulators/Android tooling unavailable. Initial local Expo configuration/cache issue fixed using clean export and retested. See QC report for precise bounds and preexisting issues.

## Release state
Local implementation/QC complete; PR/merge/deployment/live acceptance pending at this checkpoint. No production schema migration required. Code rollback is a revert/redeploy; no persistent data changes remain. Web release does not distribute native clients.

## Workspace and environment
Original modified `tsconfig.json` and untracked QA/fix-plan documents preserved; nested worktree untouched. Next 3001 and local Expo proxy 8083 may still run during release QC; stop at final handoff. Process-only Expo web API override used; no environment files edited. Local logs/screenshots/build exports in `/tmp/cellarsnap-b05c`. Next-generated AGENTS.md block must be restored to the tracked original after dev shutdown.

## Next slice
1. QC-13/B05d: typed request-auth adapter using the existing bearer/cookie authorization contract; test authenticated name/alias lookup parity, invalid/anonymous denial and existing 503 fallback. Verify true cookie-free Expo/native requests.
2. Continue bounded AUD-21 adoption as each feature contract is reviewed; do not use broad casts or invent absent database columns.
3. Finish AUD-19 managed bootstrap/seed restoration in a separate slice, then B06 badge/correctness work. Preserve P0 privacy/cache/public-projection queue and native release limitations.
