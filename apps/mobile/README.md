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
# Optional in local dev, required for AI, crop editing, and in-app account deletion
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

For TestFlight / App Review builds, point `EXPO_PUBLIC_WEB_API_BASE_URL` at the deployed web API, not localhost. The mobile app uses that API for AI photo analysis, crop editing, alerts actions, and account deletion.

## Auth Redirect URLs (Supabase)

The app uses deep links and `auth/callback` for magic link / OTP callbacks.

Add these to Supabase Auth redirect URL allow-list (matching the `cluster` scheme in `app.json`):

- `cluster://auth/callback`
- `exp://*/--/auth/callback` (Expo Go development)

If you later add OAuth providers (Google/Apple), use the same callback path and ensure provider console redirect settings point to your Supabase project callback URL.

## Vertical Slice Included

- Auth: sign in, sign up, sign out, session restore
- Identifier resolution parity with web (email/username/phone helpers via Supabase RPC)
- Entries: list entries + create entry (`wine_entries`)
- Pocket Sommelier: authenticated mobile chat powered by the web `/api/sommelier/chat` endpoint
- Loading and error states on auth and entries screens

## Release Builds

EAS profiles live in `apps/mobile/eas.json`.

From `apps/mobile`:

```bash
npx eas build --platform ios --profile production
npx eas submit --platform ios --profile production
```

Current release metadata is defined in `app.json`:

- version: `1.0.0`
- iOS build number: `1`
- Android version code: `1`

## App Review Checklist

- Account deletion is available in-app under Profile -> Settings -> Delete account.
- Privacy Policy and Terms are available in the mobile app.
- Provide App Review with a valid demo account if your production sign-in is gated.
- Verify `EXPO_PUBLIC_WEB_API_BASE_URL` points to the deployed environment before submitting.
