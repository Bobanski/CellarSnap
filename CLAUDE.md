# CellarSnap — Project Context

Wine-focused app. Core features: bottle logging, label/photo workflows, recommendations,
palate matching, social layer, badges/gamification. Product name still TBD (CellarSnap / Clinq / Cluster).

---

## Stack

- **Web**: Next.js 16 (App Router), TypeScript, Tailwind CSS 4
- **Mobile**: React Native / Expo (`apps/mobile/`), react-native-svg
- **Shared logic**: `packages/shared/` — types, schemas (Zod), badge definitions
- **Database + Auth**: Supabase (PostgreSQL + Supabase Auth + Storage)
- **AI**: OpenAI API (label autofill, photo context, sommelier RAG), Google Vision (OCR)
- **Infra**: Vercel (web), Supabase (db/auth/storage)
- **Testing**: Playwright (e2e), Vitest (unit)

## Project Structure

```
src/
  app/          Next.js App Router pages and API routes
  components/   Shared UI components
  features/     Feature-scoped modules (prefer this over flat components)
  lib/          Utilities, helpers, shared logic
  server/       Server-side only code (algorithm, badges, sommelier, etc.)
  types/        TypeScript type definitions
apps/
  mobile/       React Native / Expo app
packages/
  shared/       Code shared between web and mobile
supabase/
  sql/          Migrations (forward-only, listed in manifest.txt)
```

## Key Conventions

- **Feature-first structure**: new features go in `src/features/`, not scattered across `src/`
- **TypeScript strict** — no `any` unless absolutely unavoidable; comment why if used
- **Database changes require a migration file** in `supabase/sql/` — always call these out in the PR, never apply silently
- **Shared web/mobile logic** belongs in `packages/shared/`, not duplicated
- API routes live in `src/app/api/`

## Auth Patterns

- **Web API routes**: `const { user, supabase } = await requireRequestAuth(request)` from `@/server/auth/requestAuth`. Catches `RequestAuthError` for 401.
- **Mobile API calls**: Bearer token via `getAccessTokenForApi()` + `getWebApiBaseUrl()` from `@/src/lib/api/webApi`. Mobile entry creation uses direct Supabase inserts (not the web API).
- **Import aliases**: `@shared` on web (tsconfig), `@cellarsnap/shared` on mobile (package.json workspace).

## App Conventions

- **Rating scale is 1–5** (not 1–100, not 10-point). Always check existing types and constants before assuming UI conventions.
- **Enjoyment intent values**: `seek_more`, `happily_again`, `if_poured`, `pass`
- **Privacy levels**: `public`, `friends`, `private`
- **Brand guide**: `/Users/esneider/Downloads/cluster-brand-guide-v4.jsx` — source of truth for colors, typography, badge SVGs, and UI patterns.

## Key Features & Architecture

### Algorithm (Palate Matching)
16-axis sensory scoring engine in `src/server/algorithm/`. Computes match scores (0–100) between wine profiles and user preference vectors using weighted Euclidean distance + categorical affinity bonuses. Key files:
- `scoringEngine.ts` — core match computation
- `userPreferences.ts` — aggregates user taste data from entries
- `profileAssembly.ts` — builds wine sensory profiles from base data + modifiers
- Scores cached in `wine_entry_scores` table (6hr TTL)

### Badges & Gamification
85 badges across 6 categories (taste, region, milestone, social, somm, value) with 4 tiers and 11 SVG shapes. Key files:
- `packages/shared/src/badges.ts` — all definitions, types, color maps, trigger specs
- `src/server/badges/evaluator.ts` — runs after entry creation (best-effort async)
- `src/server/badges/queries.ts` — Supabase query builders per trigger type
- `src/features/badges/BadgeIcon.tsx` — SVG badge visual (web), also at `apps/mobile/src/components/BadgeIcon.tsx` (RN)
- `POST /api/badges/evaluate` — mobile calls this after entry creation since mobile inserts directly via Supabase
- DB: `user_badges` table + `profiles.featured_badge_id`

### Pocket Sommelier
RAG-based wine knowledge chat using OpenAI embeddings + pgvector. Knowledge ingested from PDFs into `wine_knowledge_chunks` / `general_knowledge_chunks` tables.

### Social Layer
Friends, entry reactions/comments, entry groups (shared tastings), blocks/reports. Notifications via `wine_notifications` table + realtime subscriptions.

## Database & Supabase

- For bulk data operations, prefer CSV uploads over repeated SQL INSERT statements. Never use dozens of migration pushes for seed data.
- Migrations live in `supabase/sql/` and are listed in `supabase/sql/manifest.txt` — always append new migrations to the manifest.
- Latest migration: `091_badges.sql`
- Supabase project ID: `rbmkypbqavmnuycznssv`

## Git Workflow

- Branch from `main`: `feat/`, `fix/`, `chore/`
- Always open a PR — never push directly to main
- PRs must reference the GitHub issue number

## Open Architecture Questions (don't decide unilaterally)

- Final product name (CellarSnap / Clinq / Cluster)
- Mobile-first vs. PWA strategy

## Test Commands

```bash
npm run test:routes    # unit tests
npm run e2e            # Playwright end-to-end
npm run lint           # lint all workspaces
npm run lint:web       # web only
npm run lint:mobile    # mobile only
```
