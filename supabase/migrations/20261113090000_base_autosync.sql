-- Automatyczna synchronizacja cen i stanów: Base → Centrala → Shopify.
-- Cron w Supabase (pg_cron + pg_net, jak nhp-fulfil) co minutę sprawdza, czy jest coś do zrobienia,
-- i wtedy woła /api/base/sync w panelu (Cloudflare). Tam są sekrety Base i Shopify.
-- Token crona powstaje w Vault sam — nikt go nie wpisuje. Migrację można uruchomić ponownie.

-- Stan synchronizacji: jeden wiersz (id = 1).
create table if not exists public.base_sync_state (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true,
  interval_hours integer not null default 4 check (interval_hours between 1 and 48),
  next_run_at timestamptz not null default now(),
  running boolean not null default false,
  cursor text not null default '',
  run_started_at timestamptz,
  run_checked integer not null default 0,
  run_changed integer not null default 0,
  run_errors jsonb not null default '[]'::jsonb,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_checked integer not null default 0,
  last_changed integer not null default 0,
  last_errors jsonb not null default '[]'::jsonb,
  lock_until timestamptz,
  endpoint text not null default 'https://panel.nowoczesnyhandelpolski.pl/api/base/sync',
  updated_at timestamptz not null default now()
);
insert into public.base_sync_state (id) values (1) on conflict (id) do nothing;

alter table public.base_sync_state enable row level security;
drop policy if exists "base_sync_czyta" on public.base_sync_state;
drop policy if exists "base_sync_zmienia" on public.base_sync_state;
create policy "base_sync_czyta" on public.base_sync_state for select to authenticated using (public.is_team());
create policy "base_sync_zmienia" on public.base_sync_state for update to authenticated using (public.is_team()) with check (public.is_team());
revoke all on public.base_sync_state from anon;

-- Produkt wstrzymany automatycznie, bo w hurtowni zabrakło towaru (wraca sam, gdy towar wróci).
alter table public.products add column if not exists base_auto_paused boolean not null default false;

-- Blokada jednego przebiegu naraz (cron i przycisk „Synchronizuj teraz” mogą się spotkać).
create or replace function public.base_sync_claim(p_seconds integer default 90)
returns setof public.base_sync_state
language sql
set search_path = public
as $$
  update public.base_sync_state
     set lock_until = now() + make_interval(secs => greatest(10, least(coalesce(p_seconds, 90), 300)))
   where id = 1 and (lock_until is null or lock_until < now())
  returning *;
$$;

-- Zmiany z Base jednym wywołaniem: [{ id, price, stock, variants }].
-- Stan 0 przy produkcie aktywnym → „wstrzymany” (w Shopify szkic) i znacznik base_auto_paused.
-- Towar wrócił, a produkt wstrzymała synchronizacja → znowu „opublikowany”.
-- Wyzwalacz products_shopify_queue sam wrzuca zmienione produkty do kolejki Shopify.
create or replace function public.base_sync_apply(p_changes jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v jsonb;
  v_id uuid;
  v_stock integer;
  v_wf text;
  v_paused boolean;
  v_count integer := 0;
begin
  for v in select value from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) loop
    v_id := nullif(v->>'id', '')::uuid;
    select workflow_status, base_auto_paused into v_wf, v_paused
      from public.products where id = v_id for update;
    if not found then
      continue;
    end if;
    v_stock := case when v ? 'stock' then nullif(v->>'stock', '')::numeric::integer end;
    update public.products set
      price = case when v ? 'price' then nullif(v->>'price', '')::numeric else price end,
      stock = case when v ? 'stock' then v_stock else stock end,
      variants = case when jsonb_typeof(v->'variants') = 'array' then v->'variants' else variants end,
      workflow_status = case
        when v_stock = 0 and v_wf = 'opublikowany' then 'wstrzymany'
        when v_stock > 0 and v_paused and v_wf = 'wstrzymany' then 'opublikowany'
        else workflow_status end,
      base_auto_paused = case
        when v_stock = 0 and v_wf = 'opublikowany' then true
        when v_stock > 0 and v_paused then false
        else base_auto_paused end,
      base_synced_at = now(),
      updated_at = now()
    where id = v_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Token crona z Vault. Panel porównuje nagłówek x-nhp-cron przez tę funkcję (klucz service role).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'nhp_base_sync_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'nhp_base_sync_token', 'Token crona synchronizacji Base → Shopify');
  end if;
end $$;

create or replace function public.base_sync_token_ok(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select length(coalesce(p_token, '')) >= 32
     and exists (select 1 from vault.decrypted_secrets where name = 'nhp_base_sync_token' and decrypted_secret = p_token);
$$;

revoke all on function public.base_sync_claim(integer) from public, anon, authenticated;
revoke all on function public.base_sync_apply(jsonb) from public, anon, authenticated;
revoke all on function public.base_sync_token_ok(text) from public, anon, authenticated;
grant execute on function public.base_sync_claim(integer) to service_role;
grant execute on function public.base_sync_apply(jsonb) to service_role;
grant execute on function public.base_sync_token_ok(text) to service_role;

-- Cron: co minutę, ale zapytanie do panelu idzie tylko wtedy, gdy jest coś do zrobienia:
-- przebieg trwa, przyszła pora następnego albo w kolejce Shopify czekają produkty z Base.
select cron.unschedule('nhp-base-sync') where exists (select 1 from cron.job where jobname = 'nhp-base-sync');
select cron.schedule('nhp-base-sync', '* * * * *', $cron$
  select net.http_post(
    url := (select endpoint from public.base_sync_state where id = 1),
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-nhp-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'nhp_base_sync_token')),
    timeout_milliseconds := 60000)
  where exists (
      select 1 from public.base_sync_state s
       where s.id = 1 and s.endpoint <> '' and (s.lock_until is null or s.lock_until < now())
         and (s.running or (s.enabled and s.next_run_at <= now())))
     or exists (
      select 1 from public.shopify_sync_queue q
        join public.products p on p.id = q.product_id
       where q.done_at is null and q.created_at > now() - interval '1 day' and p.source like 'base%');
$cron$);
