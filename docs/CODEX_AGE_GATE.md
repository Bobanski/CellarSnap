# Codex Task: Age Verification Gate

> **Branch:** `feat/age-gate`
> **Base:** `main` at `4ab8541`
> **⚠️ PARALLEL WORK:** Other agents are working on `feat/apple-sign-in` and `fix/terms-production-language` simultaneously. Before committing, always `git checkout feat/age-gate` and confirm you're on the correct branch. Never commit to main directly.

---

## Goal

Add a mandatory age verification screen that appears before a user can access the app. Wine apps must declare a 17+ age rating in the App Store, and Apple expects a corresponding age gate in the app itself. Without this, the app will be rejected during App Store review.

The gate must appear **once per device**, before any content is visible. Once the user confirms they are of legal age, it never appears again.

## Architecture

CellarSnap uses:
- **Expo** (React Native) for the mobile app — `apps/mobile/`
- **expo-router** for navigation — file-based routing
- **AuthProvider** at `apps/mobile/src/providers/AuthProvider.tsx` manages session state
- **`expo-secure-store`** is already installed for secure local storage
- Root layout is at `apps/mobile/app/_layout.tsx`
- Auth layout is at `apps/mobile/app/(auth)/_layout.tsx`
- App layout (authenticated) is at `apps/mobile/app/(app)/` 

The age gate should exist at the **root level** — it blocks everything (auth screens, app screens, terms/privacy). It's a device-level gate, not a user-level gate.

## What to implement

### 1. Create the age gate screen

Create `apps/mobile/app/age-gate.tsx`:

This is a standalone screen (not inside `(auth)` or `(app)` groups). It should:

- Display a dark, full-screen modal with the CellarSnap branding
- Show a clear message: "You must be of legal drinking age in your country to use CellarSnap."
- Have a confirmation button: **"I am 21 or older"** (primary amber button, matching existing style)
- Have a decline option: **"I am under 21"** (secondary/text-only button)
- If confirmed → store a flag in `expo-secure-store` and navigate to the auth flow
- If declined → show a brief message ("You must be of legal age to use this app.") and remain on the screen. Do NOT close the app programmatically — just keep them on the gate.

**Design notes:**
- Use the same dark theme as auth screens: `#0f0a09` background
- Use the same card style: `rgba(255,255,255,0.05)` bg, `rgba(255,255,255,0.1)` border, `borderRadius: 24`
- Primary button: `#fbbf24` amber background, `#09090b` text, `borderRadius: 12`, `minHeight: 46`
- Secondary/decline text: `#a1a1aa` color, uppercase, small font
- Add a subtle wine glass or age-related icon area at the top — but since we don't have custom icons loaded, use a simple text-based indicator like "🍷" emoji or just the "21+" text styled large
- Include the CellarSnap wordmark/title

**Screen layout (top to bottom):**
1. CellarSnap wordmark
2. "21+" large styled text (or wine emoji)
3. "You must be of legal drinking age in your country to use CellarSnap."
4. "I am 21 or older" primary button
5. "I am under 21" secondary text button
6. Small disclaimer: "By continuing, you confirm you are of legal drinking age in your jurisdiction."

### 2. Store the age verification flag

Use `expo-secure-store` (already installed) to persist the flag:

```typescript
import * as SecureStore from "expo-secure-store";

const AGE_VERIFIED_KEY = "cellarsnap_age_verified";

export async function getAgeVerified(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(AGE_VERIFIED_KEY);
  return value === "true";
}

export async function setAgeVerified(): Promise<void> {
  await SecureStore.setItemAsync(AGE_VERIFIED_KEY, "true");
}
```

Put this in a new file: `apps/mobile/src/lib/ageVerification.ts`

### 3. Integrate with root layout

Modify `apps/mobile/app/_layout.tsx` to check the age verification flag before rendering any content.

The current root layout is:

```typescript
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/src/providers/AuthProvider";
import { KeyboardDoneAccessory } from "@/src/components/KeyboardDoneAccessory";
import { APP_SANS_FONT_FAMILY } from "@/src/lib/typography";

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0f0a09" },
          headerTintColor: "#f4f4f5",
          headerTitleStyle: APP_SANS_FONT_FAMILY
            ? { fontFamily: APP_SANS_FONT_FAMILY }
            : undefined,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: "#0f0a09" },
        }}
      />
      <KeyboardDoneAccessory />
    </AuthProvider>
  );
}
```

**Approach:** Use a state variable + `useEffect` to check `getAgeVerified()` on mount. While checking, show a loading spinner (same style as AuthLayout). If not verified, redirect to the age-gate screen. If verified, render normally.

**IMPORTANT:** expo-router handles this well with `<Redirect>`. The pattern is:

```typescript
const [ageChecked, setAgeChecked] = useState(false);
const [ageVerified, setAgeVerified] = useState(false);

useEffect(() => {
  getAgeVerified().then((verified) => {
    setAgeVerified(verified);
    setAgeChecked(true);
  });
}, []);
```

Then inside the layout, before the `<Stack>`, conditionally redirect:

```typescript
if (!ageChecked) {
  return <LoadingScreen />;  // spinner on dark bg
}
```

And add the age-gate screen to the Stack:

```typescript
<Stack.Screen name="age-gate" options={{ headerShown: false }} />
```

Then in the age-gate screen itself, after successful verification, call `setAgeVerified()` from the lib and use `router.replace("/(auth)/sign-in")` to proceed.

**KEY CONSIDERATION:** The root `_layout.tsx` wraps everything in `<AuthProvider>`. The age gate should render OUTSIDE the auth check — it runs before auth. Since `AuthProvider` is at root, and `_layout.tsx` controls the Stack, the redirect approach with `<Redirect href="/age-gate" />` works cleanly. When not age-verified, just include a conditional redirect before the Stack renders:

```typescript
if (ageChecked && !ageVerified) {
  return (
    <View style={{ flex: 1, backgroundColor: "#0f0a09" }}>
      <StatusBar style="light" />
      <Redirect href="/age-gate" />
    </View>
  );
}
```

**Actually, the cleaner expo-router pattern** is to use `initialRouteName` or navigation-level control. But the simplest reliable approach that doesn't break deep linking:

1. Add `age-gate` as a screen in the Stack
2. In `_layout.tsx`, check SecureStore on mount
3. If not verified, use `router.replace("/age-gate")` in a useEffect after ageChecked is true
4. The age-gate screen, after confirmation, writes to SecureStore and does `router.replace("/(auth)/sign-in")`

Choose whichever approach you find cleanest, but the requirements are:
- Age gate blocks ALL app content until confirmed
- Runs before auth check
- Persists across app restarts
- Does not flash the auth screen before redirecting
- Works on fresh install and after updates

### 4. Register the screen in the Stack

Make sure `apps/mobile/app/age-gate.tsx` is picked up by expo-router. Since it's a file in `app/`, it's auto-registered. Just ensure the Stack in `_layout.tsx` has:

```typescript
<Stack.Screen name="age-gate" options={{ headerShown: false, gestureEnabled: false }} />
```

`gestureEnabled: false` prevents swiping back past the age gate.

## Files to create

| File | Purpose |
|------|---------|
| `apps/mobile/app/age-gate.tsx` | Age verification screen |
| `apps/mobile/src/lib/ageVerification.ts` | SecureStore helpers for age flag |

## Files to modify

| File | Change |
|------|--------|
| `apps/mobile/app/_layout.tsx` | Add age check state + redirect logic + register age-gate screen |

## Files NOT to modify

- `apps/mobile/app/(auth)/_layout.tsx` — Auth layout should not know about age gate
- `apps/mobile/app/(auth)/sign-in.tsx` — Do not add age checks here
- `apps/mobile/app/(auth)/sign-up.tsx` — Do not add age checks here
- `apps/mobile/src/providers/AuthProvider.tsx` — Auth is independent of age gate
- `apps/mobile/app.json` — No config changes needed for this feature

## Style reference

Copy these exact values from existing screens:

```
Background:          #0f0a09
Card bg:             rgba(255,255,255,0.05)
Card border:         rgba(255,255,255,0.1)
Card borderRadius:   24
Primary button bg:   #fbbf24
Primary button text: #09090b
Button borderRadius: 12
Button minHeight:    46
Title text:          #fafafa, fontSize 30, fontWeight 700
Subtitle text:       #d4d4d8, fontSize 14, lineHeight 20
Muted text:          #a1a1aa
Dim text:            #71717a
Error text:          #fda4af
Eyebrow:             #fcd34d, fontSize 11, fontWeight 700, letterSpacing 2, uppercase
```

## Validation

- Run `cd apps/mobile && npx tsc --noEmit` to check types
- Run `cd apps/mobile && npx eslint app/age-gate.tsx src/lib/ageVerification.ts app/_layout.tsx`
- Verify that a fresh launch (clearing SecureStore or first install) shows the age gate
- Verify that after confirming, the age gate never appears again
- Verify that the back gesture is disabled on the age gate screen

## Edge cases to handle

1. **User declines** — Show message, stay on screen. No crash, no app close.
2. **SecureStore unavailable** — If `getItemAsync` throws, treat as not verified (show gate). Don't crash.
3. **Quick flash prevention** — Don't render the auth/app screens while the age check is loading. Show a dark loading screen.
4. **App updates** — The flag persists in SecureStore across updates, so users don't re-verify. This is correct behavior.
