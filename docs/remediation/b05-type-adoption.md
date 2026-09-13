# B05c database type adoption contract

`packages/shared/src/database.types.ts` is the **single generated public database type source**. Generated via the installed Supabase CLI 2.78.1 against project `rbmkypbqavmnuycznssv` after B05b schema review. Exact command, generation time and source/catalog SHA-256s are in `supabase/baseline/type-source.json`. Do not hand-edit generated types or copy them into web/mobile.

`Database`, `Tables`, `TablesInsert`, `TablesUpdate`, `Enums` and `Json` are type-only exports from `@shared` (web) / `@cellarsnap/shared` (mobile). These describe physical storage, not safe public responses or validated user input. Keep domain DTOs, privacy projections and runtime validators distinct. In particular the stored 1–100 rating is not a public display contract.

## Bounded client/query adoption

- Web browser: `createTypedSupabaseBrowserClient()` constructs `createBrowserClient<Database>` and keeps one cached instance. Existing `createSupabaseBrowserClient()` preserves its previous inferred legacy return shape and returns **that same instance**.
- Web server: `createTypedSupabaseServerClient()` uses `createServerClient<Database>` in both cookie modes with unchanged auth/cookie options. The old factory is a named migration bridge preserving the existing caller surface. Server clients remain per-request.
- Mobile: `supabaseDatabase` constructs `createClient<Database>` with unchanged persistence, secure-storage fallback, PKCE and refresh behavior. Legacy `supabase` references the **same client**; there is no second session manager or auth subscription.
- Adopted first slice: web grape browsing joins, `/api/grapes` lookups, and Expo Explore Browse's owner-filtered producer query. Query results now infer from the schema; the nested grape/producer casts were removed. HTTP DTOs and UI ranking/filtering remain unchanged.
- B05d: `requireTypedRequestAuth()` returns `SupabaseClient<Database>` for both cookie and bearer modes through a shared resolver. `/api/grapes` adopts it; the legacy auth export preserves existing caller/test contracts. No second session owner.
- Still unadopted: legacy exports' consumers, admin factory boundaries, scoring/badges/entry mutation queries and broader public projections. **AUD-21 remains Partial.** Do not erase generated constraints with per-query casts to make those slices compile; resolve each actual schema/domain discrepancy on its original finding ID.

## Regeneration and CI

First review the live catalog using `node scripts/schema/check-live.mjs` with securely supplied libpq environment variables. If it differs, reconcile the intended forward migration and catalog rather than regenerating types from an unreviewed schema. Then run the exact generation command from `type-source.json` into a temporary file, review its diff, replace the one shared file, and record new source/catalog hashes and generation metadata.

`npm run test:schema` checks artifact hashes and all 51 public table column names, nullability, insert requirements and update optionality against the catalog. Its full replay also covers relationships/constraints and access semantics. `npm run test:database-types` compiles positive relationship/nullable-row contracts and negative unknown-table, missing-owner, wrong-rating, invalid-RPC and nonexistent-column contracts. Both commands run in CI. Whole web/mobile TypeScript, builds/exports and browser/Expo checks validate the actual adopted consumers. A matching hash alone is not schema review or generated-type validation.

## Supported environment and retirement boundary

The supported database contract for this slice is the reviewed B05b capture of the deployed PostgreSQL 17.6 schema through hosted migration `20260913020752` (`restrict_contact_resolution`), plus reviewed future app migrations appended after the B05b manifest cutoff. It intentionally does not invent `wine_entries.ai_notes_summary` or `grape_aliases.alias_type` (AUD-10). JSON column types remain JSON; domain validation is not replaced by generated types.

Web and Expo SDK 56 source/export builds are checked together. No minimum installed native binary/OTA version can be asserted from available evidence, and no native client was distributed here. Existing compatibility branches remain; AUD-20 requires fallback telemetry and an explicit supported installed-client window before retirement. Full Auth/Storage provisioning and reviewed corpus restoration remain AUD-19 prerequisites for a complete fresh product environment.
