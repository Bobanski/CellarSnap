-- Synthetic fixture extensions; no production data or DDL.
alter table wine_entries add column label_image_path text, add column place_image_path text, add column pairing_image_path text;
alter table profiles add column avatar_path text;
create view public_profiles as select id, avatar_path, is_test_account from profiles;
grant select on public_profiles to anon, authenticated, service_role;
create table if not exists storage.buckets (id text primary key, public boolean);
insert into storage.buckets (id,public) values ('wine-photos',false),('public-assets',true);

update entry_photos p set path=e.user_id::text || '/' || e.id::text || '/' || p.type || '/' || p.id::text || '.jpg'
from wine_entries e where p.entry_id=e.id;
update profiles set avatar_path=id::text || '/avatar.jpg';
update wine_entries set label_image_path=user_id::text || '/' || id::text || '/label-legacy.jpg',
  place_image_path=user_id::text || '/' || id::text || '/place-legacy.jpg',
  pairing_image_path=user_id::text || '/' || id::text || '/pairing-legacy.jpg';
update entry_group_slides s set path=e.user_id::text || '/' || e.id::text || '/' || s.photo_type || '/context-' || s.id::text || '.jpg'
from entry_groups g join wine_entries e on e.id=g.anchor_entry_id where s.group_id=g.id and s.entry_id is null;
insert into entry_photos (id,entry_id,path,type) values
('00000000-0000-4000-8000-000000000220','00000000-0000-4000-8000-000000000110','00000000-0000-4000-8000-000000000005/00000000-0000-4000-8000-000000000110/label/tester.jpg','label');
