-- =====================================================================
-- Centrala CRM + Generator stron — baza i zabezpieczenia
-- Supabase → SQL Editor → wklej CAŁY plik → Run.
-- Skrypt można uruchomić ponownie: nie kasuje zamówień ani stron.
--
-- !!! PLACEHOLDERY E-MAILI — TO NIE SĄ PRAWDZIWE ADRESY !!!
-- Zamień poniżej trzy przykładowe wiersze na prawdziwe e-maile wspólników
-- ZANIM ktokolwiek się zaloguje. Adresy @przyklad.pl nikogo nie wpuszczą,
-- ale mają zostać w pliku, żeby było widać, co uzupełnić.
-- Po wpisaniu prawdziwych adresów usuń placeholdery:
--   delete from public.allowed_emails where email like '%@przyklad.pl';
-- =====================================================================

-- Lista osób, które mają dostęp do danych CRM
create table if not exists public.allowed_emails (
  email text primary key
);
alter table public.allowed_emails enable row level security;
-- (celowo brak reguł: tej listy nie da się odczytać ani zmienić ze strony www)

insert into public.allowed_emails (email) values
  (lower('TWOJ_EMAIL@przyklad.pl')),      -- PLACEHOLDER: e-mail właściciela, NIE prawdziwy adres
  (lower('EMAIL_MICHALA@przyklad.pl')),   -- PLACEHOLDER: e-mail Michała, NIE prawdziwy adres
  (lower('EMAIL_AGATY@przyklad.pl'))      -- PLACEHOLDER: e-mail Agaty, NIE prawdziwy adres
on conflict do nothing;

comment on table public.allowed_emails is
  'PLACEHOLDER: TWOJ_EMAIL@przyklad.pl, EMAIL_MICHALA@przyklad.pl i EMAIL_AGATY@przyklad.pl trzeba zamienić na prawdziwe adresy. Te trzy wpisy same z siebie nikogo nie logują.';

do $$
begin
  raise notice 'UWAGA — PLACEHOLDERY: allowed_emails ma przykładowe adresy @przyklad.pl. Zamień je na prawdziwe e-maile wspólników.';
end $$;

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

-- Wszystkie dane CRM: zamówienia, produkty, klienci, zadania, sklepy, boty, leady, wiadomości
create table if not exists public.records (
  col        text not null,              -- rodzaj: orders, products, customers, leads, messages, ...
  id         text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (col, id)
);
alter table public.records enable row level security;
alter table public.records replica identity full;   -- potrzebne do usuwania na żywo

-- Klucz e-mail do szukania klienta i limitu zamówień (tylko serwer, przez service_role).
alter table public.records add column if not exists email_key text
  generated always as (lower(coalesce(data->>'email', ''))) stored;
create index if not exists records_email_key on public.records (col, email_key);

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

-- ---------------------------------------------------------------------
-- Strony one-page (Generator stron). Anon NIE ma dostępu.
-- Odczyt publiczny idzie przez Pages Function i klucz service_role.
-- ---------------------------------------------------------------------
create table if not exists public.pages (
  id           text primary key,
  slug         text not null unique,
  name         text not null,
  status       text not null default 'draft' check (status in ('draft', 'published')),
  product_id   text,
  shop_id      text,
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz,
  updated_by   uuid default auth.uid()
);
alter table public.pages enable row level security;
alter table public.pages replica identity full;
create index if not exists pages_status_slug on public.pages (status, slug);

drop policy if exists "strony_czyta"   on public.pages;
drop policy if exists "strony_dodaje"  on public.pages;
drop policy if exists "strony_zmienia" on public.pages;
drop policy if exists "strony_usuwa"   on public.pages;
create policy "strony_czyta"   on public.pages for select to authenticated using (public.is_team());
create policy "strony_dodaje"  on public.pages for insert to authenticated with check (public.is_team());
create policy "strony_zmienia" on public.pages for update to authenticated using (public.is_team()) with check (public.is_team());
create policy "strony_usuwa"   on public.pages for delete to authenticated using (public.is_team());

revoke all on public.pages from anon;
grant select, insert, update, delete on public.pages to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pages'
  ) then
    alter publication supabase_realtime add table public.pages;
  end if;
end $$;

-- Licznik prób z publicznych formularzy. Brak polityk = brak dostępu dla anon i authenticated.
-- Zapisuje wyłącznie serwer (service_role omija RLS).
create table if not exists public.public_hits (
  id         bigint generated always as identity primary key,
  kind       text not null,
  slug       text not null,
  ip         text,
  created_at timestamptz not null default now()
);
alter table public.public_hits enable row level security;
create index if not exists public_hits_lookup on public.public_hits (kind, ip, created_at desc);
revoke all on public.public_hits from anon, authenticated;

-- Gotowe! Dodanie nowego wspólnika później:
--   insert into public.allowed_emails (email) values (lower('nowy@przyklad.pl'));
-- I pamiętaj usunąć PLACEHOLDERY @przyklad.pl, gdy wpiszesz prawdziwe adresy.

-- =====================================================================
-- Baza produktów, aukcje, import z wtyczki, szkice Allegro, generacja.
-- Osobne tabele — nie mieszamy tego z public.records (EAV zamówień).
-- Skrypt można puścić ponownie. Tokeny Allegro i skróty kluczy API
-- nie są czytelne dla anon ani dla zalogowanego zespołu.
-- =====================================================================

create table if not exists public.product_catalogs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source text not null default 'manual',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  note text not null default '',
  position numeric not null default 0,
  status text not null default 'todo',
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid references public.product_catalogs(id) on delete set null,
  sku text,
  ean text,
  name text not null,
  catalog_name text,
  brand text,
  producer text,
  category_id text,
  category text,
  work_category_id uuid references public.work_categories(id) on delete set null,
  price numeric,
  base_price numeric,
  price_before_promo numeric,
  delivery_cost numeric,
  currency text not null default 'PLN',
  stock integer,
  shipping_time text,
  images jsonb not null default '[]'::jsonb,
  description text,
  description_sections jsonb not null default '[]'::jsonb,
  params jsonb not null default '[]'::jsonb,
  source_link text,
  allegro_product_id text,
  status text not null default 'active',
  generated jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_ean on public.products (ean);
create index if not exists products_catalog on public.products (catalog_id);

create table if not exists public.auctions (
  id uuid primary key default gen_random_uuid(),
  source_offer_id text,
  allegro_offer_id text,
  account_id uuid,
  shop text,
  origin text not null default 'import',
  sku text,
  ean text,
  name text,
  catalog_name text,
  brand text,
  producer text,
  category_id text,
  category text,
  work_category_id uuid references public.work_categories(id) on delete set null,
  price numeric,
  base_price numeric,
  price_before_promo numeric,
  delivery_cost numeric,
  currency text not null default 'PLN',
  stock integer,
  status text not null default 'draft',
  shipping_time text,
  images jsonb not null default '[]'::jsonb,
  description text,
  description_sections jsonb not null default '[]'::jsonb,
  params jsonb not null default '[]'::jsonb,
  source_link text,
  allegro_product_id text,
  product_id uuid references public.products(id) on delete set null,
  missing jsonb not null default '[]'::jsonb,
  generated jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create unique index if not exists auctions_source_offer on public.auctions (source_offer_id) where source_offer_id is not null and source_offer_id <> '';
create index if not exists auctions_status on public.auctions (status);
create index if not exists auctions_work on public.auctions (work_category_id);

create table if not exists public.product_offer_links (
  auction_id uuid not null references public.auctions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  primary key (auction_id, product_id)
);

create table if not exists public.listing_drafts (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'allegro',
  auction_id uuid references public.auctions(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  account_id uuid,
  name text,
  price numeric,
  stock integer,
  status text not null default 'draft',
  offer_id text,
  payload jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listing_items (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid references public.listing_drafts(id) on delete set null,
  account_id uuid,
  product_id uuid,
  name text,
  status text not null,
  offer_id text,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.offer_import_batches (
  id text primary key,
  name text,
  account_login text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.offer_import_items (
  id uuid primary key default gen_random_uuid(),
  batch_id text not null references public.offer_import_batches(id) on delete cascade,
  pos integer not null default 0,
  source_offer_id text,
  ean text,
  status text not null default 'draft',
  missing jsonb not null default '[]'::jsonb,
  data jsonb not null default '{}'::jsonb,
  product_id uuid,
  auction_id uuid,
  updated_at timestamptz not null default now()
);
create index if not exists offer_import_items_batch on public.offer_import_items (batch_id, pos);

create table if not exists public.category_commissions (
  id uuid primary key default gen_random_uuid(),
  category_key text not null unique,
  label text not null,
  rate_pct numeric not null check (rate_pct >= 0 and rate_pct < 95),
  updated_at timestamptz not null default now()
);

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  tier text not null check (tier in ('s1', 's1_pro', 's1_max')),
  status text not null default 'queued',
  target text not null default 'page',
  product_id uuid,
  page_id text,
  import_item_id uuid,
  cost_estimate_pln numeric not null default 0,
  cost_actual_pln numeric,
  model text,
  error text,
  result jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid,
  page_id text,
  kind text not null check (kind in ('image', 'video')),
  bucket text not null default 'media',
  path text not null,
  public_url text,
  mime text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  label text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.allegro_accounts (
  id uuid primary key default gen_random_uuid(),
  shop text not null default '',
  login text,
  seller_id text,
  expires_at timestamptz,
  connected_by uuid,
  created_at timestamptz not null default now(),
  last_error text
);

create table if not exists public.allegro_secrets (
  account_id uuid primary key references public.allegro_accounts(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.allegro_oauth_states (
  state text primary key,
  user_id uuid,
  created_at timestamptz not null default now()
);

-- Zespół widzi dane handlowe. Tokenów i skrótu klucza nie dostaje.
do $$
declare t text;
begin
  foreach t in array array[
    'product_catalogs','work_categories','products','auctions','product_offer_links',
    'listing_drafts','listing_items','offer_import_batches','offer_import_items',
    'category_commissions','generation_jobs','media','api_keys','allegro_accounts'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists zespol_czyta on public.%I', t);
    execute format('drop policy if exists zespol_dodaje on public.%I', t);
    execute format('drop policy if exists zespol_zmienia on public.%I', t);
    execute format('drop policy if exists zespol_usuwa on public.%I', t);
    execute format('create policy zespol_czyta on public.%I for select to authenticated using (public.is_team())', t);
    execute format('create policy zespol_dodaje on public.%I for insert to authenticated with check (public.is_team())', t);
    execute format('create policy zespol_zmienia on public.%I for update to authenticated using (public.is_team()) with check (public.is_team())', t);
    execute format('create policy zespol_usuwa on public.%I for delete to authenticated using (public.is_team())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Skrót klucza zostaje przy service_role. Zespół widzi tylko metadane i może odwołać klucz.
revoke select (key_hash) on public.api_keys from authenticated;
revoke insert, update, delete on public.api_keys from authenticated;

alter table public.allegro_secrets enable row level security;
alter table public.allegro_oauth_states enable row level security;
revoke all on public.allegro_secrets from anon, authenticated;
revoke all on public.allegro_oauth_states from anon, authenticated;
grant all on public.allegro_secrets to service_role;
grant all on public.allegro_oauth_states to service_role;

-- Pliki wideo i zdjęć. Ścieżki są losowe. Odczyt publiczny jest potrzebny opublikowanej stronie.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = 52428800;

drop policy if exists media_team_read on storage.objects;
drop policy if exists media_team_insert on storage.objects;
drop policy if exists media_team_update on storage.objects;
drop policy if exists media_team_delete on storage.objects;
drop policy if exists media_public_read on storage.objects;
create policy media_team_read on storage.objects for select to authenticated using (bucket_id = 'media' and public.is_team());
create policy media_team_insert on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.is_team());
create policy media_team_update on storage.objects for update to authenticated using (bucket_id = 'media' and public.is_team()) with check (bucket_id = 'media' and public.is_team());
create policy media_team_delete on storage.objects for delete to authenticated using (bucket_id = 'media' and public.is_team());
create policy media_public_read on storage.objects for select to anon using (bucket_id = 'media');

