# B02b production rollout QC — September 12, 2026

Local date: America/New_York; deployment and verification span September 12–13 UTC. This report supplements the [B02b1](b02b1-photo-group-qc-2026-09-12.md) and [B02b2](b02b2-storage-share-qc-2026-09-12.md) implementation reports. It records actual hosted acceptance, including failures and retests.

## Released versions

- PR #86 merged as `dcfaade6884c58b020459341fe7e94dcc787c22b` at 23:58:25 UTC.
- PR #87, retargeted to main after #86, merged as `fd391aadb359a8227ecf1d34674b49d0b234e707` at 00:02:58 UTC. Its final head is `2b2689eb9ae8675af168f78cc55b0e33045aa91f`; product implementation `eb52b33`, hosted SQL correction `2b2689e`.
- Primary Vercel `cellar-snap` production deployment `dpl_HpTnyMR3NSMfE2vg4cRKPvMz7cML` is READY and aliases `https://cellarsnap.app`. GitHub's exact merge-commit deployment status is SUCCESS. [Deployment](https://vercel.com/eitan-sneiders-projects/cellar-snap/HpTnyMR3NSMfE2vg4cRKPvMz7cML).
- Mobile source is merged. Expo web was exercised against deployed APIs and Supabase. No native binary/store submission or OTA release was performed.

## SQL rollout and correction

Fresh policy definitions, including every owner write and public-assets read policy, matched the committed captures before applying DDL. Existing B01/B02a history checksums matched; neither was replayed. The wine bucket remained private.

B02b1 applied successfully. The first B02b2 attempt failed with `42501: must be owner of table objects` on redundant `ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY`. Hosted ownership is `supabase_storage_admin`; RLS was already enabled. The transaction rolled back: no helper or migration-history row remained. Correction `2b2689e` replaces that owner-only statement with an explicit prerequisite check that RLS is enabled, preserving the entire access predicate and policies. A disabled-RLS regression scenario was added. Only after retesting was the corrected exact file applied.

| Repository file | Remote version | Exact SQL MD5 |
|---|---|---|
| `20260912214315_enforce_photo_and_group_metadata_privacy.sql` | `20260912235835` | `7801266297ae37d277d9b287216edfcf` |
| `20260912222036_enforce_wine_object_privacy.sql` | `20260913000034` | `747807c2c8fcfc46df46934c45ed5b99` |

SHA256 respectively: `138a180b17c0ee6c5be8034b2bff8337572c1c1d33e46e5be2062f37ccabc142`, `7f497fca86757028ff8dd9fe1ba0947f5eab9200437d44156651d7c43be95ab4`. Remote MD5 values are over `array_to_string(statements, E'\n')` and match local file bytes. Do not reapply to reconcile timestamps.

Post-apply catalog confirms narrow authenticated Storage SELECT, preserved owner writes/public-assets SELECT, owner-only capability trigger ACL, private definer plus public invoker facade, empty search paths, and no PUBLIC/anon helper execution. [Sanitized before/after evidence](../remediation/evidence/b02b-production-rollout.json).

## Automated and live protocol checks

- Corrected SQL: 196 unit/route/database tests passed; seven Storage-focused tests passed again after adding disabled-RLS acceptance. Final-head Web and Mobile CI passed; primary preview passed. Duplicate `cellarsnap` failed again under existing OPS-01.
- Corrected SQL: all 148 actual isolated Storage HTTP assertions passed against official Storage v1.77.0/PostgreSQL 17.10, including replay, roles, copies, avatars/covers, originals, reclassification, metadata forgery and slide-only paths. Prior Next build and Expo export remain applicable because the rollout correction changes SQL, its guard test and documentation only.
- **56 live Storage/Data API assertions passed with fresh request cache keys**: owner/non-owner downloads, RPC and single/batch signing; signed retrieval; photo metadata and slides; anonymous denial; service public-only predicate; private overrides; reclassification without moving objects; private group anchors/context; originals; owner draft/orphan/cover uploads and upserts; independent physical copy after source privacy changes; hosted signed 80×50 transformation and private transformation-signing denial.
- **Five deployed web API assertions passed**: owner three authorized group slides, non-owner two, private sibling 404. An initial API run overlapped intentional fixture privacy mutations and failed its stable-fixture expectation; the complete run was repeated after the mutation sequence ended and passed. This was QC orchestration, not an application fix.
- **Eight boolean assertions across six rolled-back live SQL role scenarios passed**: baseline public/private, owner→viewer and viewer→owner blocks, trusted-tester viewer, test-authored isolation, and service public-share denial. Only designated accounts were touched inside the transaction; no capability or relationship edits persisted. These are SQL role checks, not real tester/block HTTP sessions.
- **Five production share states passed HTTP checks**: public, private photos, private parent, revoked, expired. Public photo present only in the public state; no image for all other states; private/revoked/expired show “Link expired.” All page responses use private/no-store; every OG response is HTTP 200, 1200×630 PNG, `Cache-Control: private, no-store`. Public and denied OG images were visually inspected; the public image visibly contains the hosted transformed fixture.

## Hosted cache limitation — AUD-01 remains Partial

The first immediate privacy-change assertion used the standard SDK `download()` route. After user B had legitimately downloaded the fixture, making its label private still returned HTTP 200 at the same `/storage/v1/object/wine-photos/...` URL, with `cf-cache-status: HIT` and `Cache-Control: public, max-age=3600`. A fresh query key returned 400/BYPASS, the explicit `/object/authenticated/...` route returned 400/BYPASS, and authenticated/service authorization RPCs returned false. New signatures were denied. The passing 56-check run deliberately used unique query keys to test origin authorization; it does **not** erase or count the cached-request failure as passed.

Separately, a previously issued signed URL remained usable after a source privacy change, as expected. New public-share URLs were decoded from the rendered DOM and verified to last exactly 3600 seconds; old seven-day share URLs and arbitrary SDK-requested lifetimes are not shortened. Full cache-expiry behavior, edge distribution, previously installed clients and third-party caches were not measured. [Supabase CDN behavior](https://supabase.com/docs/guides/storage/cdn/fundamentals), [signed URL caching](https://supabase.com/docs/guides/storage/cdn/smart-cdn), [download contract](https://supabase.com/docs/guides/storage/serving/downloads).

Keep AUD-01 Partial for a bounded cache/revocation follow-up: define the required revocation window, reproduce same-JWT and new-JWT behavior through expiry, document supported old-client behavior, and verify any chosen delivery/cache change across raw SDK downloads, signed links and image transforms. Do not restore broad reads or invalidate ordinary users' objects/sessions as a blanket workaround. Fresh authorization is deployed and verified; immediate revocation of existing capabilities/cached bytes is not claimed.

## Hands-on browser and mobile fallback

In-app browser against production, desktop 1365×900 and phone 390×844:

- Owner signed in, opened My Events, loaded all three fixture images, advanced to the private sibling, and retained its private rating in entry detail. Gallery layouts showed no horizontal overflow.
- Non-owner signed in, loaded public label plus context only, advanced to context, and received “Entry not found” on direct private-sibling navigation. Both permitted images loaded; no hidden source URL appeared in fixture DOM images.
- Anonymous public share visually loaded its label on desktop/phone. Hiding both photo types and reloading removed every image while retaining public text; private parent then showed “Link expired.” Sign-in and create-account links reached their actual forms without creating an account.
- Public OG contains the correct colored fixture image; denied OG is a readable generic card. Neither has overflow/clipping.
- No browser warnings/errors captured in these affected flows. Vercel production error-level queries over the release-QC window returned no records; this is bounded log coverage, not proof about every request or historic deployment.

Expo production web export at `localhost:8083` used a temporary same-origin API proxy to `https://cellarsnap.app` and the real Supabase project. At 390×844, owner My Events loaded three fixture images; non-owner feed loaded two without the private source; direct private detail showed “Entry unavailable.” Sign-in, tab/menu navigation and sign-out worked; browser warning/error logs were empty. Existing QC-01 raw rating, QC-05 router headings, QC-06 gallery semantics and QC-08 selected-entry navigation remain open. Native gallery gestures were not verified.

`xcrun simctl list devices available` failed because `simctl` is absent; `adb` and `emulator` are absent. No iOS/Android native acceptance or native distribution claim. Actual hosted avatar replacement, the full friendship HTTP matrix, S3/TUS transports, multi-region CDN and old-client compatibility were not repeated live; their isolated evidence remains explicit above.

## Cleanup and evidence

Disposable data: two owner entries, one group, three slides, two ordered photo rows, three primary objects; plus one independent-copy entry, four extra objects and one expiring share. All were removed, including cascaded rows. Synthetic anchor was temporarily feed-visible for browser/Expo QC. No ordinary entries or profile capabilities were changed. Counts returned to **384 entries, 34 groups, 107 slides, 64 profiles, four testers and 869 wine objects**. Profile flag fingerprint remains `1732f025b055f58143ed175770ddbdff`. Saved QC sessions were revoked; token file removed; browsers signed out; temporary Expo server stopped and viewport restored.

Security advisor results are unchanged before/after: seven categories, 44 observations. Existing `public_profiles` definer-view finding, mutable legacy function paths, existing public definer grants and auth hardening remain in the canonical backlog; no new finding for the narrowly granted private helper. [Advisor remediation reference](https://supabase.com/docs/guides/database/database-linter).

Local evidence: `/tmp/cellarsnap-b02b-release-qc/` screenshots/OGs, `/tmp/cellarsnap-b02b-live-qc-fresh.log`, `/tmp/cellarsnap-b02b-live-api-qc.log`, `/tmp/cellarsnap-b02b-share-http.log`, rollout unit/guard/Storage logs and sanitized server-error JSONL. These are optional supporting captures; this report and committed catalog evidence are sufficient to resume without them.
