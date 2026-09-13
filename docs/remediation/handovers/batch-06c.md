# B06c handover — September 13, 2026

> Historical implementation checkpoint. These slices are now merged, the badge migration is deployed, live checks passed and fixtures are cleaned. Use the [combined release handover](b06b-b06d-release.md) for current state; the original checkpoint below preserves history.


## Objective and IDs
QC-03: consistent own-activity summary for web menu/profile/palate and mobile menu/profile/Library. Issue #112. Related AUD-35/39 remain broader work; average rating/top grape/top region and filtered-result totals remain outside this count slice.

## Resume here
Branch `codex/b06c-summary-counts`, stacked on B06b `640338e`. Continue QC-08 event navigation separately, then finish combined Expo/build/release QC. Do not close QC-03 native acceptance prematurely.

## State and decisions
`packages/shared/src/activity-summary.ts` defines complete consumed-tasting totals, canonical-country/raw fallback with case/accent/space normalization, unique accepted friends in either direction, incoming pending requests and known earned badges scoped to the owner. `/api/profile/summary` supports cookie/bearer sessions, ignores submitted target IDs and disables caching. Web/mobile consume the same validated DTO. Keyset pagination continues past short service-capped pages. Errors display unavailable counts rather than zero. Mobile menu no longer queries the nonexistent `friendships` table; mobile profile/Library queries now explicitly select consumed rows, consistent with their summaries. Existing cellphone cellar inventory remains separate. No relationship/data edits to force agreement.

## Verification
Six new isolated contracts pass, including 1,007 entries with an artificial 37-row service cap, duplicate opposite-direction friendships, pending rows, country fallback/case/accent and query failures. Web/mobile types and whole-workspace lint pass. Cookie/bearer HTTP summaries agree at 86 tastings, three countries, two friends, eight badges while B06b's 15 private entry/three badge fixtures exist; anonymous/invalid sessions return 401 and a submitted user_id cannot switch owners. Phone menu and web profile/palate agree. Desktop 1440×1000 and phone 390×844 screenshots captured/inspected; no captured warning/errors. Complete Expo/runtime/release checks pending at checkpoint.

## Release state
Not merged/deployed. No additional SQL beyond B06b. No new count fixtures written; shared B06b fixtures remain pending exact-ID cleanup. Native runtime/distribution unverified.

## Workspace and environment
Next 3001 remains active. Existing user modifications, untracked reports and design draft #75 preserved. Evidence in `/tmp/cellarsnap-b06b`; no env-file edits.

## Next slice
QC-08: selected event wine determines caption/detail target on web/mobile; explicit context behavior, reorder/restricted-sibling tests, browser/Expo interactions. Then final combined release and native limitation handover.
