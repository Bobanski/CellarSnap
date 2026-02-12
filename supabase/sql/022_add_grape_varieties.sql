with seed(slug, name) as (
  values
    ('sagrantino', 'Sagrantino'),
    ('schioppettino', 'Schioppettino'),
    ('nerello-mascalese', 'Nerello Mascalese'),
    ('trousseau', 'Trousseau'),
    ('schiava', 'Schiava'),
    ('savagnin', 'Savagnin'),
    ('carricante', 'Carricante'),
    ('picpoul', 'Picpoul'),
    ('plavac-mali', 'Plavac Mali'),
    ('refosco', 'Refosco'),
    ('graciano', 'Graciano')
)
insert into public.grape_varieties (slug, name)
select slug, name
from seed
on conflict (slug) do nothing;

with seed(slug, name) as (
  values
    ('sagrantino', 'Sagrantino'),
    ('schioppettino', 'Schioppettino'),
    ('nerello-mascalese', 'Nerello Mascalese'),
    ('trousseau', 'Trousseau'),
    ('schiava', 'Schiava'),
    ('savagnin', 'Savagnin'),
    ('carricante', 'Carricante'),
    ('picpoul', 'Picpoul'),
    ('plavac-mali', 'Plavac Mali'),
    ('refosco', 'Refosco'),
    ('graciano', 'Graciano')
)
insert into public.grape_aliases (variety_id, alias, alias_normalized)
select
  v.id,
  v.name,
  lower(trim(regexp_replace(v.name, '[^a-z0-9]+', ' ', 'g')))
from seed s
join public.grape_varieties v
  on v.slug = s.slug
on conflict (alias_normalized) do nothing;
