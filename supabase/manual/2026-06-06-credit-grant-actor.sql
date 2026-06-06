-- ════════════════════════════════════════════════════════════════════════════
-- Kredi veren admini izle (credit_transactions.actor_id)
-- ✅ PROD'A UYGULANDI (2026-06-06) — TEKRAR ÇALIŞTIRMAYA GEREK YOK (idempotent).
--    Project: oxgnrhgaodtvywpjguku (TransWordly)
--
-- Amaç: admin "Kredi Ver" dediğinde, kredi defterinde HANGİ admin verdiği görünsün.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.credit_transactions
  add column if not exists actor_id uuid;

-- grant_credits: veren admini (auth.uid) actor_id'ye yaz
create or replace function public.grant_credits(p_user_id uuid, p_amount numeric, p_reason text DEFAULT 'admin_grant'::text)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_new numeric;
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz işlem' using errcode = '42501';
  end if;
  if p_amount is null then
    raise exception 'Geçersiz tutar' using errcode = '22023';
  end if;

  perform set_config('app.guard_bypass', 'on', true);
  update public.profiles
  set credits_remaining = greatest(0, credits_remaining + p_amount)
  where id = p_user_id
  returning credits_remaining into v_new;

  if v_new is null then
    raise exception 'Kullanıcı bulunamadı' using errcode = 'P0002';
  end if;

  insert into public.credit_transactions (user_id, amount, action, actor_id)
  values (p_user_id, p_amount, p_reason, auth.uid());

  return v_new;
end;
$function$;

-- admin_user_ledger: recent satırlarına veren admin e-postasını ekle (actor_email)
create or replace function public.admin_user_ledger(p_user_id uuid)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_result json;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Yetkisiz: admin gerekli';
  end if;
  select json_build_object(
    'purchased',      coalesce((select sum(amount) from credit_transactions where user_id = p_user_id and action = 'purchase'), 0),
    'admin_granted',  coalesce((select sum(amount) from credit_transactions where user_id = p_user_id and action = 'admin_grant'), 0),
    'monthly_reset',  coalesce((select sum(amount) from credit_transactions where user_id = p_user_id and action = 'monthly_reset'), 0),
    'spent_total',    coalesce((select sum(abs(amount)) from credit_transactions where user_id = p_user_id and amount < 0), 0),
    'spent_by_action',coalesce((select json_object_agg(action, total) from (
                         select action, sum(abs(amount)) total
                         from credit_transactions where user_id = p_user_id and amount < 0
                         group by action) s), '{}'::json),
    'recent',         coalesce((select json_agg(r) from (
                         select ct.amount, ct.action, ct.created_at, pr.email as actor_email
                         from credit_transactions ct
                         left join profiles pr on pr.id = ct.actor_id
                         where ct.user_id = p_user_id
                         order by ct.created_at desc limit 50) r), '[]'::json)
  ) into v_result;
  return v_result;
end;
$function$;
