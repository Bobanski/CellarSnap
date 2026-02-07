insert into storage.buckets (id, name, public)
values ('wine-photos', 'wine-photos', false)
on conflict (id) do nothing;

alter table storage.objects enable row level security;

create policy "Users can read own wine photos"
  on storage.objects
  for select
  using (
    bucket_id = 'wine-photos'
    and auth.uid()::text = split_part(name, '/', 1)
  );

create policy "Users can upload own wine photos"
  on storage.objects
  for insert
  with check (
    bucket_id = 'wine-photos'
    and auth.uid()::text = split_part(name, '/', 1)
  );

create policy "Users can update own wine photos"
  on storage.objects
  for update
  using (
    bucket_id = 'wine-photos'
    and auth.uid()::text = split_part(name, '/', 1)
  );

create policy "Users can delete own wine photos"
  on storage.objects
  for delete
  using (
    bucket_id = 'wine-photos'
    and auth.uid()::text = split_part(name, '/', 1)
  );
