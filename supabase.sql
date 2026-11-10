-- =====================================================================
-- Centrala CRM — baza danych i zabezpieczenia (Supabase → SQL Editor → Run)
-- 1) Wpisz poniżej PRAWDZIWE e-maile Twoje, Michała i Agaty.
-- 2) Uruchom cały skrypt. Można go uruchomić ponownie bez szkody.
-- =====================================================================

-- Lista osób, które mają dostęp do danych CRM
create table if not exists public.allowed_emails (
  email text primary key
);
alter table public.allowed_emails enable row level security;
-- (celowo brak reguł: tej listy nie da się odczytać ani zmienić ze strony www)

insert into public.allowed_emails (email) values
  (lower('TWOJ_EMAIL@przyklad.pl')),
  (lower('EMAIL_MICHALA@przyklad.pl')),
  (lower('EMAIL_AGATY@przyklad.pl'))
on conflict do nothing;

-- Czy zalogowana osoba jest w zespole?
create or replace function public.is_team()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_emails
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_team() from public, anon;
grant execute on function public.is_team() to authenticated;

-- Wszystkie dane CRM: zamówienia, produkty, klienci, zadania, sklepy, boty, ustawienia
create table if not exists public.records (
  col        text not null,              -- rodzaj: orders, products, customers, ...
  id         text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (col, id)
);
alter table public.records enable row level security;
alter table public.records replica identity full;   -- potrzebne do usuwania na żywo

drop policy if exists "zespol_czyta"   on public.records;
drop policy if exists "zespol_dodaje"  on public.records;
drop policy if exists "zespol_zmienia" on public.records;
drop policy if exists "zespol_usuwa"   on public.records;
create policy "zespol_czyta"   on public.records for select to authenticated using (public.is_team());
create policy "zespol_dodaje"  on public.records for insert to authenticated with check (public.is_team());
create policy "zespol_zmienia" on public.records for update to authenticated using (public.is_team()) with check (public.is_team());
create policy "zespol_usuwa"   on public.records for delete to authenticated using (public.is_team());

revoke all on public.records from anon;
grant select, insert, update, delete on public.records to authenticated;

-- Zmiany widoczne u wspólników na żywo
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records'
  ) then
    alter publication supabase_realtime add table public.records;
  end if;
end $$;

-- Gotowe! Dodanie nowego wspólnika później:
--   insert into public.allowed_emails (email) values (lower('nowy@przyklad.pl'));
