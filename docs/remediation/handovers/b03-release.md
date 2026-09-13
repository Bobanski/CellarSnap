# B03a/B03b release handover — September 12, 2026

## Objective and IDs
Completed two bounded slices: B03a read isolation and B03b personal embedding lifecycle, including a QC-driven publication batching correction. AUD-04 is Closed for the intended hosted database/web environment. AUD-26 remains Partial for broader retention, derived contexts and automatic refresh jobs. Targeted AUD-19/48 evidence expanded. New QC-09 records unsupported sommelier existence/write claims; it is Needs triage, not silently added to this batch.

## Resume here
Read the [canonical backlog](../backlog.md). Next small implementation slice is AUD-05/B04 identifier/contact-resolution containment, with login/recovery/availability fixtures before changing authority. AUD-01 cached-byte revocation and AUD-06/QC-01 public projection remain separate B02 follow-ups. Preserve Champagne Daylight draft PR #75.

Product release is `63712c3a99ff7e5ca6ae3e08c37dad2f73f7c4ed`: [PR #90](https://github.com/Bobanski/CellarSnap/pull/90) merged as `19cb4fe`, then [PR #91](https://github.com/Bobanski/CellarSnap/pull/91) as `63712c3`. Final B03b tested/reviewed product head is `973b4c3230c9341938ee0fe336f7f411186f98f5`. Release documentation is on `codex/b03-release-verification` based on that main; discover its current PR/merge state. Issue #89 tracks this scope. User merge permission was explicitly one-session only; it is not a standing permission for future sessions.

## State and decisions
Personal chunks are isolated in `user_entry_knowledge_chunks`, with owner-only reads, composite entry/owner FK, account cascade and backend-only publication. General search uses an explicit seven-source curated allowlist even under service authority. New personal search uses request authentication; unchanged RPC signatures preserve client compatibility. JSON metadata is not an authority source.

Source row and ordered named grapes are captured in one database snapshot. Publication locks the entry and compares that snapshot, deriving metadata from the canonical owner. Entry/grape changes synchronously invalidate chunks; entry/account deletion cascades. Late stale/deleted-source results cannot resurrect old content. Private trigger-only definers have empty search paths and no client EXECUTE grants. Publication batches cap at 100, order locks consistently and roll back malformed pages.

Legacy personal chunks had no provable version, so their 172 original derived records were invalidated, along with the two current synthetic test chunks. Raw entries and curated knowledge were preserved. The final ingester regenerated 386 current entries (384 original + two fixtures), zero skipped, with four publication calls plus five source-page calls; measured run 25.448 seconds versus about a minute for the initial 386-publication-call version. This is an observed run and request-count reduction, not a production latency benchmark. Any entry-row change conservatively invalidates its vector; immediate history fallback remains available. B10 still owns incremental/background refresh and broader retention. Old backend ingestion fails closed after migration; deployed code uses the new writer.

## Verification
[Read-isolation QC](../../audits/b03a-knowledge-qc-2026-09-12.md), [lifecycle QC](../../audits/b03b-knowledge-lifecycle-qc-2026-09-12.md), and [aggregate release evidence](../evidence/b03-release.json).

- 212 automated tests on final product code, including 16 actual pgvector/SQL/ingestion tests. Web lint, TypeScript and production build passed; final-head GitHub web and mobile type/lint jobs and primary Vercel preview passed.
- Exact lifecycle SQL passed a hosted PostgreSQL 17.6 rehearsal, rolled back before rollout. Live checks passed: 13 B03a Data API/RPC assertions, 20 B03b lifecycle assertions, three genuine concurrent transaction/lock cases, and five production-delete/cleanup checks. Account deletion tested in isolation, not on designated live accounts.
- Hands-on desktop 1440×1000 and phone 390×844: owner chat, general wine guidance, cross-user denial, sign-out/account switch, actual entry form edit/save, and fresh-chat current-note fallback passed. Fresh Expo web owner chat reflected updated notes at desktop/phone widths. No native iOS/Android tooling installed (`simctl`, `adb`, `emulator` unavailable); Expo is web fallback, not native/OTA acceptance.
- Primary production `63712c3` browser at desktop returned the revised note. After deletion through production API, a fresh phone chat did not return the deleted note. It incorrectly claimed the bottle remained listed and offered to save a note; this is QC-09, with underlying stale-context versus generation cause not yet established. No deleted note text or cross-user chunk was retrieved. Do not claim general sommelier grounding is fixed.
- No browser warning/error after the production release boundary; bounded production error log query returned zero rows. Local editor retained known Maps/Places warnings (QC-04); Expo retained `(app)` heading (QC-05) and animation fallback warning. Multi-tab viewport hit-testing mismatch was resolved by closing the second tab, resetting viewport and reloading; actual save retested successfully. The initial concurrency grape fixture violated existing 1–3 position rules; corrected to 1, strengthened the isolated fixture and reran successfully. No product change was made for either harness issue.
- Final counts after cleanup: 384 original entries, 384 personal chunks, 3,349 original curated wine chunks, zero legacy personal chunks, zero orphan chunks and zero stale source hashes. Synthetic entries, curated fixture and B03 conversations/messages removed. Ordinary account capabilities unchanged.

## Release state
Both implementation PRs are merged. Primary production `cellar-snap` is Ready at `https://cellarsnap.app`, deployment `dpl_59Ds8k68hnLHFEh2kzQ36pPtTDUP`, corresponding to `63712c3`. Duplicate `cellarsnap` still fails with missing Supabase environment variables (OPS-01); no deletion or configuration change made there. No native binary/OTA release was needed or performed for unchanged mobile code.

| Reviewed migration | Hosted version | Exact MD5 |
|---|---|---|
| `20260913002148_isolate_personal_knowledge_reads.sql` | `20260913002605` | `2c4ab9fbdf82841d6a768ba19012613d` |
| `20260913003148_enforce_personal_knowledge_lifecycle.sql` | `20260913004127` | `190fa5195c0dd372edae429250596c33` |
| `20260913004944_batch_personal_knowledge_publication.sql` | `20260913005247` | `0e8c864fbd8abfbf0b623a0b715d360d` |

Do not reapply files to reconcile timestamps. Security advisors remain seven categories / 42 observations, two fewer mutable-search-path warnings than pre-B03, no new findings. Recovery is forward correction plus regeneration; retain owner policies/FKs and never restore personal chunks to curated storage. Prior generated conversations were not broadly rewritten or purged; retention/grounding outside disposable QC is still AUD-26/QC-09 work.

## Workspace and environment
Preserve original modified `tsconfig.json`, untracked `cellarsnap-fix-plan.md`, `cellarsnap-qa-report.md`, and `.claude/worktrees/agent-a251821a0b01f63dc/` (`overhaul/w2b-palate`). No tracked environment files changed. Task servers (Next 3001, Expo proxy 8083) are stopped at handoff; credential/session file removed. Logs/screenshots remain optionally under `/tmp/cellarsnap-b03-qc/`; reproduction and numeric evidence are in Git. Native coverage remains unavailable. The CA used for direct PostgreSQL QC was task-local and TLS verification remained enabled.

## Next slice
1. AUD-05/B04: capture actual RPC grants and resolver behavior; design non-enumerating contact handling with login/recovery/availability compatibility and stable abuse limits.
2. Keep AUD-01's supported-client/cache revocation acceptance explicit; do not call fresh authorization a universal byte-revocation guarantee.
3. AUD-06/QC-01 public projection remains independent; QC-09 needs a bounded context/claim investigation without displacing urgent privacy work.
4. Continue one or two reviewable slices per handover. Native availability, schema/code deployment and live acceptance must remain separate in future reports.
