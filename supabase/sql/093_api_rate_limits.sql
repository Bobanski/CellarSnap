-- Shared API rate-limit buckets for server routes that can run on multiple
-- Vercel instances. Called with the service-role client from src/lib/rateLimit.ts.

create table if not exists public.api_rate_limits (
  route_key text not null,
  subject text not null,
  window_start_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (route_key, subject)
);

create index if not exists api_rate_limits_updated_at_idx
  on public.api_rate_limits (updated_at);

alter table public.api_rate_limits enable row level security;

create or replace function public.consume_api_rate_limit(
  p_route_key text,
  p_subject text,
  p_window_seconds integer,
  p_max_requests integer
)
returns table (
  allowed boolean,
  limit_count integer,
  remaining_count integer,
  reset_at timestamptz,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on table public.api_rate_limits from anon, authenticated;
revoke execute on function public.consume_api_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer)
  to service_role;
