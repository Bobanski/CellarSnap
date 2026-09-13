# Reviewed schema baseline — B05b, September 13, 2026

This is a **schema contract and disposable replay**, not a production migration or complete Supabase backup. Never apply `app.sql`, the fixtures, or the historical manifest prefix to an existing hosted database. AUD-19 remains Partial for full managed-service provisioning and reviewed seed restoration.

## Contents and boundaries

- `app.sql`: PostgreSQL 17.6 schema-only capture of **public and private**. Includes 51 public tables, one view, 18 sequences, 650 columns, 146 indexes, 204 constraints, 34 app functions, enums, RLS, privileges and default privileges. Definitions and owners are preserved, including known defects. Only pg_dump's random psql restrict/unrestrict lines were removed; capture SQL is otherwise unchanged.
- `auth-hooks.sql`: two actual app-owned triggers on `auth.users`. `auth.fixture.sql` supplies minimal Auth dependencies for isolated access tests. It does **not** implement GoTrue, identities, password hashing, token delivery or managed role membership. Do not use `create_test_account` against this fixture as an Auth test.
- `managed-storage.fixture.sql`: actual schema-only managed Storage capture. Used only to resolve and verify app Storage policies in replay; it is **not** an app migration or a supported replacement for the Storage service's migration runner. Existing B02b service/PostgREST tests remain necessary for HTTP/signing behavior.
- `catalog.json`: reviewed structural contract, compared after replay and by the read-only live checker. Captures app object ownership, functions/arguments/bodies, RLS/policies (including Storage), grants/default grants, triggers including Auth hooks, columns/defaults/nullability, enums, constraints, indexes, sequence configuration and schema grants. Extension-owned implementation objects are excluded; required versions are in `provenance.json`. PostgreSQL 18's added NOT NULL constraint rows are excluded because nullability is already compared at each column; no other constraint drift is ignored.
- `provenance.json`: live extension versions, hosted migration history and statement MD5s, original local manifest order/SHA-256s, artifact SHA-256s, publication membership and bucket settings. Original rollout handovers retain the authoritative remote/local SQL mapping (timestamps intentionally differ).
- `seed-contract.json`: counts and content fingerprints for 16 reference tables; **no production rows, user data, sessions or embeddings are exported**. A fresh replay deliberately has no reference corpus. Scoring/sommelier acceptance requires a separately reviewed seed/curated-ingestion artifact; synthetic test fixtures are not production seed coverage.

Managed extension requirements are vector 0.8.0 in public; pgcrypto/uuid-ossp in extensions for managed/test-account helpers; platform pg_stat_statements, Vault and plpgsql versions are inventoried. Only vector is needed by the exercised schema/access paths. Realtime publication membership was empty at capture; no publication or hosted setting is invented here. Auth/Storage service versions, installed native clients, secrets, buckets/objects and corpus restoration remain separate deployment prerequisites.

## Run and verify

```sh
npm ci
npm run test:schema
# Optional actual PostgreSQL 17 integration (requires installed pgvector 0.8.0):
node scripts/schema/replay-postgres.mjs /path/to/postgresql17/bin
# Supply libpq PGHOST/PGPORT/PGUSER/PGDATABASE/password/TLS variables securely:
node scripts/schema/check-live.mjs
```

The PGlite suite is self-contained and runs in CI. It proves complete catalog equality, detects six deliberately introduced drift categories, and exercises actual owner/stranger/anon access, the privileged-profile guard and service-only contact RPC authority. Actual PostgreSQL 17.6 replay additionally passed catalog equality and owner/stranger SQL access. Neither replaces browser/native or managed HTTP tests. `check-live.mjs` uses fixed read-only SQL, a read-only transaction, a 30-second statement timeout, and never applies a baseline. It fails on changed categories and does not print connection credentials.

The native script creates its own local cluster and destroys only that generated directory; it accepts a binary directory, never a target database URL. It inherits no PG credentials. PGlite uses PostgreSQL 18.3, and is reported separately from the actual PostgreSQL 17.6 run. For relocatable distributions, install extension files in the running server's actual extension/library directories.

## Forward workflow

`supabase/sql/manifest.txt` stays the single ordered app migration list. Its captured prefix is immutable historical evidence. The replay validates that prefix's filenames and checksums, creates the baseline, and applies **only the appended suffix**. It never replays the old scripts over the baseline.

For the next schema change, create the filename with `supabase migration new`, move the generated file to `supabase/sql/`, append it to the manifest, and develop/test it on a disposable replay. Review the intended catalog change and update `catalog.json` deliberately; never blindly bless a live drift result. Keep the original baseline SQL/provenance immutable. Add role/behavior checks appropriate to the change. Capture relevant live state read-only before rollout, apply only the reviewed forward file, and record its exact hosted version/checksum plus live acceptance in a release handover. Do not repair/renumber hosted history to imitate local filenames.

The existing CLI reset configuration is **not** presented as a working full product setup; this slice provides the explicit replay command above. Before adopting full CLI resets/branches, finish the managed-platform bootstrap and reviewed reference/knowledge seed artifacts. Do not delete old fallback branches or set a native minimum version based on schema replay alone (AUD-20/AUD-08).

Known missing `wine_entries.ai_notes_summary`, `grape_aliases.alias_type`, absent historical 096 intentions and badge authority issues remain on their existing AUD IDs. Capturing them does not approve them or silently fix them.
