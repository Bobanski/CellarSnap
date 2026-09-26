# Cluster marketing site

Static site for the Cluster public domain. Exists to satisfy Apple's Developer Program
organization check ("publicly available and functional" website on the org's domain) and to
give the App Store listing a Privacy Policy URL and Support URL.

No build step. Plain HTML + one stylesheet. Fonts from Google Fonts (Cormorant Garamond + DM Sans),
palette from `cluster-brand-guide-v4` / the app's Warm Noir tokens.

## Pages

| Path | File | Purpose |
|---|---|---|
| `/` | `index.html` | Landing — copy mirrors the in-app landing page (`src/features/landing/LandingPage.tsx`) |
| `/privacy` | `privacy.html` | Privacy Policy URL for App Store Connect |
| `/terms` | `terms.html` | Terms of Use |
| `/support` | `support.html` | Support URL for App Store Connect |

## Deploy (Vercel)

1. Vercel project **`cluster-site`** already exists (created 2026-09-10 via CLI; preview at
   https://cluster-site-teal.vercel.app). To get auto-deploys on push, connect it to this repo in
   Vercel → Settings → Git with **Root Directory = `site`**, Framework Preset = *Other*. Until then,
   `cd site && npx vercel deploy --prod` publishes the folder directly.
   Do NOT reuse the `cellar-snap` project (that is the app) or the stale duplicate `cellarsnap` project.
2. Add the custom domain in Vercel → Domains, then set DNS at the registrar (see PR description).
3. `vercel.json` gives clean URLs (`/privacy` serves `privacy.html`).

## Release maintenance

- App links point at `https://cellarsnap.app` (search for it in the HTML). Change if the app moves to the public domain.
- Keep privacy and terms content aligned with `packages/shared/src/privacyPolicy.ts` and
  `packages/shared/src/termsPolicy.ts`; the static marketing site cannot import them.
- `assets/og.png` is the social share image (generated from `assets/og.html` with Playwright).
- Footer legal identity and support contact are Cluster Wine, LLC and
  `support@clusterwine.app`.
