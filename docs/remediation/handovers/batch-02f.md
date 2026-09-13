# B02f handover — September 13, 2026

**Historical checkpoint:** superseded by the [B02e/B02f/B08b release](b02e-b02f-b08b-release.md). All three PRs are merged, SQL is live, final browser/Expo QC passed, and native runtime/distribution remains pending. The original checkpoint text below preserves sequence and limits.
## Objective and IDs
AUD-06 legacy arbitrary-ID helper RPC containment. QC-01 numeric rating projections remain separate. No identity/schema-data cleanup or policy expansion.
## Resume here
Branch `codex/b02f-private-policy-helpers` stacked on B02e `4485ba6` (#130 now merged as `685b953`). SQL/isolated QC passed; hosted SQL, HTTP/browser/Expo verification and PR merge pending.
## State and decisions
Six helper functions move to `private` using ALTER FUNCTION SET SCHEMA, preserving OIDs and ten policy dependencies. Private definitions use the same reviewed rules with qualified internal helper calls and fixed search paths. Public names become service-only invoker facades; anonymous and authenticated EXECUTE is revoked including PUBLIC inheritance. Existing private definer readers and service-only schema health continue working. No source web/mobile client directly calls these six RPCs. Private schema must remain outside Data API exposure. No policy expressions or table/row grants broadened. Migration is forward-only and replayable.
## Verification
Live predecessor full catalog exactly matched the reviewed baseline/deltas. Reviewed proposed delta: only six public definitions, six private additions, 18 public grant removals, 18 private grants and ten automatically-qualified policy expressions. Independently checked normalized private bodies and policy expressions equal predecessors. Existing Storage/entry/photo/group before/after matrix covers owner, friend, FOF, stranger, pending, trusted tester, test author, null caller and both-direction blocks. Twelve exposed RPC denials plus service parity pass. 405 isolated tests and 13 schema tests pass, including real-schema grapes/comments/reactions/shares/profile projection. PostgreSQL 17.6 whole replay/catalog/owner-stranger and four existing concurrency checks passed. Test harness corrected grape positions to 1-based and distinguished authenticated share INSERT from service-only SELECT; no product defect in those probes.
## Release state
Migration `20260913205430_private_policy_helpers.sql` is not yet applied. Apply exact file after recording SHA-256; verify hosted catalog, twelve REST RPC denials, private-schema exclusion and legitimate client flows. No client update is required for helper containment. Keep service health and share resolution working. Roll forward; do not restore public arbitrary-identity access.
## Workspace and environment
User tsconfig.json and two reports preserved; original design draft/worktree untouched. No environment changes. Local Next production on 3001 is B02e; test export from prior release available for compatibility QC. Logs/captures under `/tmp/cellarsnap-b02e-b02f-b08b`. No native runtimes installed.
## Next slice
Complete release/QC here, then B08b atomic mobile detail/grape edit. Keep web/group lifecycle and all installed-native distribution gaps explicit if outside that bounded slice.
