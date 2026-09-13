# B05d — typed request auth and grape search

## Objective and IDs
QC-13 and bounded AUD-21 adoption, issue #104. Based on main `2ce30ce`; branch `codex/b05d-grape-auth`. Preserve cookie and bearer authorization, typed grape lookup results and unavailable-reference 503s.

## State and decisions
`requireTypedRequestAuth` constructs typed cookie/bearer clients through one shared resolver. Legacy request callers retain an explicit migration bridge and the same precedence/fallback flags. Grape search uses the typed entry point; no service-role client, schema or RLS change. Its omitted limit now correctly uses eight instead of `Number("")` becoming one; explicit limits retain clamping. Ranking, deduplication and DTOs remain unchanged. The injectable handler supports actual Supabase-client transport regression tests.

## Verification
256 original isolated checks plus 16 new grape/auth contracts (272 total after final addition); initial full 271 passed, final added real bearer-factory and targeted grape suite passed. Web type/lint checked; final combined build/release verification follows in the current session. Real HTTP against local Next with hosted Auth/Data API passed cookie/bearer equality for canonical name, actual alias-only `abernet auvignon`, no-results and punctuation queries; anonymous/invalid 401; established invalid-bearer/valid-cookie fallback; default/effective limits. No credentials in checked-in evidence.

Hands-on Next cellar-add autocomplete at 1440×1000 and 390×844: Nebbiolo results, selection, unmatched search; screenshots visually inspected and no captured warning/errors. Expo web at phone width: login, Explore search with Nebbiolo result, selection into authorized detail. Proxy explicitly strips cookies on every API request and records bearer presence; therefore web cookies cannot mask the repaired path. Expo cellar-add and final desktop checks continue at the next checkpoint. Existing QC-05/10/12 and public rating scope remain separate. No iOS simctl or Android emulator available; Expo web is not native acceptance.

## Release state
Implementation/QC checkpoint, not yet merged/deployed/live-verified. No SQL migration or intentional persistent data mutations. Revert code to roll back; old native source consumers gain API compatibility after web deployment, but no native binary is distributed here.

## Workspace and environment
Original tsconfig formatting and untracked local reports preserved. Next 3001 and cookie-stripping Expo proxy 8083 running. Environment override is process-only. Local reports/screenshots under `/tmp/cellarsnap-b05d`; durable final QC/report to follow.

## Next slice
B06a/QC-02 date-only library/detail/mobile formatting and timezone contracts. Then final build/CI, review and authorized merge/live verification. AUD-19 full managed bootstrap/seed restore and broader AUD-21 adoption remain Partial; do not close #104.
