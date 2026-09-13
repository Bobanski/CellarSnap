# B06b badge authority and stored-fact contract

AUD-09, issue #112. This is a bounded repair, not closure of all badge behavior.

- Server authentication fixes the award owner; request entry hints, counts, ratings and submitted user IDs are not evidence. The authenticated Supabase client reads persisted owner rows. Only the server's service client inserts award rows.
- Consumed entry rows count as tastings, including separately owned shared tasting copies. Unopened cellar inventory is excluded. Keyset pages continue to an empty page, even when the service caps a page below 500 rows. Grapes are read from `entry_primary_grapes` and canonical `grape_varieties.name`; multiple matching links count once per tasting.
- Matching is full normalized equality (case, accents, underscores/hyphens and whitespace), not substring inference or a synonym/region hierarchy. Region or appellation can match; country uses the stored country. Unknown fields never establish positive evidence. Min-region/min-producer constraints apply to matching tastings only.
- All 85 definitions remain. **53** have supported stored categorical/milestone contracts. **32** return explicit `deferred`, including compounds with deferred children. Rating/sensory/terroir/social/manual/QPR semantics need authoritative sources and thresholds. `challenge-winner` and `cellar-master` are explicitly deferred despite their current `entry_count` definitions: their descriptions refer to challenges and ageing stock, not consumed tastings. No invented 1–5 or numeric “love” cutoff.
- Existing award reads/writes are checked. Insert uses conflict-ignore and returns only actual inserted IDs, so retries and concurrent losers do not produce award toasts. Existing awards and timestamps are preserved; no historic reclassification/backfill.
- Migration `20260913061822_server_authoritative_badge_awards.sql` drops own-award insertion and revokes client table privileges except authenticated SELECT. Existing read policy and service grants remain. No table/column signature change; generated database types remain valid. Baseline capture is immutable; schema comparison records only this reviewed policy/grant delta.

## Remaining AUD-09 work

Establish authoritative sensory/rating/social/challenge/cellar facts for the 32 deferred definitions, correct their published trigger contracts, and add actual qualifying/denied fixtures. Current category strings do not encode natural/biodynamic/oak/terroir facts. Historical award correctness has not been audited. Profile featured-badge columns remain directly user-editable; their UI can render a definition without joining earned rows, despite the featured API checking eligibility. Enforce that separate presentation boundary in a subsequent authority slice, preserving legitimate feature/unfeature actions. Native runtime and distribution remain unverified.

## Release order

Deploy server writer and apply the exact forward migration in a coordinated window. Applying grants first briefly causes the old client writer to fail (old code awards nothing anyway); deploying writer first leaves the preexisting own-insert exposure until migration. Never roll back by broadly regranting client writes. Revert/redeploy server changes if required while retaining the tightened authority boundary; pause awards if necessary.
