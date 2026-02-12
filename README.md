This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## CellarSnap MVP setup

Required environment variables (in `.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY` (for AI-assisted bottle count and autofill)

Supabase SQL steps:

- Run files in this exact order:
  - `supabase/sql/001_init.sql`
  - `supabase/sql/002_storage.sql`
  - `supabase/sql/003_social.sql`
  - `supabase/sql/004_pairing_and_rating.sql`
  - `supabase/sql/004_follow_privacy.sql`
  - `supabase/sql/005_notifications.sql`
  - `supabase/sql/006_friends.sql`
  - `supabase/sql/007_entry_photos.sql`
  - `supabase/sql/008_username_login.sql`
  - `supabase/sql/009_friendship_source_of_truth.sql`
  - `supabase/sql/009_default_public_privacy.sql`
  - `supabase/sql/010_friend_cancel_unfriend.sql`
  - `supabase/sql/011_deprecate_user_follows.sql`
  - `supabase/sql/012_privacy_onboarding.sql`
  - `supabase/sql/013_advanced_notes.sql`
  - `supabase/sql/013_profile_avatar.sql`
  - `supabase/sql/014_entry_reactions.sql`
  - `supabase/sql/015_entry_photos_visibility.sql`
  - `supabase/sql/016_entry_pricing_qpr.sql`
  - `supabase/sql/017_entry_price_currency.sql`
  - `supabase/sql/018_entry_comparison_feedback.sql`
  - `supabase/sql/019_entry_classification_and_primary_grapes.sql`
  - `supabase/sql/020_ai_notes_summary.sql`
  - `supabase/sql/021_feedback.sql`

Notes:
- Some files intentionally share numeric prefixes (`004`, `009`, `013`); keep the order above.
- `015_entry_photos_visibility.sql` also includes a compatibility overload for `can_view_entry(..., privacy text)` to support older schemas where `entry_privacy` is `text`.

Local development:

```bash
npm run dev
```

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
  - `/api/bottle-count`
  - `/api/username-check`
  - `/api/auth/resolve-identifier`

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

Fonts are configured with local/system fallbacks to avoid runtime font fetch requirements during builds.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
