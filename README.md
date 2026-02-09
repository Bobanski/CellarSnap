This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## CellarSnap MVP setup

Required environment variables (in `.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY` (for label autofill)

Supabase SQL steps:

- Run `supabase/sql/001_init.sql` to create `public.wine_entries` and RLS policies.
- Run `supabase/sql/002_storage.sql` to create the `wine-photos` bucket and storage policies.
- Run `supabase/sql/003_social.sql` to add profiles and social fields.
- Run `supabase/sql/004_pairing_and_rating.sql` to add pairing photo + optional rating.
- Run `supabase/sql/005_notifications.sql` to add notifications for tags.
- Run `supabase/sql/006_friends.sql` to add friend requests and relationships.
- Run `supabase/sql/007_entry_photos.sql` to add multi-photo support (max 3 per type).
- Run `supabase/sql/008_username_login.sql` to enforce unique usernames and enable username login.
- Run `supabase/sql/004_follow_privacy.sql` to add privacy levels (`public` / `friends` / `private`) for entries and photos.
- Run `supabase/sql/009_friendship_source_of_truth.sql` to make friendship/privacy checks use accepted friend requests.
- Run `supabase/sql/010_friend_cancel_unfriend.sql` to allow cancelling pending requests and unfriending.
- Run `supabase/sql/011_deprecate_user_follows.sql` to remove legacy `user_follows` after friendship is fully backed by `friend_requests`.
- Run `supabase/sql/012_privacy_onboarding.sql` to add explicit onboarding confirmation for default privacy.

Local development:

```bash
npm run dev
```

E2E happy path tests:

- Set these env vars before running:
  - `E2E_USER_A_ID`
  - `E2E_USER_A_IDENTIFIER`
  - `E2E_USER_A_PASSWORD`
  - `E2E_USER_B_ID`
  - `E2E_USER_B_IDENTIFIER`
  - `E2E_USER_B_PASSWORD`
  - Optional: `E2E_BASE_URL` (defaults to `http://127.0.0.1:3000`)
- Run `npm run e2e`.

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

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
