# iOS Submission Runbook

Everything below requires Eitan's own accounts (Apple Developer, App Store Connect,
Google Cloud, Supabase, EAS) — an agent cannot do any of this. Work through it
top to bottom before running `eas build --platform ios --profile production`
and `eas submit --platform ios --profile production`.

## 1. Apple Developer account

- [ ] Confirm an active Apple Developer Program membership ($99/yr) under the account
      that will own this app.
- [ ] In [developer.apple.com](https://developer.apple.com) → Certificates, Identifiers &
      Profiles → Identifiers, create (or confirm) the App ID `com.cellarsnap.mobile`.
      This bundle ID is permanent — do not change it.
- [ ] On that App ID, enable the **Sign in with Apple** capability. The mobile app
      already ships `expo-apple-authentication` and `usesAppleSignIn: true` in
      `apps/mobile/app.json` — this step just needs to be turned on server-side in
      the Apple portal to match.

## 2. Supabase Apple provider

- [ ] Enable the **Apple** auth provider in the Supabase dashboard (Authentication →
      Providers) for the project used by production (`rbmkypbqavmnuycznssv` per
      `CLAUDE.md`).
- [ ] Follow `docs/CODEX_APPLE_SIGN_IN.md` for the exact Services ID / Key ID / private
      key values Supabase needs and how the mobile `signInWithIdToken()` flow expects
      them to be configured.
- [ ] Confirm the Supabase Auth redirect URL allow-list includes `cluster://auth/callback`
      (see `apps/mobile/README.md`).

## 3. `eas.json` submit config

- [ ] `apps/mobile/eas.json` currently has an empty `submit.production: {}`. Fill in:
      - `appleId` — the Apple ID email used for App Store Connect.
      - `ascAppId` — the App Store Connect app's numeric ID (create the app record in
        App Store Connect first if it doesn't exist yet — see §5).
      - `appleTeamId` — the Apple Developer Team ID (found in the Apple Developer
        portal membership details).
- [ ] These are account-specific and should not be committed with real values checked
      into a public/shared repo unless the repo's visibility is confirmed private.

## 4. EAS environment variables — production API base URL

- [ ] **Critical:** `apps/mobile/.env.local` currently points
      `EXPO_PUBLIC_WEB_API_BASE_URL` at a LAN IP for local dev. This value gets
      **baked into the built binary at build time** (it's an `EXPO_PUBLIC_*` var, inlined
      by Expo/Metro, not read at runtime).
- [ ] Before running an EAS production build, set `EXPO_PUBLIC_WEB_API_BASE_URL` in the
      EAS project's environment variables (`eas env:create --environment production`,
      or via the Expo dashboard) to the deployed production Vercel URL — not localhost,
      not a LAN IP.
- [ ] Also confirm `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and
      `EXPO_PUBLIC_AUTH_MODE` are set correctly for production in EAS (mirroring
      `apps/mobile/README.md`'s `.env.local` template, but pointed at prod).
- [ ] After the first production build, sanity-check the IPA/build logs (or a TestFlight
      install) to confirm API calls are hitting the Vercel URL, not the LAN IP.

## 5. App Store Connect listing + privacy labels

- [ ] Create the app record in App Store Connect (if not already created) using bundle ID
      `com.cellarsnap.mobile`, name "Cluster".
- [ ] Fill out screenshots, description, keywords, support URL, marketing URL.
- [ ] Complete the **App Privacy** section using `docs/APP_PRIVACY_LABELS.md` as the
      exact mapping of CellarSnap/Cluster's data flows to App Store Connect's privacy
      questionnaire — don't re-derive this from scratch, the doc already has the answers.

## 6. Age rating

- [ ] Set the age rating to **17+** in App Store Connect (App Information → Age Rating).
      This app is wine-focused (alcohol content) and requires the 17+ tier regardless of
      other content flags.
- [ ] The mobile app's own in-app age gate (`apps/mobile/app/age-gate.tsx`) is separate
      from this — both are required.

## 7. Demo account for App Review

- [ ] Create a real, working demo account (email/password or phone, matching whatever
      `EXPO_PUBLIC_AUTH_MODE` production is set to) that App Review can sign in with.
- [ ] Seed it with at least a few cellar entries so reviewers see a populated app, not an
      empty state.
- [ ] Add the credentials to the **App Review Information** section in App Store Connect
      (Sign-In Required → demo username/password + any notes about the flow).

## 8. Google Maps API key restriction

- [ ] In Google Cloud Console, find the Maps API key currently used by the mobile app
      (location/place search).
- [ ] Restrict it to the iOS bundle ID `com.cellarsnap.mobile` (Application restrictions →
      iOS apps) so the key can't be abused if extracted from the shipped binary.
- [ ] Confirm the restricted key still works end-to-end (location search / place autocomplete)
      in a production build before submitting — overly-tight restrictions can silently break
      this feature.

## 9. `PrivacyInfo.xcprivacy` check

- [ ] iOS 17+ / Xcode 15+ requires a Privacy Manifest (`PrivacyInfo.xcprivacy`) declaring
      "required reason" API usage (e.g. UserDefaults, file timestamps) for any SDK that
      accesses them — several Expo/RN dependencies now ship their own manifests.
- [ ] On the **first** EAS production build, check the build logs for any privacy manifest
      warnings or App Store Connect "Missing Privacy Manifest" / "ITMS-91053" style
      rejection emails after upload.
- [ ] If a warning appears, identify which dependency is missing a manifest entry (EAS/Expo
      usually surfaces this by package name) and either update that package to a version
      that ships a manifest, or add the declaration per Apple's Privacy Manifest docs.

## 10. Final pre-submit checklist

- [ ] `apps/mobile/app.json` version/build numbers are correct for this submission
      (`version: 1.0.0`, iOS `buildNumber`, Android `versionCode` per
      `apps/mobile/README.md`).
- [ ] Account deletion flow (Profile → Settings → Delete account) works end-to-end against
      production.
- [ ] Privacy Policy and Terms screens (`apps/mobile/app/privacy.tsx`,
      `apps/mobile/app/terms.tsx`) show current, accurate content.
- [ ] Run `eas build --platform ios --profile production` from `apps/mobile`, then
      `eas submit --platform ios --profile production` once the build is green.
