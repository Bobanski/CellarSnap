# Reviewed grape alias seed contract (B05e / QC-14)

`grape-aliases.json` captures the 131 existing public reference spellings and their 93 canonical variety slugs/names on September 13, 2026. It contains no generated database IDs. Generate a reviewed seed script with:

```sh
node scripts/reference/grape-alias-seed.mjs > /tmp/grape-alias-seed.sql
```

The generator does not connect to any database. Its SQL requires the canonical varieties to exist and fails on a missing slug or conflicting existing key owner. Repeated application is safe for an approved seed target. This is the alias portion of fresh setup; managed services, other reference data and corpus restoration remain AUD-19. Never replay historical SQL on production, and do not use this seed to replace the forward repair.

Normalization matches existing web/mobile lookup semantics: lowercase ASCII first, replace runs outside `a-z0-9` with one space, trim. Punctuation is a separator; accents are not transliterated. All captured spellings are ASCII. The generator/repair fail on non-ASCII input so an accent policy cannot change silently. Examples: `SHIRAZ` → `shiraz`, `PX` → `px`, `Nero d'Avola` → `nero d avola`.

Reviewed collision: `Xarel-lo` and `Xarel Lo` both normalize to `xarel lo` and reference the same variety. Keep canonical spelling `Xarel-lo`; both user queries still resolve to its unchanged canonical ID. The resulting seed has 130 keys. No cross-variety collisions were found. Future cross-variety collisions fail for explicit review instead of choosing a winner.

Forward migration `20260913075619_repair_grape_alias_keys.sql` repairs only known historical encodings or already-correct keys. It locks alias writes, rejects unexpected encodings/consumers, consolidates only same-owner equivalent keys, uses transaction-local intermediate keys to avoid transient uniqueness collisions, and preserves every surviving row's ID and timestamp. Hosted preflight found zero FK consumers of alias-row IDs; application lookups consume variety IDs. Canonical varieties and entry joins are never rewritten. The historical migrations/baseline remain immutable.

Verification lives in `scripts/schema/grape-aliases.test.mjs`; the canonical backlog and B05e handover record merge, migration and live acceptance independently.
