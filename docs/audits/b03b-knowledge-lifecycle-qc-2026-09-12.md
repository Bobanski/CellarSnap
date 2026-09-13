# B03b personal knowledge lifecycle QC — September 12, 2026

PR #91 / issue #89; original product head `9e55342`, follow-up batching head recorded in Git/PR. B03a PR #90 merged `19cb4fe`; primary production deployment succeeded. Native clients are unchanged; RPC read signatures remain compatible.

## Implementation and isolated checks

Personal chunks moved to `user_entry_knowledge_chunks`, with composite entry/owner FK and account cascade. Only owners SELECT; only backend roles publish. Canonical metadata and a source snapshot replace JSON identity assumptions. Entry/grape edits invalidate synchronously; private trigger-only definers have empty search paths and revoked client EXECUTE. Curated knowledge rejects the obsolete personal writer.

212 automated tests passed after the final batching change, including 16 pgvector/SQL/ingestion tests: positive vulnerable baseline; owner/nonowner/public-parent/anonymous/service matrix; forged ownership, orphan and unknown-source denial; RPC/write authority; stale result rejection; entry/account cascades; grape insert/reassign/edit/delete and variety rename; idempotence/replay; 103-entry keyset pagination; incomplete embedding responses; batch limits and transactional rollback after a malformed later item. Web TypeScript, lint and production build passed.

## Hosted SQL and live checks

- Exact lifecycle migration rehearsed on PostgreSQL 17.6 in a rolled-back transaction. Checked curated retention, personal invalidation, publication and update cleanup; no rehearsal state persisted.
- Lifecycle SQL deployed as remote `20260913004127`, MD5 `190fa5195c0dd372edae429250596c33`. B03a remote `20260913002605`, MD5 `2c4ab9fbdf82841d6a768ba19012613d`. Both match reviewed files. Batch-publication follow-up is a separate forward file because lifecycle SQL was already deployed; never edit/reapply recorded SQL to hide history.
- 20 live Data API/RPC assertions passed on disposable fixtures: canonical publication; both owner reads and semantic matches; cross-target denial; anonymous/client snapshot/publication/write denial; legacy write rejection; immediate removal after owner update; late stale rejection; fresh replacement; curated backend search excludes personal data.
- Three real concurrent transaction cases passed using separate TLS-verified database connections: update-first blocks then rejects publisher; publication-first blocks update then invalidates the chunk; grape-insert-first blocks then rejects stale publisher. Verified actual lock waits through scoped `pg_stat_activity` PID reads. Initial grape case used invalid position 0 and failed the existing constraint; corrected to 1, strengthened the isolated schema with captured 1–3/FK/unique constraints, and reran successfully. This was fixture correction, not a product defect.
- Regeneration ran the actual production ingestion function against all 386 current sources (384 original + two fixtures): 386 published, zero skipped. Personal source-version mismatch check returned zero. Curated total remained 3,349 plus one test chunk; no raw entry data was rewritten by regeneration.
- Security advisors remain seven categories / 42 observations, unchanged from B03a. No new advisor finding. [Advisor reference](https://supabase.com/docs/guides/database/database-linter).

## Browser and mobile fallback

Hands-on Next phone 390×844: opened B's fixture, edited notes through the actual form, saved successfully, verified database note changed and old personal chunk disappeared. A fresh sommelier chat returned `violet compass`, proving history fallback uses current notes while the vector awaits refresh. Expo web owner A chat returned its updated `cedar lantern` note. B03a desktop/phone owner/nonowner and curated-chat coverage is in the [prior report](b03a-knowledge-qc-2026-09-12.md); final production browser checks follow merge.

Multiple in-app tabs with different viewport settings caused pointer hit-testing to disagree with screenshots; initial save clicks hit navigation. Closed the second tab, reset viewport, reloaded and retested successfully. No product workaround was committed. Screenshots under `/tmp/cellarsnap-b03-qc/` were visually inspected. Existing Maps loader/Places warnings (QC-04), Expo `(app)` heading (QC-05) and Animated web fallback warning remain; no new browser/server error was observed. Native `simctl`, `adb`, `emulator` remain unavailable. Expo is web fallback, not native gesture/binary/OTA acceptance.

## QC-driven publication batching

The initial actual 386-source regeneration took about one minute with **386 publication HTTP calls**. This avoidable serial delay was found in the new B03b writer (AUD-26 scope), so it was corrected before merge. `20260913004944_batch_personal_knowledge_publication.sql` caps batches at 100, locks entries in stable order, preserves every per-entry comparison and rolls back a malformed batch. The same 386 sources require **four publication calls**, with unchanged five source-page calls. Final live timing/rollout results are appended below. This is not a broad job-system or incrementality redesign (B10 remains open).

## Limits and recovery

Entry/account cascade proved with actual SQL in isolation; account deletion was not repeated on designated live accounts. Live entry deletion is checked during cleanup. Old conversation text is not rewritten; broader conversation retention remains AUD-26/B10. Any entry-row change conservatively invalidates its vector. No automatic refresh job added to save/read paths. Recover with forward fixes and regeneration; never restore legacy personal rows in the curated table. Fixtures and synthetic conversations remain until final release QC cleanup.
