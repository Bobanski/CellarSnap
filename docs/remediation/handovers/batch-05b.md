# Batch B05b handover — 2026-09-13

## Objective and IDs
AUD-19 reviewed public/private schema baseline, disposable replay and drift detection; issue #104, branch `codex/b05b-schema-baseline`, base `76da2e2`. AUD-19 remains Partial for managed-service provisioning and reviewed seed/corpus restoration. AUD-21 is the next separate type-source/client slice. No product behavior, SQL deployment, seed import or native distribution is included.

## Resume here
Read [baseline contract](../../../supabase/baseline/README.md), [backlog](../backlog.md) and hub. B05b implementation and tool/database QC are complete. PR/release state will be added at the release checkpoint. Continue with B05c generated public database types and a small deliberate client/query adoption; do not fold scoring/badge repairs into it.

## State and decisions
Captured live PostgreSQL 17.6 read-only using pg_dump 17.6 and a catalog transaction. All 51 public tables and private trigger/helper dependencies replay. Preserve owners, RLS, grants/default grants, enums, sequence settings, app Auth hooks and Storage policies. Historical manifest prefix checksums prevent replaying/rewriting old scripts; future files append to the same manifest and replay after the baseline. Seed/reference requirements have counts/fingerprints without production rows. Full fresh-product provisioning is explicitly unfinished.

## Verification
- 256 isolated existing tests, three new schema suites, web lint and TypeScript passed.
- PGlite PostgreSQL 18.3: entire compared catalog matches. Six deliberate drift mutations detected (column, grant, policy, function, disabled trigger, default privilege), each rolled back and equality rechecked. Actual baseline owner/stranger/anon reads, profile capability guard, service-only contact RPCs passed.
- Separately compiled **PostgreSQL 17.6 + pgvector 0.8.0**: disposable whole baseline replay, catalog equality and owner/stranger access passed. Local cluster stopped and removed.
- Read-only production checker returned `matches:true`, no changed categories after implementation. No production DDL or data writes.
- Initial failures were fixture completeness (private schema and dashboard role), test function parameter name, Playwright ESM interop and relocated native extension install paths; repaired and retested. PostgreSQL 18 NOT NULL catalog representation is handled explicitly via column nullability, preserving all other constraints.
- B05b changes schema/tooling artifacts only. Browser flows will be checked with the immediately following B05c client adoption before the combined release. No claim of browser/native acceptance from these SQL tests. `xcrun simctl` is unavailable; no Android SDK/emulator was found.

## Release state
Implementation/QC complete locally; merge/deployment not yet performed at this checkpoint. **No migration is required or authorized by these baseline files.** All production captures were read-only. Rollback is removal/revert of tooling/artifacts; no data recovery needed. Full-platform setup and seed restore remain explicit AUD-19 work.

## Workspace and environment
Preserve the original modified `tsconfig.json` and untracked `cellarsnap-fix-plan.md` / `cellarsnap-qa-report.md`; nested `.claude` checkout remains untouched. Build/runtime scratch and logs are under `/tmp/cellarsnap-b05b`. Native PostgreSQL binaries were built there without installing system tools. Credentials stayed in the existing environment and private task-local wrappers, not committed artifacts. No environment-file changes.

## Next slice
B05c: one generated type source tied to this reviewed schema, compile-time contract checks, client adoption in a bounded feature and desktop/phone/Expo interaction checks. Keep domain DTOs distinct. Record unadopted callers and supported-schema/native limits instead of making global completion claims.
