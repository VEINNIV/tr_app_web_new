create schema if not exists app_private;

create type public.user_role as enum ('user', 'subscriber', 'admin');
create type public.plan as enum ('free', 'starter', 'pro', 'enterprise');
create type public.document_status as enum ('uploaded', 'processing', 'completed', 'error');
create type public.translation_status as enum ('pending', 'extracting', 'translating', 'generating', 'completed', 'error');
create type public.credit_action as enum ('translation', 'chat', 'monthly_reset', 'purchase', 'admin_grant', 'study_notes');
create type public.study_session_status as enum ('draft', 'processing', 'completed', 'error');
create type public.chat_role as enum ('user', 'assistant');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  role public.user_role not null default 'user',
  plan public.plan not null default 'free',
  credits_remaining numeric(10, 2) not null default 5,
  credits_monthly_limit numeric(10, 2) not null default 5,
  credits_reset_at timestamptz,
  preferred_language text not null default 'tr',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_credits_non_negative check (credits_remaining >= 0),
  constraint profiles_monthly_limit_non_negative check (credits_monthly_limit >= 0)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  original_name text not null,
  original_storage_path text not null,
  original_language text,
  page_count integer not null default 0,
  file_size_bytes bigint not null default 0,
  status public.document_status not null default 'uploaded',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.translations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_language text not null default 'tr',
  translated_storage_path text,
  translated_text jsonb,
  progress integer not null default 0,
  status public.translation_status not null default 'pending',
  error_message text,
  credits_used numeric(10, 2) not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint translations_progress_range check (progress between 0 and 100)
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  role public.chat_role not null,
  content text not null,
  credits_used numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10, 2) not null,
  action public.credit_action not null,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  subject text,
  source_count integer not null default 0,
  generated_notes text,
  status public.study_session_status not null default 'draft',
  credits_used numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.study_sources (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  file_type text not null,
  file_size_bytes bigint not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index documents_user_created_idx on public.documents(user_id, created_at desc);
create index translations_user_status_idx on public.translations(user_id, status);
create index translations_document_idx on public.translations(document_id);
create index chat_messages_user_document_created_idx on public.chat_messages(user_id, document_id, created_at);
create index credit_transactions_user_created_idx on public.credit_transactions(user_id, created_at desc);
create index study_sessions_user_created_idx on public.study_sessions(user_id, created_at desc);
create index study_sources_session_sort_idx on public.study_sources(session_id, sort_order);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

create trigger study_sessions_set_updated_at
before update on public.study_sessions
for each row execute function public.set_updated_at();

create or replace function app_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function app_private.is_admin() from public;
grant execute on function app_private.is_admin() to authenticated;

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function app_private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.translations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.study_sessions enable row level security;
alter table public.study_sources enable row level security;

create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or app_private.is_admin());

create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

create policy "profiles_update_own_or_admin"
on public.profiles for update
to authenticated
using (id = auth.uid() or app_private.is_admin())
with check (id = auth.uid() or app_private.is_admin());

create policy "documents_owner_all"
on public.documents for all
to authenticated
using (user_id = auth.uid() or app_private.is_admin())
with check (user_id = auth.uid() or app_private.is_admin());

create policy "translations_owner_all"
on public.translations for all
to authenticated
using (user_id = auth.uid() or app_private.is_admin())
with check (user_id = auth.uid() or app_private.is_admin());

create policy "chat_messages_owner_all"
on public.chat_messages for all
to authenticated
using (user_id = auth.uid() or app_private.is_admin())
with check (user_id = auth.uid() or app_private.is_admin());

create policy "credit_transactions_owner_select"
on public.credit_transactions for select
to authenticated
using (user_id = auth.uid() or app_private.is_admin());

create policy "credit_transactions_owner_insert"
on public.credit_transactions for insert
to authenticated
with check (user_id = auth.uid() or app_private.is_admin());

create policy "study_sessions_owner_all"
on public.study_sessions for all
to authenticated
using (user_id = auth.uid() or app_private.is_admin())
with check (user_id = auth.uid() or app_private.is_admin());

create policy "study_sources_owner_all"
on public.study_sources for all
to authenticated
using (user_id = auth.uid() or app_private.is_admin())
with check (user_id = auth.uid() or app_private.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('originals', 'originals', false, 104857600, array['application/pdf']),
  ('study-sources', 'study-sources', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "storage_originals_owner_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'originals'
  and (name like auth.uid()::text || '/%' or app_private.is_admin())
);

create policy "storage_originals_owner_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'originals'
  and name like auth.uid()::text || '/%'
);

create policy "storage_originals_owner_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'originals'
  and (name like auth.uid()::text || '/%' or app_private.is_admin())
);

create policy "storage_study_sources_owner_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'study-sources'
  and (name like auth.uid()::text || '/%' or app_private.is_admin())
);

create policy "storage_study_sources_owner_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'study-sources'
  and name like auth.uid()::text || '/%'
);

create policy "storage_study_sources_owner_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'study-sources'
  and (name like auth.uid()::text || '/%' or app_private.is_admin())
);
