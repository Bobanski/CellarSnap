-- Synthetic fixture rows and dependent policy; never production data.
create policy "Users can view entry photos" on entry_photos for select using (
  exists (select 1 from wine_entries e where e.id = entry_id
    and public.can_view_entry(auth.uid(), e.user_id, e.entry_privacy))
);
insert into profiles (id,is_test_account,display_name)
select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  n in (5,6), 'Fixture ' || n from generate_series(1,7) n;
insert into friend_requests values
('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','accepted'),
('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','accepted'),
('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000007','pending');
insert into wine_entries (id,user_id,entry_privacy,rating,notes)
select ('00000000-0000-4000-8000-' || lpad((99+n)::text,12,'0'))::uuid,
  '00000000-0000-4000-8000-000000000001', p, 92, 'Synthetic tasting'
from unnest(array['public','friends','friends_of_friends','private']) with ordinality as v(p,n);
insert into wine_entries (id,user_id,entry_privacy)
select ('00000000-0000-4000-8000-' || lpad((109+n)::text,12,'0'))::uuid,
  '00000000-0000-4000-8000-000000000005', p
from unnest(array['public','friends','friends_of_friends','private']) with ordinality as v(p,n);
insert into entry_photos
select ('00000000-0000-4000-8000-' || lpad((200+n)::text,12,'0'))::uuid,
  ('00000000-0000-4000-8000-' || lpad((100+n)::text,12,'0'))::uuid,
  'synthetic/photo-' || n || '.jpg' from generate_series(0,3) n;
insert into storage.objects values ('original.svg','public-assets');
