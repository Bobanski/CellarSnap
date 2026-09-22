# B02y protected historical-photo archive

AUD-01 / AUD-22, issue #81, [PR #165](https://github.com/Bobanski/CellarSnap/pull/165). This is a preservation milestone for the 189 unreferenced historical objects identified by [B02x reconciliation](b02x-historical-photo-reconciliation.md). It does not retire old capabilities or resolve ownership/crop semantics.

## Contract

`20260922063629_protected_photo_archive.sql` creates the private `photo-recovery-archive` bucket, two restrictive ALL policies denying anonymous/authenticated object and bucket operations, and an RLS-enabled `private.photo_archive_operations` ledger. Installation refuses disabled managed Storage RLS or a pre-existing bucket. The private ledger and four invoker functions have no PUBLIC/anon/authenticated/service-role privileges. Privileged PostgreSQL performs operator transactions; a separately configured service key performs Storage copies/reads. No public RPC, app route, client grant or application database type changes.

The state machine is `planned → copied` or `planned → abandoned`. A copied record and its source-to-opaque-destination mapping remain durable. Abandon never removes partial destination bytes. Source names, backup IDs and digests are private operator data, not ownership assertions. Ordinary status output contains only operation ID, state, byte count, verification time and `retirementAuthorized: false`.

Planning binds a source to its indexed backup ID, size and SHA-256, plus inventory and backup-index digests. The CLI verifies the selected local recovery file before planning. SQL checks the live source identity/size and captures the full current base/original cohort using the existing nine-column reference snapshot. Any reference on either sibling prevents planning, including the nine originals whose missing crop/base is still referenced. Existing source-rekey requirements remain unchanged.

Resume copies with a fixed cross-bucket, no-upsert Storage request. It reads bounded source/destination bytes, compares both with the preserved backup hash/size and MIME, verifies stable metadata, then publishes proof through a short SQL transaction. The final transaction requires READ COMMITTED, locks reference tables and Storage metadata against concurrent writes, and compares source, destination and bucket privacy again. The broad locks are bounded by the existing two-second lock and thirty-second statement timeouts; no network operation holds them.

Lost copy or commit responses resume by operation ID. An existing destination is verified rather than overwritten. Resuming a copied operation checks bytes and metadata again. **Copied is a timestamped observation, not an immutable source or permission to delete it.** References and source metadata may change afterward; a later retirement implementation must recheck them and fence subsequent writes. A copied operation cannot be abandoned/replanned automatically if its source changes; preserve the old recovery record and investigate through a reviewed future transition.

## Operator workflow

1. Review and release the exact additive SQL separately from code. It has not been applied to the hosted project in this batch. Verify the new bucket is private, both managed tables retain RLS, role-denial policies and private grants match the reviewed catalog. Do not replay prior migrations.
2. Exercise the real hosted Storage copy and role matrix using disposable synthetic source/destination fixtures. SQL fixtures and the HTTP adapter contract pass locally; hosted cross-bucket copies are still an explicit release prerequisite.
3. Refresh the read-only inventory/reconciliation, preserving its private output. Reverify the durable backup. Keep nine missing-base-original recovery candidates and three no-known-byte paths outside this cohort. A prefix alone never establishes ownership.
4. Configure explicit `PGHOST`, `PGUSER`, `PGDATABASE` and credentials privately. Remote libpq requires `PGSSLMODE=verify-full`; optional `CELLARSNAP_PSQL` selects the executable. Storage uses `CELLARSNAP_ARCHIVE_STORAGE_URL` and `CELLARSNAP_ARCHIVE_SERVICE_KEY`. Never paste keys into command arguments or public logs.
5. For one reviewed source, choose a UUID and run:

   ```text
   node scripts/storage/photo-archive.mjs plan UUID PRIVATE_RECONCILIATION_JSON BACKUP_DIRECTORY SOURCE_PATH
   node scripts/storage/photo-archive.mjs resume UUID
   node scripts/storage/photo-archive.mjs status UUID
   ```

   Use the same UUID after an interrupted response. Conflicts require inspection, not automatic replacement. An uncommitted plan can be abandoned with `abandon UUID`; all original and partial archive bytes remain.
6. Verify actual client denial: anonymous and authenticated raw/transformed reads, signing, listing, copy-out and mutation must fail; successful service-key reads only prove operator access. The app reads `wine-photos`, never this archive bucket. Reconcile ledger/object counts and archive/source/backup digests before accepting preservation.

This tool has no retirement, move, delete, reference rewrite or signature command. Do not feed its copied records directly to the existing referenced-base retirement operator. Historical retirement needs its own reviewed reference/upload fence integration, fresh byte/CAS checks, old-object deletion confirmation, and separately recorded prewarmed raw/transformed denial from independent regions.

## Validation and recovery

At source `225c0ee`, 47 schema/tool checks and PostgreSQL 17.6 replay pass. Four real concurrent backends test a late reference, source replacement, destination replacement and bucket-privacy change while commit waits; all fail without publishing a copied record. Existing rekey/cutoff/edit/badge races still pass. Failure injection covers lost copy/commit responses, corrupt bytes, malformed provenance, duplicate plans, held originals, clients with otherwise broad permissive policies, disabled RLS and occupied-bucket installation refusal.

Read-only preflight verified 189 eligible recovery receipts / 559,574,950 bytes on September 22. Nine originals remain held. No hosted archive bucket, historical copies, deletions or new fences exist yet. [Evidence](evidence/b02y-release-archive-qc.json).

An application revert does not remove preserved data. If the operator is disabled, retain its ledger, bucket and all recovery bytes. Never roll back by dropping populated Storage metadata or recreating an old exposed source path. Future recovery must use newly authorized paths and explicitly reviewed ownership/crop semantics.

Provider references: [private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), [cross-bucket copy and permissions](https://supabase.com/docs/guides/storage/management/copy-move-objects). Installed `@supabase/storage-js` uses the same `destinationBucket` request field; current docs were checked September 22.
