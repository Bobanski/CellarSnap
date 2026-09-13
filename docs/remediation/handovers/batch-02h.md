# B02h handover — September 13, 2026

Release update: [B02g/B02h/B08c final handover](b02g-b02h-b08c-release.md) supersedes release-pending statements below; this checkpoint preserves intermediate evidence.

## Objective and IDs
AUD-01 P0/Partial, related AUD-20/48/50: measure old raw/transformed photo capabilities and document a supported-client/revocation contract. No production remediation claim from a synthetic test.
## Resume here
`codex/b02h-legacy-photo-revocation`, stacked on B02g `2630e62`, issue #81. Evidence/contract complete. Next B08c ordinary web detail/grape adoption; group commands, QC-01 numeric projections and production rekey remain separate.
## State and decisions
[Contract and next implementation](../b02h-photo-revocation-contract.md). Privacy changes left warmed raw/transformed URLs readable. Hash-verified copy and synthetic reference move preserved new bytes. Old object deletion left both old URLs readable through 30 seconds; denial observed at 60 and 90 seconds. Single host only; no native/browser retained-cache or global propagation proof. A future rekey needs durable receipts, conditional reference switching and a resumed deletion/invalidation stage. It must also prevent ongoing legacy capability minting after supported-client cutover.
## Verification
[Sanitized samples](../evidence/b02h-revocation-qc.json): true CDN MISS/HIT, byte counts/hashes, statuses and observation times. Real hosted Storage operations on one disposable fixture, exact bytes preserved, all fixtures cleaned. B02g contains actual browser/Expo image and crop checks. No new app code or native distribution in this slice.
## Release state
Docs/evidence only; PR/merge pending. No SQL, bulk rekey, purge, policy relaxation or key rotation. AUD-01 remains P0/Partial; issue #81 stays open. The session's one-time merge permission is still active until handoff.
## Workspace and environment
Original user files/worktree preserved. B02g Next 3001 and Expo 8083 remain available for subsequent QC; temporary harnesses under `/tmp/cellarsnap-b02g-b02h-b08c`. No environment files changed.
## Next slice
B08c scoped ordinary web transaction adoption. Production privacy closure depends on the documented client/rekey/authority steps, not the successful synthetic measurement. Update final release handover with exact merges, deployment and live verification separately.
