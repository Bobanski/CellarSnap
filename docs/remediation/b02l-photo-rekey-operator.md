# B02l — bounded photo copy and reference-swap operator

AUD-01 remains P0/Partial. This release prepares entry-owned photo cohorts for later revocation. It does **not** retire objects, eliminate legacy signing, migrate avatars, distribute clients, or establish a revocation deadline. Current user authorization covers disposable-fixture execution and merge; ordinary production objects were not rekeyed.

## Commands and authority

The additive migration adds `private.photo_rekey_operations` and four SECURITY INVOKER functions. Only the database owner has table/function access. RLS is enabled with no application policies; its advisor INFO is deliberate deny-all defense in depth. There is no public RPC, service-role grant, endpoint, cron or automatic execution. The ledger holds paths, row IDs, object metadata and SHA-256 row fingerprints, never copied notes, ratings, names or email fields. Treat the ledger and private diagnostics as operational data; retention and pending-operation cleanup need an explicit rollout policy.

Use Node 22 and a configured `psql`. Supply explicit `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, `PGSSLMODE=verify-full` for remote targets, libpq credentials and optionally `CELLARSNAP_PSQL`. Neither the database nor Storage project is inferred. For resume, also supply `CELLARSNAP_REKEY_STORAGE_URL` (an HTTPS project root) and `CELLARSNAP_REKEY_SERVICE_KEY` through the operator environment. Never expose them in client code, argv, logs or commits. Verify both targets refer to the intended project before execution.

```sh
node scripts/storage/photo-rekey.mjs plan OPERATION_UUID SOURCE_PATH
node scripts/storage/photo-rekey.mjs status OPERATION_UUID
node scripts/storage/photo-rekey.mjs resume OPERATION_UUID
node scripts/storage/photo-rekey.mjs abandon OPERATION_UUID
```

Persist the chosen operation UUID before running `plan`. Reuse it after a timeout/lost response. Stdout contains only operation ID, state and aggregate counts. The same ID cannot be rebound to another source. An active source has one operation; abandoning a precommit operation allows a new ID/mapping. Abandonment never deletes copies. A committed operation cannot be abandoned or rolled back to the old key.

## State and consistency

- **planned:** mapping and source snapshot are durable before the first Storage call. A cohort includes the base key and its deterministic `__original` sibling, including an absent sibling marker. Only three/four-segment entry-owned paths are supported; owner and source-entry prefixes remain unchanged. Fixed-name avatars, malformed/opaque paths, missing base objects, missing referenced originals and absent source entries are rejected. Other canonical fields may reference these entry-owned photos: all nine physical columns are included.
- **copy/verify:** Storage copy never upserts. Repeated runs discover existing destinations and verify bytes, SHA-256, MIME and size (maximum 25 MiB per image). Source/destination object-version snapshots must remain unchanged through verification. Network requests have 30-second deadlines, redirect refusal and streaming byte bounds. An error leaves a resumable plan; mismatched/stale copies require abandon/replan, not overwrite or automatic cleanup.
- **atomic swap:** a short database-owner transaction locks the operation and canonical writer tables, then relevant Storage metadata rows. It rechecks reference/source-row fingerprints, objects and proof, rejects new destination references, and updates only captured cells. Stable row IDs and unrelated fields are preserved. All nine reference types move together or roll back. Table locks exclude newly inserted references from legacy writers that do not participate in advisory locks. Locks are operator-wide, bounded with a two-second lock timeout and a 30-second CLI statement timeout; this is a small-cohort tool, not an online bulk-job implementation.
- **pending_revocation:** reference commit and proof persist together. A lost commit response resolves by reading the same operation ID. Old objects remain. `resume` reports the existing state without reapplying references or copies. This state means **references committed**, not that current access was accepted everywhere or old capabilities revoked.

Storage operations happen outside database transactions. Metadata snapshots detect committed concurrent changes; this does not fence in-flight uploads, future legacy writes, newly minted signatures or references reintroduced after commit. Consequently, no deletion or retirement command is supplied. Failure/retry tests cover copy and database commit; deletion-retry acceptance is deferred with the retirement worker.

## Before any retirement release

Establish supported native distribution/adoption, block legacy signing, implement future-write/reference fencing, revalidate every pending operation (including newly created originals and references), record new-object access acceptance, and add durable deletion-confirmation/multi-region denial observations. Preserve a pending state on deletion failure and never restore retired old keys. Review external/encoded URLs and the fixed-name avatar contract separately. A source/reference snapshot is not proof that every external consumer is covered. Retained client bytes cannot be recalled. See [B02h contract](b02h-photo-revocation-contract.md).

## Inventory review — September 13

Read-only hosted follow-up reconfirmed twelve missing keys: ten group-slide references (nine have an original sibling) and two ordered-photo references (neither has an original). All twelve paths still identify an existing source entry. Seven missing slides have a currently existing same-type ordered photo; one is an entry-less context slide. These are investigation leads, not an authoritative replacement mapping. No historical references were repaired.

All 118 unreferenced non-original objects are older than 30 days. 117 have entry-shaped paths with no matching source entry; one has an avatar-shaped path. 59 have a known prefix owner, zero have a current tester prefix, and none have an original sibling. Draft/external-consumer provenance remains unresolved. No deletion list or cleanup decision follows from these counts. Keep this under AUD-01/AUD-22.

## Provider references

The [Storage copy contract](https://supabase.com/docs/guides/storage/management/copy-move-objects) specifies copying and destination ownership; the operator preserves path-based source authorization and verifies hosted behavior. [Storage deletion guidance](https://supabase.com/docs/guides/storage/management/delete-objects) requires the Storage API rather than SQL. The current changelog was checked; Node 22 is used, no managed Storage schema object is modified, and new ledger privileges are explicitly denied.
