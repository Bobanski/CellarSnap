## CellarSnap MVP setup

Required environment variables (in `.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (required for public share page resolver and OG image generation)
- `PUBLIC_SITE_URL` (absolute site URL used in generated share links/metadata)
- `OPENAI_API_KEY` (for AI-assisted bottle count and autofill)

Supabase SQL steps:

- Source of truth for migration order is `supabase/sql/manifest.txt`.
- Run every file in that manifest, in listed order.
- Minimum supported schema baseline is `036_apply_friend_transition.sql`.

Notes:
- Some files intentionally share numeric prefixes (`004`, `009`, `013`, `022`, `028`, `032`); rely on `manifest.txt` order rather than filename prefix alone.
- `015_entry_photos_visibility.sql` includes a compatibility overload for `can_view_entry(..., privacy text)` to support older schemas where `entry_privacy` is `text`.
- Compatibility fallback paths in API routes are temporary and should be removed once all environments are at the manifest baseline.

Local development:

```bash
npm run dev
```

## Mobile app (Expo)

The iOS/Android client is in `apps/mobile`.

Quick start:

```bash
cd apps/mobile
npm install
npm run start
```

Set these env vars in `apps/mobile/.env.local`:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Optional: `EXPO_PUBLIC_AUTH_MODE` (`email` or `phone`)

Full mobile setup docs (including iOS/Android commands and Supabase redirect URLs):

- `apps/mobile/README.md`

E2E happy path tests:

- Ensure Playwright is installed locally:
  - `npm install --save-dev @playwright/test`
  - `npm run e2e:install`
- Set these env vars before running:
  - `E2E_USER_A_ID`
  - `E2E_USER_A_IDENTIFIER`
  - `E2E_USER_A_PASSWORD`
  - `E2E_USER_B_ID`
  - `E2E_USER_B_IDENTIFIER`
  - `E2E_USER_B_PASSWORD`
  - Optional: `E2E_BASE_URL` (defaults to `http://127.0.0.1:3000`)
- Run `npm run e2e`.

API rate limiting:

- Launch-sensitive endpoints have generous per-user/IP limits to prevent abuse while allowing friends-and-family testing:
  - `/api/lineup-autofill`
  - `/api/label-autofill`
  - `/api/photo-context`
  - `/api/bottle-count`
  - `/api/username-check`
  - `/api/phone-check`
  - `/api/auth/resolve-identifier`

Schema health:

- `GET /api/health/schema` verifies required schema features for:
  - entry photo context support
  - interaction privacy/comments
  - blocks/reports
  - post-save survey

## Getting Started

Run the web app from the repo root:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The Next.js app lives under `src/app`. The landing page entry point is `src/app/page.tsx`.

Fonts are configured with local/system fallbacks to avoid runtime font fetch requirements during builds.
