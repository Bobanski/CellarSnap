# B04c dependency handover — September 12, 2026

> Historical implementation checkpoint. Superseded for release state by the [B04c production handover](b04c-release.md): PR #98 merged and web production verified at `a0a9564`.

## Objective and IDs
Compatible dependency remediation for AUD-08, issue [#97](https://github.com/Bobanski/CellarSnap/issues/97), PR [#98](https://github.com/Bobanski/CellarSnap/pull/98). Implementation is `588d49a` on `codex/b04c-dependencies`, based on main `1db7d80`. AUD-08 remains **Partial** because two mobile advisory roots and release/native acceptance remain. AUD-48 gains real-codec coverage. Existing QC-10 is now Open after fixed-viewport reproduction; no B11 product fix is mixed in.

## Resume here
Read the [hub](../README.md), [backlog](../backlog.md), [dependency/QC report](../../audits/b04c-dependency-qc-2026-09-12.md), and [sanitized advisory evidence](../evidence/b04c-dependencies.json). Review PR #98's final checks and scope before release. Product/lockfile commit is `588d49a`; subsequent commits contain documentation only. This branch has no migrations. Do not reapply prior SQL or treat this PR as already live.

## State and decisions
- Next and eslint-config-next: 16.2.7 → 16.3.5. Sharp: transitive 0.34.5 → directly declared 0.35.4, used by image preparation, crop and lineup processing. Patched libvips/libheif binaries install through the committed lockfile.
- Expo stays on SDK 56 (56.0.9 → 56.0.21). Its installer aligned asset/constants/font/image manipulation/image picker/linking/router/splash/screens packages. React 19.2.3 and React Native 0.85.3 are unchanged. Babel/XML/PostCSS/browser tooling and other vulnerable transitives received compatible updates.
- Root override `supabase → tar@7.5.22` repairs the CLI's exact vulnerable archive dependency without replacing CLI 2.78.1. Clean `npm ci` exercised its download/checksum/extraction postinstall; version/help commands passed. This dependency is installation tooling, not a server request parser. Retire the override when a reviewed CLI upgrade stops depending on vulnerable tar.
- Mobile overrides pin `metro`, `metro-config`, `metro-transform-worker` to 0.84.5. The existing circular 0.84.4 tree survived ordinary npm update even though React Native accepts ^0.84.3; 0.84.5 removes the vulnerable image-size dependency. Keep these versions aligned and review/remove overrides during the next SDK/toolchain update.
- New Next lint rules warn on full-page login navigation. Two narrowly scoped annotations preserve the existing post-session reload that discards anonymous layout state; auth behavior was not changed to satisfy lint.
- No forced audit fix, Expo/router downgrade, schema update, theme change or broad dependency-major migration.

## Residual AUD-08 scope
Fresh audits count affected packages, including propagated parents, not independently exploitable vulnerabilities. Root full/production trees are **0**; mobile full/omit-dev trees are **14 moderate, zero high/critical**, from two causes:
1. `expo-router@56.2.20 → query-string@7.1.3 → decode-uri-component@0.2.2`. Router URL parsing calls query-string; malformed external links are relevant input. Patched decoder 0.5.0 is ESM, whereas the installed CommonJS query-string requires and directly calls the export. Do not blindly override across that boundary. Next bounded security work should obtain an upstream-compatible repair or explicitly adapt and test the router dependency, including malformed URL handling and web/native deep-link/auth callbacks. This is not dismissed as build-only exposure.
2. Expo config/prebuild tooling → `xcode@3.0.1 → uuid@7.0.3`. Advisory concerns v3/v5/v6 caller-supplied output-buffer bounds; inspected xcode uses `uuid.v4()` without an output buffer. No applicable exploit path established in that consumer; not shipped application logic. Patched uuid starts at 11.1.1, outside xcode's declared major range. A deliberate tested tooling upgrade/override remains follow-up, not an automatic downgrade of Expo.

## Verification
- Root and mobile `npm ci` passed with their own lockfiles; no force/legacy-peer-deps flags. Root audit 13 → 0; production tree 6 → 0. Mobile 29 → 14 moderate.
- **256 isolated tests passed**, including six real native Sharp codec cases: JPEG/PNG/WebP pass-through, EXIF-oriented resize, AVIF conversion and byte/error limits. Existing auth, remote transport, SQL privacy and knowledge suites retained.
- Web/mobile TypeScript and zero-warning lint passed. Next 16.3.5 Turbopack production build passed.
- Expo install compatibility check passed. Production web, iOS Hermes (5.6 MB), Android Hermes (5.9 MB) exports passed. Exporting bytecode is not a native build or simulator acceptance.
- Hands-on desktop/phone production web: designated account login/sign-out, feed photos, recovery navigation, unsafe URL rejection/retry, real HTML results and filters, synthetic label upload/AI preview/crop passed. Normal and zoomed crop HTTP checks returned actual 1200×1200 JPEGs; anonymous and tiny-image rejection passed. Real PDF fallback returned 41 wines.
- Fresh Expo web login/feed/sign-out, recovery navigation, phone URL rejection and public 48-wine scanning passed; desktop results reload retained 48/48 without horizontal overflow. Updated Expo image picker selection/preview/removal passed with a synthetic JPEG. QC-10 reproduces at a fixed 390×844 viewport: root top -160, height 844, scrollY 160, light gap exposed. Existing QC-01 public numeric ratings, QC-05 route headings and QC-06 roles remain; don't claim full mobile polish.
- Native tools: xcrun exists but cannot find simctl; no Xcode application or Android adb/emulator/SDK found. No native device build/run, camera/gallery/gesture acceptance or binary/OTA release. Recovery delivery/password changes and malicious deep-link stress were not exercised.
- Browser/server observations: intentional scan rejection; existing Maps loader/legacy Places warnings; PDF text failure followed by successful visual fallback. No new dependency-related runtime error observed in tested web flows.

## Release state
PR #98 contains the reviewed implementation and evidence. Primary Vercel preview passed at product head. Duplicate `cellarsnap` preview still fails (OPS-01); preserve working `cellar-snap`. Both GitHub CI jobs passed on product `588d49a` (run `34734788062`). Merge, production deployment/live verification, and native distribution remain pending. Last verified production product remains B04b `c83a5cb` ([release](b04-release.md)). Recheck live state before rollout.

## Workspace and environment
Preserve preexisting modified `tsconfig.json`, untracked `cellarsnap-fix-plan.md`, `cellarsnap-qa-report.md`, and nested `.claude/worktrees/agent-a251821a0b01f63dc/`. PR #75 remains untouched. No environment file edits; Expo export used a process-only local API URL. Temporary services on 3001/8082/8083 stopped; sessions signed out, tabs closed and viewport reset. [Cleanup](../evidence/b04c-cleanup.json) removed three captured disposable scans and 137 child rows, retaining the one baseline scan. No entries/accounts were saved or modified. Screenshots/logs under `/tmp/cellarsnap-b04c/` are optional; checked-in text/evidence is sufficient to resume. Never commit credentials, signed URLs or account contacts.

## Next slice
1. Review/release B04c with merge, web deployment and live acceptance tracked separately; native dependency changes need a compatible rebuilt client and actual native QC before mobile release.
2. Address the residual mobile URL-decoder path as a bounded AUD-08 follow-up, with explicit module/API compatibility and deep-link tests. Resolve xcode/uuid through a tested tooling contract; refresh advisories first.
3. Retain AUD-01 revocation acceptance, AUD-06/QC-01 public projections and OPS-01 as separate work. B05 schema/types remains the next broad planned batch once this security follow-up is bounded. QC-10 belongs to B11 and is now confirmed for Expo web only.
