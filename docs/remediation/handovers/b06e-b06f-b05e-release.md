# B06e / B06f / B05e release handover — September 13, 2026

## Objective and IDs
Three bounded slices: AUD-09 featured-profile authority (#117 / #112), QC-03 summary-outage routing and browser acceptance (#118 / #112), QC-14 historical grape alias repair plus mobile manual lookup (#119 / #104). Preserve historical awards, canonical reference identities, existing features and dark theme. Umbrella issues #112/#104 remain open for stated residual scope.

## Resume here
Read the [backlog](../backlog.md); implementation/QC checkpoints: [B06e](b06e-release.md), [B06f](batch-06f.md), [B05e](batch-05e.md). All three source slices are merged; both forward migrations are live. Final web deployment and verification are recorded below. Native runtime/distribution is not complete.

Next badge slice is B06g/QC-16: expose accessible feature/clear controls in Expo; its legacy handler currently has no caller. Re-triage outstanding P0 AUD-01 revocation and P1 AUD-06/QC-01 public projections before broader polish. Deferred 32 badge definitions/history remain AUD-09; automatic OCR grape resolver/scoring contract remains AUD-10/B07; full bootstrap/type adoption remains AUD-19/21. No new user task or automation was created. Merge/close permission was one-session only and expires with this handoff.

## State and decisions
- Both featured representations require stored owner awards, with modern ordered selection and legacy single replace/clear. Revocation/key reassignment removes missing picks transactionally. Concurrent lock conflicts may abort/retry; no unauthorized feature survives. Preserve tightened authority on rollback.
- Unknown profile count no longer means zero. Outage retains neutral palate copy and full-profile navigation; known zero or explicitly missing survey keeps setup behavior. Repeatable loopback proxy supports outage/empty/normal modes, without changing live services.
- Corrected 131 uppercase-damaged ASCII alias encodings into 130 valid keys. `Xarel-lo`/`Xarel Lo` are equivalent spellings for one owner and consolidate to canonical spelling. No cross-variety collision found; unexpected/non-ASCII keys or alias-ID FK consumers fail for review. Surviving alias IDs/timestamps and all 93 varieties/271 entry-grape rows remain unchanged. All historical SQL/baseline files preserved.
- Offline reviewed seed contract records all source spellings and generates conflict-checked SQL with canonical-variety prerequisites. This is not a full fresh-product bootstrap. Expo manual typeahead now calls the existing bearer-authenticated alias endpoint with runtime validation and stale/error handling; automated OCR selection is separate.

## Verification
- 385 isolated checks; 12 schema tests; database/web/mobile types and lint; PostgreSQL 17.6 replay/catalog and four independent-backend, lock-observed feature/revocation cases. Web build and fresh Expo web/iOS/Android exports passed. Final PR CI/primary previews passed; duplicate project's missing environment configuration remains OPS-01.
- Hosted featured authority: 29 Data API/HTTP cases (repeated against production API), including ten concurrent deletion/reassignment races, malformed/unearned/cross-owner denial and cookie/bearer parity. Exact original profile and all five award IDs/timestamps restored and compared. Private trigger catalog/drift and unchanged security-advisor metadata verified.
- Browser badge QC: desktop/phone select, reorder, cancel, save, clear and reload. Production fresh login/feature/reload/clear/reload passes. Clean dev profile repeated loads do not reproduce QC-15's one transient JSON parse error; original cause unknown. QC-15 is Not reproducible, not a speculative fix.
- Outage QC: desktop 1440×1000 and phone 390×844; identity/gallery retained, unknown counts, full palate navigation, menu Counts unavailable, known-zero fixture, and normal recovery to 71 wines/two friends/two countries pass. No live outage injected. No browser/server errors captured on this scoped flow.
- Alias QC: local/production cookie-bearer query equivalence, denials, limits and punctuation/case cases. Chrome desktop actual CSS 1800×1250 and phone 390×844 canonical suggestions/chips/remove/cancel; production Xarel Lo case passes. In-app native disclosure activation failed but Chrome local/live worked; documented as browser tooling/coverage observation, no confirmed app regression. Existing Maps warnings stay QC-04; other Chrome warnings attributed to extension scripts.
- Corrected Expo export at 390×844: Shiraz→Syrah, selected chip survives injected 503, clear failure message, GARNACHA→Grenache recovery, remove/cancel; API proxy stripped cookies and observed bearer-only requests. No entry saved. Source/API success is not native distribution.
- No Xcode app/simctl or Android SDK/emulator found. No binary/OTA deployed. QC-03/QC-14 and broader badge/dependency/date findings retain native acceptance where applicable.

## Release state
| Slice / PR | Source / merge | Primary production |
|---|---|---|
| B06e / [#117](https://github.com/Bobanski/CellarSnap/pull/117) | `831345b20abc16c46c93ad0eecffc2122cde5293` / `65a4c1c45f25ec59067bba2593eb76375766c217` at 07:53:14 UTC | `dpl_aHWfvEN8yCoyNFVs8SbeYdQ22fBG`, Ready 07:53:40 UTC |
| B06f / [#118](https://github.com/Bobanski/CellarSnap/pull/118) | `d8bdfa8a2c1ee48b8af80ac544a9d543aa372f99` / `4eb7df807db11918f663761d49a66748c4955ca0` at 07:59:41 UTC | GitHub deployment `6419143251`, success 08:00:05 UTC |
| B05e / [#119](https://github.com/Bobanski/CellarSnap/pull/119) | `713b42da84617972b0269842c430bf8157cdea02` / `67a188fc9ca1d8e15530a30ae4b76868c80a8b26` at 08:18:12 UTC | `dpl_E3HM9Bs8Dy8yvR71uNkRiNrYPEPn`, Ready 08:18:40 UTC |

Final source deployment: [primary deployment](https://cellar-snap-dfcd9954d-eitan-sneiders-projects.vercel.app), live domain https://cellarsnap.app. Production alias HTTP suite passed again after the final deployment; phone profile/menu show matching 71/2/2 counts and full palate link. Browser sign-out reaches login. Bounded final-deployment error query since 08:18:40 UTC returned zero records; this is scoped evidence, not a claim about unrelated flows. Release documentation is a separate docs-only follow-up on `chore/b06e-b06f-b05e-release`.

[Sanitized release evidence](../evidence/b06e-b06f-b05e-release.json).

Migrations applied once; do not replay to reconcile local versus hosted timestamps:

| Local file | Hosted version / name | Exact statement SHA-256 |
|---|---|---|
| `20260913071742_earned_featured_badges.sql` | `20260913074139` / `earned_featured_badges` | `319f843212eee7da071905ec27657f7bc0cf301ae1bf6f165bba378f4edcf71c` |
| `20260913075619_repair_grape_alias_keys.sql` | `20260913080026` / `repair_grape_alias_keys` | `a749e087d2df016efbd4095ee60057881b7b81d497cf288b2752a541595f35d9` |

Full live schema drift matches. Existing security advisories unchanged; see [public projection advisory](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view). No clean-bill-of-health claim for the separate backlog. Primary source deployment is separate from both SQL and native release. Forward recovery must retain server-only award authority, earned-only features and normalized canonical alias ownership; do not restore vulnerable privileges or broken keys.

## Workspace and environment
Original user `tsconfig.json` is byte-for-byte preserved; `AGENTS.md` unchanged. User untracked reports `cellarsnap-fix-plan.md`, `cellarsnap-qa-report.md` and nested `.claude/worktrees/agent-a251821a0b01f63dc` preserved. QC web and Expo sessions signed out; temporary browser tabs may remain at login. Session-owned Next 3001/dev3004, summary proxy3017 and Expo8083 stopped; no environment files changed. No new entry saved during alias UI QC. Final read-only comparison confirms profile/award restoration and all surviving alias rows differ only in normalized key.

Evidence snapshots/logs/export bundles under `/tmp/cellarsnap-b06e-resume`, `/tmp/cellarsnap-b06f`, `/tmp/cellarsnap-b05e` are optional; committed contracts/QC reports and sanitized release JSON explain reproduction without local files or chat. No credentials committed. Separate design draft #75 preserved; #104/#112 remain open.

## Next slice
1. Check current production/main and any changed priority, then B06g/QC-16 mobile feature/clear controls with real UI and native acceptance when available.
2. Revisit unresolved privacy acceptance before broad refactors. AUD-09 deferred semantics/history require reviewed facts, not invented thresholds.
3. Continue B07 scoring and AUD-19/21 bootstrap/type work as bounded slices. Existing QC-04/05/06/10/12 and OPS-01 remain separate; no unrelated fixes were silently added.
