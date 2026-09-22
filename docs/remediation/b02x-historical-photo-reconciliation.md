# B02x historical photo reconciliation — September 22, 2026

AUD-01 remains P0/Partial. This is a read-only preservation and triage checkpoint for AUD-22, not retirement approval or evidence of revocation.

The fresh production inventory contains 921 objects and twelve missing referenced paths. The original 487 rekey operations still have verified retirement evidence and the signing cutoff remains active. Do not repeat those operations or treat new uploads as historical leftovers.

The recovery archive at `/Users/esneider/Projects/Claude-OS/backups/cellarsnap/privacy-cutover-20260914` remains private and intact. This session read and SHA-256 checked all 882 files / 2,320,713,813 bytes. It also downloaded the 198 retained historical objects / 588,900,830 bytes through operator-authenticated Storage and matched every byte against that archive. No Storage write, copy, reference update or deletion occurred.

## Reproducible report

Capture a fresh snapshot with `scripts/storage/photo-reference-inventory.mjs`, using its explicit read-only database target, then run:

```sh
node scripts/storage/reconcile-historical-photos.mjs \
  /private/path/inventory.json \
  /private/path/privacy-cutover-20260914 \
  /private/path/reconciliation.json
```

The report includes source/reference cells, object IDs, recovery IDs, byte lengths and digests. Keep it outside Git. Publication is exclusive/atomic with mode 0600; corrupt or missing backup files prevent publication. Standard output contains only aggregate counts. It is deliberately not accepted by any deletion command.

Only exact historical path matches enter the retained set; changed object identity/length, current references and original-only recovery candidates are separate dispositions. New uploads are excluded. Path prefixes and original suffixes are hints, not ownership proof or evidence that uncropped originals reproduce a missing crop.

| Disposition | Objects / paths | Next acceptance |
|---|---:|---|
| Unreferenced archival review | 189 objects | Confirm canonical source history and archive mapping, copy to operator-only protected storage, verify archive bytes and denial to all app clients, then separately review retirement/fencing and regional old-capability observations. |
| Missing-base recovery review | 9 original objects | Retain exact bytes; inspect canonical slide/entry history and original-versus-crop semantics before proposing a new referenced image. Do not recreate old keys or overwrite source choices automatically. |
| No known recovery bytes | 3 referenced paths | Neither a current object, retained original nor indexed pre-cutover base is known. Preserve source rows and explicitly resolve with the owner; do not invent image content. |

Nine recoverable candidates plus three with no known bytes account for all twelve missing references. No source attribution, reconstruction or deletion is implied by these counts. The report is a point-in-time snapshot; every future mutation must repeat live compare-and-swap/reference checks, verify backups and enforce late-write fences.

## Retirement boundary

The existing rekey operator intentionally requires a valid referenced base/source and verifies application access before deleting old keys. Most historical objects do not meet that contract. Do not weaken those checks, pass a service-key download off as application authorization, or feed the 189 candidates into the existing rekey command. A future protected archival operation needs a separate, reviewed state machine and recovery/access contract.

The private full report and live hash result for this session are under `/tmp/cellarsnap-progress-private`; durable copies are recorded in the handover. Sanitized counts are in `evidence/b02x-b07b-b09a-qc.json`. This checkpoint does not depend on ephemeral scratch files to define the next work.
