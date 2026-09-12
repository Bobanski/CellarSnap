# B02b2 Storage / anonymous-share QC — September 12, 2026

Implementation tested: `eb52b33c436f6c1e62f85aad331e52c6dc363df1`, [PR #87](https://github.com/Bobanski/CellarSnap/pull/87), stacked on B02b1 `9558f5c`. AUD-01 remains Partial; implementation QC passed with the limitations below. No production migration, merge or production code deployment occurred. [Contract](../remediation/b02b2-storage-contract.md).

## Automated checks

| Check | Actual result |
|---|---|
| `npm run test:unit` | 196 passed, including seven new Storage/share tests using PGlite and candidate-resolution fixtures. |
| `node scripts/qc/storage-object-access.mjs <pg-runtime> <built-storage-checkout> <node24>` | 148 actual HTTP assertions passed against official Supabase Storage v1.77.0 and isolated PostgreSQL 17.10. |
| `npm run lint:web`; `npx tsc --noEmit` | Passed. |
| `npm run lint:mobile`; `npm run typecheck --prefix apps/mobile` | Passed with the mobile workspace's compiler. A preliminary root-compiler invocation rejected mobile's TypeScript 6 setting; the documented workspace command passed. No config change was made. |
| `npm run build` | Next 16.2.7 production build passed, repeated after final changes with dev servers stopped. |
| `npx expo export --platform web --output-dir /tmp/cellarsnap-b02b2-expo` from `apps/mobile` | Passed. |
| `git diff --check` | Passed. |

The HTTP suite first reproduced a private-photo download under captured live policies, replayed the actual migration twice, then denied the same download. It covers owner/friend/two-hop/stranger/pending/trusted-test roles; single and batch signing and signed retrieval; private-bucket public endpoint and invalid JWT denial; owner pre-metadata upload and repeat upsert; denied foreign upload/upsert/copy/delete; signed uploads; originals; exact avatar selection; covers; independent physical copies; both block directions; next-request parent/photo privacy changes; and continuing validity of an already-issued signature. Public-assets anonymous reads and denied ordinary-user writes were preserved.

PGlite adds source/root/group forgery, service-role public-only checks, anonymous RPC denial, private helper/public invoker function modes, missing predecessors, public bucket/unknown-policy rejection, malformed and unattached paths, reclassified metadata, duplicate conflicting types, hidden ordered sources referenced as public context, and slide-only source/anchor semantics. Candidate-resolution tests verify hidden-first fallback, member filtering, hidden anchors and fail-closed RPC errors.

## Actual Storage runtime and reproduction

Docker is unavailable; this did not prevent testing the object service. The runner starts its own embedded PostgreSQL, applies the targeted app fixtures, replaces the synthetic Storage schema with the official service's own migrations, and runs the real HTTP server with its file backend. Random credentials and JWT keys are local to that process. It never accepts a database URL or loads project credentials.

The temporary runtime used `embedded-postgres@17.10.0-beta.17`/`pg@8.16.3` in `/tmp/cellarsnap-review-runtime`, plus PostgREST 16.3 for the optional browser phase. Storage was cloned from [official v1.77.0](https://github.com/supabase/storage/tree/v1.77.0), commit `755986d5a8d915296d0fedafe03011e2616ae563`, into `/tmp/cellarsnap-storage-runtime`. Build with Node 24 and npm 11.12.1 (`npm ci`, `npm run build`); the host's default Node 22/npm 10 was rejected by Storage's engine requirement. No application dependencies were added or changed.

To reproduce, provision those isolated runtime dependencies, then run the checked-in HTTP script with their paths. Append `--serve` for the anonymous browser phase: it adds synthetic share rows, starts PostgREST and a local routing proxy, and starts the real Next app on 3001 against those local services. Enter `label-public`, `label-private`, `public`, `private`, `revoke`, `restore` or `stop` on stdin to change only the disposable fixture. Share suffixes 900/901/902/903/904/905 are respectively public mixed group/private entry/test author/expired/revoked/no-photo. `stop` shuts everything down and deletes the temporary database/objects.

This is targeted policy/service replay, not the entire hosted Supabase stack. Auth JWTs in the isolated suite are synthetic. S3/TUS, hosted CDN behavior and image transformation were not exercised. Transformations are disabled in the local Storage runtime; OG image generation and no-store headers passed, but the transformed photo region is not a hosted-transform acceptance result. Ordinary signed label bytes loaded in the browser. Repeat transformed previews on the migrated target.

## Hands-on desktop and phone

In-app Chromium, desktop 1365×900 and phone 390×844, actual Next app with isolated PostgreSQL/PostgREST/Storage:

- Public label loaded from an actual signed Storage URL at both widths. Read-only DOM inspection confirmed successful image loading and no horizontal overflow; visual inspection checked layout and controls. Decoding the observed signature showed a 3,600-second lifetime without recording the token.
- Hidden label showed the existing “No label image” fallback, with zero rendered photo images. Making the label public restored the image; making it private removed it on the next reload. This was retested after the final metadata-authority helper adjustment.
- Making the entry private changed the same share page to “Link expired” on reload. Separate private, tester-authored, expired and revoked shares also denied. Revoking an already viewed public share denied on the next request; a photo-free public share remained readable.
- Sign-in and Create account links reached their corresponding forms. No account was created, no message/email was sent and no personal data entered in the isolated phase.
- OG routes returned 1200×630 PNGs for public and denied shares with `Cache-Control: private, no-store`. Both outputs were inspected visually, subject to the transform limitation above.
- No browser warnings/errors in checked public share states. No server 5xx in the share journeys. A stale temporary tab hit connection-refused while restarting local services; this was a test-service transition, not an app regression. Other test tabs were closed and the viewport reset; the unmarked stale tab could not be closed through the browser tool's data-URL guard and was left for automatic temporary-tab cleanup.

Screenshots/logs: `/tmp/cellarsnap-b02b2-qc/` (desktop/phone public label, hidden label, entry denial, revocation, final helper retest, OG states). Reproduction and outcomes are recorded here so continuity does not depend on temporary assets.

## Mobile fallback and live fixture cleanup

`xcrun simctl list devices available` reported that simctl is unavailable. Neither `adb` nor `emulator` is installed. **No native acceptance is claimed.**

Expo production web at 390×844 used designated E2E accounts A/B and disposable live fixtures. This checked current app compatibility against **unchanged production policies**, not the new Storage SQL. Owner sign-in, entry detail, Cellar → My Events and sign-out passed. The event contained three loaded fixture images including its private member. Viewer sign-in/feed showed exactly two loaded fixture images, neither from the private entry; direct private detail rendered “Entry unavailable.” The corresponding changed local web API returned three versus two group slides for A/B. No warnings/errors in inspected public galleries, no horizontal overflow and no server 5xx; the private denial produced the expected 404. Existing QC-01 numeric ratings, QC-05 route headings and QC-06 gallery semantics remain open. Touch swiping was not retested or accepted; no native camera/upload/gesture testing occurred.

Cleanup passed and was verified by row/object queries. Removed two entries, one group, three slides, two photo rows and three objects. Counts restored to **384 entries, 34 groups, 107 slides, 64 profiles, four trusted testers and 869 wine objects**. No account capabilities or relationships changed. Browser accounts signed out; saved temporary sessions were revoked/already absent and their token file removed. Next/Expo services on 3001/8083 stopped. No environment file was edited.

## Review corrections, advisors and release limits

Catalog QC found three reclassified photos and eight slide-only member images. The helper was corrected to preserve both patterns, with additional automated/service checks and a final share-browser retest. A private helper is necessary to distinguish hidden metadata from absent rows while preventing a public context from overriding private source metadata. The only existing private-schema function was the protected capability trigger with postgres-only execution; its permissions remain unchanged.

The read-only hosted security advisor run still reports seven existing categories: api_rate_limits has RLS/no policy; public_profiles is a definer view; four mutable-search-path functions; one public-schema extension; 18 anonymous and 18 authenticated executable definer-function findings; and leaked-password protection disabled. These belong to existing AUD-05/06/19 and related work; this was not a post-deployment verification of the new helper. See the official [database advisor guidance](https://supabase.com/docs/guides/database/database-linter) and [password-protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No unrelated live repairs were made.

PR #87 remains dependent on #86. SQL checksum (SHA-256): `3e42ae94f6bd63ade4191b21b6d5951d4af89257c193280b6e6854b8ba35dc70`. Release requires reviewed predecessor/current migrations, code deployment and actual hosted Storage/share/web/mobile acceptance. Previously issued URLs keep their original lifetimes; one-hour share signing is not retroactive revocation or a global client-signing TTL cap. Check the current handover for CI/preview state; passing local QC does not imply a fixed production boundary.
