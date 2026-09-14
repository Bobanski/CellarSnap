# B02r/B02s release — September 13, 2026 (EDT)

## Objective and IDs

QC-01 P1/Partial: adopt an owner-library contract before physical rating isolation. Related AUD-19/48/50, QC-06 retry acceptance and AUD-35 incremental-search residual. Two bounded batches: B02r owner API and B02s mobile Library/Events adoption. No SQL, rating transfer, photo retirement or native distribution.

## Resume here

**#152/#153 merged.** Product main `05f912d0ed722ff48e28fc3f00cce8afb3a8b081`, tree `0cd0530b267368fdde309e0945b0fc1e13275835`, exactly equals tested candidate `db3225f`. B02r merged as `6907e77`; B02s as `05f912d`. Application CI and primary preview builds pass. Final-primary full acceptance passed. This supersedes the B02r/B02s checkpoints.
Preserve #81/#104/#112 and design draft #75. This session's merge/close permission expires at handoff.

## State and decisions

- `/api/entries/library` reauthenticates every request, scopes consumed entries to the authenticated owner even for testers, and validates ownership again at serialization. Only owner rows carry numeric 1–100 inputs; grouped slides carry null/public bands. Existing `/api/entries` callers remain compatible.
- Bounded 1–100 pages use a validated versioned owner/date/timestamp/ID cursor, retaining tied microseconds and UUID boundaries. Cursors are positions, not authority; cross-owner cursors fail. This is not a transaction snapshot across concurrent edits; refresh remains necessary for changing chronology.
- Required grapes, label-photo queries and groups fail closed on database errors. Existing helper callers retain their legacy fallback defaults. Photo source authorization remains request-based; no Storage signatures are minted by adopted payloads. Sanitized stage-only failures and debug page counts support diagnosis without tokens/rows.
- Mobile Library/Events no longer read/hydrate raw entries through Supabase. Complete page schema, viewer/owner, public group bands, unique IDs and advancing cursors are required. Bounded bearer/no-cookie reads have no fallback. Session/refresh/unmount invalidate obsolete loads; first/later-page failures clear results with a 44px Retry button. Optional collection labels fall back after five seconds.
- Existing progressive client filtering/sorting is retained. During a slow multi-page load, search/average display still reflects loaded rows; this remains AUD-35/B09, not a claim of complete server aggregates/search. Physical rating storage remains readable by authenticated roles on visible rows; targeted live grants reconfirm table/column SELECT. Owner create/edit/import, server/operator source contracts and installed-client gates remain.

## Verification

**509 isolated / 30 schema checks**, canonical database type contract, web/mobile types and lint, all-platform Expo exports and exact-commit primary Vercel production builds/application CI pass. A separate local Next production build was not run. Targeted live table/column privilege and cleanup counts are read-only; no fresh full-catalog audit.
Actual local and primary production desktop 1440×1000 / phone 390×844 Expo-browser Library: owner/private and unrated values, numeric filters, both rating sort directions, Syrah grouping, decoded label images, Events gallery/dot selection and owner-detail navigation. No direct mobile Library wine_entries requests. API fixture scan: 105 owner entries share date and exact microsecond timestamp; 11 pages at limit 17 preserve all fixture IDs with no duplicates/skips. Second designated owner cannot see those rows or reuse their cursor. Group slides retain public bands; grapes and request-photo URLs preserved.

Malformed owner/viewer/raw group payload rejection; initial and later-page injected failures clear results; Retry recovers; optional collection request stalls cannot strand Library; held responses after tab navigation/sign-out are rejected. Cookie and cross-origin bearer, explicit invalid bearer with valid cookie, anonymous and read-only preflight counterparts pass. Web owner detail/photo/rating desktop/phone counterpart passes.

Final production suite: zero page exceptions and eight expected HTTP/console failures only (five deliberate bad-input/cross-owner-cursor 400s, three injected 503s). Web supplemental photo/rating desktop/phone run has zero page/HTTP failures and one recurring owner `TypeError: Failed to fetch` console diagnostic; its origin was not isolated in this slice (AUD-50 remains Partial). A bounded exact-deployment error-log query returned zero entries; scope/time/limit are in the evidence.
Native unavailable: CommandLineTools only, simctl absent, emulator/adb and standard Android SDK directory absent. Expo-browser acceptance and iOS/Android exports are not installed-native acceptance. QC-05 `(app)` header and existing B11 polish remain; QC-06 broader pressable audit remains Open.

QC corrections: fixture used the canonical variety_id/1-based grape position; observed UI labels replaced guessed sort/tab labels; image decode and full multi-page deadline waits replaced premature screenshots/assertions. New retry touch target was corrected to 44px and retested. Storage HEAD existence returned an SDK error for a removed key; independent list/catalog verification confirmed cleanup. A disposed interception interrupted the first production fault run; the exact persisted fixture manifest was recovered, late interception disposal is handled, and the complete production suite was rerun. No ordinary data was repaired or deleted.

## Release state

Primary `dpl_933bno3mVsxmfnv9X2HS35r4qbxc`, GitHub deployment `6429282439`, is for `05f912d`; Ready September 14 **02:21:57 UTC**, alias cellarsnap.app. The Expo export was served locally through a cookie-stripping proxy to that primary backend.
No schema/migration, ordinary photo rewrite or native binary/OTA release. Primary `cellar-snap` builds pass; duplicate legacy `cellarsnap` fails for missing Supabase variables (OPS-01, logs reconfirmed). Do not restore direct-rating fallbacks for backend outages; preserve the API when recovering supported clients.

## Workspace and environment

Independent final catalog/list checks: **zero session entries/groups/photo objects, 882 total wine-photo objects, four testers**. No tester/profile flags changed; entry-attached fixtures and links removed.
Original modified tsconfig bytes, two untracked user reports, nested worktree and #75 preserved. Generated Next AGENTS delta restored. Session Next 3001/Expo 8083 stopped; unrelated services preserved. No env files changed. Private harness/logs `/tmp/cellarsnap-b02r-b02s`; committed evidence is sanitized.

## Next slice

1. AUD-01 P0: supported/native adoption evidence, durable late-write fencing and legacy-signing cutoff, avatar/external-consumer coverage and retirement-worker acceptance. B02l pending_revocation does not authorize production retirement.
2. QC-01: remaining owner native create/edit/import and other source paths from the inventory, privileged scoring/knowledge/operator contracts and coordinated private source transfer. Preserve atomic save snapshots/grape semantics and owner numbers; verify REST/RPC/realtime access before physical cutoff. Library and Events adoption is complete in source/backend, installed-native rollout remains.
3. AUD-13/15 grouped/lifecycle commands. Preserve AUD-35 server search/aggregates and AUD-10/19/21/B11 residuals on existing IDs.

[Library phone](../evidence/b02s-live-library-phone.png), [Events phone](../evidence/b02s-live-events-phone.png), [Retry phone](../evidence/b02s-live-library-outage.png), [web photo phone](../evidence/b02s-live-web-photo-phone.png).

[Backlog](../backlog.md), [hub](../README.md), [consumer inventory](../b02o-rating-consumers.md), [evidence](../evidence/b02r-b02s-release.json).
