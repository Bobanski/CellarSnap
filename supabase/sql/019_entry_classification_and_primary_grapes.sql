alter table public.wine_entries
  add column if not exists classification text;

comment on column public.wine_entries.classification is
  'Optional quality/classification descriptor kept separate from appellation (for example Premier Cru, Grand Cru Classe).';

create table if not exists public.grape_varieties (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.grape_aliases (
  id uuid primary key default gen_random_uuid(),
  variety_id uuid not null references public.grape_varieties(id) on delete cascade,
  alias text not null,
  alias_normalized text not null,
  created_at timestamptz not null default now(),
  unique (variety_id, alias_normalized),
  unique (alias_normalized)
);

create index if not exists grape_aliases_variety_id_idx
  on public.grape_aliases (variety_id);

create table if not exists public.entry_primary_grapes (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.wine_entries(id) on delete cascade,
  variety_id uuid not null references public.grape_varieties(id) on delete restrict,
  position smallint not null check (position between 1 and 3),
  created_at timestamptz not null default now(),
  unique (entry_id, variety_id),
  unique (entry_id, position)
);

create index if not exists entry_primary_grapes_entry_idx
  on public.entry_primary_grapes (entry_id, position);

create index if not exists entry_primary_grapes_variety_idx
  on public.entry_primary_grapes (variety_id);

alter table public.grape_varieties enable row level security;
alter table public.grape_aliases enable row level security;
alter table public.entry_primary_grapes enable row level security;

drop policy if exists "Authenticated users can read grape varieties" on public.grape_varieties;
create policy "Authenticated users can read grape varieties"
  on public.grape_varieties
  for select
  using (auth.uid() is not null);

drop policy if exists "Authenticated users can read grape aliases" on public.grape_aliases;
create policy "Authenticated users can read grape aliases"
  on public.grape_aliases
  for select
  using (auth.uid() is not null);

drop policy if exists "Users can view primary grapes for visible entries" on public.entry_primary_grapes;
create policy "Users can view primary grapes for visible entries"
  on public.entry_primary_grapes
  for select
  using (
    exists (
      select 1
      from public.wine_entries e
      where e.id = entry_id
        and public.can_view_entry(auth.uid(), e.user_id, e.entry_privacy)
    )
  );

drop policy if exists "Users can insert primary grapes on own entries" on public.entry_primary_grapes;
create policy "Users can insert primary grapes on own entries"
  on public.entry_primary_grapes
  for insert
  with check (
    exists (
      select 1
      from public.wine_entries e
      where e.id = entry_id
        and e.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update primary grapes on own entries" on public.entry_primary_grapes;
create policy "Users can update primary grapes on own entries"
  on public.entry_primary_grapes
  for update
  using (
    exists (
      select 1
      from public.wine_entries e
      where e.id = entry_id
        and e.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.wine_entries e
      where e.id = entry_id
        and e.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete primary grapes on own entries" on public.entry_primary_grapes;
create policy "Users can delete primary grapes on own entries"
  on public.entry_primary_grapes
  for delete
  using (
    exists (
      select 1
      from public.wine_entries e
      where e.id = entry_id
        and e.user_id = auth.uid()
    )
  );

with seed(slug, name) as (
  values
    ('cabernet-sauvignon', 'Cabernet Sauvignon'),
    ('merlot', 'Merlot'),
    ('cabernet-franc', 'Cabernet Franc'),
    ('petit-verdot', 'Petit Verdot'),
    ('malbec', 'Malbec'),
    ('carmenere', 'Carmenere'),
    ('pinot-noir', 'Pinot Noir'),
    ('syrah', 'Syrah'),
    ('grenache', 'Grenache'),
    ('mourvedre', 'Mourvedre'),
    ('cinsault', 'Cinsault'),
    ('carignan', 'Carignan'),
    ('tempranillo', 'Tempranillo'),
    ('sangiovese', 'Sangiovese'),
    ('nebbiolo', 'Nebbiolo'),
    ('barbera', 'Barbera'),
    ('dolcetto', 'Dolcetto'),
    ('montepulciano', 'Montepulciano'),
    ('aglianico', 'Aglianico'),
    ('nero-d-avola', 'Nero d''Avola'),
    ('frappato', 'Frappato'),
    ('corvina', 'Corvina'),
    ('rondinella', 'Rondinella'),
    ('molinara', 'Molinara'),
    ('primitivo', 'Primitivo'),
    ('zinfandel', 'Zinfandel'),
    ('gamay', 'Gamay'),
    ('pinotage', 'Pinotage'),
    ('tannat', 'Tannat'),
    ('touriga-nacional', 'Touriga Nacional'),
    ('mencia', 'Mencia'),
    ('bobal', 'Bobal'),
    ('xinomavro', 'Xinomavro'),
    ('saperavi', 'Saperavi'),
    ('chardonnay', 'Chardonnay'),
    ('sauvignon-blanc', 'Sauvignon Blanc'),
    ('riesling', 'Riesling'),
    ('pinot-grigio', 'Pinot Grigio'),
    ('chenin-blanc', 'Chenin Blanc'),
    ('semillon', 'Semillon'),
    ('viognier', 'Viognier'),
    ('marsanne', 'Marsanne'),
    ('roussanne', 'Roussanne'),
    ('gewurztraminer', 'Gewurztraminer'),
    ('torrontes', 'Torrontes'),
    ('albarino', 'Albarino'),
    ('verdejo', 'Verdejo'),
    ('godello', 'Godello'),
    ('vermentino', 'Vermentino'),
    ('arneis', 'Arneis'),
    ('garganega', 'Garganega'),
    ('trebbiano', 'Trebbiano'),
    ('verdicchio', 'Verdicchio'),
    ('fiano', 'Fiano'),
    ('greco', 'Greco'),
    ('falanghina', 'Falanghina'),
    ('cortese', 'Cortese'),
    ('moscato-bianco', 'Moscato Bianco'),
    ('muscat-of-alexandria', 'Muscat of Alexandria'),
    ('assyrtiko', 'Assyrtiko'),
    ('moschofilero', 'Moschofilero'),
    ('gruner-veltliner', 'Gruner Veltliner'),
    ('silvaner', 'Silvaner'),
    ('furmint', 'Furmint'),
    ('harslevelu', 'Harslevelu'),
    ('muller-thurgau', 'Muller-Thurgau'),
    ('melon-de-bourgogne', 'Melon de Bourgogne'),
    ('glera', 'Glera'),
    ('pinot-meunier', 'Pinot Meunier'),
    ('palomino', 'Palomino'),
    ('pedro-ximenez', 'Pedro Ximenez'),
    ('airen', 'Airen'),
    ('macabeo', 'Macabeo'),
    ('xarel-lo', 'Xarel-lo'),
    ('parellada', 'Parellada'),
    ('sercial', 'Sercial'),
    ('malvasia', 'Malvasia'),
    ('baga', 'Baga'),
    ('zweigelt', 'Zweigelt'),
    ('blaufrankisch', 'Blaufrankisch'),
    ('durif', 'Durif'),
    ('alicante-bouschet', 'Alicante Bouschet')
)
insert into public.grape_varieties (slug, name)
select slug, name
from seed
on conflict (slug) do nothing;

insert into public.grape_aliases (variety_id, alias, alias_normalized)
select
  v.id,
  v.name,
  lower(trim(regexp_replace(v.name, '[^a-z0-9]+', ' ', 'g')))
from public.grape_varieties v
on conflict (alias_normalized) do nothing;

with alias_seed(variety_name, alias) as (
  values
    ('Cabernet Sauvignon', 'Cabernet'),
    ('Cabernet Sauvignon', 'Cab'),
    ('Cabernet Sauvignon', 'Cab Sauv'),
    ('Cabernet Sauvignon', 'Cab Sauvignon'),
    ('Cabernet Franc', 'Cab Franc'),
    ('Syrah', 'Shiraz'),
    ('Grenache', 'Garnacha'),
    ('Mourvedre', 'Monastrell'),
    ('Mourvedre', 'Mataro'),
    ('Carignan', 'Carignane'),
    ('Tempranillo', 'Tinta Roriz'),
    ('Tempranillo', 'Aragonez'),
    ('Sangiovese', 'Brunello'),
    ('Sangiovese', 'Prugnolo Gentile'),
    ('Nebbiolo', 'Spanna'),
    ('Chardonnay', 'Chard'),
    ('Sauvignon Blanc', 'Sauv Blanc'),
    ('Pinot Grigio', 'Pinot Gris'),
    ('Gewurztraminer', 'Gewurz'),
    ('Albarino', 'Alvarinho'),
    ('Vermentino', 'Rolle'),
    ('Trebbiano', 'Ugni Blanc'),
    ('Moscato Bianco', 'Moscato'),
    ('Moscato Bianco', 'Muscat Blanc a Petits Grains'),
    ('Muscat of Alexandria', 'Zibibbo'),
    ('Gruner Veltliner', 'Gruner'),
    ('Gruner Veltliner', 'Gru Vee'),
    ('Muller-Thurgau', 'Rivaner'),
    ('Melon de Bourgogne', 'Muscadet'),
    ('Glera', 'Prosecco Grape'),
    ('Pinot Meunier', 'Meunier'),
    ('Pedro Ximenez', 'PX'),
    ('Macabeo', 'Viura'),
    ('Xarel-lo', 'Xarel Lo'),
    ('Blaufrankisch', 'Lemberger'),
    ('Durif', 'Petit Sirah'),
    ('Durif', 'Petite Sirah'),
    ('Touriga Nacional', 'Touriga')
)
insert into public.grape_aliases (variety_id, alias, alias_normalized)
select
  v.id,
  a.alias,
  lower(trim(regexp_replace(a.alias, '[^a-z0-9]+', ' ', 'g')))
from alias_seed a
join public.grape_varieties v
  on v.name = a.variety_name
on conflict (alias_normalized) do nothing;

comment on table public.grape_varieties is
  'Canonical grape variety list used for normalized entry tagging and search.';

comment on table public.grape_aliases is
  'Synonyms and shorthand aliases mapped to canonical grape varieties.';

comment on table public.entry_primary_grapes is
  'Up to three normalized primary grape selections associated with a wine entry.';
