# `ui-ethan-edits` Handoff

## Working rule

- Treat the Next.js web app as the source of truth.
- Web lives mainly under `src/app` and `src/features`.
- Expo/mobile lives mainly under `apps/mobile/app` and `apps/mobile/src`.
- When web and mobile drift, reconcile mobile to web unless there is a clear mobile-only reason not to.

## What is already reconciled

### Pocket Sommelier

- Shared copy/constants now live in `packages/shared/src/sommelier.ts`.
- Web and mobile both read from the shared Sommelier copy.
- Mobile also has the adjusted composer placement/size and `Done` keyboard button behavior.

### Feed

- Shared feed labels/helpers now live in `packages/shared/src/feed.ts`.
- Web and mobile now use the same feed copy, reaction/report labels, and feed display helpers.

### Entries library

- Shared library labels/helpers now live in `packages/shared/src/entriesLibrary.ts`.
- Web and mobile now use the same library copy, sort/group labels, search placeholder, and display helpers.

### Home

- Shared home constants/types now live in `packages/shared/src/home.ts`.
- Mobile prefers the web `/api/home` response when `EXPO_PUBLIC_WEB_API_BASE_URL` is set, so home is much closer to web behavior.

### Own profile/settings

- Shared profile copy/config now lives in `packages/shared/src/profile.ts`.
- Web and mobile use the same badge definitions, settings labels, privacy options, and tab labels.

### Public profile

- Mobile public profile now uses the web APIs instead of a separate local-only interpretation.
- Mobile API client: `apps/mobile/src/lib/api/publicProfile.ts`.

### Record a new pour

- Shared new-entry copy/constants now live in `packages/shared/src/newEntry.ts`.
- Web and mobile new-entry flows are closer and use the same shared text/helpers where possible.

### Entry detail

- Mobile entry detail now has:
  - comments thread support using the web comment APIs
  - share action using the web share API
  - tagged tasting `Add to my cellar`
  - palate match card using the web algorithm API
  - `?edit=1` handoff so copied cellar entries can open directly in mobile edit mode
- Shared entry-detail helpers now live in `packages/shared/src/entryDetail.ts`.

## API/auth updates already made

- Web APIs were updated so Expo can call them with bearer auth where needed.
- Important touched endpoints include:
  - `src/app/api/home/route.ts`
  - `src/app/api/share/handler.ts`
  - `src/app/api/entries/[id]/route.ts`
  - `src/app/api/entries/[id]/comments/route.ts`
  - `src/app/api/comments/[id]/route.ts`
  - `src/app/api/users/[id]/route.ts`
  - `src/app/api/users/[id]/follow/route.ts`
  - `src/app/api/users/[id]/block/route.ts`
  - `src/app/api/users/[id]/entries/handler.ts`
  - `src/app/api/users/[id]/tagged/handler.ts`
  - `src/app/api/friends/requests/[id]/route.ts`

## Validation status

- Targeted ESLint checks passed on the touched web/shared/API files.
- `npm --prefix apps/mobile run typecheck` passed.
- Root web typecheck still has pre-existing unrelated failures:
  - `src/features/sommelier/SommelierMessage.tsx`
  - `src/server/listScan/parse.ts`
  - `src/server/sommelier/ingest.ts`
- Those root errors were not introduced by this parity work.

## What is still left

### 1. List-scan parity

- This is the biggest remaining product surface that still clearly drifts.
- Main files:
  - `src/app/list-scan/page.tsx`
  - `src/app/list-scan/results/page.tsx`
  - `src/app/list-scan/history/page.tsx`
  - `apps/mobile/app/(app)/list-scan/index.tsx`
  - `apps/mobile/app/(app)/list-scan/results.tsx`

### 2. Auth/onboarding parity

- Web and mobile auth/onboarding flows are still separate and not fully reconciled.
- Main web files:
  - `src/app/login/page.tsx`
  - `src/app/signup/page.tsx`
  - `src/app/forgot-password/page.tsx`
  - `src/app/reset-password/page.tsx`
  - `src/app/verify-phone/page.tsx`
  - `src/app/finish-signup/page.tsx`
- Main mobile area:
  - `apps/mobile/app/(auth)`

### 3. Lower-priority legal/static drift

- `src/app/privacy/page.tsx`
- `src/app/terms/page.tsx`
- `apps/mobile/app/privacy.tsx`
- `apps/mobile/app/terms.tsx`

## Recommended next move

1. Continue with list-scan parity first.
2. After that, reconcile auth/onboarding.
3. Leave legal/static pages for the end.

## Quick resume commands

```powershell
git switch ui-ethan-edits
git pull
```

### Web

```powershell
cd C:\Users\ethan\Desktop\CellarSnap
npm run dev
```

### Mobile

```powershell
cd C:\Users\ethan\Desktop\CellarSnap\apps\mobile
npx expo start --clear
```

## Notes

- `EXPO_PUBLIC_WEB_API_BASE_URL` matters for the mobile parity work, because several Expo screens now intentionally use the web APIs to stay aligned with Node/web behavior.
- `.next-dev.log` and `.next-dev.err.log` are local-only and should stay out of commits.
