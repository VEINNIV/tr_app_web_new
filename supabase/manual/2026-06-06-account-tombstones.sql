-- ════════════════════════════════════════════════════════════════════════════
-- Hesap Mezar Taşı (tombstone) + Yeniden-kayıt Engeli + Moderasyon Görünürlüğü
--
-- ⚠️  ELLE / MCP ile ÇALIŞTIR. Canlı DB el-yönetimli; repo migration'ları stale.
--     Project: oxgnrhgaodtvywpjguku (TransWordly)
--
-- Amaç:
--  • Admin bir kullanıcıyı silerken opsiyonel "sebep" girebilsin.
--  • Silinen e-posta ile YENİDEN KAYIT engellensin (tombstone blocklist).
--  • Kullanıcı, kayıt denerken sebebi (varsa) görebilsin (check_blocked_email).
--  • Admin panelinde "silen admin + sebep + tarih" görünür olsun (admin_deleted_accounts).
--  • Admin, gerekirse yeniden kayda izin verebilsin (admin_unblock_email).
--
-- Güvenlik: tüm admin RPC'leri SECURITY DEFINER + is_admin() korumalı.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Tombstone tablosu ────────────────────────────────────────────────────────
create table if not exists public.deleted_accounts (
  id               uuid primary key default gen_random_uuid(),
  email            text not null,
  full_name        text,
  original_user_id uuid,
  reason           text,            -- opsiyonel; varsa kullanıcıya gösterilir
  deleted_by       uuid,            -- silen admin (auth.uid)
  deleted_by_email text,
  created_at       timestamptz not null default now()
);

-- Aynı e-posta tek satır (normalize: lower). Tekrar silmede sebep güncellenir.
create unique index if not exists deleted_accounts_email_uniq
  on public.deleted_accounts (lower(email));

alter table public.deleted_accounts enable row level security;

-- Sadece admin okuyabilir. Yazma/silme yalnızca SECURITY DEFINER fonksiyonları ile.
drop policy if exists deleted_accounts_admin_select on public.deleted_accounts;
create policy deleted_accounts_admin_select
  on public.deleted_accounts for select
  using (public.is_admin());

-- 2) admin_delete_users — sebep parametresi + silmeden önce tombstone yaz ───────
create or replace function public.admin_delete_users(
  p_user_ids uuid[],
  p_reason   text default null
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_deleted    int;
  v_admin      uuid := auth.uid();
  v_admin_mail text;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz işlem' using errcode = '42501';
  end if;
  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    raise exception 'Kullanıcı seçilmedi' using errcode = '22023';
  end if;
  if v_admin = any(p_user_ids) then
    raise exception 'Kendinizi silemezsiniz' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where id = any(p_user_ids) and role = 'admin') then
    raise exception 'Admin kullanıcılar silinemez' using errcode = '42501';
  end if;

  select email into v_admin_mail from public.profiles where id = v_admin;

  -- Tombstone: silinecek her kullanıcı için (e-posta lower normalize edilir).
  insert into public.deleted_accounts (email, full_name, original_user_id, reason, deleted_by, deleted_by_email)
  select lower(p.email), p.full_name, p.id,
         nullif(btrim(coalesce(p_reason, '')), ''),
         v_admin, v_admin_mail
  from public.profiles p
  where p.id = any(p_user_ids) and p.email is not null
  on conflict (lower(email)) do update
    set reason           = excluded.reason,
        deleted_by       = excluded.deleted_by,
        deleted_by_email = excluded.deleted_by_email,
        full_name        = excluded.full_name,
        original_user_id = excluded.original_user_id,
        created_at       = now();

  perform set_config('app.guard_bypass', 'on', true);
  delete from auth.users where id = any(p_user_ids);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

-- 3) Yeniden-kayıt engeli — auth.users BEFORE INSERT trigger ───────────────────
create or replace function public.block_deleted_email()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.email is not null and exists (
    select 1 from public.deleted_accounts where lower(email) = lower(new.email)
  ) then
    raise exception 'Bu hesap kaldırılmıştır; aynı e-posta ile yeniden kayıt olunamaz.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists block_deleted_email_trg on auth.users;
create trigger block_deleted_email_trg
  before insert on auth.users
  for each row execute function public.block_deleted_email();

-- 4) check_blocked_email — frontend dostça mesaj için (anon çağırabilir) ────────
create or replace function public.check_blocked_email(p_email text)
returns table(blocked boolean, reason text)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select true, d.reason
  from public.deleted_accounts d
  where lower(d.email) = lower(coalesce(p_email, ''))
  limit 1;
$function$;

grant execute on function public.check_blocked_email(text) to anon, authenticated;

-- 5) admin_deleted_accounts — moderasyon listesi (admin) ───────────────────────
create or replace function public.admin_deleted_accounts(
  p_limit  integer default 100,
  p_search text default null
)
returns setof public.deleted_accounts
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz işlem' using errcode = '42501';
  end if;
  return query
    select *
    from public.deleted_accounts d
    where p_search is null
       or d.email ilike '%' || p_search || '%'
       or coalesce(d.full_name, '') ilike '%' || p_search || '%'
    order by d.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$function$;

-- 6) admin_unblock_email — yeniden kayda izin ver (tombstone sil) ──────────────
create or replace function public.admin_unblock_email(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz işlem' using errcode = '42501';
  end if;
  delete from public.deleted_accounts where id = p_id;
end;
$function$;

-- ── Doğrulama (opsiyonel) ─────────────────────────────────────────────────────
-- select proname from pg_proc where proname in
--   ('admin_delete_users','block_deleted_email','check_blocked_email','admin_deleted_accounts','admin_unblock_email');
-- select tgname from pg_trigger where tgname = 'block_deleted_email_trg';
