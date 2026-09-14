# B02v/B02w privacy cutoff runbook

QC-01 / AUD-01, issue #81. These changes are staged: installing either SQL file does **not** activate its cutoff. The current handover records whether staging, distribution, activation, object deletion and live verification actually happened. Never infer production state from a passing replay.

## Rating source

`wine_entry_ratings` holds the owner-only nullable 1–100 value, with entry/account cascade FKs and independent RLS. API roles have read-only access; the entry write trigger owns updates. `wine_entries_with_ratings` is a security-invoker view: existing entry visibility plus an independent private-rating join. Owners/service readers retain numbers; other viewers receive null and the stored public enjoyment band. App, scoring, knowledge, mobile and operator readers use that view. Badge fact queries that do not consume ratings stay on their original relation.

During staging, the write trigger mirrors current entry ratings. Activation drains writers, checks exact parity and changes the enabled trigger before clearing the legacy column. Trigger selection is catalog state, so an old repeatable-read snapshot cannot restore legacy values. After activation, successful entry writes capture submitted ratings and clear the input column in the same transaction. Explicit null clears, conflict/no-op retries, failed grape changes, ownership immutability and deletion cascades are tested. Valid personal knowledge survives installation/activation; later source edits still invalidate it synchronously.

The AFTER trigger creates intermediate WAL tuples. **Keep both rating relations out of Realtime/logical publications.** Activation refuses an existing publication; recheck this invariant after infrastructure changes. This is committed Data API isolation, not erasure of database backups, WAL, privileged exports or knowledge legitimately held by its owner. Do not roll back by restoring numbers to readable public rows.

## Photo authority

`photo_delivery_state` controls legacy direct Storage access. The restrictive SELECT policy distinguishes actual Storage operations. Once activated, direct raw/transformed signing, download, listing and S3 reads are denied; existing owner-scoped upload/update/copy/delete operations remain subject to prior policies. Authorized application metadata uses a bounded authenticated RPC and current source authorization, followed by the existing protected image endpoint. Adopted clients use this endpoint; the new server release no longer emits legacy wine-photo signatures.

Reference swaps advance a locked epoch and record durable tombstones for the old base and original sibling. All nine canonical reference columns reject retired paths, including ordinary privileged reference writes. Old-snapshot writers abort rather than revive a reference. Owner uploads/overwrites to tombstoned paths are denied. Fixed and unique avatars use the same protocol; new uploads use unique names. Replacing an avatar leaves old objects for verified retirement. Privileged Storage access remains trusted administrative access; coordinate any separate service-role writers.

The worker keeps `state=pending_revocation` after the copy/hash/reference commit. Retirement phases are separate: `deleting`, `deleted_pending_cdn`, then `verified` for recorded observations. A lost delete response resumes the same operation and paths. Deleting Storage metadata directly is never the production procedure.

## Release order and gates

**September 14 owner clarification:** CellarSnap is currently web-only and has not launched iOS or Android. Historical EAS builds are not a supported installed population. Native installation/distribution is deferred to a future mobile launch and does not gate this web privacy release. Desktop and phone-width web acceptance remains required. Brief photo unavailability is acceptable; permanent photo loss is not. Preserve a private, hash-verified backup and verify replacement bytes, references and application access before retiring any old object. Missing references and unreferenced objects are not a deletion cohort.

1. Review/merge the PR and record exact SQL hashes. Install only the two new manifest files, in order; never replay historical migrations. Capture pre/post entry/rated-row/private-knowledge/object counts, grants/policies/publications and backfill parity. Keep both activation flags false. Verify old primary API and owner create/edit paths against the staged database.
2. For this web-only release, verify desktop and phone-width login, library/events, feed/Home/profile/detail, normal and bulk creation, import/copy/drink, edits, photos/crop/avatars, retry and sign-out against the staged backend. Native 1.0.1/build 2 acceptance and distribution remain a future mobile-launch requirement, explicitly waived as a gate for this release by the owner. No native or OTA release is part of this rollout.
3. Deploy the new web/server release and verify primary cookie/bearer/anonymous/owner/friend/FOF/stranger/block/test/share flows. Capture old raw and transformed signed capabilities **before** signing cutoff, warm them from at least two independent regions, and retain their timestamps/body hashes privately. Do not commit capability URLs or tokens.
4. With client adoption and live application acceptance recorded, run these **explicit operator actions** through an authenticated administrative SQL connection. Each is idempotent, bounded by a short lock timeout, and independent; retry lock conflicts rather than weakening locks:

   ```sql
   select private.activate_rating_isolation();
   select private.activate_photo_cutoff();
   ```

   Verify zero committed non-null `wine_entries.rating`, exact owner/private-source counts, role-based REST filters and embedded joins, owner null/1/100 writes, atomic retry/conflict, scoring/knowledge, and current images. Verify authenticated direct signing/raw/transformed/alternate reads are denied while supported uploads/crop/delete and request-authorized images work.
5. Refresh the canonical photo inventory. Resolve the previously recorded twelve missing references and review the 118 unreferenced objects separately; do not blindly delete either cohort. Inventory all fixed avatars and external consumers. Use stable operation UUIDs and one reviewed photo cohort at a time:

   ```sh
   node scripts/storage/photo-rekey.mjs plan OPERATION_UUID SOURCE_PATH
   node scripts/storage/photo-rekey.mjs resume OPERATION_UUID
   node scripts/storage/photo-rekey.mjs status OPERATION_UUID
   node scripts/storage/photo-rekey.mjs retire OPERATION_UUID
   node scripts/storage/photo-rekey.mjs observe OPERATION_UUID EVIDENCE_JSON
   ```

   SQL adapter requires explicit `PGHOST`, `PGUSER`, `PGDATABASE`, verified remote TLS and private credential input. Storage adapter requires `CELLARSNAP_REKEY_STORAGE_URL` and `CELLARSNAP_REKEY_SERVICE_KEY`. Retirement additionally requires `CELLARSNAP_REKEY_APP_ORIGIN` and a current authorized `CELLARSNAP_REKEY_VERIFY_BEARER`. Keep credentials out of command arguments and logs. The worker rehashes replacements and requires a successful protected image response before deletion. SQL verifies tombstones, source references, object identity/proof, cutoff and actual deletion.
6. Poll the previously warmed raw/transformed URLs from both regions while their capabilities remain valid. Record denial HTTP status (400/403/404), observation time, region, path, surface, capability SHA-256, original source SHA-256, warmed body SHA-256, warmed-at timestamp and warm status 200. `observe` accepts a bounded JSON array with keys `region`, `path`, `surface`, `status`, `observed_at`, `capability_sha256`, `source_sha256`, `warm_sha256`, `warmed_at`, `warm_status`. Transformed warmed bytes may differ from source bytes. Missing/malformed/one-region evidence cannot mark the operation verified. This is trusted operator evidence, not independent verification of geographical origin.
7. Recheck current protected images and all reference/object counts. Preserve an explicit record of deleted-pending-CDN operations. A verified sample is not a universal CDN invalidation guarantee, and revocation cannot erase bytes already downloaded or cached by a recipient. Close AUD-01/QC-01 only against their documented live acceptance, supported-client and residual boundaries.

## Failure and recovery

Before activation, leave flags false if adoption or parity is incomplete. After activation, retain the private source and tombstones; recover the adopting app rather than restoring exposed ratings or signing. Never roll references back to retired keys. Failed copy/reference commits keep original authoritative references intact; use the existing abandon/resume rules. After a committed swap, verify and repair forward using fresh paths. If deletion is uncertain, inspect/resume the same operation; if CDN denial is incomplete, remain `deleted_pending_cdn`.

Official references: [Supabase column privileges](https://supabase.com/docs/guides/database/postgres/column-level-security), [Storage operation definitions](https://github.com/supabase/storage/blob/master/src/http/routes/operations.ts), [EAS monorepo builds](https://docs.expo.dev/build-reference/build-with-monorepos/), [EAS archive rules](https://github.com/expo/fyi/blob/main/eas-build-archive.md).
