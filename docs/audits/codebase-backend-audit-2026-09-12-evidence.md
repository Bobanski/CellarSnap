# CellarSnap audit — evidence appendix

**Captured September 12, 2026.** Companion to [the prioritized audit](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/docs/audits/codebase-backend-audit-2026-09-12.md>).

This appendix records schema metadata, aggregate statistics, code locations, and local check results. It contains no user records, authentication tokens, or personal embedding contents. Live row counts below are the table-inventory snapshot, not a guaranteed transactionally consistent count across all tables.

## Coverage map

| Area | Inspection |
|---|---|
| Web routes and components | Repository inventory/import analysis; manual entry, feed, home, profile, friends, cellar, explore, palate, badge, photo, import, and notification paths |
| Native app | Route/support inventory; entry creation/detail, library/feed, profile, photos, API adapters, notification state, theme, and build configuration |
| Shared package | Domain schemas, badges, scoring/preference primitives, formatting, normalization, platform re-exports |
| Backend services | Auth/access, entry persistence, groups/shares/collections, scoring/cache/materialization, scan parsing/inference, sommelier ingestion/retrieval |
| Database | All 50 public table definitions, public view, 142 indexes, 24 non-extension public functions, 106 public/storage policies, public triggers, role grants, migration history, advisor results |
| Supporting project | Marketing site, scripts, package locks, lint/TypeScript/build/test configuration, existing audits and architecture guidance |
| Runtime validation | Local type/lint checks, 157 selected mock/pure tests, isolated webpack build, historical SQL aggregate statistics |
| Not exercised | Production browser/mobile flows, live mutations, fresh schema replay, load/penetration tests, paid model calls, real-device rendering/network profiles |

## Live public table inventory

All 50 tables have RLS enabled. RLS being enabled does not establish that policies are restrictive enough. “Missing” means no CREATE TABLE declaration found in the repository's 73 SQL files; it does not mean the table is unused.

| Table | Reported rows | Columns | Primary key | Local CREATE |
|---|---:|---:|---|---|
| `aging_curve_baselines` | 40 | 70 | id | **Missing** |
| `api_rate_limits` | 56 | 5 | route_key, subject | Present |
| `appellation_grape_map` | 922 | 12 | id | **Missing** |
| `base_profiles` | 205 | 42 | id | **Missing** |
| `cellar_custom_field_defs` | 0 | 6 | id | Present |
| `cellar_custom_field_values` | 0 | 5 | id | Present |
| `classification_tier_aging_modifiers` | 40 | 11 | id | **Missing** |
| `classification_tier_modifiers` | 55 | 27 | id | **Missing** |
| `content_reports` | 0 | 10 | id | Present |
| `entry_comments` | 14 | 8 | id | Present |
| `entry_comparison_feedback` | 126 | 6 | id | Present |
| `entry_group_slides` | 107 | 7 | id | Present |
| `entry_groups` | 34 | 8 | id | Present |
| `entry_photos` | 473 | 6 | id | Present |
| `entry_primary_grapes` | 267 | 5 | id | Present |
| `entry_reactions` | 36 | 5 | id | Present |
| `friend_notifications` | 41 | 7 | id | **Missing** |
| `friend_requests` | 55 | 7 | id | Present |
| `general_knowledge_chunks` | 560 | 7 | id | Present |
| `grape_aliases` | 131 | 5 | id | Present |
| `grape_sensitivity_coefficients` | 61 | 13 | id | **Missing** |
| `grape_varieties` | 93 | 4 | id | Present |
| `knowledge_documents` | 13 | 13 | id | Present |
| `launch_feedback` | 4 | 8 | id | Present |
| `list_scan_results` | 99 | 9 | scan_id | Present |
| `list_scan_wines` | 5420 | 17 | id | Present |
| `palate_profiles` | 2 | 6 | user_id | Present |
| `post_shares` | 15 | 7 | id | Present |
| `producer_aliases` | 1695 | 4 | id | **Missing** |
| `producer_modifiers` | 705 | 24 | id | **Missing** |
| `producer_region_crosswalk` | 91 | 6 | id | **Missing** |
| `profiles` | 64 | 18 | id | Present |
| `region_aliases` | 809 | 6 | id | **Missing** |
| `scan_resolution_log` | 303 | 18 | id | Present |
| `sommelier_conversations` | 113 | 5 | id | Present |
| `sommelier_messages` | 267 | 6 | id | Present |
| `taste_survey_responses` | 12 | 15 | id | Present |
| `taxonomy_classification_tiers` | 133 | 9 | id | **Missing** |
| `taxonomy_master_v2` | 89 | 11 | id | **Missing** |
| `taxonomy_price_ranges` | 8 | 4 | id | **Missing** |
| `user_badges` | 50 | 4 | id | Present |
| `user_blocks` | 0 | 3 | blocker_id, blocked_id | Present |
| `user_collection_items` | 9 | 12 | id | Present |
| `user_collections` | 5 | 6 | id | Present |
| `vintage_weather_modifiers` | 2150 | 48 | id | **Missing** |
| `wine_entries` | 384 | 56 | id | Present |
| `wine_entry_scores` | 56 | 14 | id | Present |
| `wine_knowledge_chunks` | 3521 | 8 | id | Present |
| `wine_notifications` | 63 | 7 | id | Present |
| `wine_profiles` | 67 | 12 | id | Present |

The live migration history contained 30 entries, many for reference-data seed chunks. That history is not equivalent to replaying the 73-file local manifest. No deployed Edge Functions were listed.

Other aggregate observations: 257 public / 66 friends / 61 private wine entries; 183 entries have null assembled sensory data; 172 knowledge chunks reference wine entries, with zero orphan entry references at inspection time. The counts establish data categories and coverage, not quality or resolvability.

## Selected live policy definitions

The following are catalog excerpts, not proposed migration SQL. PostgreSQL permissive policies combine with OR, so a broad SELECT policy can defeat a narrower owner policy. See the [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security).

### public.profiles: Users can insert their profile

- Command: INSERT; mode: PERMISSIVE; roles: `public`.

```sql
USING: (not applicable/not specified)
WITH CHECK: (auth.uid() = id)
```

### public.profiles: Users can update their profile

- Command: UPDATE; mode: PERMISSIVE; roles: `public`.

```sql
USING: (auth.uid() = id)
WITH CHECK: (not applicable/not specified)
```

### public.profiles: Users can view their own profile

- Command: SELECT; mode: PERMISSIVE; roles: `public`.

```sql
USING: (auth.uid() = id)
WITH CHECK: (not applicable/not specified)
```

### public.wine_entries: Authenticated users can view wine entries

- Command: SELECT; mode: PERMISSIVE; roles: `public`.

```sql
USING: (auth.role() = 'authenticated'::text)
WITH CHECK: (not applicable/not specified)
```

### public.wine_entries: Users can view own wine entries

- Command: SELECT; mode: PERMISSIVE; roles: `public`.

```sql
USING: (auth.uid() = user_id)
WITH CHECK: (not applicable/not specified)
```

### public.wine_knowledge_chunks: wine_knowledge_chunks_select_authenticated

- Command: SELECT; mode: PERMISSIVE; roles: `authenticated`.

```sql
USING: true
WITH CHECK: (not applicable/not specified)
```

### public.user_badges: Users can insert own badges

- Command: INSERT; mode: PERMISSIVE; roles: `public`.

```sql
USING: (not applicable/not specified)
WITH CHECK: (auth.uid() = user_id)
```

### storage.objects: Authenticated users can read wine photos

- Command: SELECT; mode: PERMISSIVE; roles: `public`.

```sql
USING: ((bucket_id = 'wine-photos'::text) AND (auth.role() = 'authenticated'::text))
WITH CHECK: (not applicable/not specified)
```

### storage.objects: Public read access for public-assets

- Command: SELECT; mode: PERMISSIVE; roles: `public`.

```sql
USING: (bucket_id = 'public-assets'::text)
WITH CHECK: (not applicable/not specified)
```

### storage.objects: Service role can update public-assets

- Command: UPDATE; mode: PERMISSIVE; roles: `public`.

```sql
USING: (bucket_id = 'public-assets'::text)
WITH CHECK: (not applicable/not specified)
```

### storage.objects: Service role can upload to public-assets

- Command: INSERT; mode: PERMISSIVE; roles: `public`.

```sql
USING: (not applicable/not specified)
WITH CHECK: (bucket_id = 'public-assets'::text)
```

A missing explicit WITH CHECK on an UPDATE policy is not itself proof of an ownership bypass: PostgreSQL can reuse USING. The profile issue is that the owner is allowed to change a privileged column on their own row.

Underlying role grants also matter. Both anon and authenticated have storage.objects INSERT/UPDATE/SELECT grants. Both have broad public-table privileges where cataloged; policies then determine row access. No upload, flag change, or private-content retrieval was attempted.

### Public profile view

View options were null, so this is not a security-invoker view.

```sql
 SELECT id,
        CASE
            WHEN ((COALESCE(name_display_preference, 'real_name'::text) = 'real_name'::text) AND (NULLIF(btrim(first_name), ''::text) IS NOT NULL)) THEN concat(btrim(first_name),
            CASE
                WHEN (NULLIF(btrim(last_name), ''::text) IS NOT NULL) THEN ((' '::text || upper("left"(btrim(last_name), 1))) || '.'::text)
                ELSE ''::text
            END)
            ELSE NULLIF(btrim(display_name), ''::text)
        END AS display_name,
    NULLIF(btrim(display_name), ''::text) AS username,
    first_name,
    last_name,
    name_display_preference,
    avatar_path,
    created_at,
    NULL::text AS email,
    is_test_account
   FROM profiles;
```

### Privileged test-account and knowledge retrieval functions

Selected exact live definitions follow. These help explain the access chains in findings 03–05; they are not recommendations to execute these functions.

#### is_test_account

SECURITY DEFINER: true; anon EXECUTE: true; authenticated EXECUTE: true.

```sql
CREATE OR REPLACE FUNCTION public.is_test_account(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if user_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.profiles
    where id = user_id
      and coalesce(is_test_account, false)
  );
end;
$function$
```

#### can_view_entry

SECURITY DEFINER: true; anon EXECUTE: true; authenticated EXECUTE: true.

```sql
CREATE OR REPLACE FUNCTION public.can_view_entry(viewer_id uuid, owner_id uuid, privacy text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.can_view_entry_standard(viewer_id, owner_id, privacy) then
    return true;
  end if;

  if viewer_id is null or owner_id is null then
    return false;
  end if;

  if public.is_user_blocked(viewer_id, owner_id) then
    return false;
  end if;

  if not public.can_view_test_authored_content(viewer_id, owner_id) then
    return false;
  end if;

  return public.is_test_account(viewer_id);
end;
$function$
```

#### get_email_for_username

SECURITY DEFINER: true; anon EXECUTE: true; authenticated EXECUTE: true.

```sql
CREATE OR REPLACE FUNCTION public.get_email_for_username(username text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  result text;
begin
  select coalesce(users.email, profiles.email) into result
  from public.profiles profiles
  join auth.users users on users.id = profiles.id
  where lower(profiles.display_name) = lower(trim(username))
  order by profiles.id
  limit 1;
  return result;
end;
$function$
```

#### match_wine_knowledge

SECURITY DEFINER: false; anon EXECUTE: true; authenticated EXECUTE: true.

```sql
CREATE OR REPLACE FUNCTION public.match_wine_knowledge(query_embedding vector, match_threshold double precision DEFAULT 0.72, match_count integer DEFAULT 5)
 RETURNS TABLE(id bigint, content text, similarity double precision, metadata jsonb)
 LANGUAGE sql
 STABLE
AS $function$
  select
    wkc.id,
    wkc.content,
    1 - (wkc.embedding <=> query_embedding) as similarity,
    wkc.metadata
  from public.wine_knowledge_chunks wkc
  where wkc.embedding is not null
    and 1 - (wkc.embedding <=> query_embedding) > match_threshold
  order by wkc.embedding <=> query_embedding
  limit match_count;
$function$
```

#### match_user_entries

SECURITY DEFINER: false; anon EXECUTE: true; authenticated EXECUTE: true.

```sql
CREATE OR REPLACE FUNCTION public.match_user_entries(query_embedding vector, target_user_id uuid, match_threshold double precision DEFAULT 0.55, match_count integer DEFAULT 5)
 RETURNS TABLE(id bigint, content text, similarity double precision, metadata jsonb)
 LANGUAGE sql
 STABLE
AS $function$
  select
    wkc.id,
    wkc.content,
    1 - (wkc.embedding <=> query_embedding) as similarity,
    wkc.metadata
  from public.wine_knowledge_chunks wkc
  where wkc.embedding is not null
    and wkc.source_table = 'wine_entries'
    and wkc.metadata->>'user_id' = target_user_id::text
    and 1 - (wkc.embedding <=> query_embedding) > match_threshold
  order by wkc.embedding <=> query_embedding
  limit match_count;
$function$
```

## Advisor results and interpretation

These are grouped advisor observations, not an equal number of independently proven defects.

| Advisor group | Severity | Findings | Interpretation |
|---|---|---:|---|
| [rls_enabled_no_policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) | INFO | 1 | api_rate_limits appears deliberately service-only. Do not add public policies just to silence this. |
| [security_definer_view](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view) | ERROR | 1 | public_profiles needs a deliberate public projection; see finding 06. |
| [function_search_path_mutable](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable) | WARN | 4 | Set a fixed safe search path and schema-qualify referenced objects after checking extension/type dependencies. |
| [extension_in_public](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public) | WARN | 1 | Consider relocating vector to a dedicated extensions schema in a tested migration; update vector types/operators and dependent functions together. |
| [anon_security_definer_function_executable](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) | WARN | 18 | Review caller checks and revoke unnecessary anonymous exposure, particularly contact lookup RPCs. |
| [authenticated_security_definer_function_executable](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) | WARN | 18 | Same 18 functions as the anon group, not 18 additional functions. Some helpers are intentionally privileged. |
| [auth_leaked_password_protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) | WARN | 1 | Enable compromised-password checks if supported by the project plan; validate password change/signup UX. No setting was changed. |
| [unindexed_foreign_keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) | INFO | 11 | Prioritize actual joins/deletion paths; list below. |
| [auth_rls_initplan](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan) | WARN | 78 | Wrap row-independent auth calls where semantics allow; validate plans and policies. |
| [unused_index](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) | INFO | 13 | Investigate actual redundancy and observation window; do not delete all zero-scan indexes. |
| [multiple_permissive_policies](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies) | WARN | 37 | Repair privacy semantics first, then consolidate equivalent paths. |
| [auth_db_connections_absolute](https://supabase.com/docs/guides/deployment/going-into-prod) | INFO | 1 | Consider percentage-based Auth connection allocation if compute capacity changes; not an observed current bottleneck. |

Mutable-search-path functions: `set_updated_at`, `match_wine_knowledge`, `match_general_knowledge`, `match_user_entries`.

The exposed definer-function list includes trigger functions. PostgreSQL does not allow ordinary invocation of a trigger function as if it were a normal RPC; an advisor EXECUTE finding alone does not establish that such a function is exploitable. Ordinary helper functions still need caller/parameter review.

### Foreign keys without covering indexes

- `content_reports_comment_id_fkey`
- `content_reports_entry_id_fkey`
- `content_reports_target_user_id_fkey`
- `entry_reactions_user_id_fkey`
- `friend_notifications_actor_id_fkey`
- `friend_notifications_friend_request_id_fkey`
- `user_collection_items_entry_id_fkey`
- `user_collection_items_snapshot_entry_group_id_fkey`
- `wine_entries_cellared_from_id_fkey`
- `wine_notifications_actor_id_fkey`
- `wine_notifications_entry_id_fkey`

### Index definitions relevant to consolidation

```sql
CREATE UNIQUE INDEX vintage_weather_modifiers_pkey ON public.vintage_weather_modifiers USING btree (id);
CREATE INDEX vintage_weather_modifiers_lookup_idx ON public.vintage_weather_modifiers USING btree (country, region, vintage);
CREATE UNIQUE INDEX wine_profiles_profile_type_slug_audience_mode_key ON public.wine_profiles USING btree (profile_type, slug, audience_mode);
CREATE INDEX idx_wine_profiles_type_slug_mode ON public.wine_profiles USING btree (profile_type, slug, audience_mode);
CREATE UNIQUE INDEX wine_profiles_pkey ON public.wine_profiles USING btree (id);
CREATE UNIQUE INDEX general_knowledge_chunks_pkey ON public.general_knowledge_chunks USING btree (id);
CREATE UNIQUE INDEX general_knowledge_chunks_document_id_chunk_index_key ON public.general_knowledge_chunks USING btree (document_id, chunk_index);
CREATE INDEX idx_general_knowledge_embedding ON public.general_knowledge_chunks USING hnsw (embedding vector_cosine_ops) WHERE (embedding IS NOT NULL);
CREATE INDEX idx_general_knowledge_document ON public.general_knowledge_chunks USING btree (document_id, chunk_index);
```

Both embedding tables already have HNSW indexes. Match quality, planner choices, operator classes, and real cardinality should be inspected before changing the vector-index strategy.

### Live noninternal public triggers

```sql
CREATE TRIGGER wine_entries_tag_notifications AFTER INSERT OR UPDATE OF tasted_with_user_ids ON public.wine_entries FOR EACH ROW EXECUTE FUNCTION handle_wine_tag_notifications();
CREATE TRIGGER friend_request_accept_notifications AFTER UPDATE OF status ON public.friend_requests FOR EACH ROW EXECUTE FUNCTION handle_friend_request_accept_notifications();
CREATE TRIGGER entry_comments_validate_parent BEFORE INSERT OR UPDATE OF entry_id, parent_comment_id ON public.entry_comments FOR EACH ROW EXECUTE FUNCTION validate_entry_comment_parent();
CREATE TRIGGER knowledge_documents_set_updated_at BEFORE UPDATE ON public.knowledge_documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sommelier_conversations_set_updated_at BEFORE UPDATE ON public.sommelier_conversations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

The six intended updated_at triggers absent live are for api_rate_limits, entry_groups, palate_profiles, wine_entry_scores, user_collections, and taste_survey_responses. entry_comments already has its update trigger. wine_entries has no updated_at column.

## Historical database workload

Statistics reset at **2026-02-07 05:58:58 UTC**. The examples below mix prior releases and users; they do not measure the current release in isolation. Database time excludes network, browser/native rendering, and most external AI latency. Calls are database statements, not necessarily one per user action.

| Representative statement | Role | Calls | Mean database ms | Cumulative database ms |
|---|---|---:|---:|---:|
| Producer modifiers | service_role | 13,836 | 141.87 | 1962883.1 |
| Vintage lookup | service_role | 22,599 | 16.85 | 380804.8 |
| Entry photo IDs | authenticated | 6,720 | 52.56 | 353222.6 |
| Storage object lookup | authenticated | 457,965 | 0.62 | 284116.4 |
| Primary grapes with variety | authenticated | 15,288 | 17.21 | 263152.1 |
| Knowledge vector match | service_role | 161 | 1116.01 | 179677.4 |
| Base sensory profiles | service_role | 14,865 | 9.79 | 145549.9 |
| Entry reactions | authenticated | 7,765 | 16.71 | 129721.5 |
| Unread notification rows | authenticated | 227,361 | 0.25 | 56413.3 |

Repeated reference and photo reads support investigating request reduction. They do not prove all historical calls still occur after the existing reference cache and bulk-signing improvements. Vector matching's historical mean warrants a representative EXPLAIN investigation; no new index or tuning change is prescribed without it.

## Exact duplicate function inventory

All 74 groups detected across different files are listed. Token comparison ignores whitespace/comments, but includes identifier spelling and function bodies. Anonymous callbacks and nested functions can overlap. This is a candidate list for semantic review, not a list of 74 safe extractions. Line counts can differ because formatting differs.

| Group | Function name(s) | Lines per occurrence | Locations |
|---|---|---|---|
| 1 | `handleCropResponderMove` | 69, 68 | [apps/mobile/src/screens/entries/NewEntryScreenContainer.tsx:1464](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/entries/NewEntryScreenContainer.tsx:1464>); [apps/mobile/app/(app)/entries/[id].tsx:2575](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/entries/[id].tsx:2575>) |
| 2 | `sendRequest` | 32, 29, 32 | [src/app/friends/page.tsx:176](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/friends/page.tsx:176>); [src/app/profile/page.tsx:472](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/profile/page.tsx:472>); [src/components/palate/FriendsTab.tsx:175](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/components/palate/FriendsTab.tsx:175>) |
| 3 | `<callback>` | 55, 55 | [src/app/friends/page.tsx:120](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/friends/page.tsx:120>); [src/components/palate/FriendsTab.tsx:119](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/components/palate/FriendsTab.tsx:119>) |
| 4 | `<callback>` | 42, 42 | [src/app/friends/page.tsx:499](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/friends/page.tsx:499>); [src/components/palate/FriendsTab.tsx:477](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/components/palate/FriendsTab.tsx:477>) |
| 5 | `normalizeVariety` | 13, 11, 11, 11 | [src/lib/primaryGrapes.ts:21](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/lib/primaryGrapes.ts:21>); [apps/mobile/src/lib/feed/feedPage.ts:237](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/lib/feed/feedPage.ts:237>); [apps/mobile/app/(app)/entries/[id].tsx:643](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/entries/[id].tsx:643>); [apps/mobile/app/(app)/entries/index.tsx:201](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/entries/index.tsx:201>) |
| 6 | `<callback>` | 39, 39 | [src/server/entries/schema.ts:200](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/entries/schema.ts:200>); [packages/shared/src/entries.ts:199](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/packages/shared/src/entries.ts:199>) |
| 7 | `<callback>` | 38, 38 | [src/features/listScan/ListScanResultsScreen.tsx:746](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/listScan/ListScanResultsScreen.tsx:746>); [apps/mobile/src/screens/listScan/ListScanResultsScreen.tsx:365](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/listScan/ListScanResultsScreen.tsx:365>) |
| 8 | `toOrdinal` | 12, 12, 12, 12 | [src/components/SwipePhotoGallery.tsx:18](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/components/SwipePhotoGallery.tsx:18>); [src/features/entries/edit/EditEntryScreenContainer.tsx:113](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/edit/EditEntryScreenContainer.tsx:113>); [src/features/entries/new/NewEntryScreenContainer.tsx:162](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/new/NewEntryScreenContainer.tsx:162>); [apps/mobile/app/(app)/entries/[id].tsx:626](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/entries/[id].tsx:626>) |
| 9 | `<callback>` | 36, 36 | [src/features/listScan/ListScanResultsScreen.tsx:747](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/listScan/ListScanResultsScreen.tsx:747>); [apps/mobile/src/screens/listScan/ListScanResultsScreen.tsx:366](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/listScan/ListScanResultsScreen.tsx:366>) |
| 10 | `<callback>` | 34, 36 | [src/app/taste-survey/page.tsx:169](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/taste-survey/page.tsx:169>); [apps/mobile/app/(app)/taste-survey/index.tsx:148](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/taste-survey/index.tsx:148>) |
| 11 | `<callback>` | 33, 33 | [src/app/friends/page.tsx:135](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/friends/page.tsx:135>); [src/components/palate/FriendsTab.tsx:134](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/components/palate/FriendsTab.tsx:134>) |
| 12 | `respondToRequest` | 31, 31 | [src/app/friends/page.tsx:209](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/friends/page.tsx:209>); [src/components/palate/FriendsTab.tsx:208](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/components/palate/FriendsTab.tsx:208>) |
| 13 | `buildScanProgress` | 31, 24 | [src/features/listScan/ListScanIntakeScreen.tsx:162](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/listScan/ListScanIntakeScreen.tsx:162>); [apps/mobile/src/screens/listScan/ListScanIntakeScreen.tsx:79](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/listScan/ListScanIntakeScreen.tsx:79>) |
| 14 | `deleteRequest` | 28, 28 | [src/app/friends/page.tsx:241](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/friends/page.tsx:241>); [src/components/palate/FriendsTab.tsx:240](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/components/palate/FriendsTab.tsx:240>) |
| 15 | `isMissingGroupedPostSchemaError` | 9, 9, 9, 9 | [src/app/api/entries/[id]/deleteHandler.ts:7](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/entries/[id]/deleteHandler.ts:7>); [src/app/api/entries/[id]/putHandler.ts:28](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/entries/[id]/putHandler.ts:28>); [src/app/api/entries/bulk-group/handler.ts:29](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/entries/bulk-group/handler.ts:29>); [src/server/entries/groupPosts.ts:62](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/entries/groupPosts.ts:62>) |
| 16 | `<callback>` | 27, 20 | [src/app/entries/page.tsx:1009](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/entries/page.tsx:1009>); [apps/mobile/app/(app)/entries/index.tsx:622](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/entries/index.tsx:622>) |
| 17 | `<callback>` | 13, 13, 13 | [src/features/entries/edit/EditEntryScreenContainer.tsx:2422](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/edit/EditEntryScreenContainer.tsx:2422>); [src/features/entries/new/NewEntryScreenContainer.tsx:3852](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/new/NewEntryScreenContainer.tsx:3852>); [src/features/entries/new/NewEntryScreenContainer.tsx:4390](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/new/NewEntryScreenContainer.tsx:4390>) |
| 18 | `asErrorLike` | 26, 26 | [src/lib/schemaHealth.ts:150](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/lib/schemaHealth.ts:150>); [src/server/friends/transition.ts:48](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/friends/transition.ts:48>) |
| 19 | `getCropGeometry`, `<callback>` | 26, 26 | [apps/mobile/src/screens/entries/NewEntryScreenContainer.tsx:536](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/entries/NewEntryScreenContainer.tsx:536>); [apps/mobile/app/(app)/entries/[id].tsx:2069](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/entries/[id].tsx:2069>) |
| 20 | `<callback>` | 26, 26 | [apps/mobile/app/(auth)/sign-in.tsx:47](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(auth)/sign-in.tsx:47>); [apps/mobile/app/(auth)/sign-up.tsx:63](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(auth)/sign-up.tsx:63>) |
| 21 | `loadFriends` | 25, 25 | [src/app/friends/page.tsx:80](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/friends/page.tsx:80>); [src/components/palate/FriendsTab.tsx:79](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/components/palate/FriendsTab.tsx:79>) |
| 22 | `extractJson` | 8, 8, 8, 8 | [src/app/api/bottle-count/route.ts:21](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/bottle-count/route.ts:21>); [src/app/api/lineup-autofill/route.ts:210](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/lineup-autofill/route.ts:210>); [src/app/api/photo-context/route.ts:22](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/photo-context/route.ts:22>); [src/server/labelAutofill/extractWineLabel.ts:121](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/labelAutofill/extractWineLabel.ts:121>) |
| 23 | `countActiveFilterGroups` | 24, 24 | [src/features/listScan/ListScanResultsScreen.tsx:172](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/listScan/ListScanResultsScreen.tsx:172>); [apps/mobile/src/screens/listScan/ListScanResultsScreen.tsx:169](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/listScan/ListScanResultsScreen.tsx:169>) |
| 24 | `buildRegionSummary` | 24, 24 | [src/features/listScan/RegionFilterSelect.tsx:17](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/listScan/RegionFilterSelect.tsx:17>); [apps/mobile/src/screens/listScan/RegionFilterSelect.tsx:18](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/listScan/RegionFilterSelect.tsx:18>) |
| 25 | `handleCropResponderGrant` | 24, 23 | [apps/mobile/src/screens/entries/NewEntryScreenContainer.tsx:1439](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/entries/NewEntryScreenContainer.tsx:1439>); [apps/mobile/app/(app)/entries/[id].tsx:2551](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/entries/[id].tsx:2551>) |
| 26 | `buildSummary` | 23, 23 | [src/components/collections/CollectionPickerPopover.tsx:29](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/components/collections/CollectionPickerPopover.tsx:29>); [apps/mobile/src/components/collections/CollectionPickerModal.tsx:38](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/components/collections/CollectionPickerModal.tsx:38>) |
| 27 | `renderCheckbox` | 22, 22 | [src/features/entries/edit/EditEntryScreenContainer.tsx:2490](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/edit/EditEntryScreenContainer.tsx:2490>); [src/features/entries/new/NewEntryScreenContainer.tsx:4454](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/new/NewEntryScreenContainer.tsx:4454>) |
| 28 | `<callback>` | 22, 22 | [apps/mobile/src/screens/entries/NewEntryScreenContainer.tsx:660](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/entries/NewEntryScreenContainer.tsx:660>); [apps/mobile/app/(app)/feed/index.tsx:1650](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/feed/index.tsx:1650>) |
| 29 | `<callback>` | 19, 19 | [src/app/profile/page.tsx:177](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/profile/page.tsx:177>); [apps/mobile/app/(app)/profile/index.tsx:272](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/profile/index.tsx:272>) |
| 30 | `buildPriceSummary` | 19, 19 | [src/features/listScan/ListScanResultsScreen.tsx:79](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/listScan/ListScanResultsScreen.tsx:79>); [apps/mobile/src/screens/listScan/ListScanResultsScreen.tsx:69](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/listScan/ListScanResultsScreen.tsx:69>) |
| 31 | `buildWineTypeSummary` | 16, 16 | [src/features/listScan/ListScanResultsScreen.tsx:99](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/listScan/ListScanResultsScreen.tsx:99>); [apps/mobile/src/screens/listScan/ListScanResultsScreen.tsx:89](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/listScan/ListScanResultsScreen.tsx:89>) |
| 32 | `isMissingTestAccountSchemaError` | 8, 8, 8 | [src/lib/access/privateBetaFeatures.ts:11](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/lib/access/privateBetaFeatures.ts:11>); [src/lib/access/testAccounts.ts:5](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/lib/access/testAccounts.ts:5>); [src/lib/access/usePrivateBetaFeatureAccess.ts:8](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/lib/access/usePrivateBetaFeatureAccess.ts:8>) |
| 33 | `<callback>` | 15, 15 | [src/app/profile/page.tsx:180](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/profile/page.tsx:180>); [apps/mobile/app/(app)/profile/index.tsx:275](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/profile/index.tsx:275>) |
| 34 | `toggleCommentsExpanded`, `<callback>` | 14, 14 | [src/app/feed/page.tsx:560](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/feed/page.tsx:560>); [apps/mobile/src/lib/feed/useFeedInteractions.ts:203](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/lib/feed/useFeedInteractions.ts:203>) |
| 35 | `<callback>` | 14, 14 | [src/app/reset-password/phone/page.tsx:154](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/reset-password/phone/page.tsx:154>); [src/app/verify-phone/page.tsx:150](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/verify-phone/page.tsx:150>) |
| 36 | `<callback>` | 14, 14 | [src/features/entries/edit/EditEntryScreenContainer.tsx:2529](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/edit/EditEntryScreenContainer.tsx:2529>); [src/features/entries/new/NewEntryScreenContainer.tsx:4493](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/new/NewEntryScreenContainer.tsx:4493>) |
| 37 | `handleSubRegionToggle` | 14, 14 | [src/features/listScan/RegionFilterSelect.tsx:75](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/listScan/RegionFilterSelect.tsx:75>); [apps/mobile/src/screens/listScan/RegionFilterSelect.tsx:76](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/listScan/RegionFilterSelect.tsx:76>) |
| 38 | `<callback>` | 13, 13 | [src/app/api/algorithm/score/batch/handler.ts:76](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/algorithm/score/batch/handler.ts:76>); [src/app/api/algorithm/score/handler.ts:119](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/algorithm/score/handler.ts:119>) |
| 39 | `loadSharpFactory` | 13, 13 | [src/app/api/lineup-autofill/route.ts:219](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/lineup-autofill/route.ts:219>); [src/app/api/photo-crop/route.ts:51](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/photo-crop/route.ts:51>) |
| 40 | `loadUsers` | 13, 13 | [src/features/entries/edit/EditEntryScreenContainer.tsx:398](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/edit/EditEntryScreenContainer.tsx:398>); [src/features/entries/new/NewEntryScreenContainer.tsx:528](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/new/NewEntryScreenContainer.tsx:528>) |
| 41 | `profileInitial` | 12, 12 | [src/app/friends/page.tsx:52](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/friends/page.tsx:52>); [src/components/palate/FriendsTab.tsx:51](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/components/palate/FriendsTab.tsx:51>) |
| 42 | `<callback>` | 12, 12 | [src/features/entries/edit/EditEntryScreenContainer.tsx:2145](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/edit/EditEntryScreenContainer.tsx:2145>); [src/features/entries/new/NewEntryScreenContainer.tsx:4202](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/new/NewEntryScreenContainer.tsx:4202>) |
| 43 | `buildSummary` | 12, 12 | [src/features/listScan/FacetMultiSelect.tsx:17](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/listScan/FacetMultiSelect.tsx:17>); [apps/mobile/src/screens/listScan/FacetMultiSelect.tsx:19](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/listScan/FacetMultiSelect.tsx:19>) |
| 44 | `getPrimaryTouchPoint` | 12, 12 | [apps/mobile/src/screens/entries/NewEntryScreenContainer.tsx:1426](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/entries/NewEntryScreenContainer.tsx:1426>); [apps/mobile/app/(app)/entries/[id].tsx:2538](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/entries/[id].tsx:2538>) |
| 45 | `formatConsumedDate` | 12, 12 | [apps/mobile/app/(app)/entries/[id].tsx:389](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/entries/[id].tsx:389>); [apps/mobile/app/(app)/home/index.tsx:199](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/home/index.tsx:199>) |
| 46 | `<callback>` | 11, 12 | [src/app/api/algorithm/score/handler.ts:275](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/algorithm/score/handler.ts:275>); [src/server/listScan/parse.ts:1639](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/listScan/parse.ts:1639>) |
| 47 | `<callback>` | 11, 11 | [src/app/api/entries/[id]/comments/route.ts:482](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/entries/[id]/comments/route.ts:482>); [src/app/api/home/route.ts:98](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/home/route.ts:98>) |
| 48 | `getTouchDistance` | 11, 10 | [apps/mobile/src/screens/entries/NewEntryScreenContainer.tsx:1414](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/entries/NewEntryScreenContainer.tsx:1414>); [apps/mobile/app/(app)/entries/[id].tsx:2527](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/entries/[id].tsx:2527>) |
| 49 | `<callback>` | 10, 10 | [src/app/api/algorithm/score/batch/handler.ts:62](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/algorithm/score/batch/handler.ts:62>); [src/app/api/algorithm/score/handler.ts:105](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/algorithm/score/handler.ts:105>) |
| 50 | `<callback>` | 10, 10 | [src/app/cellar/add/page.tsx:75](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/cellar/add/page.tsx:75>); [apps/mobile/app/(app)/cellar-add/index.tsx:84](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/cellar-add/index.tsx:84>) |
| 51 | `<callback>` | 10, 10 | [src/app/feed/page.tsx:563](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/feed/page.tsx:563>); [apps/mobile/src/lib/feed/useFeedInteractions.ts:206](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/lib/feed/useFeedInteractions.ts:206>) |
| 52 | `<callback>` | 10, 10 | [src/features/entries/edit/EditEntryScreenContainer.tsx:2875](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/edit/EditEntryScreenContainer.tsx:2875>); [src/features/entries/new/NewEntryScreenContainer.tsx:4749](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/new/NewEntryScreenContainer.tsx:4749>) |
| 53 | `hasCustomWineTypeSelection` | 10, 10 | [src/features/listScan/ListScanResultsScreen.tsx:161](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/listScan/ListScanResultsScreen.tsx:161>); [apps/mobile/src/screens/listScan/ListScanResultsScreen.tsx:158](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/listScan/ListScanResultsScreen.tsx:158>) |
| 54 | `toggleFiltersVisibility` | 10, 10 | [src/features/listScan/ListScanResultsScreen.tsx:792](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/listScan/ListScanResultsScreen.tsx:792>); [apps/mobile/src/screens/listScan/ListScanResultsScreen.tsx:416](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/listScan/ListScanResultsScreen.tsx:416>) |
| 55 | `<callback>` | 10, 10 | [apps/mobile/src/screens/entries/NewEntryScreenContainer.tsx:793](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/entries/NewEntryScreenContainer.tsx:793>); [apps/mobile/app/(app)/entries/[id].tsx:1999](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/entries/[id].tsx:1999>) |
| 56 | `isMissingBlocksTableError` | 9, 9 | [src/app/api/users/[id]/block/route.ts:6](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/api/users/[id]/block/route.ts:6>); [src/lib/access/entryVisibility.ts:17](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/lib/access/entryVisibility.ts:17>) |
| 57 | `FriendAvatar` | 9, 9 | [src/app/friends/page.tsx:65](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/friends/page.tsx:65>); [src/components/palate/FriendsTab.tsx:64](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/components/palate/FriendsTab.tsx:64>) |
| 58 | `<callback>` | 9, 8 | [src/components/palate/TasteTab.tsx:235](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/components/palate/TasteTab.tsx:235>); [src/features/palate/PalateProfile.tsx:445](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/palate/PalateProfile.tsx:445>) |
| 59 | `<callback>` | 9, 9 | [src/features/entries/edit/EditEntryScreenContainer.tsx:581](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/edit/EditEntryScreenContainer.tsx:581>); [src/features/entries/new/NewEntryScreenContainer.tsx:658](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/new/NewEntryScreenContainer.tsx:658>) |
| 60 | `<callback>` | 9, 9 | [src/features/listScan/ListScanHistoryScreen.tsx:134](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/listScan/ListScanHistoryScreen.tsx:134>); [apps/mobile/src/screens/listScan/ListScanHistoryScreen.tsx:81](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/listScan/ListScanHistoryScreen.tsx:81>) |
| 61 | `summarizeSelectedLabels` | 9, 9 | [src/features/listScan/ListScanResultsScreen.tsx:69](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/listScan/ListScanResultsScreen.tsx:69>); [apps/mobile/src/screens/listScan/ListScanResultsScreen.tsx:59](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/listScan/ListScanResultsScreen.tsx:59>) |
| 62 | `acceptMobileFriendRequest` | 9, 9 | [apps/mobile/src/lib/api/friends.ts:185](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/lib/api/friends.ts:185>); [apps/mobile/src/lib/api/publicProfile.ts:201](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/lib/api/publicProfile.ts:201>) |
| 63 | `deleteMobileFriendRequest` | 9, 9 | [apps/mobile/src/lib/api/friends.ts:205](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/lib/api/friends.ts:205>); [apps/mobile/src/lib/api/publicProfile.ts:211](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/lib/api/publicProfile.ts:211>) |
| 64 | `<callback>` | 9, 9 | [apps/mobile/app/(app)/feed/index.tsx:1472](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/feed/index.tsx:1472>); [apps/mobile/app/(app)/home/index.tsx:447](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/home/index.tsx:447>) |
| 65 | `<callback>` | 8, 8 | [src/app/explore/page.tsx:347](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/explore/page.tsx:347>); [apps/mobile/app/(app)/explore-browse/index.tsx:166](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/explore-browse/index.tsx:166>) |
| 66 | `applyResults` | 8, 8 | [src/app/taste-survey/page.tsx:175](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/taste-survey/page.tsx:175>); [apps/mobile/app/(app)/taste-survey/index.tsx:154](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/taste-survey/index.tsx:154>) |
| 67 | `loadImageElement` | 8, 8 | [src/features/entries/edit/EditEntryScreenContainer.tsx:1226](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/edit/EditEntryScreenContainer.tsx:1226>); [src/features/entries/new/NewEntryScreenContainer.tsx:747](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/new/NewEntryScreenContainer.tsx:747>) |
| 68 | `<callback>` | 8, 8 | [src/features/entries/edit/EditEntryScreenContainer.tsx:1584](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/edit/EditEntryScreenContainer.tsx:1584>); [src/features/entries/new/NewEntryScreenContainer.tsx:1448](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/new/NewEntryScreenContainer.tsx:1448>) |
| 69 | `<callback>` | 8, 8 | [src/features/entries/edit/EditEntryScreenContainer.tsx:2499](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/edit/EditEntryScreenContainer.tsx:2499>); [src/features/entries/new/NewEntryScreenContainer.tsx:4463](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/new/NewEntryScreenContainer.tsx:4463>) |
| 70 | `<callback>` | 8, 8 | [src/features/entries/edit/EditEntryScreenContainer.tsx:2968](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/edit/EditEntryScreenContainer.tsx:2968>); [src/features/entries/new/NewEntryScreenContainer.tsx:4842](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/new/NewEntryScreenContainer.tsx:4842>) |
| 71 | `<callback>` | 8, 8 | [src/features/listScan/ListScanResultsScreen.tsx:680](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/listScan/ListScanResultsScreen.tsx:680>); [apps/mobile/src/screens/listScan/ListScanResultsScreen.tsx:309](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/listScan/ListScanResultsScreen.tsx:309>) |
| 72 | `handleCountryPress` | 8, 8 | [src/features/listScan/RegionFilterSelect.tsx:66](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/listScan/RegionFilterSelect.tsx:66>); [apps/mobile/src/screens/listScan/RegionFilterSelect.tsx:67](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/listScan/RegionFilterSelect.tsx:67>) |
| 73 | `normalizeOptionalString` | 8, 8 | [src/server/algorithm/aliasLookup.ts:66](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/algorithm/aliasLookup.ts:66>); [src/server/algorithm/resolver.ts:108](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/algorithm/resolver.ts:108>) |
| 74 | `<callback>` | 8, 8 | [apps/mobile/src/lib/entries/groupedPosts.ts:52](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/lib/entries/groupedPosts.ts:52>); [apps/mobile/src/lib/feed/feedPage.ts:831](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/lib/feed/feedPage.ts:831>) |

### Largest controllers/modules

| File | Lines | useState calls | useEffect calls |
|---|---:|---:|---:|
| [apps/mobile/app/(app)/entries/[id].tsx:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/entries/[id].tsx:1>) | 6643 | 81 | 15 |
| [src/features/entries/new/NewEntryScreenContainer.tsx:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/new/NewEntryScreenContainer.tsx:1>) | 4907 | 49 | 9 |
| [src/server/listScan/parse.ts:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/server/listScan/parse.ts:1>) | 3941 | 0 | 0 |
| [apps/mobile/app/(app)/profile/index.tsx:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/profile/index.tsx:1>) | 3564 | 59 | 2 |
| [apps/mobile/src/screens/entries/NewEntryScreenContainer.tsx:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/entries/NewEntryScreenContainer.tsx:1>) | 3397 | 53 | 10 |
| [apps/mobile/app/(app)/feed/index.tsx:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/feed/index.tsx:1>) | 3142 | 23 | 7 |
| [src/features/entries/edit/EditEntryScreenContainer.tsx:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/features/entries/edit/EditEntryScreenContainer.tsx:1>) | 3107 | 33 | 7 |
| [src/app/profile/page.tsx:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/profile/page.tsx:1>) | 2316 | 61 | 2 |
| [src/app/feed/page.tsx:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/feed/page.tsx:1>) | 2221 | 40 | 5 |
| [src/app/entries/page.tsx:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/entries/page.tsx:1>) | 2206 | 31 | 4 |
| [apps/mobile/app/(app)/home/index.tsx:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/home/index.tsx:1>) | 1840 | 14 | 1 |
| [apps/mobile/app/(app)/entries/index.tsx:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/entries/index.tsx:1>) | 1761 | 26 | 3 |
| [apps/mobile/app/(app)/explore/[type]/[slug].tsx:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/app/(app)/explore/[type]/[slug].tsx:1>) | 1740 | 4 | 1 |
| [src/app/entries/[id]/page.tsx:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/src/app/entries/[id]/page.tsx:1>) | 1694 | 37 | 6 |
| [apps/mobile/src/screens/listScan/ListScanResultsScreen.tsx:1](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/apps/mobile/src/screens/listScan/ListScanResultsScreen.tsx:1>) | 1639 | 11 | 2 |

Hook counts count calls spelled useState/useEffect; they do not quantify render cost. File lengths include blank lines and comments. Shared hooks, aliased calls, and runtime behavior need separate analysis.

## Regression check details

Selected suites: phase6-primitives, phase6-route-handlers, phase5-parity, ws1-algorithm-core, ws1-algorithm-api, ws2-entry-normalization, ws3-list-scan, ws3-algorithm-ui, ws3-pocket-sommelier, post-save-survey-bulk. Result: **149 passed, 8 failed**. These existing tests use mocks/pure code; this was not a browser acceptance run.

| Failing test | Observation |
|---|---|
| [e2e/phase6-primitives.spec.ts:496](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/e2e/phase6-primitives.spec.ts:496>) | Signing mock lacks createSignedUrls after the production bulk-signing change. |
| [e2e/ws1-algorithm-core.spec.ts:602](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/e2e/ws1-algorithm-core.spec.ts:602>) | Axis contribution expected 2.9; actual 2.6. Reconcile intended weights. |
| [e2e/ws1-algorithm-core.spec.ts:622](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/e2e/ws1-algorithm-core.spec.ts:622>) | Complexity contribution expected 1; actual 1.3. Reconcile intended weights. |
| [e2e/ws2-entry-normalization.spec.ts:498](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/e2e/ws2-entry-normalization.spec.ts:498>) | Resolver payload now also contains primary_grapes: []. |
| [e2e/ws2-entry-normalization.spec.ts:613](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/e2e/ws2-entry-normalization.spec.ts:613>) | Resolver payload now also contains primary_grapes: ["Cabernet Sauvignon"]. |
| [e2e/ws3-algorithm-ui.spec.ts:392](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/e2e/ws3-algorithm-ui.spec.ts:392>) | Plush-vector style-family expectation differs from actual result. |
| [e2e/ws3-algorithm-ui.spec.ts:406](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/e2e/ws3-algorithm-ui.spec.ts:406>) | Refresh mock lacks query.eq used by the entry-status filter. |
| [e2e/ws3-algorithm-ui.spec.ts:552](</Users/esneider/Projects/Claude-OS/projects/cellarsnap/e2e/ws3-algorithm-ui.spec.ts:552>) | Same incomplete query.eq mock on the empty-entry path. |

TypeScript success did not detect the stale database columns or badge trigger vocabulary because those boundaries have handwritten/unparameterized types. Restoring green tests should mean deciding intended behavior, not simply accepting whatever the current implementation returns.

### Local check commands and isolation

- Web types: local tsc with --noEmit --incremental false.
- Native types/lint: the mobile project's existing TypeScript and lint commands.
- Web lint: npm run lint:web; comparison run with eslint --max-warnings 0 --ignore-pattern '.claude/**'.
- Tests: local Playwright, the ten named suites above, E2E_BASE_URL set to avoid starting the configured web server; output directed to /tmp/cellarsnap-audit/test-results.
- Dependencies: npm audit --json against each existing lockfile. No automatic fix or install.
- Build: isolated source/config copy with existing node_modules symlink and nonfunctional public Supabase values; next build --webpack. Default next build encountered the harness symlink-root restriction.

The three unused TypeScript imports were React in BadgeCard.tsx, BadgesPage.tsx, and BadgeToast.tsx. The four unused-module candidates in finding 46 were checked separately through imports/reference searches.

## Dependency advisory package inventory

These are npm's affected-package entries at the audit date, including transitive and development tools. “Direct” means declared directly in the relevant manifest, not necessarily shipped to the browser/device. Several wrapper entries inherit the same underlying advisory. Listed severity is npm's maximum for that package; exposure depends on actual use. Root tar is in the Supabase CLI toolchain; mobile shell-quote is build tooling. Do not interpret their critical severity as proof of a remotely exploitable production application.

| Lockfile | Package | Maximum severity | Relationship | Example advisory sources |
|---|---|---|---|---|
| Root | `@babel/core` | low | Transitive | [Advisory 1](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) |
| Root | `@humanfs/node` | moderate | Transitive | [Advisory 1](https://github.com/advisories/GHSA-p498-v437-472g) |
| Root | `@xmldom/xmldom` | high | Transitive | [Advisory 1](https://github.com/advisories/GHSA-6gmq-8vp8-gcm6), [Advisory 2](https://github.com/advisories/GHSA-6mj3-qw4j-hgrw) (+11 more in npm result) |
| Root | `baseline-browser-mapping` | moderate | Transitive | [Advisory 1](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) |
| Root | `brace-expansion` | high | Transitive | [Advisory 1](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp), [Advisory 2](https://github.com/advisories/GHSA-mh99-v99m-4gvg) (+1 more in npm result) |
| Root | `browserslist` | high | Transitive | [Advisory 1](https://github.com/advisories/GHSA-c83g-rgw3-j3cx), [Advisory 2](https://github.com/advisories/GHSA-73wf-gq98-2v4g) |
| Root | `js-yaml` | high | Transitive | [Advisory 1](https://github.com/advisories/GHSA-h67p-54hq-rp68), [Advisory 2](https://github.com/advisories/GHSA-52cp-r559-cp3m) (+2 more in npm result) |
| Root | `nanoid` | high | Transitive | [Advisory 1](https://github.com/advisories/GHSA-28wg-ghj8-5hjv), [Advisory 2](https://github.com/advisories/GHSA-2v37-7h3g-55p8) |
| Root | `next` | critical | Direct | [Advisory 1](https://github.com/advisories/GHSA-6gpp-xcg3-4w24), [Advisory 2](https://github.com/advisories/GHSA-m99w-x7hq-7vfj) (+9 more in npm result) |
| Root | `postcss` | high | Transitive | [Advisory 1](https://github.com/advisories/GHSA-qx2v-qp2m-jg93), [Advisory 2](https://github.com/advisories/GHSA-6g55-p6wh-862q) (+2 more in npm result) |
| Root | `sharp` | high | Transitive | [Advisory 1](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), [Advisory 2](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) |
| Root | `supabase` | moderate | Direct | Inherited through affected dependencies |
| Root | `tar` | critical | Transitive | [Advisory 1](https://github.com/advisories/GHSA-vmf3-w455-68vh), [Advisory 2](https://github.com/advisories/GHSA-w8wr-v893-vjvp) (+4 more in npm result) |
| Mobile | `@babel/core` | low | Direct | [Advisory 1](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) |
| Mobile | `@expo/cli` | moderate | Transitive | Inherited through affected dependencies |
| Mobile | `@expo/config` | moderate | Transitive | Inherited through affected dependencies |
| Mobile | `@expo/config-plugins` | moderate | Transitive | Inherited through affected dependencies |
| Mobile | `@expo/inline-modules` | moderate | Transitive | Inherited through affected dependencies |
| Mobile | `@expo/local-build-cache-provider` | moderate | Transitive | Inherited through affected dependencies |
| Mobile | `@expo/metro` | high | Transitive | Inherited through affected dependencies |
| Mobile | `@expo/metro-config` | moderate | Transitive | Inherited through affected dependencies |
| Mobile | `@expo/prebuild-config` | moderate | Transitive | Inherited through affected dependencies |
| Mobile | `@xmldom/xmldom` | high | Transitive | [Advisory 1](https://github.com/advisories/GHSA-6gmq-8vp8-gcm6), [Advisory 2](https://github.com/advisories/GHSA-w2rr-34g9-rvrj) (+8 more in npm result) |
| Mobile | `baseline-browser-mapping` | moderate | Transitive | [Advisory 1](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) |
| Mobile | `brace-expansion` | high | Transitive | [Advisory 1](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp), [Advisory 2](https://github.com/advisories/GHSA-mh99-v99m-4gvg) (+1 more in npm result) |
| Mobile | `browserslist` | high | Transitive | [Advisory 1](https://github.com/advisories/GHSA-c83g-rgw3-j3cx), [Advisory 2](https://github.com/advisories/GHSA-73wf-gq98-2v4g) |
| Mobile | `decode-uri-component` | moderate | Transitive | [Advisory 1](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) |
| Mobile | `expo` | moderate | Direct | Inherited through affected dependencies |
| Mobile | `expo-router` | moderate | Direct | Inherited through affected dependencies |
| Mobile | `expo-splash-screen` | moderate | Direct | Inherited through affected dependencies |
| Mobile | `image-size` | high | Transitive | [Advisory 1](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr), [Advisory 2](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) |
| Mobile | `js-yaml` | high | Transitive | [Advisory 1](https://github.com/advisories/GHSA-52cp-r559-cp3m), [Advisory 2](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) (+1 more in npm result) |
| Mobile | `metro` | high | Transitive | Inherited through affected dependencies |
| Mobile | `metro-config` | high | Transitive | Inherited through affected dependencies |
| Mobile | `metro-transform-worker` | high | Transitive | Inherited through affected dependencies |
| Mobile | `nanoid` | high | Transitive | [Advisory 1](https://github.com/advisories/GHSA-28wg-ghj8-5hjv), [Advisory 2](https://github.com/advisories/GHSA-2v37-7h3g-55p8) |
| Mobile | `postcss` | high | Transitive | [Advisory 1](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), [Advisory 2](https://github.com/advisories/GHSA-r28c-9q8g-f849) |
| Mobile | `query-string` | moderate | Transitive | Inherited through affected dependencies |
| Mobile | `shell-quote` | critical | Transitive | [Advisory 1](https://github.com/advisories/GHSA-w7jw-789q-3m8p), [Advisory 2](https://github.com/advisories/GHSA-395f-4hp3-45gv) |
| Mobile | `uuid` | moderate | Transitive | [Advisory 1](https://github.com/advisories/GHSA-w5hq-g745-h8pq) |
| Mobile | `ws` | high | Transitive | [Advisory 1](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) |
| Mobile | `xcode` | moderate | Transitive | Inherited through affected dependencies |

Detailed temporary logs and the detector script remain under /tmp/cellarsnap-audit. Their lifetime is temporary; this appendix preserves the material results. The snapshot should be revalidated after schema, dependency, or source changes.
