-- ════════════════════════════════════════════════════════════════════════════
-- Admin Moderasyon — ban kolonları + ban/sil RPC'leri + AI geçidi ban kontrolü
--
-- ⚠️  ELLE ÇALIŞTIR: Supabase Dashboard → SQL Editor'a yapıştır ve çalıştır.
--     (Auto-mode canlı DB'ye DDL uygulamayı bloke ediyor; repo migration'ları
--      stale, `db push` YOK — canlı DB el-yönetimli.)
--     Project: oxgnrhgaodtvywpjguku (TransWordly)
--
-- Güvenlik: tüm RPC'ler SECURITY DEFINER + is_admin() korumalı (mevcut pattern).
-- Self-koruma: admin kendini silemez/yasaklayamaz; admin rolü silinemez/yasaklanamaz.
-- Silme: auth.users cascade (profiles + tüm alt tablolar ON DELETE CASCADE) → edge gerekmez.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Ban kolonları (profiles)
alter table public.profiles
  add column if not exists banned_until timestamptz,
  add column if not exists ban_reason  text;

-- 2) Ban / yasak kaldır
--    p_until: null = yasağı kaldır · gelecekteki ts = o tarihe kadar · 'infinity' = kalıcı
create or replace function public.admin_set_ban(
  p_user_id uuid,
  p_until   timestamptz,
  p_reason  text default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_target_role text;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz işlem' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Kendinizi yasaklayamazsınız' using errcode = '22023';
  end if;

  select role into v_target_role from public.profiles where id = p_user_id;
  if v_target_role is null then
    raise exception 'Kullanıcı bulunamadı' using errcode = 'P0002';
  end if;
  if v_target_role = 'admin' then
    raise exception 'Admin kullanıcı yasaklanamaz' using errcode = '42501';
  end if;

  perform set_config('app.guard_bypass', 'on', true);
  update public.profiles
  set banned_until = p_until,
      ban_reason   = case when p_until is null then null else p_reason end
  where id = p_user_id;
end;
$function$;

-- 3) Kullanıcı silme (tekli + toplu) — auth.users cascade ile tüm veri silinir
create or replace function public.admin_delete_users(p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_deleted int;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz işlem' using errcode = '42501';
  end if;
  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    raise exception 'Kullanıcı seçilmedi' using errcode = '22023';
  end if;
  if auth.uid() = any(p_user_ids) then
    raise exception 'Kendinizi silemezsiniz' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where id = any(p_user_ids) and role = 'admin') then
    raise exception 'Admin kullanıcılar silinemez' using errcode = '42501';
  end if;

  perform set_config('app.guard_bypass', 'on', true);
  delete from auth.users where id = any(p_user_ids);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

-- 4) AI geçidine ban kontrolü ekle (yasaklı kullanıcı kredi harcayamaz / AI kullanamaz)
--    NOT: begin_ai_operation'ın geri kalanı CANLI ile birebir aynı; yalnızca
--    auth kontrolünden hemen sonra "yasaklı" bloğu eklendi.
create or replace function public.begin_ai_operation(p_action text, p_amount numeric, p_calls integer, p_reference uuid DEFAULT NULL::uuid)
 returns TABLE(operation_id uuid, remaining numeric)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user uuid;
  v_current numeric;
  v_new numeric;
  v_op uuid;
  v_calls int;
  v_amount numeric;
  v_unit numeric;
  v_units int;
  v_recent int;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Yetkisiz işlem' using errcode = '42501';
  end if;

  -- Yasaklı kullanıcı AI kullanamaz
  if exists (
    select 1 from public.profiles
    where id = v_user and banned_until is not null and banned_until > now()
  ) then
    raise exception 'Hesabınız askıya alındı' using errcode = '42501';
  end if;

  if p_action not in ('translation','chat','study_notes','glossary','flashcards','write') then
    raise exception 'Geçersiz işlem türü' using errcode = '22023';
  end if;

  -- Hız sınırı
  select count(*) into v_recent
  from public.ai_operations
  where user_id = v_user and created_at > now() - interval '60 seconds';
  if v_recent >= 40 then
    raise exception 'Çok fazla istek — lütfen biraz bekleyin' using errcode = 'P0001';
  end if;

  -- Birim ücret (canlı app_config; yoksa 1)
  select value into v_unit
  from public.app_config
  where key = 'credit_cost.' ||
    case p_action when 'translation' then 'translation_per_page' else p_action end;
  v_unit := coalesce(v_unit, 1);

  if p_action in ('translation','study_notes') then
    v_calls := greatest(1, least(coalesce(p_calls, 1), 20000));
    if p_action = 'translation' then
      v_units := greatest(1, ceil((v_calls - 30) / 6.0))::int;
    else
      v_units := greatest(1, ceil((v_calls - 5) / 2.0))::int;
    end if;
    v_amount := v_unit * v_units;
  else
    v_amount := v_unit;
    v_calls := case p_action
                 when 'chat' then 6
                 when 'glossary' then 3
                 when 'flashcards' then 3
                 when 'write' then 3
                 else 3
               end;
  end if;

  -- Atomik düşüm
  select credits_remaining into v_current
  from public.profiles where id = v_user for update;
  if v_current is null then
    raise exception 'Profil bulunamadı' using errcode = 'P0002';
  end if;
  if v_current < v_amount then
    raise exception 'Yetersiz kredi' using errcode = 'P0001';
  end if;

  v_new := v_current - v_amount;
  perform set_config('app.guard_bypass', 'on', true);
  update public.profiles set credits_remaining = v_new where id = v_user;

  if v_amount > 0 then
    insert into public.credit_transactions (user_id, amount, action, reference_id)
    values (v_user, -v_amount, p_action, p_reference);
  end if;

  insert into public.ai_operations (user_id, action, calls_allowed, expires_at, charged)
  values (v_user, p_action, v_calls, now() + interval '2 hours', v_amount)
  returning id into v_op;

  return query select v_op, v_new;
end;
$function$;

-- ── Doğrulama (çalıştırdıktan sonra opsiyonel) ──────────────────────────────
-- select proname from pg_proc where proname in ('admin_set_ban','admin_delete_users');
-- select column_name from information_schema.columns
--   where table_schema='public' and table_name='profiles' and column_name in ('banned_until','ban_reason');
