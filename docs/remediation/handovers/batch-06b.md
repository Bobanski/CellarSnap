# B06b handover — September 13, 2026

> Historical implementation checkpoint. These slices are now merged, the badge migration is deployed, live checks passed and fixtures are cleaned. Use the [combined release handover](b06b-b06d-release.md) for current state; the original checkpoint below preserves history.


## Objective and IDs
AUD-09: server-controlled award writes and 53 stored-fact badge definitions. Preserve all 85; 32 deliberately deferred, with reasons in [contract](../b06-badge-contract.md). QC-03 and QC-08 remain separate next slices. Issue #112.

## Resume here
Branch `codex/b06b-badge-contract`, base `eb36ee0`. Implementation checkpoint; finish combined Expo fallback and release checks before merge. Native tools unavailable. Continue count definitions then selected event navigation as separate commits/PRs.

## State and decisions
No request-provided eligibility facts. Owner consumed-entry keyset load, canonical grape links, normalized exact matching and full compound constraints. Admin writer reports actual inserted rows only. Forward SQL restricts clients to reading awards; historical awards preserved. Featured-profile presentation authority remains an explicit later AUD-09 slice.

## Verification
375 isolated checks passed; after two semantically incorrect definitions were deferred, the 96 badge checks passed again. Five schema/source checks, web typecheck, database type contracts, web lint and Next production build pass. The initial test fixture incorrectly used `first-pour` rather than published `first-log`; corrected and rerun. An initial live grape fixture used position zero; the database correctly rejected it, and position one succeeded.

Authenticated local HTTP: anonymous/invalid 401; forged user/count/rating hints ignored; 15 disposable private tastings with canonical Nebbiolo links produced exactly Nebbiolo Head, Campania Curious and Chile Committed. Repeated/concurrent requests report no duplicates. Existing five awards preserved. Actual desktop 1440×1000 and phone 390×844 badge category filters, earned badges and detail toggling passed; screenshots visually inspected, no captured browser warnings/errors. Local screenshots/results `/tmp/cellarsnap-b06b`. No iOS simctl or Android emulator available. Expo fallback pending at this checkpoint.

## Release state
Not merged; SQL not deployed; no production server acceptance claimed. Local app uses hosted DB. Fifteen disposable entry IDs and three newly earned badge IDs are recorded under `/tmp/cellarsnap-b06b`; remove those exact fixtures after release QC, preserve original awards. SQL rollback strategy in contract.

## Workspace and environment
Next dev on 3001. Existing modified `tsconfig.json`, untracked fix-plan/QA-report and nested `.claude` checkout preserved. Next-generated AGENTS additions must be restored at cleanup. No environment file edits. Design draft #75 untouched.

## Next slice
QC-03: align consumed tasting/country and accepted-friend definitions across menu/profile/palate and mobile; do not count missing-query results as zero. Then QC-08 selected wine details and deliberate context behavior. Keep AUD-09 Partial until deferred contracts and native acceptance are complete.
