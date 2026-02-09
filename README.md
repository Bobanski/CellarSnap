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
- Run `supabase/sql/004_follow_privacy.sql` to add follows + privacy levels (`public` / `friends` / `private`) for entries and photos.

Local development:

```bash
npm run dev
```

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
