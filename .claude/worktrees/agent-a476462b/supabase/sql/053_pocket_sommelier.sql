create extension if not exists vector;

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_url text,
  source_filename text,
  content_type text not null default 'markdown',
  content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  ingest_status text not null default 'pending',
  chunk_count integer not null default 0,
  last_ingested_at timestamptz,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wine_knowledge_chunks (
  id bigserial primary key,
  source_table text not null,
  source_row_id text not null,
  chunk_index integer not null default 0,
  content text not null,
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_table, source_row_id, chunk_index)
);

create table if not exists public.general_knowledge_chunks (
  id bigserial primary key,
  document_id uuid not null references public.knowledge_documents (id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create table if not exists public.sommelier_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sommelier_messages (
  id bigserial primary key,
  conversation_id uuid not null references public.sommelier_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_wine_knowledge_embedding
  on public.wine_knowledge_chunks
  using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create index if not exists idx_general_knowledge_embedding
  on public.general_knowledge_chunks
  using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create index if not exists idx_general_knowledge_document
  on public.general_knowledge_chunks (document_id, chunk_index);

create index if not exists idx_knowledge_documents_uploaded_by
  on public.knowledge_documents (uploaded_by, created_at desc);

create index if not exists idx_sommelier_conversations_user
  on public.sommelier_conversations (user_id, updated_at desc);

create index if not exists idx_sommelier_messages_conversation
  on public.sommelier_messages (conversation_id, created_at asc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists knowledge_documents_set_updated_at on public.knowledge_documents;
create trigger knowledge_documents_set_updated_at
before update on public.knowledge_documents
for each row
execute function public.set_updated_at();

drop trigger if exists sommelier_conversations_set_updated_at on public.sommelier_conversations;
create trigger sommelier_conversations_set_updated_at
before update on public.sommelier_conversations
for each row
execute function public.set_updated_at();

create or replace function public.match_wine_knowledge(
  query_embedding vector(1536),
  match_threshold float default 0.72,
  match_count int default 5
) returns table (
  id bigint,
  content text,
  similarity float,
  metadata jsonb
)
language sql
stable
as $$
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
$$;

create or replace function public.match_general_knowledge(
  query_embedding vector(1536),
  match_threshold float default 0.72,
  match_count int default 5
) returns table (
  id bigint,
  document_id uuid,
  content text,
  similarity float,
  metadata jsonb
)
language sql
stable
as $$
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

alter table public.knowledge_documents enable row level security;
alter table public.wine_knowledge_chunks enable row level security;
alter table public.general_knowledge_chunks enable row level security;
alter table public.sommelier_conversations enable row level security;
alter table public.sommelier_messages enable row level security;

drop policy if exists "knowledge_documents_select_authenticated" on public.knowledge_documents;
create policy "knowledge_documents_select_authenticated"
on public.knowledge_documents
for select
to authenticated
using (true);

drop policy if exists "knowledge_documents_insert_owner" on public.knowledge_documents;
create policy "knowledge_documents_insert_owner"
on public.knowledge_documents
for insert
to authenticated
with check (uploaded_by = auth.uid());

drop policy if exists "knowledge_documents_update_owner" on public.knowledge_documents;
create policy "knowledge_documents_update_owner"
on public.knowledge_documents
for update
to authenticated
using (uploaded_by = auth.uid())
with check (uploaded_by = auth.uid());

drop policy if exists "knowledge_documents_delete_owner" on public.knowledge_documents;
create policy "knowledge_documents_delete_owner"
on public.knowledge_documents
for delete
to authenticated
using (uploaded_by = auth.uid());

drop policy if exists "wine_knowledge_chunks_select_authenticated" on public.wine_knowledge_chunks;
create policy "wine_knowledge_chunks_select_authenticated"
on public.wine_knowledge_chunks
for select
to authenticated
using (true);

drop policy if exists "general_knowledge_chunks_select_authenticated" on public.general_knowledge_chunks;
create policy "general_knowledge_chunks_select_authenticated"
on public.general_knowledge_chunks
for select
to authenticated
using (true);

drop policy if exists "sommelier_conversations_owner_all" on public.sommelier_conversations;
create policy "sommelier_conversations_owner_all"
on public.sommelier_conversations
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "sommelier_messages_owner_all" on public.sommelier_messages;
create policy "sommelier_messages_owner_all"
on public.sommelier_messages
for all
to authenticated
using (
  exists (
    select 1
    from public.sommelier_conversations sc
    where sc.id = conversation_id
      and sc.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.sommelier_conversations sc
    where sc.id = conversation_id
      and sc.user_id = auth.uid()
  )
);

grant execute on function public.match_wine_knowledge(vector, float, int) to authenticated;
grant execute on function public.match_general_knowledge(vector, float, int) to authenticated;
