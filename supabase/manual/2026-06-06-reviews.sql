-- 2026-06-06 — Kullanıcı yorumları + admin moderasyon
-- Kural: SADECE gerçek ödeme (credit_action='purchase') yapmış kullanıcı yorum yazabilir;
-- yorumlar admin onayından geçmeden yayınlanmaz. Anasayfa yalnızca onaylıları okur.
-- DB drift nedeniyle elle uygulanır (db push YOK).

create table if not exists public.reviews (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references public.profiles(id) on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  body         text not null check (char_length(btrim(body)) between 4 and 1000),
  display_name text,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid references public.profiles(id) on delete set null
);

create index if not exists reviews_public_idx on public.reviews (status, rating, created_at desc);

alter table public.reviews enable row level security;

-- Herkes onaylı yorumu görebilir; kullanıcı kendi yorumunu; admin hepsini.
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews
  for select
  using (status = 'approved' or auth.uid() = user_id or public.is_admin());

grant select on public.reviews to anon, authenticated;

-- ── Yorum gönder (upsert; her yeniden gönderim onayı sıfırlar) ─────────────────
create or replace function public.submit_review(
  p_rating smallint,
  p_body text,
  p_display_name text default null
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text;
begin
  if v_uid is null then
    raise exception 'Giriş gerekli';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Geçersiz puan';
  end if;
  if p_body is null or char_length(btrim(p_body)) < 4 then
    raise exception 'Yorum çok kısa';
  end if;

  -- Yalnızca gerçek ödeme yapmış kullanıcı yorum yazabilir (admin_grant sayılmaz).
  if not exists (
    select 1 from public.credit_transactions
    where user_id = v_uid and action = 'purchase'
  ) then
    raise exception 'Yorum yapabilmek için bir satın alım gerekir';
  end if;

  v_name := nullif(btrim(coalesce(p_display_name, '')), '');
  if v_name is null then
    select coalesce(nullif(btrim(nickname), ''), nullif(btrim(full_name), ''), 'Kullanıcı')
      into v_name from public.profiles where id = v_uid;
  end if;

  insert into public.reviews (user_id, rating, body, display_name, status)
  values (v_uid, p_rating, btrim(p_body), v_name, 'pending')
  on conflict (user_id) do update
    set rating       = excluded.rating,
        body         = excluded.body,
        display_name = excluded.display_name,
        status       = 'pending',
        updated_at   = now(),
        reviewed_at  = null,
        reviewed_by  = null;

  return 'pending';
end;
$$;

grant execute on function public.submit_review(smallint, text, text) to authenticated;

-- ── Admin: yorum durumunu değiştir ────────────────────────────────────────────
create or replace function public.admin_set_review_status(
  p_id uuid,
  p_status text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkisiz';
  end if;
  if p_status not in ('approved', 'rejected', 'pending') then
    raise exception 'Geçersiz durum';
  end if;
  update public.reviews
    set status      = p_status,
        reviewed_at = now(),
        reviewed_by = auth.uid()
    where id = p_id;
end;
$$;

grant execute on function public.admin_set_review_status(uuid, text) to authenticated;

-- ── Onaylı yorum istatistiği (dürüst AggregateRating için — TÜM onaylılar) ─────
create or replace function public.review_stats()
returns table (count bigint, average numeric)
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint, round(coalesce(avg(rating), 0), 2)
  from public.reviews
  where status = 'approved';
$$;

grant execute on function public.review_stats() to anon, authenticated;
