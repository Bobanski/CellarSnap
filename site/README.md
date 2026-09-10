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

1. New Vercel project from this repo, **Root Directory = `site`**, Framework Preset = *Other*.
   Do NOT reuse the `cellar-snap` project (that is the app) or the stale duplicate `cellarsnap` project.
2. Add the custom domain in Vercel → Domains, then set DNS at the registrar (see PR description).
3. `vercel.json` gives clean URLs (`/privacy` serves `privacy.html`).

## Things to update later

- App links point at `https://cellarsnap.app` (search for it in the HTML). Change if the app moves to the public domain.
- Contact email is `cellarsnap@gmail.com` everywhere. Swap for a domain address once one exists.
- `assets/og.png` is the social share image (generated from `assets/og.html` with Playwright).
- Footer legal line says "© 2026 Cluster" — add the LLC's legal name once confirmed; Apple's check looks for the domain to be associated with the legal entity.
