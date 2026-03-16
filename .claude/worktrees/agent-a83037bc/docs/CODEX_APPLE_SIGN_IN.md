# Codex Task: Sign in with Apple

> **Branch:** `feat/apple-sign-in`
> **Base:** `main` at `4ab8541`
> **⚠️ PARALLEL WORK:** Other agents are working on `feat/age-gate` and `fix/terms-production-language` simultaneously. Before committing, always `git checkout feat/apple-sign-in` and confirm you're on the correct branch. Never commit to main directly.

---

## Goal

Add "Sign in with Apple" to the iOS mobile app. Apple requires this for any app with third-party sign-in (App Store Review Guideline 4.8). CellarSnap currently offers email/password and phone/password auth only.

## Architecture

CellarSnap uses:
- **Expo** (React Native) for the mobile app — `apps/mobile/`
- **Supabase** for auth — the mobile client is in `apps/mobile/src/lib/supabase.ts`
- **expo-router** for navigation — auth screens are in `apps/mobile/app/(auth)/`
- **AuthProvider** at `apps/mobile/src/providers/AuthProvider.tsx` manages session state

The auth flow uses `supabase.auth.signInWithIdToken()` for native OAuth providers. This is the recommended pattern for Expo + Supabase Apple Sign In.

## What to implement

### 1. Install expo-apple-authentication

Add `expo-apple-authentication` to `apps/mobile/package.json` and add the plugin to `apps/mobile/app.json`:

```json
"plugins": [
  ...existing plugins,
  "expo-apple-authentication"
]
```

Also add `"usesAppleSignIn": true` inside the `expo.ios` section of `app.json`.

**IMPORTANT:** Another agent is adding `NSCameraUsageDescription` to the same `app.json` file. Your changes to `app.json` should be limited to the `plugins` array and `ios` section. Do NOT modify the `infoPlist` section — that's the other agent's territory. If there's a merge conflict, the resolution is simple: keep both changes.

### 2. Create an Apple sign-in helper

Create `apps/mobile/src/lib/api/appleAuth.ts`:

```typescript
import * as AppleAuthentication from "expo-apple-authentication";
import { supabase } from "@/src/lib/supabase";

export async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error("Apple Sign In failed — no identity token received.");
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
  });

  if (error) {
    throw new Error(error.message);
  }

  // Apple only provides the user's name on the FIRST sign-in.
  // If we got a name, upsert it to the profile so it's not lost.
  const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (fullName && data.user) {
    await supabase
      .from("profiles")
      .upsert(
        { id: data.user.id, display_name: fullName },
        { onConflict: "id" }
      )
      .then(() => {}); // Fire-and-forget — don't block sign-in on profile upsert.
  }

  return data;
}
```

### 3. Add Apple button to sign-in screen

Modify `apps/mobile/app/(auth)/sign-in.tsx`:

- Import `AppleAuthentication` from `expo-apple-authentication` and `signInWithApple` from the new helper
- Add an Apple Sign In button below the existing "Create Account" button but above "Forgot password?"
- Use `AppleAuthentication.AppleAuthenticationButton` for the native Apple button (it must use Apple's official design per their Human Interface Guidelines)
- Wrap in `Platform.OS === "ios"` check — only show on iOS
- On success, navigate to `/(app)/home`
- On error, show the error in the existing `errorMessage` state (but ignore `ERR_REQUEST_CANCELED` — that's the user dismissing the sheet)

**Button placement order in the card should be:**
1. Sign In (primary, amber)
2. Sign in with Apple (native Apple button)
3. Create Account (secondary, outlined)
4. Forgot password?
5. Privacy · Terms

Add a subtle divider/separator between the password sign-in button and the Apple button. Something like:

```
<View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 2 }}>
  <View style={{ flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.1)" }} />
  <AppText style={{ color: "#71717a", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" }}>or</AppText>
  <View style={{ flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.1)" }} />
</View>
```

### 4. Add Apple button to sign-up screen

Same pattern in `apps/mobile/app/(auth)/sign-up.tsx`:
- Add the Apple button below the "Create Account" button
- Same "or" divider
- Same error handling
- Same Platform.OS check

### 5. Style details

The app uses a dark theme:
- Background: `#0f0a09`
- Card: `rgba(255,255,255,0.05)` with `rgba(255,255,255,0.1)` border
- Primary button: `#fbbf24` amber
- Text: `#f4f4f5` / `#d4d4d8` / `#a1a1aa` / `#71717a`
- Error text: `#fda4af`

Use `AppleAuthenticationButton` with:
- `buttonType`: `AppleAuthenticationButtonType.SIGN_IN`
- `buttonStyle`: `AppleAuthenticationButtonStyle.WHITE` (it's a dark background app, so white Apple button gives best contrast)
- `cornerRadius`: 12 (matches existing button rounding)
- Height: 46 (matches existing `minHeight: 46` on primary button)

### 6. Handle availability check

`expo-apple-authentication` provides `AppleAuthentication.isAvailableAsync()`. Check this before rendering the button. If not available (Android, older iOS), don't render it at all. Don't show a disabled button.

## Files to modify

| File | Change |
|------|--------|
| `apps/mobile/package.json` | Add `expo-apple-authentication` dependency |
| `apps/mobile/app.json` | Add plugin + `usesAppleSignIn` to ios |
| `apps/mobile/src/lib/api/appleAuth.ts` | **NEW** — Apple auth helper |
| `apps/mobile/app/(auth)/sign-in.tsx` | Add Apple button + divider |
| `apps/mobile/app/(auth)/sign-up.tsx` | Add Apple button + divider |

## Files NOT to modify

- `apps/mobile/src/providers/AuthProvider.tsx` — No changes needed. The existing `onAuthStateChange` listener will pick up Apple sessions automatically.
- `apps/mobile/src/lib/supabase.ts` — No changes needed.
- `apps/mobile/app/(auth)/_layout.tsx` — No changes needed.

## Validation

- Run `cd apps/mobile && npx expo install --check` to verify compatible dependency versions
- Run `cd apps/mobile && npx tsc --noEmit` to check types
- Run `cd apps/mobile && npx eslint --max-warnings 0 app/\(auth\)/sign-in.tsx app/\(auth\)/sign-up.tsx src/lib/api/appleAuth.ts`

## Note for the developer

The Supabase Apple provider must be enabled in the Supabase dashboard (Authentication → Providers → Apple) by the project owner. This code change assumes that will be configured. The code should gracefully handle the case where the provider isn't enabled yet — `signInWithIdToken` will return an error that gets shown to the user.
