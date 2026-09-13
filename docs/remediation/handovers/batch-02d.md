# B02d handover — September 13, 2026

## Objective and IDs
AUD-01 anonymous-share image delivery. New shares stop distributing reusable Storage signatures. Photo bytes pass through a dynamic application endpoint which checks share revocation/expiry, public entry, non-test author and current source-photo authority on every request. No SQL, bulk invalidation, key rotation or object rewrite.

## Resume here
Branch `codex/b02d-share-image-delivery`, stacked on B02c2 `4c7c90d` / #126; issue #81. Code and focused checks implemented; final browser/OG/revocation retest and production build pending at this checkpoint. Session-only merge permission applies after QC.

## State and decisions
A request that begins after a committed share/privacy change must pass current authority before bytes are returned. Allowed in-flight reads and copies already retained by recipients cannot be recalled. Successful and denied responses are `private, no-store` plus CDN no-store; no redirects, ETags, signatures or upstream authorization headers are returned. The origin is configured server-side, paths are authorized and safely encoded, dot segments denied, and downloads/pixels/output sizes bounded. Raster-only re-encoding prevents same-origin active image content. Display output is WebP; OG uses PNG because the renderer failed on WebP during actual QC. This failure was repaired and is being retested.

Public share page and OG metadata retain existing visual content, rating bands, text-only fallback and private-photo filtering. The OG renderer inlines freshly authorized PNG bytes rather than following request-host URLs. Existing direct SDK, signed and transformed Storage links and installed native clients are **not** contained by this endpoint. AUD-01 stays P0/Partial; extend delivery adoption and establish legacy revocation separately. Supabase Smart CDN documentation says cached signed responses may survive token expiry: https://supabase.com/docs/guides/storage/cdn/smart-cdn . No universal byte-revocation deadline is claimed.

## Verification
395 isolated checks passed before the OG-format correction; focused rerun checks corrected PNG output. Tests exercise actual SDK query construction, share/entry/author/photo denial and recovery, fixed variants, path encoding/traversal rejection, byte limits and cancellation. Browser and hosted-object results will be appended after retest. Native unavailable; this slice changes web/backend only, while signed SDK/native residuals remain open.

## Release state
No merge or web deployment yet. No migration. Rollback of web code would resume issuing old capabilities; prefer forward repair. Disposable hosted-object test fixtures and designated author flag are restored/removed even on test failure.

## Workspace and environment
Local Next 3001 and Expo static/proxy 8083. Original user changes preserved. Evidence/logs under `/tmp/cellarsnap-b02c2-b02d-b08a`; no credentials in repository evidence.

## Next slice
After successful retest, B08a/QC-07 canonical mobile grapes, then combined final QC/release. Update the hub/backlog and record exact deployed source separately from the already-live B02c2 migration.
