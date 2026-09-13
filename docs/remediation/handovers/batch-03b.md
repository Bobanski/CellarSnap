# Batch B03b handover — September 12, 2026

## Objective and IDs
AUD-04 personal knowledge lifecycle, lifecycle subset of AUD-26, targeted AUD-19/48. B03a PR #90 merged as `19cb4fe`; its SQL/live read containment passed. B03b branch `codex/b03b-knowledge-lifecycle` starts from B03a's final head `5e15f9c` (included in merged main). Issue #89. No unrelated backlog scope pulled in.

## Resume here
Implementation and isolated QC passed. Hosted exact-migration rehearsal passed and rolled back. Open B03b PR, apply the reviewed migration, regenerate personal embeddings, run live concurrency/API/browser checks, then merge if final checks pass. Audit finding remains Partial until those release steps are verified.

## State and decisions
New `user_entry_knowledge_chunks` has a composite entry/owner FK, account cascade, owner-only SELECT and backend-only writes. No public-entry exception, JSON ownership authority, or anonymous/client writer. Curated `wine_knowledge_chunks` rejects legacy personal writes and keeps the B03a allowlist; current RPC signatures remain compatible with existing web/mobile clients.

`get_entry_knowledge_sources` provides ordered keyset pages and a single MVCC snapshot of row + named grapes. `publish_entry_knowledge` locks the source, compares the snapshot, derives identity metadata and upserts idempotently. A stale/deleted source returns false; the ingestion response counts it as skipped for retry. Entry edits, grape insert/update/delete and variety rename invalidate derived content synchronously. Entry/account deletion cascades. Trigger-only definer functions are private, have empty search paths and no client EXECUTE grants.

`20260913003148_enforce_personal_knowledge_lifecycle.sql` deliberately deletes only legacy personal derived chunks (172 preflight, plus current disposable fixtures), whose freshness cannot be proven. Raw entries and all curated documents/chunks remain. Regenerate from current entries using the new ingestion path. The existing personal-history fallback remains available while vectors are absent. Any entry-row change conservatively invalidates its vector; automatic refresh/retention/jobs remain B10 (AUD-26/31/32), not added to save/read paths here. This is a schema-compatible client rollout but the old backend ingestion writer fails closed until code deployment.

## Verification
210 automated tests passed, including 14 actual pgvector/SQL/ingestion tests. Positive vulnerable baseline; read matrix; legacy writer rejection; composite ownership; owner search; client/RPC authority; synchronous entry/grape invalidation; stale publication; entry/account cascade; 103-entry pagination; embedding response errors; idempotence/replay. Web TypeScript/lint and production build passed. Hosted PostgreSQL 17.6 rehearsal executed exact SQL in a rolled-back transaction and verified curated retention, legacy invalidation, publication and update cleanup. Live races and post-migration browser/Expo QC pending. B03a hands-on evidence remains in its [report](../../audits/b03a-knowledge-qc-2026-09-12.md).

## Release state
B03a merged and SQL deployed. B03b is not merged or migrated at this checkpoint. Keep the source authorization repair on rollback; forward-fix lifecycle functions/ingester. Do not restore old personal chunks into curated storage. New vectors can be regenerated from authoritative entries without changing ratings/notes.

## Workspace and environment
Preserve original modified `tsconfig.json`, two untracked historical reports, and nested Claude worktree. Next dev 3001 and fresh Expo export proxy 8083 are running. Temporary scripts/logs under `/tmp/cellarsnap-b03*`; no tracked environment edits. B03 synthetic A/B entries, curated chunk and conversations remain for live lifecycle QC; clean them at session end. TLS verification for direct database QC uses the official Supabase CA in a task-local file, not a global trust change. Native iOS/Android tooling unavailable; test Expo web explicitly as fallback.

## Next slice
Complete B03b rollout, live concurrency and browser retests; update this handover, canonical statuses and hub. Then prioritize independent AUD-05/B04 contact-resolution containment; AUD-06/QC-01 public projection remains a separate B02 slice. AUD-01 cache/revocation and broad B05 schema baseline remain open.
