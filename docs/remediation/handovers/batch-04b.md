# B04b handover — September 12, 2026

## Objective and IDs
Two bounded B04 slices in this session: B04a/AUD-05 is released; B04b/AUD-07 implements bounded remote wine-list fetching. Issue #93. AUD-08 compatible dependency remediation and OPS-01 remain separate. Targeted AUD-19/48/50 evidence expanded. QC-10 is a new low-confidence Expo layout/scroll triage item. QC-11 records the pre-existing successful-empty result for JavaScript-rendered menus; neither is silently added to this implementation.

## Resume here
B04b branch `codex/b04b-bounded-menu-fetch`, based on released main `db402fe`. Complete final Expo results verification and PR checks, merge, verify primary production with a legitimate menu and rejected private destination, then remove only the captured disposable scan IDs. Keep original account data untouched.

## State and decisions
`src/server/listScan/remoteSource.ts` owns all remote menu transport. It checks URL protocol, credentials and standard web ports; resolves every destination including redirects; rejects non-public/mixed answers, address encodings, IPv6 transition ranges and the Azure platform VIP. The actual socket uses one validated address while preserving the original Host and TLS identity. IPv4 is preferred when both families exist. Connections are not pooled across validations.

One 20-second deadline covers DNS, all redirect hops, headers, and complete body delivery. Five redirects maximum. Transfer and decoded bodies are capped: text/HTML 400,000 bytes, images 24 MiB, PDFs 32 MiB. Gzip/deflate/Brotli are supported and decompressed bytes are bounded. Oversized HTML now reports an upload alternative instead of silently parsing a truncated page. Redirected URL/path determine parser type and source context. Diagnostics include complete-download time and downloaded bytes; this is not a performance claim. Direct image/PDF uploads retain their existing parsers and limits.

The only dependency addition is pinned `ipaddr.js@2.5.0`; no unrelated upgrade or lockfile churn. Root npm audit still reports existing advisories (AUD-08); this slice does not resolve them.

## Verification
249 isolated tests passed, including 30 added remote-transport tests. The suite exercises public IPv4/IPv6, 21 unsafe addresses, noncanonical IP URLs, credentials/ports/protocols, actual streaming sockets, validated lookup pinning, mixed/private DNS, relative/private redirects, redirect loops, cumulative deadlines, never-resolving DNS, slow headers/body, resets, exact/over-limit body sizes, declared PDF/image limits, and gzip expansion. The socket fixture routes only its injected test transport to loopback; production has no bypass flag.

TypeScript, web lint and production Next build passed. Live HTTPS downloader fetched Maison Harlem HTML (72,535 bytes), Restaurant Beck HTML (35,257 bytes) and a Soho House sample PDF (39,105 bytes, `%PDF-`), preserving TLS validation. Hands-on desktop scan parsed Maison Harlem into 48 wines and recommendations; phone filter interaction deselected White and showed 33/48. IPv4/IPv6 private inputs showed a useful rejection with re-enabled controls. Expo phone private-input denial passed; a readable Maison Harlem Expo scan is pending at this checkpoint. Restaurant Beck downloads correctly but its script-held wine objects produce a successful empty result: QC-11. Legacy and bounded fetches return byte-identical documents, so this is existing extraction behavior. Expected 422 validation errors are logged by existing UI; no unexplained server exception observed in these flows.

Native simctl/adb/emulator unavailable. Expo is a fresh production web export with same-origin API proxy, not a native binary/OTA test. A transient Expo recovery scroll/background gap after responsive testing is QC-10 Needs triage; reload restored root top=0, so do not claim a confirmed native defect.

## Release state
B04a PR #94 merged as `db402fefca8319af49a85e1769f182d0d1e12395`; primary `cellar-snap` deployment `dpl_GTogXmCiwcujdffTToaB1M2foByD` Ready at cellarsnap.app. Exact migration file `20260913014834_restrict_contact_resolution.sql` is live under hosted version `20260913020752`; both local file and hosted statement MD5 are `0a15926a59392db0f4906d5be3c30dcc`. Twenty live API/Data API checks passed, including spoofed X-Forwarded-For plus changed user-agent retaining a single limiter bucket. Production phone-width username login reached feed with no console warning/error. Security advisors retain the same seven categories; the six changed functions were independently verified service-only. See [live evidence](../evidence/b04a-live-results.json) and [B04a QC](../../audits/b04a-auth-privacy-qc-2026-09-12.md).

B04b is not merged/deployed at this checkpoint; no SQL migration. Release via primary Vercel target after checks. Duplicate `cellarsnap` fails with missing env (OPS-01); preserve working primary. Recovery: forward-correct the bounded fetcher, retain authorization and destination checks. B04a old web tabs require reload; existing mobile API contracts work without a native release. No actual account recovery messages/password changes were submitted.

## Workspace and environment
Preserve original modified `tsconfig.json`, untracked historical reports and nested Claude worktree. PR #75 untouched. A stale zero-byte Git index lock had no active Git owner and was removed before creating the branch. Next 3001; exported Expo static server 8082 plus same-origin proxy 8083. Temporary Expo environment content was restored exactly after export. Evidence/logs/screenshots under `/tmp/cellarsnap-b04-qc/` and `/tmp/b04*`; no secrets in repository evidence. Disposable list-scan IDs and baseline IDs captured for cleanup; do not remove pre-existing scans.

## Next slice
Finish B04b release and update this checkpoint. Then AUD-08/B04c: refresh advisories, inspect compatible Next/Expo upgrades and declare directly imported image dependencies; separate actual runtime exposure from build tooling. OPS-01 requires ownership/routing evidence before retirement. B02 follow-ups AUD-01 cache revocation and AUD-06/QC-01 public projections remain explicit. Continue bounded slices with actual browser/available mobile QC.

## Implementation references
- [Node HTTP](https://nodejs.org/api/http.html), [DNS](https://nodejs.org/api/dns.html) for pinned lookup and request cancellation.
- [ipaddr.js](https://github.com/whitequark/ipaddr.js) for special-range classification and mapped addresses.
- [Azure platform VIP](https://learn.microsoft.com/en-us/azure/virtual-network/what-is-ip-address-168-63-129-16) for the explicit platform-only public-address exclusion.
