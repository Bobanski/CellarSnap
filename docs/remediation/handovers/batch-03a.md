# Batch B03a handover — September 12, 2026

## Objective and IDs
AUD-04 read containment; targeted AUD-19/48 coverage. Personal embeddings remain in the existing table, with owner-only access based on the actual entry, never JSON ownership claims. Curated search uses an explicit seven-source allowlist even for service-role requests. Unknown/orphan sources fail closed. Lifecycle cleanup is B03b (AUD-04/26), not claimed complete here.

## Resume here
Branch `codex/b03a-knowledge-isolation`, base `70c0721`; GitHub issue #89. Implementation complete; browser/release QC in progress. See canonical backlog and current Git state for release status.

## State and decisions
New forward migration `20260913002148_isolate_personal_knowledge_reads.sql` changes SELECT policy, client grants and both search RPCs. Same RPC signatures support existing clients. Personal search in the server uses the request client, adding caller identity to database isolation. Curated documents remain unchanged. No destructive rewrite or personal-data export.

## Verification
201 automated tests passed, including five pgvector/PostgreSQL tests reproducing the old disclosure and checking cross-owner, forged metadata, public-parent, orphan/unknown source, anonymous, client write/TRUNCATE, service general search, threshold and replay behavior. Web lint and TypeScript passed. Build/browser/live verification pending at this checkpoint. Captured live catalog contains schema and aggregate counts only: `evidence/b03-live-catalog.json`.

## Release state
Not merged, no migration applied, no live-fix acceptance at this checkpoint. Forward-fix recovery; do not restore globally readable personal chunks. B03a migration is compatible with the old app; deploy it before relying on the new request-client path.

## Workspace and environment
Preserve original modified tsconfig.json, two untracked historical reports and nested Claude worktree. Local Next development port 3001; logs under `/tmp/cellarsnap-b03a-*`. No native iOS/Android runtime/tooling available; responsive/Expo web is fallback only.

## Next slice
Finish B03a browser/live QC and release. B03b must add entry/owner FK-backed lifecycle, invalidate changed notes/grapes and reject stale in-flight embeddings. Existing history fallback must continue to work while embeddings await regeneration. Broad refresh jobs remain B10.
