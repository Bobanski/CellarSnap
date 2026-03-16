# CellarSnap — Project Context

Wine-focused app. Core features: bottle logging, label/photo workflows, recommendations,
palate matching, social layer. Product name still TBD (CellarSnap / Clinq / Cluster).

---

## Stack

- **Web**: Next.js (App Router), TypeScript, Tailwind CSS
- **Mobile**: React Native (`apps/mobile/`)
- **Shared logic**: `packages/shared/`
- **Database + Auth**: Supabase (PostgreSQL + Supabase Auth)
- **Infra**: Vercel (web), Supabase (db/auth)
- **Testing**: Playwright (e2e), Vitest (unit)

## Project Structure

```
src/
  app/          Next.js App Router pages and API routes
  components/   Shared UI components
  features/     Feature-scoped modules (prefer this over flat components)
  lib/          Utilities, helpers, shared logic
  server/       Server-side only code
  types/        TypeScript type definitions
apps/
  mobile/       React Native app
packages/
  shared/       Code shared between web and mobile
supabase/       Migrations, edge functions, config
```

## Key Conventions

- **Feature-first structure**: new features go in `src/features/`, not scattered across `src/`
- **TypeScript strict** — no `any` unless absolutely unavoidable; comment why if used
- **Database changes require a migration file** in `supabase/migrations/` — always call these out in the PR, never apply silently
- **Shared web/mobile logic** belongs in `packages/shared/`, not duplicated
- API routes live in `src/app/api/`

## Git Workflow

- Branch from `main`: `feat/`, `fix/`, `chore/`
- Always open a PR — never push directly to main
- PRs must reference the GitHub issue number

## Open Architecture Questions (don't decide unilaterally)

- Final product name (CellarSnap / Clinq / Cluster)
- Palate matching algorithm design
- Mobile-first vs. PWA strategy

## Test Commands

```bash
npm run test:routes    # unit tests
npm run e2e            # Playwright end-to-end
npm run lint           # lint all workspaces
```
