# CellarSnap Mobile (Expo)

This app lives in `apps/mobile` and talks directly to Supabase using the public anon key and RLS.

## Requirements

- Node.js 20+
- Expo CLI via `npx expo` (no global install required)
- iOS Simulator (Xcode) and/or Android Emulator

## Environment Variables

Create `apps/mobile/.env.local`:

```bash
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
# Optional: defaults to "email"
EXPO_PUBLIC_AUTH_MODE=email
# Optional: enables AI label autofill + photo auto-tagging via web API routes
EXPO_PUBLIC_WEB_API_BASE_URL=http://127.0.0.1:3000
```

`EXPO_PUBLIC_AUTH_MODE` should match web behavior (`email` or `phone`).

## Install

From repo root:

```bash
npm install
```

From `apps/mobile`:

```bash
npm install
```

## Run

From `apps/mobile`:

```bash
npm run start
npm run ios
npm run android
```

If you use AI label autofill / photo auto-tagging, run the web app too (repo root):

```bash
npm run dev
```

## Auth Redirect URLs (Supabase)

The app uses deep links and `auth/callback` for magic link / OTP callbacks.

Add these to Supabase Auth redirect URL allow-list:

- `cellarsnap://auth/callback`
- `exp://*/--/auth/callback` (Expo Go development)

If you later add OAuth providers (Google/Apple), use the same callback path and ensure provider console redirect settings point to your Supabase project callback URL.

## Vertical Slice Included

- Auth: sign in, sign up, sign out, session restore
- Identifier resolution parity with web (email/username/phone helpers via Supabase RPC)
- Entries: list entries + create entry (`wine_entries`)
- Loading and error states on auth and entries screens
