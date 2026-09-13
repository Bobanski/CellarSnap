# B02c2 handover — September 13, 2026

**Subsequent release:** merged and QC verified in [B02c2/B02d/B08a release](b02c2-b02d-b08a-release.md). The dated checkpoint below preserves implementation history; use the release handover for current state.


## Objective and IDs
AUD-06 public-profile authority and identity projection; related AUD-19/21/48. P0 escalation: the current hosted view has authenticated INSERT/UPDATE/DELETE grants and updatable identity columns. An isolated reproduction using its captured definition lets a stranger change another profile's first name through the view while a direct base-table update affects zero rows. No production attack was attempted. Raw public rating payloads (QC-01), signed/CDN delivery (AUD-01), and other public helper RPCs are outside this slice.

## Resume here
Branch `codex/b02c2-public-profile-authority`, base `33b8200`, related issue #81. Migration `20260913194536_restrict_public_profile_projection.sql`. Implementation, hosted rollout and desktop/phone/Expo QC complete; PR #126 is release pending. Product candidate `a2f97c9`, generated-type/evidence follow-up in the same PR. Session user explicitly permits merge/close after thorough QC, for this session only.

## State and decisions
The public view becomes a read-only security-invoker/barrier facade over an explicitly guarded private-schema reader. Owner-only `profiles` RLS and all writes through the base table remain unchanged. No supplied viewer ID or user_metadata authority. The reader returns only a safe projection, with current UID, both-direction blocks and trusted-test visibility; service-role share lookups retain test filtering. Public chosen name is username or first name plus last initial. Legacy raw-name/email columns remain selectable but null, including filters; foreign test flags are null. Owner capability reads remain available. Original names remain in owner-only profiles. Existing clients need no simultaneous source release to select these columns.

Security-advisor intake also confirms pre-existing exposed helper RPCs including `is_test_account`, `is_user_blocked`, `are_friends` and access predicates. Their arbitrary-ID boolean disclosures require a separate AUD-06 follow-up; this slice does not claim all identity/test-status inference is contained. Trigger RPCs are not assumed exploitable merely because the advisor lists them.

## Verification
392 isolated checks, 12 schema tests, database compile contracts and focused lint pass. Actual PostgreSQL 17.6 complete replay/catalog equality, owner/stranger checks and four existing badge concurrency checks pass. The new profile tests cover old write reproduction, idempotency, preference/owner/friend/stranger/test/anonymous access, blocks in both directions, legacy filters, base owner edits and all view mutations. Reviewed catalog delta changes only this view, its grants/options and the narrow reader. All eight desktop 1440×1000 / phone 390×844 web/Expo profile checks pass for username and real-name preferences, with visually reviewed screenshots. Real API response/filter checks confirm no raw surname; no page exceptions or failed API requests. Both test-profile values and original flags restored exactly. Existing Expo router implementation label remains QC-05. Direct hosted REST read/write/filter/anonymous/owner checks pass; private reader is not exposed through public RPC. Browser UI exercised existing released Expo export, not a native runtime. Native inventory: command-line developer tools only, no installed Xcode simulator or Android SDK/emulator; no native runtime acceptance.

## Release state
PR #126 not merged at this checkpoint. SQL applied as hosted `20260913195059`, statement MD5 `e76dec629d5c7c72045fdb596d516a39`; local SHA-256 `140c7e3b7ecdc5bce2e4a6c61e9a1047b512f04fcddc60de259d75676c3ec226`. Complete read-only hosted catalog comparison has zero differences. This is a database fix compatible with the existing web code; no web code change needed. Generated public types now prohibit view writes. The migration changes no profile rows, object files or authentication state. Roll forward on problems; never restore the writable/raw identity view. Ordinary code rollback must preserve the new database boundary.

## Workspace and environment
Original modified tsconfig.json and two user reports preserved; Next dev auto-generated the documented AGENTS.md block, which will be restored after stopping the server; nested worktree and design PR #75 untouched. Temporary logs in `/tmp/cellarsnap-b02c2-b02d-b08a`. No environment files changed.

## Next slice
After hosted/browser acceptance, B02d share-image reauthorization, then B08a/QC-07 canonical mobile grapes. Keep SDK/signed cache revocation, numeric entry projection and native distribution explicit in the backlog. Update this handover with actual release evidence.
