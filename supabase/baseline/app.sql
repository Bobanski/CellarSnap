-- CAPTURED BASELINE: disposable replay only; never apply this file to production.
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: private; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA private;


ALTER SCHEMA private OWNER TO postgres;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: entry_comparison_response; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.entry_comparison_response AS ENUM (
    'more',
    'less',
    'same_or_not_sure'
);


ALTER TYPE public.entry_comparison_response OWNER TO postgres;

--
-- Name: entry_group_mode; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.entry_group_mode AS ENUM (
    'event',
    'catch_up'
);


ALTER TYPE public.entry_group_mode OWNER TO postgres;

--
-- Name: entry_survey_drink_again; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.entry_survey_drink_again AS ENUM (
    'yes',
    'no'
);


ALTER TYPE public.entry_survey_drink_again OWNER TO postgres;

--
-- Name: entry_survey_enjoyment_intent; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.entry_survey_enjoyment_intent AS ENUM (
    'seek_more',
    'happily_again',
    'if_poured',
    'pass'
);


ALTER TYPE public.entry_survey_enjoyment_intent OWNER TO postgres;

--
-- Name: entry_survey_expectation_match; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.entry_survey_expectation_match AS ENUM (
    'below_expectations',
    'met_expectations',
    'above_expectations'
);


ALTER TYPE public.entry_survey_expectation_match OWNER TO postgres;

--
-- Name: entry_survey_how_was_it; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.entry_survey_how_was_it AS ENUM (
    'awful',
    'bad',
    'okay',
    'good',
    'exceptional'
);


ALTER TYPE public.entry_survey_how_was_it OWNER TO postgres;

--
-- Name: price_paid_currency; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.price_paid_currency AS ENUM (
    'usd',
    'eur',
    'gbp',
    'chf',
    'aud',
    'mxn'
);


ALTER TYPE public.price_paid_currency OWNER TO postgres;

--
-- Name: price_paid_source; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.price_paid_source AS ENUM (
    'retail',
    'restaurant'
);


ALTER TYPE public.price_paid_source OWNER TO postgres;

--
-- Name: privacy_level; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.privacy_level AS ENUM (
    'public',
    'friends',
    'private',
    'friends_of_friends'
);


ALTER TYPE public.privacy_level OWNER TO postgres;

--
-- Name: qpr_level; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.qpr_level AS ENUM (
    'extortion',
    'pricey',
    'mid',
    'good_value',
    'absolute_steal'
);


ALTER TYPE public.qpr_level OWNER TO postgres;

--
-- Name: wine_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.wine_type AS ENUM (
    'red',
    'white',
    'rose',
    'sparkling',
    'sweet',
    'orange'
);


ALTER TYPE public.wine_type OWNER TO postgres;

--
-- Name: can_access_wine_photo(text); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.can_access_wine_photo(object_name text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  viewer uuid := auth.uid();
  public_only boolean := coalesce(auth.role() = 'service_role', false);
  parts text[] := string_to_array(object_name, '/');
  source public.wine_entries%rowtype;
  base_path text := regexp_replace(object_name, '__original(\.[a-zA-Z0-9]+)?$', '\1');
  kinds text[];
  kind text;
  photo_privacy text;
begin
  if not public_only and viewer is null then return false; end if;
  -- Preserves uploads before metadata exists, upserts, avatar/cover changes,
  -- originals, drafts and cleanup of orphaned objects within one's own prefix.
  if not public_only and parts[1] = viewer::text then return true; end if;
  if parts[1] is null or parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  if not public_only and array_length(parts,1)=2 then
    return parts[2] ~ '^avatar\.(jpg|png|webp|gif)$'
      and public.can_view_entry(viewer, parts[1]::uuid, 'public')
      and exists (select 1 from public.profiles p
        where p.id=parts[1]::uuid and p.avatar_path=object_name);
  end if;
  if array_length(parts,1) not in (3,4) or parts[2] is null
    or parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  select * into source from public.wine_entries e
    where e.id=parts[2]::uuid and e.user_id=parts[1]::uuid;
  if not found then return false; end if;
  if public_only then
    if source.entry_privacy::text is distinct from 'public'
      or public.is_test_account(source.user_id) then return false; end if;
  elsif not public.can_view_entry(viewer,source.user_id,source.entry_privacy::text) then
    return false;
  end if;

  -- Photo reclassification updates metadata without moving the object. Exact
  -- ordered metadata wins over legacy columns and group references. ALL current
  -- types must permit access if duplicate rows point at the same source object.
  select array_agg(distinct p.type::text) into kinds from public.entry_photos p
    where p.entry_id=source.id and p.path=base_path;
  if kinds is null then
    select array_agg(v.kind) into kinds from (values
      ('label',source.label_image_path),('place',source.place_image_path),
      ('pairing',source.pairing_image_path)) v(kind,path) where v.path=base_path;
  end if;
  if kinds is null then
    -- Some legacy group photos exist only in slides. Validate the source member
    -- and the group's owned, readable anchor. Entry-less context is anchored.
    -- A private ordered/legacy source above always wins over a slide reference.
    select array_agg(distinct s.photo_type::text) into kinds
    from public.entry_groups g join public.entry_group_slides s on s.group_id=g.id
    join public.wine_entries anchor on anchor.id=g.anchor_entry_id
      and anchor.user_id=g.user_id and anchor.entry_group_id=g.id
    where g.user_id=source.user_id and source.entry_group_id=g.id
      and coalesce(s.entry_id,g.anchor_entry_id)=source.id and s.path=base_path
      and case when public_only then anchor.entry_privacy::text='public'
        else public.can_view_entry(viewer,anchor.user_id,anchor.entry_privacy::text) end;
  end if;
  if kinds is null then return false; end if;
  foreach kind in array kinds loop
    if kind is null or kind not in ('label','place','pairing','lineup','people','other_bottles') then return false; end if;
    photo_privacy := case kind
      when 'label' then coalesce(source.label_photo_privacy,source.entry_privacy)::text
      when 'place' then coalesce(source.place_photo_privacy,source.entry_privacy)::text
      else source.entry_privacy::text end;
    if public_only then
      if photo_privacy is distinct from 'public' then return false; end if;
    elsif not public.can_view_entry(viewer,source.user_id,photo_privacy) then return false; end if;
  end loop;
  return true;
end;
$_$;


ALTER FUNCTION private.can_access_wine_photo(object_name text) OWNER TO postgres;

--
-- Name: invalidate_entry_knowledge(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.invalidate_entry_knowledge() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  delete from public.user_entry_knowledge_chunks where entry_id = old.id;
  return new;
end;
$$;


ALTER FUNCTION private.invalidate_entry_knowledge() OWNER TO postgres;

--
-- Name: invalidate_grape_entry_knowledge(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.invalidate_grape_entry_knowledge() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare affected_ids uuid[];
begin
  if tg_op = 'INSERT' then affected_ids := array[new.entry_id];
  elsif tg_op = 'DELETE' then affected_ids := array[old.entry_id];
  else affected_ids := array[old.entry_id,new.entry_id]; end if;
  perform 1 from public.wine_entries where id = any(affected_ids) order by id for update;
  delete from public.user_entry_knowledge_chunks where entry_id = any(affected_ids);
  return null;
end;
$$;


ALTER FUNCTION private.invalidate_grape_entry_knowledge() OWNER TO postgres;

--
-- Name: invalidate_variety_entry_knowledge(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.invalidate_variety_entry_knowledge() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform 1 from public.wine_entries e where exists (
    select 1 from public.entry_primary_grapes g where g.entry_id=e.id and g.variety_id=old.id
  ) order by e.id for update;
  delete from public.user_entry_knowledge_chunks k where exists (
    select 1 from public.entry_primary_grapes g where g.entry_id=k.entry_id and g.variety_id=old.id
  );
  return new;
end;
$$;


ALTER FUNCTION private.invalidate_variety_entry_knowledge() OWNER TO postgres;

--
-- Name: protect_profile_capabilities(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.protect_profile_capabilities() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  -- Use the database role, never user-editable metadata or a submitted user ID.
  -- Auth hooks / service-role administration can continue maintaining this flag.
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if coalesce(new.is_test_account, false) then
        raise exception 'Account capabilities can only be assigned by an administrator'
          using errcode = '42501';
      end if;
    elsif new.is_test_account is distinct from old.is_test_account then
      raise exception 'Account capabilities can only be changed by an administrator'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION private.protect_profile_capabilities() OWNER TO postgres;

--
-- Name: apply_friend_transition(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.apply_friend_transition(target_user_id uuid, action text) RETURNS TABLE(status text, request_id uuid, changed boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  actor_id uuid := auth.uid();
  normalized_action text := lower(trim(coalesce(action, '')));
  now_ts timestamptz := now();
  lock_key text;
  forward_row public.friend_requests%rowtype;
  reverse_row public.friend_requests%rowtype;
  inserted_id uuid;
  removed_outgoing_count integer := 0;
  removed_incoming_count integer := 0;
begin
  if actor_id is null then
    raise exception 'FRIEND_TRANSITION_UNAUTHORIZED'
      using errcode = '42501',
            detail = 'Authenticated user required.';
  end if;

  if target_user_id is null then
    raise exception 'FRIEND_TRANSITION_TARGET_REQUIRED'
      using errcode = '22023',
            detail = 'target_user_id is required.';
  end if;

  if target_user_id = actor_id then
    raise exception 'FRIEND_TRANSITION_SELF_NOT_ALLOWED'
      using errcode = '22023',
            detail = 'Users cannot transition friendship with themselves.';
  end if;

  if normalized_action not in ('request', 'accept', 'decline', 'remove') then
    raise exception 'FRIEND_TRANSITION_INVALID_ACTION'
      using errcode = '22023',
            detail = 'Action must be one of request, accept, decline, remove.';
  end if;

  -- Serialize all transitions for this pair to avoid racey split-brain states.
  lock_key := concat(
    least(actor_id::text, target_user_id::text),
    ':',
    greatest(actor_id::text, target_user_id::text)
  );
  perform pg_advisory_xact_lock(hashtext(lock_key));

  select *
  into forward_row
  from public.friend_requests
  where requester_id = actor_id
    and recipient_id = target_user_id
  limit 1
  for update;

  select *
  into reverse_row
  from public.friend_requests
  where requester_id = target_user_id
    and recipient_id = actor_id
  limit 1
  for update;

  if normalized_action = 'request' then
    if reverse_row.id is not null and reverse_row.status in ('pending', 'accepted') then
      if reverse_row.status = 'pending' then
        update public.friend_requests as fr
        set status = 'accepted',
            responded_at = now_ts,
            seen_at = now_ts
        where fr.id = reverse_row.id
          and fr.status = 'pending';
      end if;

      delete from public.friend_requests fr
      where fr.requester_id = actor_id
        and fr.recipient_id = target_user_id
        and fr.status in ('pending', 'accepted');
      get diagnostics removed_outgoing_count = row_count;

      return query select
        'accepted'::text,
        reverse_row.id,
        (reverse_row.status = 'pending') or removed_outgoing_count > 0;
      return;
    end if;

    if forward_row.id is not null then
      if forward_row.status = 'declined' then
        delete from public.friend_requests fr
        where fr.requester_id = actor_id
          and fr.recipient_id = target_user_id
          and fr.status = 'declined';

        inserted_id := gen_random_uuid();
        insert into public.friend_requests (id, requester_id, recipient_id, status)
        values (inserted_id, actor_id, target_user_id, 'pending');

        return query select 'pending'::text, inserted_id, true;
        return;
      end if;

      return query select forward_row.status::text, forward_row.id, false;
      return;
    end if;

    inserted_id := gen_random_uuid();
    insert into public.friend_requests (id, requester_id, recipient_id, status)
    values (inserted_id, actor_id, target_user_id, 'pending');

    return query select 'pending'::text, inserted_id, true;
    return;
  end if;

  if normalized_action = 'accept' then
    if reverse_row.id is null then
      raise exception 'FRIEND_TRANSITION_NOT_FOUND'
        using errcode = 'P0002',
              detail = 'No incoming request to accept.';
    end if;

    if reverse_row.status = 'pending' then
      update public.friend_requests as fr
      set status = 'accepted',
          responded_at = now_ts,
          seen_at = now_ts
      where fr.id = reverse_row.id
        and fr.status = 'pending';

      delete from public.friend_requests fr
      where fr.requester_id = actor_id
        and fr.recipient_id = target_user_id
        and fr.status in ('pending', 'accepted');

      return query select 'accepted'::text, reverse_row.id, true;
      return;
    end if;

    if reverse_row.status = 'accepted' then
      delete from public.friend_requests fr
      where fr.requester_id = actor_id
        and fr.recipient_id = target_user_id
        and fr.status in ('pending', 'accepted');
      get diagnostics removed_outgoing_count = row_count;

      return query select 'accepted'::text, reverse_row.id, removed_outgoing_count > 0;
      return;
    end if;

    raise exception 'FRIEND_TRANSITION_CONFLICT'
      using errcode = '23514',
            detail = 'Cannot accept a declined request.';
  end if;

  if normalized_action = 'decline' then
    if reverse_row.id is null then
      raise exception 'FRIEND_TRANSITION_NOT_FOUND'
        using errcode = 'P0002',
              detail = 'No incoming request to decline.';
    end if;

    if reverse_row.status = 'pending' then
      update public.friend_requests as fr
      set status = 'declined',
          responded_at = now_ts,
          seen_at = now_ts
      where fr.id = reverse_row.id
        and fr.status = 'pending';

      delete from public.friend_requests fr
      where fr.requester_id = actor_id
        and fr.recipient_id = target_user_id
        and fr.status = 'pending';
      get diagnostics removed_outgoing_count = row_count;

      return query select 'declined'::text, reverse_row.id, true;
      return;
    end if;

    if reverse_row.status = 'declined' then
      return query select 'declined'::text, reverse_row.id, false;
      return;
    end if;

    raise exception 'FRIEND_TRANSITION_CONFLICT'
      using errcode = '23514',
            detail = 'Cannot decline an accepted request.';
  end if;

  delete from public.friend_requests fr
  where fr.requester_id = actor_id
    and fr.recipient_id = target_user_id
    and fr.status in ('pending', 'accepted');
  get diagnostics removed_outgoing_count = row_count;

  delete from public.friend_requests fr
  where fr.requester_id = target_user_id
    and fr.recipient_id = actor_id
    and fr.status in ('pending', 'accepted');
  get diagnostics removed_incoming_count = row_count;

  return query
  select
    'none'::text,
    coalesce(
      case
        when reverse_row.status in ('pending', 'accepted') then reverse_row.id
        else null
      end,
      case
        when forward_row.status in ('pending', 'accepted') then forward_row.id
        else null
      end
    ),
    removed_outgoing_count > 0 or removed_incoming_count > 0;
  return;
end;
$$;


ALTER FUNCTION public.apply_friend_transition(target_user_id uuid, action text) OWNER TO postgres;

--
-- Name: are_friends(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.are_friends(user_a uuid, user_b uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if user_a is null or user_b is null then
    return false;
  end if;

  if user_a = user_b then
    return true;
  end if;

  return exists (
    select 1
    from public.friend_requests fr
    where fr.status = 'accepted'
      and (
        (fr.requester_id = user_a and fr.recipient_id = user_b)
        or
        (fr.requester_id = user_b and fr.recipient_id = user_a)
      )
  );
end;
$$;


ALTER FUNCTION public.are_friends(user_a uuid, user_b uuid) OWNER TO postgres;

--
-- Name: can_access_wine_photo(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_access_wine_photo(object_name text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select private.can_access_wine_photo(object_name);
$$;


ALTER FUNCTION public.can_access_wine_photo(object_name text) OWNER TO postgres;

--
-- Name: can_view_entry(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_entry(viewer_id uuid, owner_id uuid, privacy text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


ALTER FUNCTION public.can_view_entry(viewer_id uuid, owner_id uuid, privacy text) OWNER TO postgres;

--
-- Name: can_view_entry_standard(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_entry_standard(viewer_id uuid, owner_id uuid, privacy text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  normalized_privacy text;
begin
  if viewer_id is null or owner_id is null then
    return false;
  end if;

  if public.is_user_blocked(viewer_id, owner_id) then
    return false;
  end if;

  if not public.can_view_test_authored_content(viewer_id, owner_id) then
    return false;
  end if;

  if viewer_id = owner_id then
    return true;
  end if;

  normalized_privacy := lower(coalesce(privacy, ''));

  if normalized_privacy = 'public' then
    return true;
  end if;

  if normalized_privacy = 'friends' then
    return public.are_friends(viewer_id, owner_id);
  end if;

  if normalized_privacy = 'friends_of_friends' then
    if public.are_friends(viewer_id, owner_id) then
      return true;
    end if;

    return exists (
      with viewer_friends as (
        select case
          when fr.requester_id = viewer_id then fr.recipient_id
          else fr.requester_id
        end as friend_id
        from public.friend_requests fr
        where fr.status = 'accepted'
          and (fr.requester_id = viewer_id or fr.recipient_id = viewer_id)
      ),
      owner_friends as (
        select case
          when fr.requester_id = owner_id then fr.recipient_id
          else fr.requester_id
        end as friend_id
        from public.friend_requests fr
        where fr.status = 'accepted'
          and (fr.requester_id = owner_id or fr.recipient_id = owner_id)
      )
      select 1
      from viewer_friends vf
      join owner_friends ofr
        on ofr.friend_id = vf.friend_id
      where vf.friend_id <> viewer_id
        and vf.friend_id <> owner_id
      limit 1
    );
  end if;

  return false;
end;
$$;


ALTER FUNCTION public.can_view_entry_standard(viewer_id uuid, owner_id uuid, privacy text) OWNER TO postgres;

--
-- Name: can_view_test_authored_content(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.can_view_test_authored_content(viewer_id uuid, owner_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if viewer_id is null or owner_id is null then
    return false;
  end if;

  if viewer_id = owner_id then
    return true;
  end if;

  if not public.is_test_account(owner_id) then
    return true;
  end if;

  return public.is_test_account(viewer_id);
end;
$$;


ALTER FUNCTION public.can_view_test_authored_content(viewer_id uuid, owner_id uuid) OWNER TO postgres;

--
-- Name: consume_api_rate_limit(text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.consume_api_rate_limit(p_route_key text, p_subject text, p_window_seconds integer, p_max_requests integer) RETURNS TABLE(allowed boolean, limit_count integer, remaining_count integer, reset_at timestamp with time zone, retry_after_seconds integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  now_ts timestamptz := clock_timestamp();
  window_interval interval;
  bucket_window_start timestamptz;
  bucket_request_count integer;
begin
  if nullif(trim(p_route_key), '') is null then
    raise exception 'p_route_key is required';
  end if;

  if nullif(trim(p_subject), '') is null then
    raise exception 'p_subject is required';
  end if;

  if p_window_seconds <= 0 then
    raise exception 'p_window_seconds must be positive';
  end if;

  if p_max_requests <= 0 then
    raise exception 'p_max_requests must be positive';
  end if;

  window_interval := make_interval(secs => p_window_seconds);

  insert into public.api_rate_limits (
    route_key,
    subject,
    window_start_at,
    request_count,
    updated_at
  )
  values (
    p_route_key,
    p_subject,
    now_ts,
    1,
    now_ts
  )
  on conflict (route_key, subject) do update
    set
      window_start_at = case
        when public.api_rate_limits.window_start_at <= now_ts - window_interval
          then now_ts
        else public.api_rate_limits.window_start_at
      end,
      request_count = case
        when public.api_rate_limits.window_start_at <= now_ts - window_interval
          then 1
        else public.api_rate_limits.request_count + 1
      end,
      updated_at = now_ts
  returning
    public.api_rate_limits.window_start_at,
    public.api_rate_limits.request_count
  into bucket_window_start, bucket_request_count;

  allowed := bucket_request_count <= p_max_requests;
  limit_count := p_max_requests;
  remaining_count := greatest(0, p_max_requests - bucket_request_count);
  reset_at := bucket_window_start + window_interval;
  retry_after_seconds := greatest(
    1,
    ceiling(extract(epoch from reset_at - now_ts))::integer
  );

  return next;
end;
$$;


ALTER FUNCTION public.consume_api_rate_limit(p_route_key text, p_subject text, p_window_seconds integer, p_max_requests integer) OWNER TO postgres;

--
-- Name: create_test_account(text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_test_account(username text, password text, email text DEFAULT NULL::text) RETURNS TABLE(user_id uuid, login_username text, login_email text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions'
    AS $$
declare
  normalized_username text := trim(username);
  normalized_password text := password;
  normalized_email text := lower(trim(coalesce(email, '')));
  email_local_part text;
  created_user_id uuid := gen_random_uuid();
begin
  if normalized_username is null
    or length(normalized_username) < 3
    or length(normalized_username) > 100
    or normalized_username ~ '[\s@]'
  then
    raise exception 'Username must be 3-100 characters and cannot contain spaces or @.';
  end if;

  if normalized_password is null
    or length(normalized_password) < 8
    or length(normalized_password) > 72
  then
    raise exception 'Password must be 8-72 characters.';
  end if;

  if not public.is_username_available(normalized_username) then
    raise exception 'That username is already taken.';
  end if;

  if normalized_email = '' then
    email_local_part := lower(
      regexp_replace(normalized_username, '[^a-zA-Z0-9._-]+', '-', 'g')
    );
    email_local_part := btrim(email_local_part, '-.');
    if email_local_part = '' then
      email_local_part := 'tester';
    end if;
    normalized_email :=
      email_local_part || '+' || left(created_user_id::text, 8) || '@test.cellarsnap.local';
  end if;

  if position('@' in normalized_email) = 0 then
    raise exception 'Email must be valid.';
  end if;

  if exists (
    select 1
    from auth.users
    where lower(coalesce(auth.users.email, '')) = normalized_email
  ) then
    raise exception 'That email is already in use.';
  end if;

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    created_user_id,
    'authenticated',
    'authenticated',
    normalized_email,
    crypt(normalized_password, gen_salt('bf')),
    now(),
    null,
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'display_name', normalized_username,
      'test_account', true
    ),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    created_user_id,
    jsonb_build_object(
      'sub', created_user_id::text,
      'email', normalized_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    created_user_id::text,
    null,
    now(),
    now()
  );

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'is_test_account'
  ) then
    update public.profiles
    set display_name = normalized_username,
        email = normalized_email,
        is_test_account = true
    where id = created_user_id;
  else
    update public.profiles
    set display_name = normalized_username,
        email = normalized_email
    where id = created_user_id;
  end if;

  return query
  select created_user_id, normalized_username, normalized_email;
end;
$$;


ALTER FUNCTION public.create_test_account(username text, password text, email text) OWNER TO postgres;

--
-- Name: entry_knowledge_snapshot(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.entry_knowledge_snapshot(target_entry_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'extensions'
    AS $$
  select jsonb_build_object('entry', to_jsonb(e), 'primary_grapes', coalesce((
    select jsonb_agg(jsonb_build_object('id', g.variety_id, 'name', v.name, 'position', g.position)
      order by g.position, g.id)
    from public.entry_primary_grapes g
    join public.grape_varieties v on v.id = g.variety_id
    where g.entry_id = e.id
  ), '[]'::jsonb))
  from public.wine_entries e where e.id = target_entry_id;
$$;


ALTER FUNCTION public.entry_knowledge_snapshot(target_entry_id uuid) OWNER TO postgres;

--
-- Name: get_email_for_phone(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_email_for_phone(phone text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  normalized text;
  result text;
begin
  normalized := trim(phone);
  if normalized is null or normalized = '' then
    return null;
  end if;
  if normalized !~ '^[+][1-9][0-9]{7,14}$' then
    return null;
  end if;

  select coalesce(users.email, profiles.email) into result
  from public.profiles profiles
  join auth.users users on users.id = profiles.id
  where profiles.phone = normalized
  order by profiles.id
  limit 1;

  return result;
end;
$_$;


ALTER FUNCTION public.get_email_for_phone(phone text) OWNER TO postgres;

--
-- Name: get_email_for_username(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_email_for_username(username text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
$$;


ALTER FUNCTION public.get_email_for_username(username text) OWNER TO postgres;

--
-- Name: get_entry_knowledge_sources(uuid, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_entry_knowledge_sources(after_entry_id uuid DEFAULT NULL::uuid, batch_size integer DEFAULT 100) RETURNS TABLE(entry_id uuid, source_snapshot jsonb)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'extensions'
    AS $$
  select e.id, public.entry_knowledge_snapshot(e.id)
  from public.wine_entries e
  where after_entry_id is null or e.id > after_entry_id
  order by e.id limit greatest(0, least(coalesce(batch_size, 100), 200));
$$;


ALTER FUNCTION public.get_entry_knowledge_sources(after_entry_id uuid, batch_size integer) OWNER TO postgres;

--
-- Name: get_phone_for_email(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_phone_for_email(email text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  normalized text;
  result text;
begin
  normalized := lower(trim(email));
  if normalized is null or normalized = '' then
    return null;
  end if;

  select coalesce(users.phone, profiles.phone) into result
  from public.profiles profiles
  join auth.users users on users.id = profiles.id
  where lower(coalesce(users.email, profiles.email, '')) = normalized
  order by profiles.id
  limit 1;

  return result;
end;
$$;


ALTER FUNCTION public.get_phone_for_email(email text) OWNER TO postgres;

--
-- Name: get_phone_for_username(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_phone_for_username(username text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  result text;
begin
  select coalesce(users.phone, profiles.phone) into result
  from public.profiles profiles
  join auth.users users on users.id = profiles.id
  where lower(profiles.display_name) = lower(trim(username))
  order by profiles.id
  limit 1;
  return result;
end;
$$;


ALTER FUNCTION public.get_phone_for_username(username text) OWNER TO postgres;

--
-- Name: handle_auth_user_phone_update(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_auth_user_phone_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.profiles
  set phone = new.phone
  where id = new.id;
  return new;
end;
$$;


ALTER FUNCTION public.handle_auth_user_phone_update() OWNER TO postgres;

--
-- Name: handle_friend_request_accept_notifications(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_friend_request_accept_notifications() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- Only notify when transitioning into accepted.
  if tg_op = 'UPDATE' and new.status = 'accepted' and old.status is distinct from new.status then
    insert into public.friend_notifications (user_id, actor_id, friend_request_id, type, created_at)
    values (
      new.requester_id,
      new.recipient_id,
      new.id,
      'friend_request_accepted',
      coalesce(new.responded_at, now())
    )
    on conflict (user_id, friend_request_id, type) do nothing;
  end if;

  return new;
end;
$$;


ALTER FUNCTION public.handle_friend_request_accept_notifications() OWNER TO postgres;

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

--
-- Name: handle_wine_tag_notifications(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_wine_tag_notifications() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  added uuid[];
  root_author_id uuid;
  root_tagged_user_ids uuid[];
begin
  if tg_op = 'INSERT' then
    added := new.tasted_with_user_ids;
  else
    added := array(
      select unnest(coalesce(new.tasted_with_user_ids, '{}'::uuid[]))
      except
      select unnest(coalesce(old.tasted_with_user_ids, '{}'::uuid[]))
    );
  end if;

  if added is null then
    return new;
  end if;

  root_author_id := null;
  root_tagged_user_ids := '{}'::uuid[];
  if new.root_entry_id is not null then
    select
      user_id,
      coalesce(tasted_with_user_ids, '{}'::uuid[])
    into
      root_author_id,
      root_tagged_user_ids
    from public.wine_entries
    where id = new.root_entry_id;
  end if;

  insert into public.wine_notifications (user_id, entry_id, actor_id, type)
  select tag_id, new.id, new.user_id, 'tagged'
  from unnest(added) as tag_id
  where tag_id is not null
    and tag_id <> new.user_id
    and not (root_author_id is not null and tag_id = root_author_id)
    and not (new.root_entry_id is not null and tag_id = any(root_tagged_user_ids))
  on conflict (user_id, entry_id, type) do update
    set actor_id = excluded.actor_id,
        created_at = now(),
        seen_at = null;

  return new;
end;
$$;


ALTER FUNCTION public.handle_wine_tag_notifications() OWNER TO postgres;

--
-- Name: is_phone_available(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_phone_available(phone text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  normalized text;
begin
  normalized := trim(phone);
  if normalized is null or normalized = '' then
    return false;
  end if;
  if normalized !~ '^[+][1-9][0-9]{7,14}$' then
    return false;
  end if;
  return not exists (
    select 1
    from public.profiles
    where profiles.phone = normalized
  );
end;
$_$;


ALTER FUNCTION public.is_phone_available(phone text) OWNER TO postgres;

--
-- Name: is_test_account(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_test_account(user_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


ALTER FUNCTION public.is_test_account(user_id uuid) OWNER TO postgres;

--
-- Name: is_user_blocked(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_user_blocked(viewer_id uuid, target_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if viewer_id is null or target_id is null then
    return false;
  end if;

  if viewer_id = target_id then
    return false;
  end if;

  return exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = viewer_id and b.blocked_id = target_id)
       or (b.blocker_id = target_id and b.blocked_id = viewer_id)
  );
end;
$$;


ALTER FUNCTION public.is_user_blocked(viewer_id uuid, target_id uuid) OWNER TO postgres;

--
-- Name: is_username_available(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_username_available(username text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if username is null or length(trim(username)) < 3 then
    return false;
  end if;
  return not exists (
    select 1
    from public.profiles
    where lower(display_name) = lower(trim(username))
  );
end;
$$;


ALTER FUNCTION public.is_username_available(username text) OWNER TO postgres;

--
-- Name: match_general_knowledge(public.vector, double precision, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.match_general_knowledge(query_embedding public.vector, match_threshold double precision DEFAULT 0.72, match_count integer DEFAULT 5) RETURNS TABLE(id bigint, document_id uuid, content text, similarity double precision, metadata jsonb)
    LANGUAGE sql STABLE
    AS $$
  select
    gkc.id,
    gkc.document_id,
    gkc.content,
    1 - (gkc.embedding <=> query_embedding) as similarity,
    gkc.metadata
  from public.general_knowledge_chunks gkc
  where gkc.embedding is not null
    and 1 - (gkc.embedding <=> query_embedding) > match_threshold
  order by gkc.embedding <=> query_embedding
  limit match_count;
$$;


ALTER FUNCTION public.match_general_knowledge(query_embedding public.vector, match_threshold double precision, match_count integer) OWNER TO postgres;

--
-- Name: match_user_entries(public.vector, uuid, double precision, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.match_user_entries(query_embedding public.vector, target_user_id uuid, match_threshold double precision DEFAULT 0.55, match_count integer DEFAULT 5) RETURNS TABLE(id bigint, content text, similarity double precision, metadata jsonb)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'extensions'
    AS $$
  select k.id,k.content,1-(k.embedding <=> query_embedding),k.metadata
  from public.user_entry_knowledge_chunks k
  where k.user_id=target_user_id
    and (target_user_id=(select auth.uid()) or current_user='service_role')
    and 1-(k.embedding <=> query_embedding)>match_threshold
  order by k.embedding <=> query_embedding,k.id
  limit greatest(0,least(coalesce(match_count,5),50));
$$;


ALTER FUNCTION public.match_user_entries(query_embedding public.vector, target_user_id uuid, match_threshold double precision, match_count integer) OWNER TO postgres;

--
-- Name: match_wine_knowledge(public.vector, double precision, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.match_wine_knowledge(query_embedding public.vector, match_threshold double precision DEFAULT 0.72, match_count integer DEFAULT 5) RETURNS TABLE(id bigint, content text, similarity double precision, metadata jsonb)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'extensions'
    AS $$
  select k.id, k.content, 1 - (k.embedding <=> query_embedding), k.metadata
  from public.wine_knowledge_chunks k
  where k.embedding is not null
    and k.source_table in (
      'base_profiles', 'classification_tier_modifiers', 'producer_modifiers',
      'aging_curve_baselines', 'vintage_weather_modifiers',
      'grape_sensitivity_coefficients', 'taxonomy_classification_tiers'
    )
    and 1 - (k.embedding <=> query_embedding) > match_threshold
  order by k.embedding <=> query_embedding, k.id
  limit greatest(0, least(coalesce(match_count, 5), 50));
$$;


ALTER FUNCTION public.match_wine_knowledge(query_embedding public.vector, match_threshold double precision, match_count integer) OWNER TO postgres;

--
-- Name: publish_entry_knowledge(uuid, jsonb, text, public.vector); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.publish_entry_knowledge(target_entry_id uuid, expected_snapshot jsonb, chunk_content text, chunk_embedding public.vector) RETURNS boolean
    LANGUAGE plpgsql
    SET search_path TO 'public', 'extensions'
    AS $$
declare current_snapshot jsonb; owner_id uuid;
begin
  -- Serializes publication with entry edits/deletion and grape invalidation.
  select e.user_id into owner_id from public.wine_entries e
    where e.id = target_entry_id for update;
  if not found then return false; end if;
  current_snapshot := public.entry_knowledge_snapshot(target_entry_id);
  if expected_snapshot is null or current_snapshot is distinct from expected_snapshot then
    return false;
  end if;
  if chunk_content is null or length(trim(chunk_content)) = 0 or chunk_embedding is null then
    raise exception 'Personal knowledge requires content and an embedding' using errcode = '22023';
  end if;
  insert into public.user_entry_knowledge_chunks(entry_id,user_id,content,embedding,metadata,source_hash)
  values (target_entry_id,owner_id,chunk_content,chunk_embedding,
    jsonb_build_object('table','wine_entries','user_id',owner_id,'entry_id',target_entry_id,
      'title',coalesce(nullif(current_snapshot->'entry'->>'wine_name',''),
        nullif(current_snapshot->'entry'->>'producer',''),'Cellar entry'),
      'wine_type',current_snapshot->'entry'->'wine_type',
      'rating',current_snapshot->'entry'->'rating',
      'vintage',current_snapshot->'entry'->'vintage'),
    md5(current_snapshot::text))
  on conflict (entry_id) do update set
    user_id=excluded.user_id, content=excluded.content, embedding=excluded.embedding,
    metadata=excluded.metadata, source_hash=excluded.source_hash, created_at=now();
  return true;
end;
$$;


ALTER FUNCTION public.publish_entry_knowledge(target_entry_id uuid, expected_snapshot jsonb, chunk_content text, chunk_embedding public.vector) OWNER TO postgres;

--
-- Name: publish_entry_knowledge_batch(jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.publish_entry_knowledge_batch(chunks jsonb) RETURNS TABLE(entry_id uuid, published boolean)
    LANGUAGE plpgsql
    SET search_path TO 'public', 'extensions'
    AS $$
declare item jsonb;
begin
  if chunks is null or jsonb_typeof(chunks) <> 'array' then
    raise exception 'Expected a personal knowledge batch' using errcode = '22023';
  end if;
  if jsonb_array_length(chunks) > 100 then
    raise exception 'Personal knowledge batch exceeds 100 entries' using errcode = '22023';
  end if;
  -- Consistent lock ordering across competing batches.
  for item in select value from jsonb_array_elements(chunks) order by value->>'entry_id' loop
    entry_id := (item->>'entry_id')::uuid;
    published := public.publish_entry_knowledge(entry_id, item->'source_snapshot',
      item->>'content', (item->'embedding')::text::vector(1536));
    return next;
  end loop;
end;
$$;


ALTER FUNCTION public.publish_entry_knowledge_batch(chunks jsonb) OWNER TO postgres;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION public.set_updated_at() OWNER TO postgres;

--
-- Name: validate_entry_comment_parent(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.validate_entry_comment_parent() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  parent_entry_id uuid;
  parent_parent_id uuid;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  select entry_id, parent_comment_id
    into parent_entry_id, parent_parent_id
    from public.entry_comments
   where id = new.parent_comment_id;

  if not found then
    raise exception 'Parent comment not found.'
      using errcode = '23503';
  end if;

  if parent_entry_id <> new.entry_id then
    raise exception 'Parent comment must belong to the same entry.'
      using errcode = '23514';
  end if;

  if parent_parent_id is not null then
    raise exception 'Replies can only target top-level comments.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;


ALTER FUNCTION public.validate_entry_comment_parent() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: aging_curve_baselines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.aging_curve_baselines (
    id bigint NOT NULL,
    country text,
    region text,
    sub_region text,
    primary_grapes text,
    wine_type text,
    aging_curve_family text,
    youth_end numeric,
    development_end numeric,
    peak_end numeric,
    decline_end numeric,
    has_muted_phase boolean,
    muted_start_year numeric,
    muted_end_year numeric,
    dev_delta_tannin numeric,
    dev_delta_acidity numeric,
    dev_delta_fruit_ripeness numeric,
    dev_delta_oak_presence numeric,
    dev_delta_earthy numeric,
    dev_delta_mineral numeric,
    dev_delta_savory numeric,
    dev_delta_aromatic_intensity numeric,
    dev_delta_freshness numeric,
    dev_delta_finish_length numeric,
    dev_delta_concentration numeric,
    dev_delta_complexity numeric,
    peak_delta_tannin numeric,
    peak_delta_acidity numeric,
    peak_delta_fruit_ripeness numeric,
    peak_delta_oak_presence numeric,
    peak_delta_earthy numeric,
    peak_delta_mineral numeric,
    peak_delta_savory numeric,
    peak_delta_aromatic_intensity numeric,
    peak_delta_freshness numeric,
    peak_delta_finish_length numeric,
    peak_delta_concentration numeric,
    peak_delta_complexity numeric,
    decl_delta_tannin numeric,
    decl_delta_acidity numeric,
    decl_delta_fruit_ripeness numeric,
    decl_delta_oak_presence numeric,
    decl_delta_earthy numeric,
    decl_delta_mineral numeric,
    decl_delta_savory numeric,
    decl_delta_aromatic_intensity numeric,
    decl_delta_freshness numeric,
    decl_delta_finish_length numeric,
    decl_delta_concentration numeric,
    decl_delta_complexity numeric,
    past_delta_tannin numeric,
    past_delta_acidity numeric,
    past_delta_fruit_ripeness numeric,
    past_delta_oak_presence numeric,
    past_delta_earthy numeric,
    past_delta_mineral numeric,
    past_delta_savory numeric,
    past_delta_aromatic_intensity numeric,
    past_delta_freshness numeric,
    past_delta_finish_length numeric,
    past_delta_concentration numeric,
    past_delta_complexity numeric,
    peak_aroma_additions text,
    peak_aroma_removals text,
    decline_aroma_additions text,
    youth_texture text,
    peak_texture text,
    source_urls text,
    confidence numeric,
    notes text
);


ALTER TABLE public.aging_curve_baselines OWNER TO postgres;

--
-- Name: aging_curve_baselines_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.aging_curve_baselines ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.aging_curve_baselines_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: api_rate_limits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.api_rate_limits (
    route_key text NOT NULL,
    subject text NOT NULL,
    window_start_at timestamp with time zone DEFAULT now() NOT NULL,
    request_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT api_rate_limits_request_count_check CHECK ((request_count >= 0))
);


ALTER TABLE public.api_rate_limits OWNER TO postgres;

--
-- Name: appellation_grape_map; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.appellation_grape_map (
    id integer NOT NULL,
    appellation text NOT NULL,
    country text NOT NULL,
    region text NOT NULL,
    sub_region text,
    primary_grapes text NOT NULL,
    secondary_grapes text,
    wine_type text NOT NULL,
    blend_style text,
    classification text,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.appellation_grape_map OWNER TO postgres;

--
-- Name: appellation_grape_map_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.appellation_grape_map_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.appellation_grape_map_id_seq OWNER TO postgres;

--
-- Name: appellation_grape_map_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.appellation_grape_map_id_seq OWNED BY public.appellation_grape_map.id;


--
-- Name: base_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.base_profiles (
    id bigint NOT NULL,
    country text NOT NULL,
    region text NOT NULL,
    sub_region text,
    wine_type text NOT NULL,
    color text,
    primary_grapes text,
    blend_style text,
    regulatory_classification text,
    quality_tier text,
    body smallint,
    acidity smallint,
    tannin smallint,
    alcohol_perception smallint,
    fruit_ripeness smallint,
    oak_presence smallint,
    earthy smallint,
    mineral smallint,
    savory smallint,
    aromatic_intensity smallint,
    sweetness_perception smallint,
    bitterness_phenolic_grip smallint,
    finish_length smallint,
    concentration smallint,
    freshness smallint,
    balance_body_acid smallint,
    balance_sweet_acid smallint,
    balance_tannin_fruit smallint,
    balance_alcohol_body smallint,
    balance_oak_fruit smallint,
    overall_balance smallint,
    primary_aroma_clusters text,
    secondary_aroma_clusters text,
    tertiary_aroma_clusters text,
    oak_character text,
    texture text,
    style_families text,
    price_range text,
    drinking_window text,
    sweetness_level text,
    alcohol_range text,
    confidence_notes text,
    CONSTRAINT base_profiles_acidity_check CHECK (((acidity >= 1) AND (acidity <= 5))),
    CONSTRAINT base_profiles_alcohol_perception_check CHECK (((alcohol_perception >= 1) AND (alcohol_perception <= 5))),
    CONSTRAINT base_profiles_aromatic_intensity_check CHECK (((aromatic_intensity >= 1) AND (aromatic_intensity <= 5))),
    CONSTRAINT base_profiles_balance_alcohol_body_check CHECK (((balance_alcohol_body >= 1) AND (balance_alcohol_body <= 5))),
    CONSTRAINT base_profiles_balance_body_acid_check CHECK (((balance_body_acid >= 1) AND (balance_body_acid <= 5))),
    CONSTRAINT base_profiles_balance_oak_fruit_check CHECK (((balance_oak_fruit >= 1) AND (balance_oak_fruit <= 5))),
    CONSTRAINT base_profiles_balance_sweet_acid_check CHECK (((balance_sweet_acid >= 1) AND (balance_sweet_acid <= 5))),
    CONSTRAINT base_profiles_balance_tannin_fruit_check CHECK (((balance_tannin_fruit >= 1) AND (balance_tannin_fruit <= 5))),
    CONSTRAINT base_profiles_bitterness_phenolic_grip_check CHECK (((bitterness_phenolic_grip >= 1) AND (bitterness_phenolic_grip <= 5))),
    CONSTRAINT base_profiles_body_check CHECK (((body >= 1) AND (body <= 5))),
    CONSTRAINT base_profiles_concentration_check CHECK (((concentration >= 1) AND (concentration <= 5))),
    CONSTRAINT base_profiles_earthy_check CHECK (((earthy >= 1) AND (earthy <= 5))),
    CONSTRAINT base_profiles_finish_length_check CHECK (((finish_length >= 1) AND (finish_length <= 5))),
    CONSTRAINT base_profiles_freshness_check CHECK (((freshness >= 1) AND (freshness <= 5))),
    CONSTRAINT base_profiles_fruit_ripeness_check CHECK (((fruit_ripeness >= 1) AND (fruit_ripeness <= 5))),
    CONSTRAINT base_profiles_mineral_check CHECK (((mineral >= 1) AND (mineral <= 5))),
    CONSTRAINT base_profiles_oak_presence_check CHECK (((oak_presence >= 1) AND (oak_presence <= 5))),
    CONSTRAINT base_profiles_overall_balance_check CHECK (((overall_balance >= 1) AND (overall_balance <= 5))),
    CONSTRAINT base_profiles_savory_check CHECK (((savory >= 1) AND (savory <= 5))),
    CONSTRAINT base_profiles_sweetness_perception_check CHECK (((sweetness_perception >= 1) AND (sweetness_perception <= 5))),
    CONSTRAINT base_profiles_tannin_check CHECK (((tannin >= 1) AND (tannin <= 5)))
);


ALTER TABLE public.base_profiles OWNER TO postgres;

--
-- Name: base_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.base_profiles ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.base_profiles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cellar_custom_field_defs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cellar_custom_field_defs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    field_name text NOT NULL,
    field_type text DEFAULT 'text'::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cellar_custom_field_defs_field_type_check CHECK ((field_type = ANY (ARRAY['text'::text, 'number'::text, 'date'::text])))
);


ALTER TABLE public.cellar_custom_field_defs OWNER TO postgres;

--
-- Name: cellar_custom_field_values; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cellar_custom_field_values (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_id uuid NOT NULL,
    field_def_id uuid NOT NULL,
    value text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.cellar_custom_field_values OWNER TO postgres;

--
-- Name: classification_tier_aging_modifiers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.classification_tier_aging_modifiers (
    id bigint NOT NULL,
    classification_system text,
    tier_name text,
    quality_rank integer,
    youth_end_shift numeric,
    development_end_shift numeric,
    peak_end_shift numeric,
    decline_end_shift numeric,
    source_urls text,
    confidence numeric,
    notes text
);


ALTER TABLE public.classification_tier_aging_modifiers OWNER TO postgres;

--
-- Name: classification_tier_aging_modifiers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.classification_tier_aging_modifiers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.classification_tier_aging_modifiers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: classification_tier_modifiers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.classification_tier_modifiers (
    id bigint NOT NULL,
    classification_system text,
    tier_name text,
    quality_rank integer,
    delta_body numeric,
    delta_acidity numeric,
    delta_tannin numeric,
    delta_alcohol_perception numeric,
    delta_fruit_ripeness numeric,
    delta_oak_presence numeric,
    delta_earthy numeric,
    delta_mineral numeric,
    delta_savory numeric,
    delta_aromatic_intensity numeric,
    delta_sweetness_perception numeric,
    delta_finish_length numeric,
    delta_concentration numeric,
    delta_freshness numeric,
    delta_complexity numeric,
    price_range_override text,
    drinking_window_override text,
    alcohol_range_override text,
    style_family_additions text,
    tertiary_aroma_additions text,
    regulatory_basis text,
    source_urls text,
    confidence numeric
);


ALTER TABLE public.classification_tier_modifiers OWNER TO postgres;

--
-- Name: classification_tier_modifiers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.classification_tier_modifiers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.classification_tier_modifiers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: content_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.content_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reporter_id uuid NOT NULL,
    target_type text NOT NULL,
    entry_id uuid,
    comment_id uuid,
    target_user_id uuid NOT NULL,
    reason text,
    details text,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT content_reports_check CHECK ((reporter_id <> target_user_id)),
    CONSTRAINT content_reports_check1 CHECK ((((target_type = 'entry'::text) AND (entry_id IS NOT NULL) AND (comment_id IS NULL)) OR ((target_type = 'comment'::text) AND (comment_id IS NOT NULL)))),
    CONSTRAINT content_reports_details_check CHECK (((details IS NULL) OR (char_length(details) <= 2000))),
    CONSTRAINT content_reports_reason_check CHECK (((reason IS NULL) OR (char_length(reason) <= 200))),
    CONSTRAINT content_reports_status_check CHECK ((status = ANY (ARRAY['open'::text, 'reviewing'::text, 'resolved'::text, 'dismissed'::text]))),
    CONSTRAINT content_reports_target_type_check CHECK ((target_type = ANY (ARRAY['entry'::text, 'comment'::text])))
);


ALTER TABLE public.content_reports OWNER TO postgres;

--
-- Name: entry_comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.entry_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_id uuid NOT NULL,
    user_id uuid NOT NULL,
    parent_comment_id uuid,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT entry_comments_body_max_len CHECK ((char_length(body) <= 1000)),
    CONSTRAINT entry_comments_body_not_blank CHECK ((char_length(TRIM(BOTH FROM body)) > 0))
);


ALTER TABLE public.entry_comments OWNER TO postgres;

--
-- Name: entry_comparison_feedback; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.entry_comparison_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    new_entry_id uuid NOT NULL,
    comparison_entry_id uuid NOT NULL,
    response public.entry_comparison_response NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entry_comparison_feedback_check CHECK ((new_entry_id <> comparison_entry_id))
);


ALTER TABLE public.entry_comparison_feedback OWNER TO postgres;

--
-- Name: entry_group_slides; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.entry_group_slides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    entry_id uuid,
    photo_type text NOT NULL,
    path text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entry_group_slides_type_check CHECK ((photo_type = ANY (ARRAY['label'::text, 'place'::text, 'people'::text, 'pairing'::text, 'lineup'::text, 'other_bottles'::text])))
);


ALTER TABLE public.entry_group_slides OWNER TO postgres;

--
-- Name: entry_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.entry_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    mode public.entry_group_mode DEFAULT 'event'::public.entry_group_mode NOT NULL,
    title text NOT NULL,
    anchor_entry_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    event_type text,
    CONSTRAINT entry_groups_title_not_blank CHECK ((char_length(btrim(title)) > 0))
);


ALTER TABLE public.entry_groups OWNER TO postgres;

--
-- Name: entry_photos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.entry_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_id uuid NOT NULL,
    type text NOT NULL,
    path text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entry_photos_type_check CHECK ((type = ANY (ARRAY['label'::text, 'place'::text, 'people'::text, 'pairing'::text, 'lineup'::text, 'other_bottles'::text])))
);


ALTER TABLE public.entry_photos OWNER TO postgres;

--
-- Name: entry_primary_grapes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.entry_primary_grapes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_id uuid NOT NULL,
    variety_id uuid NOT NULL,
    "position" smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entry_primary_grapes_position_check CHECK ((("position" >= 1) AND ("position" <= 3)))
);


ALTER TABLE public.entry_primary_grapes OWNER TO postgres;

--
-- Name: entry_reactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.entry_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_id uuid NOT NULL,
    user_id uuid NOT NULL,
    emoji text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.entry_reactions OWNER TO postgres;

--
-- Name: friend_notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.friend_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    friend_request_id uuid NOT NULL,
    type text DEFAULT 'friend_request_accepted'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    seen_at timestamp with time zone
);


ALTER TABLE public.friend_notifications OWNER TO postgres;

--
-- Name: friend_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.friend_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requester_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    responded_at timestamp with time zone,
    seen_at timestamp with time zone,
    CONSTRAINT friend_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text])))
);


ALTER TABLE public.friend_requests OWNER TO postgres;

--
-- Name: general_knowledge_chunks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.general_knowledge_chunks (
    id bigint NOT NULL,
    document_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    embedding public.vector(1536),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.general_knowledge_chunks OWNER TO postgres;

--
-- Name: general_knowledge_chunks_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.general_knowledge_chunks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.general_knowledge_chunks_id_seq OWNER TO postgres;

--
-- Name: general_knowledge_chunks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.general_knowledge_chunks_id_seq OWNED BY public.general_knowledge_chunks.id;


--
-- Name: grape_aliases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.grape_aliases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    variety_id uuid NOT NULL,
    alias text NOT NULL,
    alias_normalized text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.grape_aliases OWNER TO postgres;

--
-- Name: grape_sensitivity_coefficients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.grape_sensitivity_coefficients (
    id bigint NOT NULL,
    grape text,
    color text,
    skin_thickness text,
    typical_tannin text,
    oxidation_resistance text,
    heat_sensitivity text,
    cold_sensitivity text,
    rain_sensitivity text,
    drought_sensitivity text,
    aging_potential_multiplier text,
    notes text,
    source_notes text
);


ALTER TABLE public.grape_sensitivity_coefficients OWNER TO postgres;

--
-- Name: grape_sensitivity_coefficients_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.grape_sensitivity_coefficients ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.grape_sensitivity_coefficients_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: grape_varieties; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.grape_varieties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.grape_varieties OWNER TO postgres;

--
-- Name: knowledge_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knowledge_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    source_url text,
    source_filename text,
    content_type text DEFAULT 'markdown'::text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    ingest_status text DEFAULT 'pending'::text NOT NULL,
    chunk_count integer DEFAULT 0 NOT NULL,
    last_ingested_at timestamp with time zone,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.knowledge_documents OWNER TO postgres;

--
-- Name: launch_feedback; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.launch_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    email text,
    category text NOT NULL,
    message text NOT NULL,
    page_path text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT launch_feedback_category_check CHECK ((category = ANY (ARRAY['bug'::text, 'idea'::text, 'ux'::text, 'other'::text])))
);


ALTER TABLE public.launch_feedback OWNER TO postgres;

--
-- Name: list_scan_results; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.list_scan_results (
    scan_id text NOT NULL,
    user_id uuid NOT NULL,
    source_type text NOT NULL,
    source_label text,
    venue_name text,
    list_title text,
    overall_confidence integer,
    scanned_at timestamp with time zone DEFAULT now() NOT NULL,
    raw_result jsonb NOT NULL,
    CONSTRAINT list_scan_results_confidence_check CHECK (((overall_confidence IS NULL) OR ((overall_confidence >= 0) AND (overall_confidence <= 100)))),
    CONSTRAINT list_scan_results_raw_result_check CHECK ((jsonb_typeof(raw_result) = 'object'::text)),
    CONSTRAINT list_scan_results_source_type_check CHECK ((source_type = ANY (ARRAY['image'::text, 'pdf'::text, 'url'::text])))
);


ALTER TABLE public.list_scan_results OWNER TO postgres;

--
-- Name: list_scan_wines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.list_scan_wines (
    id text NOT NULL,
    scan_id text NOT NULL,
    user_id uuid NOT NULL,
    source_order integer NOT NULL,
    menu_label text NOT NULL,
    producer text,
    wine_name text,
    vintage text,
    wine_type text NOT NULL,
    price_display text,
    price_value numeric(10,2),
    varietals text[] DEFAULT '{}'::text[] NOT NULL,
    regions text[] DEFAULT '{}'::text[] NOT NULL,
    match_percent integer NOT NULL,
    parse_confidence integer NOT NULL,
    rationale text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT list_scan_wines_match_percent_check CHECK (((match_percent >= 0) AND (match_percent <= 100))),
    CONSTRAINT list_scan_wines_parse_confidence_check CHECK (((parse_confidence >= 0) AND (parse_confidence <= 100))),
    CONSTRAINT list_scan_wines_wine_type_check CHECK ((wine_type = ANY (ARRAY['sparkling'::text, 'white'::text, 'rose'::text, 'orange'::text, 'red'::text, 'dessert_fortified'::text, 'unknown'::text])))
);


ALTER TABLE public.list_scan_wines OWNER TO postgres;

--
-- Name: palate_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.palate_profiles (
    user_id uuid NOT NULL,
    profile jsonb NOT NULL,
    signal_hash text NOT NULL,
    model text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.palate_profiles OWNER TO postgres;

--
-- Name: post_shares; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.post_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    mode text DEFAULT 'unlisted'::text NOT NULL,
    CONSTRAINT post_shares_mode_check CHECK ((mode = 'unlisted'::text))
);


ALTER TABLE public.post_shares OWNER TO postgres;

--
-- Name: producer_aliases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.producer_aliases (
    id bigint NOT NULL,
    alias text NOT NULL,
    canonical_producer_name text NOT NULL,
    alias_type text NOT NULL,
    CONSTRAINT producer_aliases_alias_type_check CHECK ((alias_type = ANY (ARRAY['exact'::text, 'common'::text, 'abbreviation'::text, 'alternate'::text, 'historical'::text, 'alternate_name'::text, 'alternate_spelling'::text, 'informal'::text, 'no_accents'::text, 'no_prefix'::text])))
);


ALTER TABLE public.producer_aliases OWNER TO postgres;

--
-- Name: producer_aliases_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.producer_aliases ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.producer_aliases_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: producer_modifiers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.producer_modifiers (
    id bigint NOT NULL,
    producer_name text,
    region text,
    appellation text,
    wine_type text,
    grapes text,
    winemaking_approach text,
    style_keywords text,
    price_tier_numeric numeric,
    delta_body numeric,
    delta_acidity numeric,
    delta_tannin numeric,
    delta_fruit_ripeness numeric,
    delta_oak_presence numeric,
    delta_concentration numeric,
    delta_earthy numeric,
    delta_aromatic_intensity numeric,
    house_style_descriptors text,
    vs_regional_average text,
    sensory_signatures text,
    winemaking_style_detail text,
    price_tier_label text,
    sources text,
    confidence numeric
);


ALTER TABLE public.producer_modifiers OWNER TO postgres;

--
-- Name: producer_modifiers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.producer_modifiers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.producer_modifiers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: producer_region_crosswalk; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.producer_region_crosswalk (
    id bigint NOT NULL,
    producer_modifier_region text,
    profile_country text,
    profile_region text,
    profile_sub_region text,
    match_quality text
);


ALTER TABLE public.producer_region_crosswalk OWNER TO postgres;

--
-- Name: producer_region_crosswalk_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.producer_region_crosswalk ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.producer_region_crosswalk_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    display_name text,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    privacy_confirmed_at timestamp with time zone,
    avatar_path text,
    default_entry_privacy public.privacy_level DEFAULT 'public'::public.privacy_level NOT NULL,
    first_name text,
    last_name text,
    phone text,
    default_reaction_privacy public.privacy_level DEFAULT 'public'::public.privacy_level NOT NULL,
    default_comments_privacy public.privacy_level DEFAULT 'friends_of_friends'::public.privacy_level NOT NULL,
    bio text,
    is_test_account boolean DEFAULT false NOT NULL,
    name_display_preference text DEFAULT 'real_name'::text NOT NULL,
    audience_mode text DEFAULT 'explorer'::text NOT NULL,
    featured_badge_id text,
    featured_badge_ids text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT profiles_audience_mode_check CHECK ((audience_mode = ANY (ARRAY['explorer'::text, 'enthusiast'::text, 'connoisseur'::text]))),
    CONSTRAINT profiles_featured_badge_ids_max_five CHECK (((featured_badge_ids IS NULL) OR (array_length(featured_badge_ids, 1) IS NULL) OR (array_length(featured_badge_ids, 1) <= 5))),
    CONSTRAINT profiles_name_display_preference_check CHECK ((name_display_preference = ANY (ARRAY['real_name'::text, 'username'::text])))
);


ALTER TABLE public.profiles OWNER TO postgres;

--
-- Name: public_profiles; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.public_profiles AS
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
   FROM public.profiles;


ALTER VIEW public.public_profiles OWNER TO postgres;

--
-- Name: region_aliases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.region_aliases (
    id bigint NOT NULL,
    alias text NOT NULL,
    canonical_region text NOT NULL,
    canonical_sub_region text,
    canonical_country text NOT NULL,
    alias_type text NOT NULL,
    CONSTRAINT region_aliases_alias_type_check CHECK ((alias_type = ANY (ARRAY['exact'::text, 'common'::text, 'abbreviation'::text, 'alternate'::text, 'historical'::text, 'alternate_name'::text, 'alternate_spelling'::text, 'informal'::text, 'no_accents'::text, 'no_prefix'::text])))
);


ALTER TABLE public.region_aliases OWNER TO postgres;

--
-- Name: region_aliases_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.region_aliases ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.region_aliases_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: scan_resolution_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scan_resolution_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_id uuid,
    user_id uuid NOT NULL,
    raw_region text,
    raw_producer text,
    raw_classification text,
    raw_wine_type text,
    canonical_region text,
    canonical_producer text,
    canonical_classification text,
    resolution_confidence numeric(4,3),
    fallback_level smallint,
    resolution_source text DEFAULT 'stub'::text NOT NULL,
    region_alias_matched boolean DEFAULT false NOT NULL,
    producer_alias_matched boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    canonical_country text,
    canonical_sub_region text,
    CONSTRAINT scan_resolution_log_confidence_check CHECK (((resolution_confidence IS NULL) OR ((resolution_confidence >= (0)::numeric) AND (resolution_confidence <= (1)::numeric)))),
    CONSTRAINT scan_resolution_log_fallback_level_check CHECK (((fallback_level IS NULL) OR ((fallback_level >= 1) AND (fallback_level <= 6)))),
    CONSTRAINT scan_resolution_log_source_check CHECK ((resolution_source = ANY (ARRAY['stub'::text, 'alias_map'::text, 'exact'::text])))
);


ALTER TABLE public.scan_resolution_log OWNER TO postgres;

--
-- Name: sommelier_conversations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sommelier_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.sommelier_conversations OWNER TO postgres;

--
-- Name: sommelier_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sommelier_messages (
    id bigint NOT NULL,
    conversation_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sommelier_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);


ALTER TABLE public.sommelier_messages OWNER TO postgres;

--
-- Name: sommelier_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.sommelier_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sommelier_messages_id_seq OWNER TO postgres;

--
-- Name: sommelier_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.sommelier_messages_id_seq OWNED BY public.sommelier_messages.id;


--
-- Name: taste_survey_responses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.taste_survey_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    wine_types text[] DEFAULT '{}'::text[] NOT NULL,
    varietals text[] DEFAULT '{}'::text[] NOT NULL,
    regions text[] DEFAULT '{}'::text[] NOT NULL,
    countries text[] DEFAULT '{}'::text[] NOT NULL,
    sensory_loves text[] DEFAULT '{}'::text[] NOT NULL,
    sensory_avoids text[] DEFAULT '{}'::text[] NOT NULL,
    budget_restaurant text,
    budget_retail text,
    adventurousness integer DEFAULT 5 NOT NULL,
    free_text text,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.taste_survey_responses OWNER TO postgres;

--
-- Name: taxonomy_classification_tiers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.taxonomy_classification_tiers (
    id bigint NOT NULL,
    country text,
    region text,
    sub_region text,
    classification_system text,
    tier_name text,
    tier_label text,
    quality_rank integer,
    description text
);


ALTER TABLE public.taxonomy_classification_tiers OWNER TO postgres;

--
-- Name: taxonomy_classification_tiers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.taxonomy_classification_tiers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.taxonomy_classification_tiers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: taxonomy_master_v2; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.taxonomy_master_v2 (
    id bigint NOT NULL,
    term text,
    category text,
    parent_category text,
    description text,
    scale_1_5_labels text,
    wset_alignment text,
    examples text,
    edge_cases text,
    status text,
    version text
);


ALTER TABLE public.taxonomy_master_v2 OWNER TO postgres;

--
-- Name: taxonomy_master_v2_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.taxonomy_master_v2 ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.taxonomy_master_v2_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: taxonomy_price_ranges; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.taxonomy_price_ranges (
    id bigint NOT NULL,
    price_range text,
    range_order integer,
    description text
);


ALTER TABLE public.taxonomy_price_ranges OWNER TO postgres;

--
-- Name: taxonomy_price_ranges_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.taxonomy_price_ranges ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.taxonomy_price_ranges_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_badges; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_badges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    badge_id text NOT NULL,
    earned_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_badges OWNER TO postgres;

--
-- Name: user_blocks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_blocks (
    blocker_id uuid NOT NULL,
    blocked_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_blocks_check CHECK ((blocker_id <> blocked_id))
);


ALTER TABLE public.user_blocks OWNER TO postgres;

--
-- Name: user_collection_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_collection_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    collection_id uuid NOT NULL,
    user_id uuid NOT NULL,
    entry_id uuid NOT NULL,
    snapshot_entry_group_id uuid,
    snapshot_wine_name text,
    snapshot_producer text,
    snapshot_vintage text,
    snapshot_consumed_at date,
    snapshot_preview_image_path text,
    snapshot_label_image_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_collection_items OWNER TO postgres;

--
-- Name: user_collections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_collections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    cover_image_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_collections_name_not_blank CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 80)))
);


ALTER TABLE public.user_collections OWNER TO postgres;

--
-- Name: user_entry_knowledge_chunks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_entry_knowledge_chunks (
    id bigint NOT NULL,
    entry_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    embedding public.vector(1536) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_entry_knowledge_chunks OWNER TO postgres;

--
-- Name: user_entry_knowledge_chunks_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_entry_knowledge_chunks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_entry_knowledge_chunks_id_seq OWNER TO postgres;

--
-- Name: user_entry_knowledge_chunks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_entry_knowledge_chunks_id_seq OWNED BY public.user_entry_knowledge_chunks.id;


--
-- Name: vintage_weather_modifiers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vintage_weather_modifiers (
    id bigint NOT NULL,
    country text NOT NULL,
    region text NOT NULL,
    sub_region text,
    vintage smallint NOT NULL,
    temp_label text,
    temp_score numeric(3,1),
    rain_label text,
    rain_score numeric(3,1),
    is_compound_rain boolean DEFAULT false NOT NULL,
    notes text,
    quality_indicator numeric(3,1),
    red_delta_body numeric(5,2),
    red_delta_acidity numeric(5,2),
    red_delta_tannin numeric(5,2),
    red_delta_alcohol_perception numeric(5,2),
    red_delta_fruit_ripeness numeric(5,2),
    red_delta_oak_presence numeric(5,2),
    red_delta_earthy numeric(5,2),
    red_delta_mineral numeric(5,2),
    red_delta_savory numeric(5,2),
    red_delta_aromatic_intensity numeric(5,2),
    red_delta_sweetness_perception numeric(5,2),
    red_delta_bitterness_phenolic numeric(5,2),
    red_delta_finish_length numeric(5,2),
    red_delta_concentration numeric(5,2),
    red_delta_freshness numeric(5,2),
    white_delta_body numeric(5,2),
    white_delta_acidity numeric(5,2),
    white_delta_tannin numeric(5,2),
    white_delta_alcohol_perception numeric(5,2),
    white_delta_fruit_ripeness numeric(5,2),
    white_delta_oak_presence numeric(5,2),
    white_delta_earthy numeric(5,2),
    white_delta_mineral numeric(5,2),
    white_delta_savory numeric(5,2),
    white_delta_aromatic_intensity numeric(5,2),
    white_delta_sweetness_perception numeric(5,2),
    white_delta_bitterness_phenolic numeric(5,2),
    white_delta_finish_length numeric(5,2),
    white_delta_concentration numeric(5,2),
    white_delta_freshness numeric(5,2),
    youth_end_shift numeric(4,1),
    development_end_shift numeric(4,1),
    peak_end_shift numeric(4,1),
    decline_end_shift numeric(4,1),
    confidence numeric(3,2),
    rain_parse_note text
);


ALTER TABLE public.vintage_weather_modifiers OWNER TO postgres;

--
-- Name: vintage_weather_modifiers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.vintage_weather_modifiers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.vintage_weather_modifiers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: wine_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wine_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    wine_name text,
    producer text,
    vintage text,
    region text,
    rating integer,
    notes text,
    location_text text,
    consumed_at date DEFAULT CURRENT_DATE NOT NULL,
    label_image_path text,
    place_image_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tasted_with_user_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    pairing_image_path text,
    country text,
    appellation text,
    entry_privacy text DEFAULT 'private'::text,
    label_photo_privacy text,
    place_photo_privacy text,
    advanced_notes jsonb,
    price_paid numeric(10,2),
    price_paid_source public.price_paid_source,
    qpr_level public.qpr_level,
    price_paid_currency public.price_paid_currency,
    classification text,
    root_entry_id uuid,
    is_feed_visible boolean DEFAULT true NOT NULL,
    location_place_id text,
    comments_scope text DEFAULT 'viewers'::text NOT NULL,
    reaction_privacy public.privacy_level DEFAULT 'public'::public.privacy_level NOT NULL,
    comments_privacy public.privacy_level DEFAULT 'public'::public.privacy_level NOT NULL,
    survey_how_was_it public.entry_survey_how_was_it,
    survey_expectation_match public.entry_survey_expectation_match,
    survey_drink_again public.entry_survey_drink_again,
    drinking_now boolean DEFAULT false NOT NULL,
    entry_group_id uuid,
    wine_type public.wine_type,
    raw_region text,
    raw_producer text,
    raw_classification text,
    raw_wine_type text,
    canonical_region text,
    canonical_producer text,
    canonical_classification text,
    resolution_confidence numeric(4,3),
    fallback_level smallint,
    canonical_country text,
    canonical_sub_region text,
    survey_enjoyment_intent public.entry_survey_enjoyment_intent,
    assembled_sensory jsonb,
    sensory_resolved_at timestamp with time zone,
    entry_status text DEFAULT 'consumed'::text NOT NULL,
    cellar_quantity integer,
    bottle_format text,
    cellared_from_id uuid,
    CONSTRAINT wine_entries_advanced_notes_object_check CHECK (((advanced_notes IS NULL) OR (jsonb_typeof(advanced_notes) = 'object'::text))),
    CONSTRAINT wine_entries_bottle_format_check CHECK (((bottle_format IS NULL) OR (bottle_format = ANY (ARRAY['375ml'::text, '750ml'::text, '1.5L'::text, '3L'::text, '5L'::text, '6L'::text, 'other'::text])))),
    CONSTRAINT wine_entries_cellar_quantity_check CHECK (((cellar_quantity IS NULL) OR (cellar_quantity >= 0))),
    CONSTRAINT wine_entries_comments_scope_check CHECK ((comments_scope = ANY (ARRAY['viewers'::text, 'friends'::text]))),
    CONSTRAINT wine_entries_entry_status_check CHECK ((entry_status = ANY (ARRAY['consumed'::text, 'cellaring'::text]))),
    CONSTRAINT wine_entries_fallback_level_check CHECK (((fallback_level IS NULL) OR ((fallback_level >= 1) AND (fallback_level <= 6)))),
    CONSTRAINT wine_entries_price_paid_non_negative_check CHECK (((price_paid IS NULL) OR (price_paid >= (0)::numeric))),
    CONSTRAINT wine_entries_price_source_requires_price_check CHECK ((((price_paid IS NULL) AND (price_paid_source IS NULL) AND (price_paid_currency IS NULL)) OR ((price_paid IS NOT NULL) AND (price_paid_source IS NOT NULL) AND (price_paid_currency IS NOT NULL)))),
    CONSTRAINT wine_entries_rating_check CHECK (((rating IS NULL) OR ((rating >= 1) AND (rating <= 100)))),
    CONSTRAINT wine_entries_resolution_confidence_check CHECK (((resolution_confidence IS NULL) OR ((resolution_confidence >= (0)::numeric) AND (resolution_confidence <= (1)::numeric)))),
    CONSTRAINT wine_entries_root_entry_id_check CHECK (((root_entry_id IS NULL) OR (root_entry_id <> id)))
);


ALTER TABLE public.wine_entries OWNER TO postgres;

--
-- Name: wine_entry_scores; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wine_entry_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wine_entry_id uuid NOT NULL,
    user_id uuid NOT NULL,
    match_score integer NOT NULL,
    match_band text NOT NULL,
    confidence numeric(4,3),
    display_score boolean DEFAULT false NOT NULL,
    axis_breakdown jsonb DEFAULT '{}'::jsonb NOT NULL,
    effective_profile jsonb DEFAULT '{}'::jsonb NOT NULL,
    modifiers_applied jsonb DEFAULT '[]'::jsonb NOT NULL,
    preference_event_count integer DEFAULT 0 NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wine_entry_scores_confidence_check CHECK (((confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))),
    CONSTRAINT wine_entry_scores_match_band_check CHECK ((match_band = ANY (ARRAY['excellent'::text, 'strong'::text, 'decent'::text, 'not_your_style'::text]))),
    CONSTRAINT wine_entry_scores_match_score_check CHECK (((match_score >= 0) AND (match_score <= 100))),
    CONSTRAINT wine_entry_scores_preference_event_count_check CHECK ((preference_event_count >= 0))
);


ALTER TABLE public.wine_entry_scores OWNER TO postgres;

--
-- Name: wine_knowledge_chunks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wine_knowledge_chunks (
    id bigint NOT NULL,
    source_table text NOT NULL,
    source_row_id text NOT NULL,
    chunk_index integer DEFAULT 0 NOT NULL,
    content text NOT NULL,
    embedding public.vector(1536),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wine_knowledge_curated_only CHECK ((source_table <> 'wine_entries'::text))
);


ALTER TABLE public.wine_knowledge_chunks OWNER TO postgres;

--
-- Name: wine_knowledge_chunks_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.wine_knowledge_chunks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.wine_knowledge_chunks_id_seq OWNER TO postgres;

--
-- Name: wine_knowledge_chunks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.wine_knowledge_chunks_id_seq OWNED BY public.wine_knowledge_chunks.id;


--
-- Name: wine_notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wine_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entry_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    type text DEFAULT 'tagged'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    seen_at timestamp with time zone
);


ALTER TABLE public.wine_notifications OWNER TO postgres;

--
-- Name: wine_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wine_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_type text NOT NULL,
    slug text NOT NULL,
    display_name text NOT NULL,
    content jsonb,
    hero_image_url text,
    hero_image_attribution text,
    sensory_data jsonb,
    related_slugs jsonb,
    last_refreshed timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    audience_mode text DEFAULT 'enthusiast'::text NOT NULL,
    CONSTRAINT wine_profiles_audience_mode_check CHECK ((audience_mode = ANY (ARRAY['explorer'::text, 'enthusiast'::text, 'connoisseur'::text]))),
    CONSTRAINT wine_profiles_profile_type_check CHECK ((profile_type = ANY (ARRAY['grape'::text, 'region'::text, 'producer'::text])))
);


ALTER TABLE public.wine_profiles OWNER TO postgres;

--
-- Name: appellation_grape_map id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appellation_grape_map ALTER COLUMN id SET DEFAULT nextval('public.appellation_grape_map_id_seq'::regclass);


--
-- Name: general_knowledge_chunks id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.general_knowledge_chunks ALTER COLUMN id SET DEFAULT nextval('public.general_knowledge_chunks_id_seq'::regclass);


--
-- Name: sommelier_messages id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sommelier_messages ALTER COLUMN id SET DEFAULT nextval('public.sommelier_messages_id_seq'::regclass);


--
-- Name: user_entry_knowledge_chunks id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_entry_knowledge_chunks ALTER COLUMN id SET DEFAULT nextval('public.user_entry_knowledge_chunks_id_seq'::regclass);


--
-- Name: wine_knowledge_chunks id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wine_knowledge_chunks ALTER COLUMN id SET DEFAULT nextval('public.wine_knowledge_chunks_id_seq'::regclass);


--
-- Name: aging_curve_baselines aging_curve_baselines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.aging_curve_baselines
    ADD CONSTRAINT aging_curve_baselines_pkey PRIMARY KEY (id);


--
-- Name: api_rate_limits api_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_rate_limits
    ADD CONSTRAINT api_rate_limits_pkey PRIMARY KEY (route_key, subject);


--
-- Name: appellation_grape_map appellation_grape_map_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appellation_grape_map
    ADD CONSTRAINT appellation_grape_map_pkey PRIMARY KEY (id);


--
-- Name: base_profiles base_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.base_profiles
    ADD CONSTRAINT base_profiles_pkey PRIMARY KEY (id);


--
-- Name: cellar_custom_field_defs cellar_custom_field_defs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cellar_custom_field_defs
    ADD CONSTRAINT cellar_custom_field_defs_pkey PRIMARY KEY (id);


--
-- Name: cellar_custom_field_defs cellar_custom_field_defs_user_id_field_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cellar_custom_field_defs
    ADD CONSTRAINT cellar_custom_field_defs_user_id_field_name_key UNIQUE (user_id, field_name);


--
-- Name: cellar_custom_field_values cellar_custom_field_values_entry_id_field_def_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cellar_custom_field_values
    ADD CONSTRAINT cellar_custom_field_values_entry_id_field_def_id_key UNIQUE (entry_id, field_def_id);


--
-- Name: cellar_custom_field_values cellar_custom_field_values_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cellar_custom_field_values
    ADD CONSTRAINT cellar_custom_field_values_pkey PRIMARY KEY (id);


--
-- Name: classification_tier_aging_modifiers classification_tier_aging_modifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classification_tier_aging_modifiers
    ADD CONSTRAINT classification_tier_aging_modifiers_pkey PRIMARY KEY (id);


--
-- Name: classification_tier_modifiers classification_tier_modifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classification_tier_modifiers
    ADD CONSTRAINT classification_tier_modifiers_pkey PRIMARY KEY (id);


--
-- Name: content_reports content_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_pkey PRIMARY KEY (id);


--
-- Name: entry_comments entry_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_comments
    ADD CONSTRAINT entry_comments_pkey PRIMARY KEY (id);


--
-- Name: entry_comparison_feedback entry_comparison_feedback_new_entry_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_comparison_feedback
    ADD CONSTRAINT entry_comparison_feedback_new_entry_id_key UNIQUE (new_entry_id);


--
-- Name: entry_comparison_feedback entry_comparison_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_comparison_feedback
    ADD CONSTRAINT entry_comparison_feedback_pkey PRIMARY KEY (id);


--
-- Name: entry_group_slides entry_group_slides_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_group_slides
    ADD CONSTRAINT entry_group_slides_pkey PRIMARY KEY (id);


--
-- Name: entry_groups entry_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_groups
    ADD CONSTRAINT entry_groups_pkey PRIMARY KEY (id);


--
-- Name: entry_photos entry_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_photos
    ADD CONSTRAINT entry_photos_pkey PRIMARY KEY (id);


--
-- Name: entry_primary_grapes entry_primary_grapes_entry_id_position_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_primary_grapes
    ADD CONSTRAINT entry_primary_grapes_entry_id_position_key UNIQUE (entry_id, "position");


--
-- Name: entry_primary_grapes entry_primary_grapes_entry_id_variety_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_primary_grapes
    ADD CONSTRAINT entry_primary_grapes_entry_id_variety_id_key UNIQUE (entry_id, variety_id);


--
-- Name: entry_primary_grapes entry_primary_grapes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_primary_grapes
    ADD CONSTRAINT entry_primary_grapes_pkey PRIMARY KEY (id);


--
-- Name: entry_reactions entry_reactions_entry_id_user_id_emoji_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_reactions
    ADD CONSTRAINT entry_reactions_entry_id_user_id_emoji_key UNIQUE (entry_id, user_id, emoji);


--
-- Name: entry_reactions entry_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_reactions
    ADD CONSTRAINT entry_reactions_pkey PRIMARY KEY (id);


--
-- Name: friend_notifications friend_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.friend_notifications
    ADD CONSTRAINT friend_notifications_pkey PRIMARY KEY (id);


--
-- Name: friend_requests friend_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_pkey PRIMARY KEY (id);


--
-- Name: general_knowledge_chunks general_knowledge_chunks_document_id_chunk_index_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.general_knowledge_chunks
    ADD CONSTRAINT general_knowledge_chunks_document_id_chunk_index_key UNIQUE (document_id, chunk_index);


--
-- Name: general_knowledge_chunks general_knowledge_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.general_knowledge_chunks
    ADD CONSTRAINT general_knowledge_chunks_pkey PRIMARY KEY (id);


--
-- Name: grape_aliases grape_aliases_alias_normalized_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grape_aliases
    ADD CONSTRAINT grape_aliases_alias_normalized_key UNIQUE (alias_normalized);


--
-- Name: grape_aliases grape_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grape_aliases
    ADD CONSTRAINT grape_aliases_pkey PRIMARY KEY (id);


--
-- Name: grape_aliases grape_aliases_variety_id_alias_normalized_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grape_aliases
    ADD CONSTRAINT grape_aliases_variety_id_alias_normalized_key UNIQUE (variety_id, alias_normalized);


--
-- Name: grape_sensitivity_coefficients grape_sensitivity_coefficients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grape_sensitivity_coefficients
    ADD CONSTRAINT grape_sensitivity_coefficients_pkey PRIMARY KEY (id);


--
-- Name: grape_varieties grape_varieties_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grape_varieties
    ADD CONSTRAINT grape_varieties_name_key UNIQUE (name);


--
-- Name: grape_varieties grape_varieties_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grape_varieties
    ADD CONSTRAINT grape_varieties_pkey PRIMARY KEY (id);


--
-- Name: grape_varieties grape_varieties_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grape_varieties
    ADD CONSTRAINT grape_varieties_slug_key UNIQUE (slug);


--
-- Name: knowledge_documents knowledge_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_documents
    ADD CONSTRAINT knowledge_documents_pkey PRIMARY KEY (id);


--
-- Name: launch_feedback launch_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.launch_feedback
    ADD CONSTRAINT launch_feedback_pkey PRIMARY KEY (id);


--
-- Name: list_scan_results list_scan_results_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.list_scan_results
    ADD CONSTRAINT list_scan_results_pkey PRIMARY KEY (scan_id);


--
-- Name: list_scan_wines list_scan_wines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.list_scan_wines
    ADD CONSTRAINT list_scan_wines_pkey PRIMARY KEY (id);


--
-- Name: palate_profiles palate_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.palate_profiles
    ADD CONSTRAINT palate_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: post_shares post_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.post_shares
    ADD CONSTRAINT post_shares_pkey PRIMARY KEY (id);


--
-- Name: producer_aliases producer_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producer_aliases
    ADD CONSTRAINT producer_aliases_pkey PRIMARY KEY (id);


--
-- Name: producer_modifiers producer_modifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producer_modifiers
    ADD CONSTRAINT producer_modifiers_pkey PRIMARY KEY (id);


--
-- Name: producer_region_crosswalk producer_region_crosswalk_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producer_region_crosswalk
    ADD CONSTRAINT producer_region_crosswalk_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: region_aliases region_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.region_aliases
    ADD CONSTRAINT region_aliases_pkey PRIMARY KEY (id);


--
-- Name: scan_resolution_log scan_resolution_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scan_resolution_log
    ADD CONSTRAINT scan_resolution_log_pkey PRIMARY KEY (id);


--
-- Name: sommelier_conversations sommelier_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sommelier_conversations
    ADD CONSTRAINT sommelier_conversations_pkey PRIMARY KEY (id);


--
-- Name: sommelier_messages sommelier_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sommelier_messages
    ADD CONSTRAINT sommelier_messages_pkey PRIMARY KEY (id);


--
-- Name: taste_survey_responses taste_survey_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.taste_survey_responses
    ADD CONSTRAINT taste_survey_responses_pkey PRIMARY KEY (id);


--
-- Name: taste_survey_responses taste_survey_responses_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.taste_survey_responses
    ADD CONSTRAINT taste_survey_responses_user_id_key UNIQUE (user_id);


--
-- Name: taxonomy_classification_tiers taxonomy_classification_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.taxonomy_classification_tiers
    ADD CONSTRAINT taxonomy_classification_tiers_pkey PRIMARY KEY (id);


--
-- Name: taxonomy_master_v2 taxonomy_master_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.taxonomy_master_v2
    ADD CONSTRAINT taxonomy_master_v2_pkey PRIMARY KEY (id);


--
-- Name: taxonomy_price_ranges taxonomy_price_ranges_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.taxonomy_price_ranges
    ADD CONSTRAINT taxonomy_price_ranges_pkey PRIMARY KEY (id);


--
-- Name: user_badges user_badges_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_pkey PRIMARY KEY (id);


--
-- Name: user_badges user_badges_user_badge_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_user_badge_unique UNIQUE (user_id, badge_id);


--
-- Name: user_blocks user_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_pkey PRIMARY KEY (blocker_id, blocked_id);


--
-- Name: user_collection_items user_collection_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_collection_items
    ADD CONSTRAINT user_collection_items_pkey PRIMARY KEY (id);


--
-- Name: user_collections user_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_collections
    ADD CONSTRAINT user_collections_pkey PRIMARY KEY (id);


--
-- Name: user_entry_knowledge_chunks user_entry_knowledge_chunks_entry_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_entry_knowledge_chunks
    ADD CONSTRAINT user_entry_knowledge_chunks_entry_id_key UNIQUE (entry_id);


--
-- Name: user_entry_knowledge_chunks user_entry_knowledge_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_entry_knowledge_chunks
    ADD CONSTRAINT user_entry_knowledge_chunks_pkey PRIMARY KEY (id);


--
-- Name: vintage_weather_modifiers vintage_weather_modifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vintage_weather_modifiers
    ADD CONSTRAINT vintage_weather_modifiers_pkey PRIMARY KEY (id);


--
-- Name: wine_entries wine_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wine_entries
    ADD CONSTRAINT wine_entries_pkey PRIMARY KEY (id);


--
-- Name: wine_entry_scores wine_entry_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wine_entry_scores
    ADD CONSTRAINT wine_entry_scores_pkey PRIMARY KEY (id);


--
-- Name: wine_entry_scores wine_entry_scores_user_entry_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wine_entry_scores
    ADD CONSTRAINT wine_entry_scores_user_entry_unique UNIQUE (wine_entry_id, user_id);


--
-- Name: wine_knowledge_chunks wine_knowledge_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wine_knowledge_chunks
    ADD CONSTRAINT wine_knowledge_chunks_pkey PRIMARY KEY (id);


--
-- Name: wine_knowledge_chunks wine_knowledge_chunks_source_table_source_row_id_chunk_inde_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wine_knowledge_chunks
    ADD CONSTRAINT wine_knowledge_chunks_source_table_source_row_id_chunk_inde_key UNIQUE (source_table, source_row_id, chunk_index);


--
-- Name: wine_notifications wine_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wine_notifications
    ADD CONSTRAINT wine_notifications_pkey PRIMARY KEY (id);


--
-- Name: wine_profiles wine_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wine_profiles
    ADD CONSTRAINT wine_profiles_pkey PRIMARY KEY (id);


--
-- Name: wine_profiles wine_profiles_profile_type_slug_audience_mode_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wine_profiles
    ADD CONSTRAINT wine_profiles_profile_type_slug_audience_mode_key UNIQUE (profile_type, slug, audience_mode);


--
-- Name: api_rate_limits_updated_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX api_rate_limits_updated_at_idx ON public.api_rate_limits USING btree (updated_at);


--
-- Name: base_profiles_lookup_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX base_profiles_lookup_idx ON public.base_profiles USING btree (country, region, wine_type);


--
-- Name: base_profiles_sub_region_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX base_profiles_sub_region_idx ON public.base_profiles USING btree (country, region, sub_region, wine_type) WHERE (sub_region IS NOT NULL);


--
-- Name: content_reports_reporter_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX content_reports_reporter_created_idx ON public.content_reports USING btree (reporter_id, created_at DESC);


--
-- Name: content_reports_target_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX content_reports_target_idx ON public.content_reports USING btree (target_type, entry_id, comment_id, created_at DESC);


--
-- Name: content_reports_unique_active_comment_per_reporter_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX content_reports_unique_active_comment_per_reporter_idx ON public.content_reports USING btree (reporter_id, comment_id) WHERE ((target_type = 'comment'::text) AND (comment_id IS NOT NULL) AND (status = ANY (ARRAY['open'::text, 'reviewing'::text])));


--
-- Name: content_reports_unique_active_entry_per_reporter_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX content_reports_unique_active_entry_per_reporter_idx ON public.content_reports USING btree (reporter_id, entry_id) WHERE ((target_type = 'entry'::text) AND (entry_id IS NOT NULL) AND (status = ANY (ARRAY['open'::text, 'reviewing'::text])));


--
-- Name: entry_comments_deleted_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX entry_comments_deleted_at_idx ON public.entry_comments USING btree (deleted_at);


--
-- Name: entry_comments_entry_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX entry_comments_entry_created_idx ON public.entry_comments USING btree (entry_id, created_at);


--
-- Name: entry_comments_parent_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX entry_comments_parent_idx ON public.entry_comments USING btree (parent_comment_id);


--
-- Name: entry_comments_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX entry_comments_user_idx ON public.entry_comments USING btree (user_id, created_at);


--
-- Name: entry_comparison_feedback_comparison_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX entry_comparison_feedback_comparison_idx ON public.entry_comparison_feedback USING btree (comparison_entry_id);


--
-- Name: entry_comparison_feedback_user_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX entry_comparison_feedback_user_created_idx ON public.entry_comparison_feedback USING btree (user_id, created_at DESC);


--
-- Name: entry_group_slides_entry_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX entry_group_slides_entry_id_idx ON public.entry_group_slides USING btree (entry_id);


--
-- Name: entry_group_slides_group_position_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX entry_group_slides_group_position_idx ON public.entry_group_slides USING btree (group_id, "position", created_at);


--
-- Name: entry_group_slides_group_position_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX entry_group_slides_group_position_unique ON public.entry_group_slides USING btree (group_id, "position");


--
-- Name: entry_groups_anchor_entry_id_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX entry_groups_anchor_entry_id_unique ON public.entry_groups USING btree (anchor_entry_id) WHERE (anchor_entry_id IS NOT NULL);


--
-- Name: entry_groups_user_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX entry_groups_user_created_at_idx ON public.entry_groups USING btree (user_id, created_at DESC);


--
-- Name: entry_photos_entry_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX entry_photos_entry_type ON public.entry_photos USING btree (entry_id, type);


--
-- Name: entry_photos_entry_type_position; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX entry_photos_entry_type_position ON public.entry_photos USING btree (entry_id, type, "position");


--
-- Name: entry_primary_grapes_entry_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX entry_primary_grapes_entry_idx ON public.entry_primary_grapes USING btree (entry_id, "position");


--
-- Name: entry_primary_grapes_variety_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX entry_primary_grapes_variety_idx ON public.entry_primary_grapes USING btree (variety_id);


--
-- Name: entry_reactions_entry_emoji; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX entry_reactions_entry_emoji ON public.entry_reactions USING btree (entry_id, emoji);


--
-- Name: entry_reactions_entry_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX entry_reactions_entry_id ON public.entry_reactions USING btree (entry_id);


--
-- Name: friend_notifications_unique_request_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX friend_notifications_unique_request_type ON public.friend_notifications USING btree (user_id, friend_request_id, type);


--
-- Name: friend_notifications_user_seen_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX friend_notifications_user_seen_created ON public.friend_notifications USING btree (user_id, seen_at, created_at DESC);


--
-- Name: friend_requests_recipient_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX friend_requests_recipient_status ON public.friend_requests USING btree (recipient_id, status);


--
-- Name: friend_requests_requester_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX friend_requests_requester_status ON public.friend_requests USING btree (requester_id, status);


--
-- Name: friend_requests_unique_pair; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX friend_requests_unique_pair ON public.friend_requests USING btree (requester_id, recipient_id);


--
-- Name: grape_aliases_variety_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX grape_aliases_variety_id_idx ON public.grape_aliases USING btree (variety_id);


--
-- Name: idx_agm_appellation_lower; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_agm_appellation_lower ON public.appellation_grape_map USING btree (lower(appellation));


--
-- Name: idx_agm_country_region; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_agm_country_region ON public.appellation_grape_map USING btree (country, region);


--
-- Name: idx_custom_field_defs_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_custom_field_defs_user ON public.cellar_custom_field_defs USING btree (user_id);


--
-- Name: idx_custom_field_values_def; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_custom_field_values_def ON public.cellar_custom_field_values USING btree (field_def_id);


--
-- Name: idx_custom_field_values_entry; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_custom_field_values_entry ON public.cellar_custom_field_values USING btree (entry_id);


--
-- Name: idx_general_knowledge_document; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_general_knowledge_document ON public.general_knowledge_chunks USING btree (document_id, chunk_index);


--
-- Name: idx_general_knowledge_embedding; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_general_knowledge_embedding ON public.general_knowledge_chunks USING hnsw (embedding public.vector_cosine_ops) WHERE (embedding IS NOT NULL);


--
-- Name: idx_knowledge_documents_uploaded_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_knowledge_documents_uploaded_by ON public.knowledge_documents USING btree (uploaded_by, created_at DESC);


--
-- Name: idx_sommelier_conversations_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sommelier_conversations_user ON public.sommelier_conversations USING btree (user_id, updated_at DESC);


--
-- Name: idx_sommelier_messages_conversation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sommelier_messages_conversation ON public.sommelier_messages USING btree (conversation_id, created_at);


--
-- Name: idx_wine_entries_cellar; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_wine_entries_cellar ON public.wine_entries USING btree (user_id, entry_status) WHERE (entry_status = 'cellaring'::text);


--
-- Name: idx_wine_knowledge_embedding; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_wine_knowledge_embedding ON public.wine_knowledge_chunks USING hnsw (embedding public.vector_cosine_ops) WHERE (embedding IS NOT NULL);


--
-- Name: idx_wine_profiles_type_slug_mode; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_wine_profiles_type_slug_mode ON public.wine_profiles USING btree (profile_type, slug, audience_mode);


--
-- Name: launch_feedback_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX launch_feedback_created_at_idx ON public.launch_feedback USING btree (created_at DESC);


--
-- Name: launch_feedback_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX launch_feedback_user_id_idx ON public.launch_feedback USING btree (user_id);


--
-- Name: list_scan_results_user_scanned_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX list_scan_results_user_scanned_at_idx ON public.list_scan_results USING btree (user_id, scanned_at DESC);


--
-- Name: list_scan_wines_scan_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX list_scan_wines_scan_id_idx ON public.list_scan_wines USING btree (scan_id, source_order);


--
-- Name: list_scan_wines_user_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX list_scan_wines_user_created_at_idx ON public.list_scan_wines USING btree (user_id, created_at DESC);


--
-- Name: post_shares_active_post_created_by_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX post_shares_active_post_created_by_idx ON public.post_shares USING btree (post_id, created_by) WHERE (revoked_at IS NULL);


--
-- Name: post_shares_created_by_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX post_shares_created_by_created_at_idx ON public.post_shares USING btree (created_by, created_at DESC);


--
-- Name: post_shares_post_created_by_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX post_shares_post_created_by_created_at_idx ON public.post_shares USING btree (post_id, created_by, created_at DESC);


--
-- Name: producer_aliases_alias_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX producer_aliases_alias_key ON public.producer_aliases USING btree (lower(alias));


--
-- Name: profiles_display_name_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX profiles_display_name_unique ON public.profiles USING btree (lower(display_name)) WHERE (display_name IS NOT NULL);


--
-- Name: profiles_phone_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX profiles_phone_unique ON public.profiles USING btree (phone) WHERE (phone IS NOT NULL);


--
-- Name: region_aliases_alias_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX region_aliases_alias_key ON public.region_aliases USING btree (lower(alias));


--
-- Name: scan_resolution_log_entry_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scan_resolution_log_entry_id_idx ON public.scan_resolution_log USING btree (entry_id);


--
-- Name: scan_resolution_log_user_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scan_resolution_log_user_created_at_idx ON public.scan_resolution_log USING btree (user_id, created_at DESC);


--
-- Name: user_badges_badge_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX user_badges_badge_id_idx ON public.user_badges USING btree (badge_id);


--
-- Name: user_badges_user_earned_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX user_badges_user_earned_at_idx ON public.user_badges USING btree (user_id, earned_at DESC);


--
-- Name: user_blocks_blocked_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX user_blocks_blocked_created_idx ON public.user_blocks USING btree (blocked_id, created_at DESC);


--
-- Name: user_collection_items_collection_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX user_collection_items_collection_created_at_idx ON public.user_collection_items USING btree (collection_id, created_at DESC);


--
-- Name: user_collection_items_collection_entry_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX user_collection_items_collection_entry_unique ON public.user_collection_items USING btree (collection_id, entry_id);


--
-- Name: user_collection_items_user_entry_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX user_collection_items_user_entry_idx ON public.user_collection_items USING btree (user_id, entry_id, created_at DESC);


--
-- Name: user_collections_user_name_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX user_collections_user_name_unique ON public.user_collections USING btree (user_id, lower(btrim(name)));


--
-- Name: user_collections_user_updated_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX user_collections_user_updated_at_idx ON public.user_collections USING btree (user_id, updated_at DESC, created_at DESC);


--
-- Name: user_entry_knowledge_owner_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX user_entry_knowledge_owner_idx ON public.user_entry_knowledge_chunks USING btree (user_id);


--
-- Name: vintage_weather_modifiers_lookup_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX vintage_weather_modifiers_lookup_idx ON public.vintage_weather_modifiers USING btree (country, region, vintage);


--
-- Name: wine_entries_canonical_region_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX wine_entries_canonical_region_idx ON public.wine_entries USING btree (canonical_region) WHERE (canonical_region IS NOT NULL);


--
-- Name: wine_entries_entry_group_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX wine_entries_entry_group_id_idx ON public.wine_entries USING btree (entry_group_id);


--
-- Name: wine_entries_id_owner_knowledge_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX wine_entries_id_owner_knowledge_key ON public.wine_entries USING btree (id, user_id);


--
-- Name: wine_entries_is_feed_visible_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX wine_entries_is_feed_visible_created_at_idx ON public.wine_entries USING btree (is_feed_visible, created_at DESC);


--
-- Name: wine_entries_root_entry_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX wine_entries_root_entry_id_idx ON public.wine_entries USING btree (root_entry_id);


--
-- Name: wine_entries_tasted_with_user_ids_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX wine_entries_tasted_with_user_ids_gin ON public.wine_entries USING gin (tasted_with_user_ids);


--
-- Name: wine_entries_user_root_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX wine_entries_user_root_unique ON public.wine_entries USING btree (user_id, root_entry_id) WHERE (root_entry_id IS NOT NULL);


--
-- Name: wine_entries_user_wine_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX wine_entries_user_wine_type_idx ON public.wine_entries USING btree (user_id, wine_type) WHERE (wine_type IS NOT NULL);


--
-- Name: wine_entry_scores_user_computed_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX wine_entry_scores_user_computed_at_idx ON public.wine_entry_scores USING btree (user_id, computed_at DESC);


--
-- Name: wine_entry_scores_user_match_score_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX wine_entry_scores_user_match_score_idx ON public.wine_entry_scores USING btree (user_id, match_score DESC) WHERE (display_score = true);


--
-- Name: wine_notifications_unique_tag; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX wine_notifications_unique_tag ON public.wine_notifications USING btree (user_id, entry_id, type);


--
-- Name: entry_comments entry_comments_validate_parent; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER entry_comments_validate_parent BEFORE INSERT OR UPDATE OF entry_id, parent_comment_id ON public.entry_comments FOR EACH ROW EXECUTE FUNCTION public.validate_entry_comment_parent();


--
-- Name: friend_requests friend_request_accept_notifications; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER friend_request_accept_notifications AFTER UPDATE OF status ON public.friend_requests FOR EACH ROW EXECUTE FUNCTION public.handle_friend_request_accept_notifications();


--
-- Name: wine_entries invalidate_entry_knowledge; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER invalidate_entry_knowledge BEFORE UPDATE ON public.wine_entries FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION private.invalidate_entry_knowledge();


--
-- Name: entry_primary_grapes invalidate_grape_entry_knowledge; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER invalidate_grape_entry_knowledge AFTER INSERT OR DELETE OR UPDATE ON public.entry_primary_grapes FOR EACH ROW EXECUTE FUNCTION private.invalidate_grape_entry_knowledge();


--
-- Name: grape_varieties invalidate_variety_entry_knowledge; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER invalidate_variety_entry_knowledge AFTER UPDATE OF name ON public.grape_varieties FOR EACH ROW WHEN ((old.name IS DISTINCT FROM new.name)) EXECUTE FUNCTION private.invalidate_variety_entry_knowledge();


--
-- Name: knowledge_documents knowledge_documents_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER knowledge_documents_set_updated_at BEFORE UPDATE ON public.knowledge_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles profiles_protect_capabilities; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER profiles_protect_capabilities BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.protect_profile_capabilities();


--
-- Name: sommelier_conversations sommelier_conversations_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER sommelier_conversations_set_updated_at BEFORE UPDATE ON public.sommelier_conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: wine_entries wine_entries_tag_notifications; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER wine_entries_tag_notifications AFTER INSERT OR UPDATE OF tasted_with_user_ids ON public.wine_entries FOR EACH ROW EXECUTE FUNCTION public.handle_wine_tag_notifications();


--
-- Name: cellar_custom_field_defs cellar_custom_field_defs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cellar_custom_field_defs
    ADD CONSTRAINT cellar_custom_field_defs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: cellar_custom_field_values cellar_custom_field_values_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cellar_custom_field_values
    ADD CONSTRAINT cellar_custom_field_values_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.wine_entries(id) ON DELETE CASCADE;


--
-- Name: cellar_custom_field_values cellar_custom_field_values_field_def_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cellar_custom_field_values
    ADD CONSTRAINT cellar_custom_field_values_field_def_id_fkey FOREIGN KEY (field_def_id) REFERENCES public.cellar_custom_field_defs(id) ON DELETE CASCADE;


--
-- Name: content_reports content_reports_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.entry_comments(id) ON DELETE CASCADE;


--
-- Name: content_reports content_reports_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.wine_entries(id) ON DELETE CASCADE;


--
-- Name: content_reports content_reports_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: content_reports content_reports_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: entry_comments entry_comments_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_comments
    ADD CONSTRAINT entry_comments_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.wine_entries(id) ON DELETE CASCADE;


--
-- Name: entry_comments entry_comments_parent_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_comments
    ADD CONSTRAINT entry_comments_parent_comment_id_fkey FOREIGN KEY (parent_comment_id) REFERENCES public.entry_comments(id) ON DELETE CASCADE;


--
-- Name: entry_comments entry_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_comments
    ADD CONSTRAINT entry_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: entry_comparison_feedback entry_comparison_feedback_comparison_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_comparison_feedback
    ADD CONSTRAINT entry_comparison_feedback_comparison_entry_id_fkey FOREIGN KEY (comparison_entry_id) REFERENCES public.wine_entries(id) ON DELETE CASCADE;


--
-- Name: entry_comparison_feedback entry_comparison_feedback_new_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_comparison_feedback
    ADD CONSTRAINT entry_comparison_feedback_new_entry_id_fkey FOREIGN KEY (new_entry_id) REFERENCES public.wine_entries(id) ON DELETE CASCADE;


--
-- Name: entry_comparison_feedback entry_comparison_feedback_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_comparison_feedback
    ADD CONSTRAINT entry_comparison_feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: entry_group_slides entry_group_slides_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_group_slides
    ADD CONSTRAINT entry_group_slides_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.wine_entries(id) ON DELETE CASCADE;


--
-- Name: entry_group_slides entry_group_slides_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_group_slides
    ADD CONSTRAINT entry_group_slides_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.entry_groups(id) ON DELETE CASCADE;


--
-- Name: entry_groups entry_groups_anchor_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_groups
    ADD CONSTRAINT entry_groups_anchor_entry_id_fkey FOREIGN KEY (anchor_entry_id) REFERENCES public.wine_entries(id) ON DELETE SET NULL;


--
-- Name: entry_groups entry_groups_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_groups
    ADD CONSTRAINT entry_groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: entry_photos entry_photos_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_photos
    ADD CONSTRAINT entry_photos_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.wine_entries(id) ON DELETE CASCADE;


--
-- Name: entry_primary_grapes entry_primary_grapes_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_primary_grapes
    ADD CONSTRAINT entry_primary_grapes_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.wine_entries(id) ON DELETE CASCADE;


--
-- Name: entry_primary_grapes entry_primary_grapes_variety_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_primary_grapes
    ADD CONSTRAINT entry_primary_grapes_variety_id_fkey FOREIGN KEY (variety_id) REFERENCES public.grape_varieties(id) ON DELETE RESTRICT;


--
-- Name: entry_reactions entry_reactions_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_reactions
    ADD CONSTRAINT entry_reactions_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.wine_entries(id) ON DELETE CASCADE;


--
-- Name: entry_reactions entry_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entry_reactions
    ADD CONSTRAINT entry_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: friend_notifications friend_notifications_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.friend_notifications
    ADD CONSTRAINT friend_notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: friend_notifications friend_notifications_friend_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.friend_notifications
    ADD CONSTRAINT friend_notifications_friend_request_id_fkey FOREIGN KEY (friend_request_id) REFERENCES public.friend_requests(id) ON DELETE CASCADE;


--
-- Name: friend_notifications friend_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.friend_notifications
    ADD CONSTRAINT friend_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: friend_requests friend_requests_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: friend_requests friend_requests_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: general_knowledge_chunks general_knowledge_chunks_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.general_knowledge_chunks
    ADD CONSTRAINT general_knowledge_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.knowledge_documents(id) ON DELETE CASCADE;


--
-- Name: grape_aliases grape_aliases_variety_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grape_aliases
    ADD CONSTRAINT grape_aliases_variety_id_fkey FOREIGN KEY (variety_id) REFERENCES public.grape_varieties(id) ON DELETE CASCADE;


--
-- Name: knowledge_documents knowledge_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_documents
    ADD CONSTRAINT knowledge_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: launch_feedback launch_feedback_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.launch_feedback
    ADD CONSTRAINT launch_feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: list_scan_results list_scan_results_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.list_scan_results
    ADD CONSTRAINT list_scan_results_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: list_scan_wines list_scan_wines_scan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.list_scan_wines
    ADD CONSTRAINT list_scan_wines_scan_id_fkey FOREIGN KEY (scan_id) REFERENCES public.list_scan_results(scan_id) ON DELETE CASCADE;


--
-- Name: list_scan_wines list_scan_wines_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.list_scan_wines
    ADD CONSTRAINT list_scan_wines_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: palate_profiles palate_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.palate_profiles
    ADD CONSTRAINT palate_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: post_shares post_shares_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.post_shares
    ADD CONSTRAINT post_shares_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: post_shares post_shares_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.post_shares
    ADD CONSTRAINT post_shares_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.wine_entries(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: scan_resolution_log scan_resolution_log_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scan_resolution_log
    ADD CONSTRAINT scan_resolution_log_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.wine_entries(id) ON DELETE CASCADE;


--
-- Name: scan_resolution_log scan_resolution_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scan_resolution_log
    ADD CONSTRAINT scan_resolution_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sommelier_conversations sommelier_conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sommelier_conversations
    ADD CONSTRAINT sommelier_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sommelier_messages sommelier_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sommelier_messages
    ADD CONSTRAINT sommelier_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.sommelier_conversations(id) ON DELETE CASCADE;


--
-- Name: taste_survey_responses taste_survey_responses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.taste_survey_responses
    ADD CONSTRAINT taste_survey_responses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_badges user_badges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_blocks user_blocks_blocked_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_blocks user_blocks_blocker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_collection_items user_collection_items_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_collection_items
    ADD CONSTRAINT user_collection_items_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.user_collections(id) ON DELETE CASCADE;


--
-- Name: user_collection_items user_collection_items_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_collection_items
    ADD CONSTRAINT user_collection_items_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.wine_entries(id) ON DELETE CASCADE;


--
-- Name: user_collection_items user_collection_items_snapshot_entry_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_collection_items
    ADD CONSTRAINT user_collection_items_snapshot_entry_group_id_fkey FOREIGN KEY (snapshot_entry_group_id) REFERENCES public.entry_groups(id) ON DELETE SET NULL;


--
-- Name: user_collection_items user_collection_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_collection_items
    ADD CONSTRAINT user_collection_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_collections user_collections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_collections
    ADD CONSTRAINT user_collections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_entry_knowledge_chunks user_entry_knowledge_chunks_entry_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_entry_knowledge_chunks
    ADD CONSTRAINT user_entry_knowledge_chunks_entry_id_user_id_fkey FOREIGN KEY (entry_id, user_id) REFERENCES public.wine_entries(id, user_id) ON DELETE CASCADE;


--
-- Name: user_entry_knowledge_chunks user_entry_knowledge_chunks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_entry_knowledge_chunks
    ADD CONSTRAINT user_entry_knowledge_chunks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: wine_entries wine_entries_cellared_from_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wine_entries
    ADD CONSTRAINT wine_entries_cellared_from_id_fkey FOREIGN KEY (cellared_from_id) REFERENCES public.wine_entries(id) ON DELETE SET NULL;


--
-- Name: wine_entries wine_entries_entry_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wine_entries
    ADD CONSTRAINT wine_entries_entry_group_id_fkey FOREIGN KEY (entry_group_id) REFERENCES public.entry_groups(id) ON DELETE SET NULL;


--
-- Name: wine_entries wine_entries_root_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wine_entries
    ADD CONSTRAINT wine_entries_root_entry_id_fkey FOREIGN KEY (root_entry_id) REFERENCES public.wine_entries(id) ON DELETE SET NULL;


--
-- Name: wine_entries wine_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wine_entries
    ADD CONSTRAINT wine_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: wine_entry_scores wine_entry_scores_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wine_entry_scores
    ADD CONSTRAINT wine_entry_scores_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: wine_entry_scores wine_entry_scores_wine_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wine_entry_scores
    ADD CONSTRAINT wine_entry_scores_wine_entry_id_fkey FOREIGN KEY (wine_entry_id) REFERENCES public.wine_entries(id) ON DELETE CASCADE;


--
-- Name: wine_notifications wine_notifications_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wine_notifications
    ADD CONSTRAINT wine_notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: wine_notifications wine_notifications_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wine_notifications
    ADD CONSTRAINT wine_notifications_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.wine_entries(id) ON DELETE CASCADE;


--
-- Name: wine_notifications wine_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wine_notifications
    ADD CONSTRAINT wine_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: wine_profiles Anyone authenticated can read wine profiles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Anyone authenticated can read wine profiles" ON public.wine_profiles FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: launch_feedback Anyone can submit launch feedback; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Anyone can submit launch feedback" ON public.launch_feedback FOR INSERT WITH CHECK (((auth.role() = ANY (ARRAY['anon'::text, 'authenticated'::text])) AND (char_length(TRIM(BOTH FROM message)) >= 10)));


--
-- Name: grape_aliases Authenticated users can read grape aliases; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can read grape aliases" ON public.grape_aliases FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: grape_varieties Authenticated users can read grape varieties; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can read grape varieties" ON public.grape_varieties FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: user_badges Authenticated users can view badges; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can view badges" ON public.user_badges FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: friend_requests Either party can delete friend requests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Either party can delete friend requests" ON public.friend_requests FOR DELETE USING (((auth.uid() = requester_id) OR (auth.uid() = recipient_id)));


--
-- Name: post_shares Owners can create share rows; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can create share rows" ON public.post_shares FOR INSERT TO authenticated WITH CHECK (((auth.uid() = created_by) AND (EXISTS ( SELECT 1
   FROM public.wine_entries entries
  WHERE ((entries.id = post_shares.post_id) AND public.can_view_entry(auth.uid(), entries.user_id, entries.entry_privacy))))));


--
-- Name: wine_entry_scores Owners can delete their cached entry scores; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can delete their cached entry scores" ON public.wine_entry_scores FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: list_scan_results Owners can delete their list scan results; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can delete their list scan results" ON public.list_scan_results FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: list_scan_wines Owners can delete their list scan wines; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can delete their list scan wines" ON public.list_scan_wines FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: scan_resolution_log Owners can insert resolution logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can insert resolution logs" ON public.scan_resolution_log FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: wine_entry_scores Owners can insert their cached entry scores; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can insert their cached entry scores" ON public.wine_entry_scores FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: list_scan_results Owners can insert their list scan results; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can insert their list scan results" ON public.list_scan_results FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: list_scan_wines Owners can insert their list scan wines; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can insert their list scan wines" ON public.list_scan_wines FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_collection_items Owners can manage collection items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can manage collection items" ON public.user_collection_items USING (((auth.uid() = user_id) AND (auth.uid() = ( SELECT user_collections.user_id
   FROM public.user_collections
  WHERE (user_collections.id = user_collection_items.collection_id))))) WITH CHECK (((auth.uid() = user_id) AND (auth.uid() = ( SELECT user_collections.user_id
   FROM public.user_collections
  WHERE (user_collections.id = user_collection_items.collection_id)))));


--
-- Name: user_collections Owners can manage collections; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can manage collections" ON public.user_collections USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: entry_group_slides Owners can manage entry group slides; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can manage entry group slides" ON public.entry_group_slides TO authenticated USING ((( SELECT auth.uid() AS uid) = ( SELECT g.user_id
   FROM public.entry_groups g
  WHERE (g.id = entry_group_slides.group_id)))) WITH CHECK ((( SELECT auth.uid() AS uid) = ( SELECT g.user_id
   FROM public.entry_groups g
  WHERE (g.id = entry_group_slides.group_id))));


--
-- Name: entry_groups Owners can manage entry groups; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can manage entry groups" ON public.entry_groups TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: entry_photos Owners can manage entry photos; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can manage entry photos" ON public.entry_photos TO authenticated USING ((( SELECT auth.uid() AS uid) = ( SELECT e.user_id
   FROM public.wine_entries e
  WHERE (e.id = entry_photos.entry_id)))) WITH CHECK ((( SELECT auth.uid() AS uid) = ( SELECT e.user_id
   FROM public.wine_entries e
  WHERE (e.id = entry_photos.entry_id))));


--
-- Name: post_shares Owners can read own share rows; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can read own share rows" ON public.post_shares FOR SELECT TO authenticated USING ((auth.uid() = created_by));


--
-- Name: wine_entry_scores Owners can update their cached entry scores; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can update their cached entry scores" ON public.wine_entry_scores FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: list_scan_results Owners can update their list scan results; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can update their list scan results" ON public.list_scan_results FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: list_scan_wines Owners can update their list scan wines; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can update their list scan wines" ON public.list_scan_wines FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_collection_items Owners can view collection items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can view collection items" ON public.user_collection_items FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_collections Owners can view collections; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can view collections" ON public.user_collections FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: wine_entry_scores Owners can view their cached entry scores; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can view their cached entry scores" ON public.wine_entry_scores FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: list_scan_results Owners can view their list scan results; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can view their list scan results" ON public.list_scan_results FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: list_scan_wines Owners can view their list scan wines; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can view their list scan wines" ON public.list_scan_wines FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: scan_resolution_log Owners can view their resolution logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners can view their resolution logs" ON public.scan_resolution_log FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: post_shares Public can read active share rows; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can read active share rows" ON public.post_shares FOR SELECT TO authenticated, anon USING (((revoked_at IS NULL) AND ((expires_at IS NULL) OR (expires_at > now()))));


--
-- Name: friend_requests Recipients can update friend requests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Recipients can update friend requests" ON public.friend_requests FOR UPDATE USING ((auth.uid() = recipient_id));


--
-- Name: aging_curve_baselines Reference data is readable; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Reference data is readable" ON public.aging_curve_baselines FOR SELECT USING (true);


--
-- Name: appellation_grape_map Reference data is readable; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Reference data is readable" ON public.appellation_grape_map FOR SELECT USING (true);


--
-- Name: base_profiles Reference data is readable; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Reference data is readable" ON public.base_profiles FOR SELECT USING (true);


--
-- Name: classification_tier_aging_modifiers Reference data is readable; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Reference data is readable" ON public.classification_tier_aging_modifiers FOR SELECT USING (true);


--
-- Name: classification_tier_modifiers Reference data is readable; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Reference data is readable" ON public.classification_tier_modifiers FOR SELECT USING (true);


--
-- Name: grape_sensitivity_coefficients Reference data is readable; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Reference data is readable" ON public.grape_sensitivity_coefficients FOR SELECT USING (true);


--
-- Name: producer_aliases Reference data is readable; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Reference data is readable" ON public.producer_aliases FOR SELECT USING (true);


--
-- Name: producer_modifiers Reference data is readable; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Reference data is readable" ON public.producer_modifiers FOR SELECT USING (true);


--
-- Name: producer_region_crosswalk Reference data is readable; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Reference data is readable" ON public.producer_region_crosswalk FOR SELECT USING (true);


--
-- Name: region_aliases Reference data is readable; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Reference data is readable" ON public.region_aliases FOR SELECT USING (true);


--
-- Name: taxonomy_classification_tiers Reference data is readable; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Reference data is readable" ON public.taxonomy_classification_tiers FOR SELECT USING (true);


--
-- Name: taxonomy_master_v2 Reference data is readable; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Reference data is readable" ON public.taxonomy_master_v2 FOR SELECT USING (true);


--
-- Name: taxonomy_price_ranges Reference data is readable; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Reference data is readable" ON public.taxonomy_price_ranges FOR SELECT USING (true);


--
-- Name: vintage_weather_modifiers Reference data is readable; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Reference data is readable" ON public.vintage_weather_modifiers FOR SELECT USING (true);


--
-- Name: entry_comments Users can add comments for allowed audience; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can add comments for allowed audience" ON public.entry_comments FOR INSERT WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.wine_entries e
  WHERE ((e.id = entry_comments.entry_id) AND public.can_view_entry_standard(auth.uid(), e.user_id, e.entry_privacy) AND public.can_view_entry_standard(auth.uid(), e.user_id, COALESCE((e.comments_privacy)::text,
        CASE
            WHEN ((COALESCE(e.comments_scope, 'viewers'::text) = 'friends'::text) AND (COALESCE(e.entry_privacy, 'public'::text) <> 'private'::text)) THEN 'friends'::text
            ELSE COALESCE(e.entry_privacy, 'public'::text)
        END)) AND public.can_view_test_authored_content(e.user_id, auth.uid()))))));


--
-- Name: entry_reactions Users can add reactions for allowed audience; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can add reactions for allowed audience" ON public.entry_reactions FOR INSERT WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.wine_entries e
  WHERE ((e.id = entry_reactions.entry_id) AND public.can_view_entry_standard(auth.uid(), e.user_id, e.entry_privacy) AND public.can_view_entry_standard(auth.uid(), e.user_id, COALESCE((e.reaction_privacy)::text, e.entry_privacy)) AND public.can_view_test_authored_content(e.user_id, auth.uid()))))));


--
-- Name: friend_requests Users can create friend requests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create friend requests" ON public.friend_requests FOR INSERT WITH CHECK ((auth.uid() = requester_id));


--
-- Name: user_blocks Users can create own blocks; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create own blocks" ON public.user_blocks FOR INSERT WITH CHECK (((auth.uid() = blocker_id) AND (blocker_id <> blocked_id)));


--
-- Name: user_blocks Users can delete own blocks; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete own blocks" ON public.user_blocks FOR DELETE USING ((auth.uid() = blocker_id));


--
-- Name: entry_comments Users can delete own comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete own comments" ON public.entry_comments FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: entry_reactions Users can delete own reaction; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete own reaction" ON public.entry_reactions FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: wine_entries Users can delete own wine entries; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete own wine entries" ON public.wine_entries FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: entry_primary_grapes Users can delete primary grapes on own entries; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete primary grapes on own entries" ON public.entry_primary_grapes FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.wine_entries e
  WHERE ((e.id = entry_primary_grapes.entry_id) AND (e.user_id = auth.uid())))));


--
-- Name: user_badges Users can insert own badges; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own badges" ON public.user_badges FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: entry_comparison_feedback Users can insert own comparison feedback; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own comparison feedback" ON public.entry_comparison_feedback FOR INSERT WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.wine_entries new_entry
  WHERE ((new_entry.id = entry_comparison_feedback.new_entry_id) AND (new_entry.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM public.wine_entries comparison_entry
  WHERE ((comparison_entry.id = entry_comparison_feedback.comparison_entry_id) AND (comparison_entry.user_id = auth.uid()))))));


--
-- Name: content_reports Users can insert own content reports; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own content reports" ON public.content_reports FOR INSERT WITH CHECK ((auth.uid() = reporter_id));


--
-- Name: taste_survey_responses Users can insert own survey; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own survey" ON public.taste_survey_responses FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: wine_entries Users can insert own wine entries; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own wine entries" ON public.wine_entries FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: entry_primary_grapes Users can insert primary grapes on own entries; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert primary grapes on own entries" ON public.entry_primary_grapes FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.wine_entries e
  WHERE ((e.id = entry_primary_grapes.entry_id) AND (e.user_id = auth.uid())))));


--
-- Name: profiles Users can insert their profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert their profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: cellar_custom_field_defs Users can manage own field defs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage own field defs" ON public.cellar_custom_field_defs USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: cellar_custom_field_values Users can manage own field values; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage own field values" ON public.cellar_custom_field_values USING ((EXISTS ( SELECT 1
   FROM public.wine_entries
  WHERE ((wine_entries.id = cellar_custom_field_values.entry_id) AND (wine_entries.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.wine_entries
  WHERE ((wine_entries.id = cellar_custom_field_values.entry_id) AND (wine_entries.user_id = auth.uid())))));


--
-- Name: entry_reactions Users can read entry reactions for allowed audience; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can read entry reactions for allowed audience" ON public.entry_reactions FOR SELECT USING ((public.can_view_test_authored_content(auth.uid(), user_id) AND (EXISTS ( SELECT 1
   FROM public.wine_entries e
  WHERE ((e.id = entry_reactions.entry_id) AND public.can_view_entry(auth.uid(), e.user_id, e.entry_privacy) AND public.can_view_entry(auth.uid(), e.user_id, COALESCE((e.reaction_privacy)::text, e.entry_privacy)))))));


--
-- Name: user_blocks Users can read own blocks; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can read own blocks" ON public.user_blocks FOR SELECT USING ((auth.uid() = blocker_id));


--
-- Name: content_reports Users can read own content reports; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can read own content reports" ON public.content_reports FOR SELECT USING ((auth.uid() = reporter_id));


--
-- Name: launch_feedback Users can read own launch feedback; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can read own launch feedback" ON public.launch_feedback FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: taste_survey_responses Users can read own survey; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can read own survey" ON public.taste_survey_responses FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: entry_comments Users can update own comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own comments" ON public.entry_comments FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: taste_survey_responses Users can update own survey; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own survey" ON public.taste_survey_responses FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: wine_entries Users can update own wine entries; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own wine entries" ON public.wine_entries FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: entry_primary_grapes Users can update primary grapes on own entries; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update primary grapes on own entries" ON public.entry_primary_grapes FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.wine_entries e
  WHERE ((e.id = entry_primary_grapes.entry_id) AND (e.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.wine_entries e
  WHERE ((e.id = entry_primary_grapes.entry_id) AND (e.user_id = auth.uid())))));


--
-- Name: friend_notifications Users can update their friend notifications; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their friend notifications" ON public.friend_notifications FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: wine_notifications Users can update their notifications; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their notifications" ON public.wine_notifications FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update their profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: entry_group_slides Users can view allowed entry group slides; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view allowed entry group slides" ON public.entry_group_slides FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.entry_groups g
     JOIN public.wine_entries e ON ((e.id = COALESCE(entry_group_slides.entry_id, g.anchor_entry_id))))
  WHERE ((g.id = entry_group_slides.group_id) AND (e.entry_group_id = g.id) AND (e.user_id = g.user_id) AND public.can_view_entry(( SELECT auth.uid() AS uid), e.user_id, e.entry_privacy) AND public.can_view_entry(( SELECT auth.uid() AS uid), e.user_id,
        CASE entry_group_slides.photo_type
            WHEN 'label'::text THEN COALESCE(e.label_photo_privacy, e.entry_privacy)
            WHEN 'place'::text THEN COALESCE(e.place_photo_privacy, e.entry_privacy)
            ELSE e.entry_privacy
        END) AND ((entry_group_slides.entry_id IS NOT NULL) OR (split_part(entry_group_slides.path, '/'::text, 1) = (g.user_id)::text))))));


--
-- Name: entry_groups Users can view allowed entry groups; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view allowed entry groups" ON public.entry_groups FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.wine_entries e
  WHERE ((e.id = entry_groups.anchor_entry_id) AND (e.entry_group_id = entry_groups.id) AND (e.user_id = entry_groups.user_id) AND public.can_view_entry(( SELECT auth.uid() AS uid), e.user_id, e.entry_privacy)))));


--
-- Name: wine_entries Users can view allowed wine entries; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view allowed wine entries" ON public.wine_entries FOR SELECT TO authenticated USING (public.can_view_entry(( SELECT auth.uid() AS uid), user_id, entry_privacy));


--
-- Name: entry_comments Users can view entry comments for allowed audience; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view entry comments for allowed audience" ON public.entry_comments FOR SELECT USING (((NOT public.is_user_blocked(auth.uid(), user_id)) AND public.can_view_test_authored_content(auth.uid(), user_id) AND (EXISTS ( SELECT 1
   FROM public.wine_entries e
  WHERE ((e.id = entry_comments.entry_id) AND public.can_view_entry(auth.uid(), e.user_id, e.entry_privacy) AND public.can_view_entry(auth.uid(), e.user_id, COALESCE((e.comments_privacy)::text,
        CASE
            WHEN ((COALESCE(e.comments_scope, 'viewers'::text) = 'friends'::text) AND (COALESCE(e.entry_privacy, 'public'::text) <> 'private'::text)) THEN 'friends'::text
            ELSE COALESCE(e.entry_privacy, 'public'::text)
        END)))))));


--
-- Name: entry_photos Users can view entry photos; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view entry photos" ON public.entry_photos FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.wine_entries e
  WHERE ((e.id = entry_photos.entry_id) AND public.can_view_entry(( SELECT auth.uid() AS uid), e.user_id, e.entry_privacy) AND public.can_view_entry(( SELECT auth.uid() AS uid), e.user_id,
        CASE entry_photos.type
            WHEN 'label'::text THEN COALESCE(e.label_photo_privacy, e.entry_privacy)
            WHEN 'place'::text THEN COALESCE(e.place_photo_privacy, e.entry_privacy)
            ELSE e.entry_privacy
        END)))));


--
-- Name: entry_comparison_feedback Users can view own comparison feedback; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own comparison feedback" ON public.entry_comparison_feedback FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: palate_profiles Users can view own palate profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own palate profile" ON public.palate_profiles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: entry_primary_grapes Users can view primary grapes for visible entries; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view primary grapes for visible entries" ON public.entry_primary_grapes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.wine_entries e
  WHERE ((e.id = entry_primary_grapes.entry_id) AND public.can_view_entry(auth.uid(), e.user_id, e.entry_privacy)))));


--
-- Name: friend_notifications Users can view their friend notifications; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their friend notifications" ON public.friend_notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: friend_requests Users can view their friend requests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their friend requests" ON public.friend_requests FOR SELECT USING (((auth.uid() = requester_id) OR (auth.uid() = recipient_id)));


--
-- Name: wine_notifications Users can view their notifications; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their notifications" ON public.wine_notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: aging_curve_baselines; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.aging_curve_baselines ENABLE ROW LEVEL SECURITY;

--
-- Name: api_rate_limits; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: appellation_grape_map; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.appellation_grape_map ENABLE ROW LEVEL SECURITY;

--
-- Name: base_profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.base_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: cellar_custom_field_defs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.cellar_custom_field_defs ENABLE ROW LEVEL SECURITY;

--
-- Name: cellar_custom_field_values; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.cellar_custom_field_values ENABLE ROW LEVEL SECURITY;

--
-- Name: classification_tier_aging_modifiers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.classification_tier_aging_modifiers ENABLE ROW LEVEL SECURITY;

--
-- Name: classification_tier_modifiers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.classification_tier_modifiers ENABLE ROW LEVEL SECURITY;

--
-- Name: content_reports; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: entry_comments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.entry_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: entry_comparison_feedback; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.entry_comparison_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: entry_group_slides; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.entry_group_slides ENABLE ROW LEVEL SECURITY;

--
-- Name: entry_groups; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.entry_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: entry_photos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.entry_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: entry_primary_grapes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.entry_primary_grapes ENABLE ROW LEVEL SECURITY;

--
-- Name: entry_reactions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.entry_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: friend_notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.friend_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: friend_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: general_knowledge_chunks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.general_knowledge_chunks ENABLE ROW LEVEL SECURITY;

--
-- Name: general_knowledge_chunks general_knowledge_chunks_select_authenticated; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY general_knowledge_chunks_select_authenticated ON public.general_knowledge_chunks FOR SELECT TO authenticated USING (true);


--
-- Name: grape_aliases; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.grape_aliases ENABLE ROW LEVEL SECURITY;

--
-- Name: grape_sensitivity_coefficients; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.grape_sensitivity_coefficients ENABLE ROW LEVEL SECURITY;

--
-- Name: grape_varieties; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.grape_varieties ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_documents; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_documents knowledge_documents_delete_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY knowledge_documents_delete_owner ON public.knowledge_documents FOR DELETE TO authenticated USING ((uploaded_by = auth.uid()));


--
-- Name: knowledge_documents knowledge_documents_insert_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY knowledge_documents_insert_owner ON public.knowledge_documents FOR INSERT TO authenticated WITH CHECK ((uploaded_by = auth.uid()));


--
-- Name: knowledge_documents knowledge_documents_select_authenticated; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY knowledge_documents_select_authenticated ON public.knowledge_documents FOR SELECT TO authenticated USING (true);


--
-- Name: knowledge_documents knowledge_documents_update_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY knowledge_documents_update_owner ON public.knowledge_documents FOR UPDATE TO authenticated USING ((uploaded_by = auth.uid())) WITH CHECK ((uploaded_by = auth.uid()));


--
-- Name: launch_feedback; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.launch_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: list_scan_results; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.list_scan_results ENABLE ROW LEVEL SECURITY;

--
-- Name: list_scan_wines; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.list_scan_wines ENABLE ROW LEVEL SECURITY;

--
-- Name: palate_profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.palate_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: post_shares; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.post_shares ENABLE ROW LEVEL SECURITY;

--
-- Name: producer_aliases; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.producer_aliases ENABLE ROW LEVEL SECURITY;

--
-- Name: producer_modifiers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.producer_modifiers ENABLE ROW LEVEL SECURITY;

--
-- Name: producer_region_crosswalk; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.producer_region_crosswalk ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: region_aliases; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.region_aliases ENABLE ROW LEVEL SECURITY;

--
-- Name: scan_resolution_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.scan_resolution_log ENABLE ROW LEVEL SECURITY;

--
-- Name: sommelier_conversations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.sommelier_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: sommelier_conversations sommelier_conversations_owner_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY sommelier_conversations_owner_all ON public.sommelier_conversations TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: sommelier_messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.sommelier_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: sommelier_messages sommelier_messages_owner_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY sommelier_messages_owner_all ON public.sommelier_messages TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.sommelier_conversations sc
  WHERE ((sc.id = sommelier_messages.conversation_id) AND (sc.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.sommelier_conversations sc
  WHERE ((sc.id = sommelier_messages.conversation_id) AND (sc.user_id = auth.uid())))));


--
-- Name: taste_survey_responses; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.taste_survey_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: taxonomy_classification_tiers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.taxonomy_classification_tiers ENABLE ROW LEVEL SECURITY;

--
-- Name: taxonomy_master_v2; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.taxonomy_master_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: taxonomy_price_ranges; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.taxonomy_price_ranges ENABLE ROW LEVEL SECURITY;

--
-- Name: user_badges; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

--
-- Name: user_blocks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: user_collection_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_collection_items ENABLE ROW LEVEL SECURITY;

--
-- Name: user_collections; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_collections ENABLE ROW LEVEL SECURITY;

--
-- Name: user_entry_knowledge_chunks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_entry_knowledge_chunks ENABLE ROW LEVEL SECURITY;

--
-- Name: user_entry_knowledge_chunks user_entry_knowledge_owner_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY user_entry_knowledge_owner_read ON public.user_entry_knowledge_chunks FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: vintage_weather_modifiers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.vintage_weather_modifiers ENABLE ROW LEVEL SECURITY;

--
-- Name: wine_entries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.wine_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: wine_entry_scores; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.wine_entry_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: wine_knowledge_chunks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.wine_knowledge_chunks ENABLE ROW LEVEL SECURITY;

--
-- Name: wine_knowledge_chunks wine_knowledge_chunks_select_authenticated; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY wine_knowledge_chunks_select_authenticated ON public.wine_knowledge_chunks FOR SELECT TO authenticated USING ((source_table = ANY (ARRAY['base_profiles'::text, 'classification_tier_modifiers'::text, 'producer_modifiers'::text, 'aging_curve_baselines'::text, 'vintage_weather_modifiers'::text, 'grape_sensitivity_coefficients'::text, 'taxonomy_classification_tiers'::text])));


--
-- Name: wine_notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.wine_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: wine_profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.wine_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA private; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT USAGE ON SCHEMA private TO service_role;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION can_access_wine_photo(object_name text); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.can_access_wine_photo(object_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION private.can_access_wine_photo(object_name text) TO authenticated;
GRANT ALL ON FUNCTION private.can_access_wine_photo(object_name text) TO service_role;


--
-- Name: FUNCTION invalidate_entry_knowledge(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.invalidate_entry_knowledge() FROM PUBLIC;


--
-- Name: FUNCTION invalidate_grape_entry_knowledge(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.invalidate_grape_entry_knowledge() FROM PUBLIC;


--
-- Name: FUNCTION invalidate_variety_entry_knowledge(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.invalidate_variety_entry_knowledge() FROM PUBLIC;


--
-- Name: FUNCTION protect_profile_capabilities(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.protect_profile_capabilities() FROM PUBLIC;


--
-- Name: FUNCTION apply_friend_transition(target_user_id uuid, action text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.apply_friend_transition(target_user_id uuid, action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_friend_transition(target_user_id uuid, action text) TO anon;
GRANT ALL ON FUNCTION public.apply_friend_transition(target_user_id uuid, action text) TO authenticated;
GRANT ALL ON FUNCTION public.apply_friend_transition(target_user_id uuid, action text) TO service_role;


--
-- Name: FUNCTION are_friends(user_a uuid, user_b uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.are_friends(user_a uuid, user_b uuid) TO anon;
GRANT ALL ON FUNCTION public.are_friends(user_a uuid, user_b uuid) TO authenticated;
GRANT ALL ON FUNCTION public.are_friends(user_a uuid, user_b uuid) TO service_role;


--
-- Name: FUNCTION can_access_wine_photo(object_name text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.can_access_wine_photo(object_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_wine_photo(object_name text) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_wine_photo(object_name text) TO service_role;


--
-- Name: FUNCTION can_view_entry(viewer_id uuid, owner_id uuid, privacy text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_entry(viewer_id uuid, owner_id uuid, privacy text) TO anon;
GRANT ALL ON FUNCTION public.can_view_entry(viewer_id uuid, owner_id uuid, privacy text) TO authenticated;
GRANT ALL ON FUNCTION public.can_view_entry(viewer_id uuid, owner_id uuid, privacy text) TO service_role;


--
-- Name: FUNCTION can_view_entry_standard(viewer_id uuid, owner_id uuid, privacy text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_entry_standard(viewer_id uuid, owner_id uuid, privacy text) TO anon;
GRANT ALL ON FUNCTION public.can_view_entry_standard(viewer_id uuid, owner_id uuid, privacy text) TO authenticated;
GRANT ALL ON FUNCTION public.can_view_entry_standard(viewer_id uuid, owner_id uuid, privacy text) TO service_role;


--
-- Name: FUNCTION can_view_test_authored_content(viewer_id uuid, owner_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_test_authored_content(viewer_id uuid, owner_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_view_test_authored_content(viewer_id uuid, owner_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_view_test_authored_content(viewer_id uuid, owner_id uuid) TO service_role;


--
-- Name: FUNCTION consume_api_rate_limit(p_route_key text, p_subject text, p_window_seconds integer, p_max_requests integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.consume_api_rate_limit(p_route_key text, p_subject text, p_window_seconds integer, p_max_requests integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.consume_api_rate_limit(p_route_key text, p_subject text, p_window_seconds integer, p_max_requests integer) TO service_role;


--
-- Name: FUNCTION create_test_account(username text, password text, email text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.create_test_account(username text, password text, email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_test_account(username text, password text, email text) TO service_role;


--
-- Name: FUNCTION entry_knowledge_snapshot(target_entry_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.entry_knowledge_snapshot(target_entry_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.entry_knowledge_snapshot(target_entry_id uuid) TO service_role;


--
-- Name: FUNCTION get_email_for_phone(phone text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.get_email_for_phone(phone text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_email_for_phone(phone text) TO service_role;


--
-- Name: FUNCTION get_email_for_username(username text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.get_email_for_username(username text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_email_for_username(username text) TO service_role;


--
-- Name: FUNCTION get_entry_knowledge_sources(after_entry_id uuid, batch_size integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.get_entry_knowledge_sources(after_entry_id uuid, batch_size integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_entry_knowledge_sources(after_entry_id uuid, batch_size integer) TO service_role;


--
-- Name: FUNCTION get_phone_for_email(email text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.get_phone_for_email(email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_phone_for_email(email text) TO service_role;


--
-- Name: FUNCTION get_phone_for_username(username text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.get_phone_for_username(username text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_phone_for_username(username text) TO service_role;


--
-- Name: FUNCTION handle_auth_user_phone_update(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.handle_auth_user_phone_update() TO anon;
GRANT ALL ON FUNCTION public.handle_auth_user_phone_update() TO authenticated;
GRANT ALL ON FUNCTION public.handle_auth_user_phone_update() TO service_role;


--
-- Name: FUNCTION handle_friend_request_accept_notifications(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.handle_friend_request_accept_notifications() TO anon;
GRANT ALL ON FUNCTION public.handle_friend_request_accept_notifications() TO authenticated;
GRANT ALL ON FUNCTION public.handle_friend_request_accept_notifications() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION handle_wine_tag_notifications(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.handle_wine_tag_notifications() TO anon;
GRANT ALL ON FUNCTION public.handle_wine_tag_notifications() TO authenticated;
GRANT ALL ON FUNCTION public.handle_wine_tag_notifications() TO service_role;


--
-- Name: FUNCTION is_phone_available(phone text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.is_phone_available(phone text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_phone_available(phone text) TO service_role;


--
-- Name: FUNCTION is_test_account(user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_test_account(user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_test_account(user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_test_account(user_id uuid) TO service_role;


--
-- Name: FUNCTION is_user_blocked(viewer_id uuid, target_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_user_blocked(viewer_id uuid, target_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_user_blocked(viewer_id uuid, target_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_user_blocked(viewer_id uuid, target_id uuid) TO service_role;


--
-- Name: FUNCTION is_username_available(username text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.is_username_available(username text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_username_available(username text) TO service_role;


--
-- Name: FUNCTION match_general_knowledge(query_embedding public.vector, match_threshold double precision, match_count integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.match_general_knowledge(query_embedding public.vector, match_threshold double precision, match_count integer) TO anon;
GRANT ALL ON FUNCTION public.match_general_knowledge(query_embedding public.vector, match_threshold double precision, match_count integer) TO authenticated;
GRANT ALL ON FUNCTION public.match_general_knowledge(query_embedding public.vector, match_threshold double precision, match_count integer) TO service_role;


--
-- Name: FUNCTION match_user_entries(query_embedding public.vector, target_user_id uuid, match_threshold double precision, match_count integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.match_user_entries(query_embedding public.vector, target_user_id uuid, match_threshold double precision, match_count integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.match_user_entries(query_embedding public.vector, target_user_id uuid, match_threshold double precision, match_count integer) TO service_role;
GRANT ALL ON FUNCTION public.match_user_entries(query_embedding public.vector, target_user_id uuid, match_threshold double precision, match_count integer) TO authenticated;


--
-- Name: FUNCTION match_wine_knowledge(query_embedding public.vector, match_threshold double precision, match_count integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.match_wine_knowledge(query_embedding public.vector, match_threshold double precision, match_count integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.match_wine_knowledge(query_embedding public.vector, match_threshold double precision, match_count integer) TO service_role;
GRANT ALL ON FUNCTION public.match_wine_knowledge(query_embedding public.vector, match_threshold double precision, match_count integer) TO authenticated;


--
-- Name: FUNCTION publish_entry_knowledge(target_entry_id uuid, expected_snapshot jsonb, chunk_content text, chunk_embedding public.vector); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.publish_entry_knowledge(target_entry_id uuid, expected_snapshot jsonb, chunk_content text, chunk_embedding public.vector) FROM PUBLIC;
GRANT ALL ON FUNCTION public.publish_entry_knowledge(target_entry_id uuid, expected_snapshot jsonb, chunk_content text, chunk_embedding public.vector) TO service_role;


--
-- Name: FUNCTION publish_entry_knowledge_batch(chunks jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.publish_entry_knowledge_batch(chunks jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.publish_entry_knowledge_batch(chunks jsonb) TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION validate_entry_comment_parent(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.validate_entry_comment_parent() TO anon;
GRANT ALL ON FUNCTION public.validate_entry_comment_parent() TO authenticated;
GRANT ALL ON FUNCTION public.validate_entry_comment_parent() TO service_role;


--
-- Name: TABLE aging_curve_baselines; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.aging_curve_baselines TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.aging_curve_baselines TO authenticated;
GRANT ALL ON TABLE public.aging_curve_baselines TO service_role;


--
-- Name: SEQUENCE aging_curve_baselines_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.aging_curve_baselines_id_seq TO anon;
GRANT ALL ON SEQUENCE public.aging_curve_baselines_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.aging_curve_baselines_id_seq TO service_role;


--
-- Name: TABLE api_rate_limits; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.api_rate_limits TO service_role;


--
-- Name: TABLE appellation_grape_map; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.appellation_grape_map TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.appellation_grape_map TO authenticated;
GRANT ALL ON TABLE public.appellation_grape_map TO service_role;


--
-- Name: SEQUENCE appellation_grape_map_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.appellation_grape_map_id_seq TO anon;
GRANT ALL ON SEQUENCE public.appellation_grape_map_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.appellation_grape_map_id_seq TO service_role;


--
-- Name: TABLE base_profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.base_profiles TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.base_profiles TO authenticated;
GRANT ALL ON TABLE public.base_profiles TO service_role;


--
-- Name: SEQUENCE base_profiles_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.base_profiles_id_seq TO anon;
GRANT ALL ON SEQUENCE public.base_profiles_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.base_profiles_id_seq TO service_role;


--
-- Name: TABLE cellar_custom_field_defs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.cellar_custom_field_defs TO anon;
GRANT ALL ON TABLE public.cellar_custom_field_defs TO authenticated;
GRANT ALL ON TABLE public.cellar_custom_field_defs TO service_role;


--
-- Name: TABLE cellar_custom_field_values; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.cellar_custom_field_values TO anon;
GRANT ALL ON TABLE public.cellar_custom_field_values TO authenticated;
GRANT ALL ON TABLE public.cellar_custom_field_values TO service_role;


--
-- Name: TABLE classification_tier_aging_modifiers; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.classification_tier_aging_modifiers TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.classification_tier_aging_modifiers TO authenticated;
GRANT ALL ON TABLE public.classification_tier_aging_modifiers TO service_role;


--
-- Name: SEQUENCE classification_tier_aging_modifiers_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.classification_tier_aging_modifiers_id_seq TO anon;
GRANT ALL ON SEQUENCE public.classification_tier_aging_modifiers_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.classification_tier_aging_modifiers_id_seq TO service_role;


--
-- Name: TABLE classification_tier_modifiers; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.classification_tier_modifiers TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.classification_tier_modifiers TO authenticated;
GRANT ALL ON TABLE public.classification_tier_modifiers TO service_role;


--
-- Name: SEQUENCE classification_tier_modifiers_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.classification_tier_modifiers_id_seq TO anon;
GRANT ALL ON SEQUENCE public.classification_tier_modifiers_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.classification_tier_modifiers_id_seq TO service_role;


--
-- Name: TABLE content_reports; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.content_reports TO anon;
GRANT ALL ON TABLE public.content_reports TO authenticated;
GRANT ALL ON TABLE public.content_reports TO service_role;


--
-- Name: TABLE entry_comments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.entry_comments TO anon;
GRANT ALL ON TABLE public.entry_comments TO authenticated;
GRANT ALL ON TABLE public.entry_comments TO service_role;


--
-- Name: TABLE entry_comparison_feedback; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.entry_comparison_feedback TO anon;
GRANT ALL ON TABLE public.entry_comparison_feedback TO authenticated;
GRANT ALL ON TABLE public.entry_comparison_feedback TO service_role;


--
-- Name: TABLE entry_group_slides; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.entry_group_slides TO anon;
GRANT ALL ON TABLE public.entry_group_slides TO authenticated;
GRANT ALL ON TABLE public.entry_group_slides TO service_role;


--
-- Name: TABLE entry_groups; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.entry_groups TO anon;
GRANT ALL ON TABLE public.entry_groups TO authenticated;
GRANT ALL ON TABLE public.entry_groups TO service_role;


--
-- Name: TABLE entry_photos; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.entry_photos TO anon;
GRANT ALL ON TABLE public.entry_photos TO authenticated;
GRANT ALL ON TABLE public.entry_photos TO service_role;


--
-- Name: TABLE entry_primary_grapes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.entry_primary_grapes TO anon;
GRANT ALL ON TABLE public.entry_primary_grapes TO authenticated;
GRANT ALL ON TABLE public.entry_primary_grapes TO service_role;


--
-- Name: TABLE entry_reactions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.entry_reactions TO anon;
GRANT ALL ON TABLE public.entry_reactions TO authenticated;
GRANT ALL ON TABLE public.entry_reactions TO service_role;


--
-- Name: TABLE friend_notifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.friend_notifications TO anon;
GRANT ALL ON TABLE public.friend_notifications TO authenticated;
GRANT ALL ON TABLE public.friend_notifications TO service_role;


--
-- Name: TABLE friend_requests; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.friend_requests TO anon;
GRANT ALL ON TABLE public.friend_requests TO authenticated;
GRANT ALL ON TABLE public.friend_requests TO service_role;


--
-- Name: TABLE general_knowledge_chunks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.general_knowledge_chunks TO anon;
GRANT ALL ON TABLE public.general_knowledge_chunks TO authenticated;
GRANT ALL ON TABLE public.general_knowledge_chunks TO service_role;


--
-- Name: SEQUENCE general_knowledge_chunks_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.general_knowledge_chunks_id_seq TO anon;
GRANT ALL ON SEQUENCE public.general_knowledge_chunks_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.general_knowledge_chunks_id_seq TO service_role;


--
-- Name: TABLE grape_aliases; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.grape_aliases TO anon;
GRANT ALL ON TABLE public.grape_aliases TO authenticated;
GRANT ALL ON TABLE public.grape_aliases TO service_role;


--
-- Name: TABLE grape_sensitivity_coefficients; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.grape_sensitivity_coefficients TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.grape_sensitivity_coefficients TO authenticated;
GRANT ALL ON TABLE public.grape_sensitivity_coefficients TO service_role;


--
-- Name: SEQUENCE grape_sensitivity_coefficients_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.grape_sensitivity_coefficients_id_seq TO anon;
GRANT ALL ON SEQUENCE public.grape_sensitivity_coefficients_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.grape_sensitivity_coefficients_id_seq TO service_role;


--
-- Name: TABLE grape_varieties; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.grape_varieties TO anon;
GRANT ALL ON TABLE public.grape_varieties TO authenticated;
GRANT ALL ON TABLE public.grape_varieties TO service_role;


--
-- Name: TABLE knowledge_documents; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.knowledge_documents TO anon;
GRANT ALL ON TABLE public.knowledge_documents TO authenticated;
GRANT ALL ON TABLE public.knowledge_documents TO service_role;


--
-- Name: TABLE launch_feedback; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.launch_feedback TO anon;
GRANT ALL ON TABLE public.launch_feedback TO authenticated;
GRANT ALL ON TABLE public.launch_feedback TO service_role;


--
-- Name: TABLE list_scan_results; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.list_scan_results TO anon;
GRANT ALL ON TABLE public.list_scan_results TO authenticated;
GRANT ALL ON TABLE public.list_scan_results TO service_role;


--
-- Name: TABLE list_scan_wines; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.list_scan_wines TO anon;
GRANT ALL ON TABLE public.list_scan_wines TO authenticated;
GRANT ALL ON TABLE public.list_scan_wines TO service_role;


--
-- Name: TABLE palate_profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.palate_profiles TO anon;
GRANT ALL ON TABLE public.palate_profiles TO authenticated;
GRANT ALL ON TABLE public.palate_profiles TO service_role;


--
-- Name: TABLE post_shares; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.post_shares TO service_role;


--
-- Name: COLUMN post_shares.id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(id) ON TABLE public.post_shares TO anon;
GRANT SELECT(id) ON TABLE public.post_shares TO authenticated;


--
-- Name: COLUMN post_shares.post_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(post_id) ON TABLE public.post_shares TO anon;
GRANT SELECT(post_id),INSERT(post_id) ON TABLE public.post_shares TO authenticated;


--
-- Name: COLUMN post_shares.created_by; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT(created_by) ON TABLE public.post_shares TO authenticated;


--
-- Name: COLUMN post_shares.created_at; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(created_at) ON TABLE public.post_shares TO anon;
GRANT SELECT(created_at) ON TABLE public.post_shares TO authenticated;


--
-- Name: COLUMN post_shares.expires_at; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(expires_at) ON TABLE public.post_shares TO anon;
GRANT SELECT(expires_at),INSERT(expires_at) ON TABLE public.post_shares TO authenticated;


--
-- Name: COLUMN post_shares.revoked_at; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(revoked_at) ON TABLE public.post_shares TO authenticated;


--
-- Name: COLUMN post_shares.mode; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(mode) ON TABLE public.post_shares TO anon;
GRANT SELECT(mode),INSERT(mode) ON TABLE public.post_shares TO authenticated;


--
-- Name: TABLE producer_aliases; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.producer_aliases TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.producer_aliases TO authenticated;
GRANT ALL ON TABLE public.producer_aliases TO service_role;


--
-- Name: SEQUENCE producer_aliases_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.producer_aliases_id_seq TO anon;
GRANT ALL ON SEQUENCE public.producer_aliases_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.producer_aliases_id_seq TO service_role;


--
-- Name: TABLE producer_modifiers; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.producer_modifiers TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.producer_modifiers TO authenticated;
GRANT ALL ON TABLE public.producer_modifiers TO service_role;


--
-- Name: SEQUENCE producer_modifiers_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.producer_modifiers_id_seq TO anon;
GRANT ALL ON SEQUENCE public.producer_modifiers_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.producer_modifiers_id_seq TO service_role;


--
-- Name: TABLE producer_region_crosswalk; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.producer_region_crosswalk TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.producer_region_crosswalk TO authenticated;
GRANT ALL ON TABLE public.producer_region_crosswalk TO service_role;


--
-- Name: SEQUENCE producer_region_crosswalk_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.producer_region_crosswalk_id_seq TO anon;
GRANT ALL ON SEQUENCE public.producer_region_crosswalk_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.producer_region_crosswalk_id_seq TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE public_profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.public_profiles TO authenticated;
GRANT ALL ON TABLE public.public_profiles TO service_role;


--
-- Name: TABLE region_aliases; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.region_aliases TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.region_aliases TO authenticated;
GRANT ALL ON TABLE public.region_aliases TO service_role;


--
-- Name: SEQUENCE region_aliases_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.region_aliases_id_seq TO anon;
GRANT ALL ON SEQUENCE public.region_aliases_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.region_aliases_id_seq TO service_role;


--
-- Name: TABLE scan_resolution_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.scan_resolution_log TO anon;
GRANT ALL ON TABLE public.scan_resolution_log TO authenticated;
GRANT ALL ON TABLE public.scan_resolution_log TO service_role;


--
-- Name: TABLE sommelier_conversations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.sommelier_conversations TO anon;
GRANT ALL ON TABLE public.sommelier_conversations TO authenticated;
GRANT ALL ON TABLE public.sommelier_conversations TO service_role;


--
-- Name: TABLE sommelier_messages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.sommelier_messages TO anon;
GRANT ALL ON TABLE public.sommelier_messages TO authenticated;
GRANT ALL ON TABLE public.sommelier_messages TO service_role;


--
-- Name: SEQUENCE sommelier_messages_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.sommelier_messages_id_seq TO anon;
GRANT ALL ON SEQUENCE public.sommelier_messages_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.sommelier_messages_id_seq TO service_role;


--
-- Name: TABLE taste_survey_responses; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.taste_survey_responses TO anon;
GRANT ALL ON TABLE public.taste_survey_responses TO authenticated;
GRANT ALL ON TABLE public.taste_survey_responses TO service_role;


--
-- Name: TABLE taxonomy_classification_tiers; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.taxonomy_classification_tiers TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.taxonomy_classification_tiers TO authenticated;
GRANT ALL ON TABLE public.taxonomy_classification_tiers TO service_role;


--
-- Name: SEQUENCE taxonomy_classification_tiers_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.taxonomy_classification_tiers_id_seq TO anon;
GRANT ALL ON SEQUENCE public.taxonomy_classification_tiers_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.taxonomy_classification_tiers_id_seq TO service_role;


--
-- Name: TABLE taxonomy_master_v2; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.taxonomy_master_v2 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.taxonomy_master_v2 TO authenticated;
GRANT ALL ON TABLE public.taxonomy_master_v2 TO service_role;


--
-- Name: SEQUENCE taxonomy_master_v2_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.taxonomy_master_v2_id_seq TO anon;
GRANT ALL ON SEQUENCE public.taxonomy_master_v2_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.taxonomy_master_v2_id_seq TO service_role;


--
-- Name: TABLE taxonomy_price_ranges; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.taxonomy_price_ranges TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.taxonomy_price_ranges TO authenticated;
GRANT ALL ON TABLE public.taxonomy_price_ranges TO service_role;


--
-- Name: SEQUENCE taxonomy_price_ranges_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.taxonomy_price_ranges_id_seq TO anon;
GRANT ALL ON SEQUENCE public.taxonomy_price_ranges_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.taxonomy_price_ranges_id_seq TO service_role;


--
-- Name: TABLE user_badges; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_badges TO anon;
GRANT ALL ON TABLE public.user_badges TO authenticated;
GRANT ALL ON TABLE public.user_badges TO service_role;


--
-- Name: TABLE user_blocks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_blocks TO anon;
GRANT ALL ON TABLE public.user_blocks TO authenticated;
GRANT ALL ON TABLE public.user_blocks TO service_role;


--
-- Name: TABLE user_collection_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_collection_items TO anon;
GRANT ALL ON TABLE public.user_collection_items TO authenticated;
GRANT ALL ON TABLE public.user_collection_items TO service_role;


--
-- Name: TABLE user_collections; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_collections TO anon;
GRANT ALL ON TABLE public.user_collections TO authenticated;
GRANT ALL ON TABLE public.user_collections TO service_role;


--
-- Name: TABLE user_entry_knowledge_chunks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_entry_knowledge_chunks TO service_role;
GRANT SELECT ON TABLE public.user_entry_knowledge_chunks TO authenticated;


--
-- Name: SEQUENCE user_entry_knowledge_chunks_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.user_entry_knowledge_chunks_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_entry_knowledge_chunks_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_entry_knowledge_chunks_id_seq TO service_role;


--
-- Name: TABLE vintage_weather_modifiers; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.vintage_weather_modifiers TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.vintage_weather_modifiers TO authenticated;
GRANT ALL ON TABLE public.vintage_weather_modifiers TO service_role;


--
-- Name: SEQUENCE vintage_weather_modifiers_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.vintage_weather_modifiers_id_seq TO anon;
GRANT ALL ON SEQUENCE public.vintage_weather_modifiers_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.vintage_weather_modifiers_id_seq TO service_role;


--
-- Name: TABLE wine_entries; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.wine_entries TO anon;
GRANT ALL ON TABLE public.wine_entries TO authenticated;
GRANT ALL ON TABLE public.wine_entries TO service_role;


--
-- Name: TABLE wine_entry_scores; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.wine_entry_scores TO anon;
GRANT ALL ON TABLE public.wine_entry_scores TO authenticated;
GRANT ALL ON TABLE public.wine_entry_scores TO service_role;


--
-- Name: TABLE wine_knowledge_chunks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.wine_knowledge_chunks TO service_role;
GRANT SELECT ON TABLE public.wine_knowledge_chunks TO authenticated;


--
-- Name: SEQUENCE wine_knowledge_chunks_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.wine_knowledge_chunks_id_seq TO anon;
GRANT ALL ON SEQUENCE public.wine_knowledge_chunks_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.wine_knowledge_chunks_id_seq TO service_role;


--
-- Name: TABLE wine_notifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.wine_notifications TO anon;
GRANT ALL ON TABLE public.wine_notifications TO authenticated;
GRANT ALL ON TABLE public.wine_notifications TO service_role;


--
-- Name: TABLE wine_profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.wine_profiles TO anon;
GRANT ALL ON TABLE public.wine_profiles TO authenticated;
GRANT ALL ON TABLE public.wine_profiles TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--
