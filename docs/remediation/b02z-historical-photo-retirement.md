# B02z historical photo retirement

AUD-01 / issue #81. This is the deletion-and-revocation continuation of the [protected archive contract](b02y-protected-photo-archive.md). It applies only to archive operations already in durable `copied` state. It does not authorize the nine held originals, the three missing paths without known bytes, source reconstruction, ownership inference, or archive deletion.

## State and authority

The additive migration extends `private.photo_archive_operations` with `fenced → deleting → deleted_pending_cdn → verified`. `retirementAuthorized` remains false until `verified`. The existing `private.photo_retired_paths` table accepts exactly one of a rekey operation or archive operation, so the deployed write, metadata, signing and download guards fence the exact historical source path without creating a parallel policy system. Both operation foreign keys have covering partial indexes.

All five retirement helpers are private, invoker-only and revoked from PUBLIC, anon, authenticated and service-role access. `prepare_photo_archive_retirement` increments and locks the global delivery epoch, requires the legacy signing cutoff, rechecks the copied receipt/proof, protected archive object, source identity, references and Storage metadata under table locks, then publishes the durable path fence. `begin_photo_archive_deletion` repeats the short final CAS. `confirm_photo_archive_deletion` requires the exact source to be absent while the archive and the rest of its cohort remain valid. A missing base/original sibling is accepted only when that sibling has a separate copied archive, matching durable fence and deletion checkpoint.

`record_photo_archive_revocation_evidence` accepts no URLs or response bodies. It requires raw and transformed denials in at least two named regions, status 400/403/404, a pre-deletion successful warm observation, post-deletion timestamps, and SHA-256 bindings for the capability, source and warm response. Once verified, identical lost-response retries are idempotent and differing evidence is rejected so the original audit record cannot be replaced. This is evidence recording, not a universal CDN-expiry claim.

## Operator sequence

Configure privileged PostgreSQL and Storage credentials outside command arguments and repository files. Never print or persist signed capability URLs. For each reviewed copied operation:

```text
node scripts/storage/photo-archive.mjs prepare-retirement UUID
node scripts/storage/photo-archive.mjs retire UUID
node scripts/storage/photo-archive.mjs observe UUID PRIVATE_EVIDENCE_JSON
node scripts/storage/photo-archive.mjs status UUID
```

Before `prepare-retirement`, privately prewarm both raw and transformed forms from each observation region and record only their hashes, status and timestamps. The command re-reads bounded source/archive bytes and requires receipt equality before installing the fence. `retire` requires that prior checkpoint, repeats byte and metadata verification, starts deletion in SQL, removes exactly one source path through the Storage API, then confirms absence. Lost responses resume with the same UUID. A failure at `deleting` or `deleted_pending_cdn` requires inspection; never recreate the old source key.

Roll out in a small canary, record counts/bytes at every phase, and stop on any reference, object, proof, bucket, cohort or denial mismatch. Preserve the private archive and recovery backup indefinitely through this batch. Do not run production retirement until the database password in OPS-04 is rotated, the migration is independently reviewed/applied, a fresh reconciliation still matches the 189 eligible operations, and the regional observation method is ready.

## Verification and rollback

Local PGlite replay exercises sequential base/original retirement, role denial, invalid evidence and exact single-path Storage deletion. PostgreSQL 17.6 complete replay matches the reviewed catalog; eight independent archive races cover late references, source/archive replacements and bucket exposure during preservation and retirement fencing. The 597 isolated application tests, 49 schema/tool checks, database type contract, web lint and web typecheck pass. Live Supabase security/performance advisors were reviewed before deployment; findings are pre-existing because this migration is not hosted.

There is no rollback that recreates a retired public key. Before deletion, disable the operator and retain the fence. After deletion, retain the fence, copied ledger, protected archive and recovery backup; investigate and recover only to a newly authorized path under a separately reviewed ownership decision.
