# B04b remote wine-list QC — September 12, 2026

Final tested product code: `bc8ac20981c2bc8b0c51cf668b3686e118ed65a3`, PR #95 / issue #93. Scope AUD-07, targeted AUD-48/50. No SQL migration.

## Automated and transport evidence
250 isolated tests passed in 22.1s with two workers. Thirty-one remote-source tests cover 21 denied address cases; canonical/noncanonical IPv4, public IPv6/mapped addresses, private/reserved/transition ranges and Azure platform VIP; credentials/ports/protocols; actual HTTP body streaming/compression; mixed DNS; verified lookup pinning; every redirect; cumulative redirect deadline; never-resolving DNS and slow headers/body; abrupt resets; exact byte boundary; declared and streamed PDF/image/text limits; gzip expansion; and uppercase PDF source-kind parity. No production private endpoint was contacted: denied cases are rejected before the request factory, and wire fixtures inject a disposable local transport only.

Web TypeScript, lint, production Next build passed on final product code. Existing mobile type/lint and Expo production export passed during B04a; B04b modifies backend transport only. CI and primary preview must pass on final PR head before merge. The pinned `ipaddr.js@2.5.0` addition changes no other dependency version. Existing npm advisories remain AUD-08.

Live public HTTPS downloads passed without disabling TLS validation:

| Source | Decoded bytes | Result |
|---|---:|---|
| Maison Harlem `/menu/wine-list/` | 72,535 | HTML, fully read |
| Restaurant Beck `/wine.html` | 35,257 | HTML, fully read; scripted extraction limitation below |
| Soho House sample `lhb_pen-yen.pdf` | 39,105 | Valid PDF header; actual local API parse returned 42 wines |

Review found a case mismatch between the fetcher's PDF cap and downstream `.PDF` classification. The final source now carries a single `kind` consumed by both stages; unit coverage and actual PDF route retest passed. The PDF's text heuristics found no wines and emitted their existing fallback warning/stack; visual fallback completed, scored and saved 42 wines. Do not call this a fast text-path success or a fix to existing PDF heuristics.

## Hands-on browser results
- Desktop 1440×1000: localhost scan intake, `127.0.0.1` denial, readable public menu scan, results/recommendations (48/48), visual layout passed.
- Phone 390×844: results and filter expansion, deselecting White changed 48/48 to 33/48; Done/Scan another controls worked; IPv6 `::1` rejected, controls recovered, no horizontal clipping observed.
- Fresh Expo production web export through same-origin localhost 8083 proxy: designated account sign-in, Scan tab, loopback denial, readable Maison Harlem URL submission, 48/48 results/recommendations and settled phone/desktop layouts passed. Desktop reload confirmed actual viewport 1440×1000 before final screenshot.
- Existing UI logs expected validation warnings for rejected URLs. No unexplained server exception or new console error in successful HTML/Expo flows. PDF text-path warning is the observed fallback above. Existing Expo `(app)` heading remains QC-05. No simctl/adb/emulator; this is web fallback, not native/OTA acceptance.

Screenshots/logs optionally under `/tmp/cellarsnap-b04-qc/` and `/tmp/b04b-*`. Reproduction and numeric evidence are in this report; no screenshot is required to resume.

## Findings and limitations
QC-11: Restaurant Beck stores wine objects in a script. Existing extraction discards script content and the model returned zero wines; the API incorrectly persisted a successful empty scan and UI suggested scoring was unavailable. Original and new downloader outputs are byte-identical, SHA-256 `bbdfbffd66090f8a147ab0669015f9055fb6ab16e019c151113dee5d853bb9d8`. This is a separate existing extraction/error-state defect, not transport rejection or truncation. Follow up with explicit unreadable/empty-source handling; do not execute arbitrary website scripts as a shortcut.

QC-10: an Expo recovery screen showed displaced scroll/background after responsive navigation; reload restored root top=0. Needs fixed-viewport reproduction before treating it as a product/native bug.

The downloader covers HTTP(S) server-readable documents on standard web ports, not browser execution of client-rendered menus. Text pages larger than 400,000 bytes now fail clearly instead of silently truncating. Native network/camera/photo selection and actual email/SMS delivery are not covered. Personalization correctness is not newly certified by these transport checks.

## Release and fixtures
B04b was release-pending when this implementation report was written. See the current handover for actual merge, deployment and live verification. Disposable scans were made only under designated account A; baseline IDs were captured before scanning. Cleanup must remove only explicitly captured new QC scans and verify original scan IDs remain. Original entries, ratings, contact fields and account capabilities were not edited.
