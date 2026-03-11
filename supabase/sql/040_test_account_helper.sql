create or replace function public.create_test_account(
  username text,
  password text,
  email text default null
)
returns table (
  user_id uuid,
  login_username text,
  login_email text
)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
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
    confirmed_at,
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

revoke all on function public.create_test_account(text, text, text) from PUBLIC;
revoke all on function public.create_test_account(text, text, text) from anon;
revoke all on function public.create_test_account(text, text, text) from authenticated;
grant execute on function public.create_test_account(text, text, text) to service_role;

comment on function public.create_test_account(text, text, text) is
  'Creates a confirmed email/password test user for manual dev or staging setup. Sign in with the returned username or email plus the supplied password.';
