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

-- Skrót klucza nie jest czytelny z panelu. Wystawianie i odwołanie idzie przez funkcje poniżej (bez service_role).
revoke select (key_hash) on public.api_keys from authenticated;
revoke insert, update, delete on public.api_keys from authenticated;

-- Klucz API zespołu. Wywołanie z JWT użytkownika i kluczem publishable.
create or replace function public.create_api_key(p_label text, p_key_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.is_team() then
    raise exception 'Brak uprawnień zespołu. Ten e-mail nie jest na liście allowed_emails.' using errcode = '42501';
  end if;
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Zły skrót klucza.';
  end if;
  insert into public.api_keys (key_hash, label, created_by)
  values (p_key_hash, left(coalesce(nullif(btrim(p_label), ''), 'Wtyczka'), 80), auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.revoke_api_key(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_team() then
    raise exception 'Brak uprawnień zespołu. Ten e-mail nie jest na liście allowed_emails.' using errcode = '42501';
  end if;
  update public.api_keys set revoked_at = now() where id = p_id and revoked_at is null;
end;
$$;

revoke all on function public.create_api_key(text, text) from public, anon;
revoke all on function public.revoke_api_key(uuid) from public, anon;
grant execute on function public.create_api_key(text, text) to authenticated, service_role;
grant execute on function public.revoke_api_key(uuid) to authenticated, service_role;

create or replace function public.nhp_num(p text)
returns numeric
language plpgsql
immutable
as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  return replace(p, ',', '.')::numeric;
exception when others then
  return null;
end;
$$;
revoke all on function public.nhp_num(text) from public, anon, authenticated;

-- Import z wtyczki. Anon woła funkcję skrótem klucza; nie czyta tabeli api_keys.
create or replace function public.import_offer_export(p_key_hash text, p_batch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key public.api_keys%rowtype;
  v_catalog uuid;
  v_item jsonb;
  v_data jsonb;
  v_product uuid;
  v_auction uuid;
  v_batch text;
  v_saved int := 0;
  v_flagged int := 0;
  v_now timestamptz := now();
  v_price numeric;
  v_status text;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Nieprawidłowy klucz API.' using errcode = '28000';
  end if;
  select * into v_key from public.api_keys where key_hash = p_key_hash and revoked_at is null;
  if not found then
    raise exception 'Nieprawidłowy klucz API.' using errcode = '28000';
  end if;
  update public.api_keys set last_used_at = v_now where id = v_key.id;

  v_batch := nullif(p_batch->>'batch_id', '');
  if v_batch is null or v_batch !~ '^[A-Za-z0-9_-]{6,64}$' then
    v_batch := 'imp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
  end if;
  insert into public.offer_import_batches (id, name, account_login, created_by, updated_at)
  values (
    v_batch,
    coalesce(nullif(p_batch->>'name', ''), 'Import z wtyczki'),
    nullif(p_batch->>'account_login', ''),
    v_key.created_by,
    v_now
  )
  on conflict (id) do update
    set name = excluded.name, account_login = excluded.account_login, updated_at = excluded.updated_at;

  select id into v_catalog from public.product_catalogs where name = 'Import z wtyczki' limit 1;
  if v_catalog is null then
    insert into public.product_catalogs (name, source) values ('Import z wtyczki', 'extension') returning id into v_catalog;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_batch->'items', '[]'::jsonb))
  loop
    v_data := coalesce(v_item->'item', '{}'::jsonb);
    v_status := coalesce(nullif(v_item->>'status', ''), 'draft');
    if v_status = 'flagged' or lower(coalesce(v_item->>'flagged', '')) in ('true', 't', '1') then
      v_flagged := v_flagged + 1;
    end if;
    v_price := public.nhp_num(v_data->>'price');

    v_product := null;
    if coalesce(v_data->>'ean', '') <> '' then
      select id into v_product from public.products where ean = v_data->>'ean' limit 1;
    end if;
    if v_product is null and coalesce(v_data->>'sku', '') <> '' then
      select id into v_product from public.products where sku = v_data->>'sku' limit 1;
    end if;
    if v_product is null and coalesce(v_data->>'source_link', '') <> '' then
      select id into v_product from public.products where source_link = v_data->>'source_link' limit 1;
    end if;

    if v_product is null then
      insert into public.products (
        catalog_id, sku, ean, name, catalog_name, producer, brand, category_id, category,
        price, base_price, price_before_promo, delivery_cost, shipping_time,
        images, description, description_sections, params, source_link, allegro_product_id, status, updated_at
      ) values (
        v_catalog,
        coalesce(nullif(v_data->>'sku', ''), nullif(v_data->>'ean', '')),
        nullif(v_data->>'ean', ''),
        coalesce(nullif(v_data->>'catalog_name', ''), 'Bez nazwy'),
        nullif(v_data->>'catalog_name', ''),
        nullif(v_data->>'producer', ''),
        nullif(v_data->>'producer', ''),
        nullif(v_data->>'category_id', ''),
        nullif(v_data->>'category', ''),
        v_price,
        public.nhp_num(v_data->>'base_price'),
        public.nhp_num(v_data->>'price_before_promo'),
        public.nhp_num(v_data->>'delivery_cost'),
        nullif(v_data->>'shipping_time', ''),
        coalesce(v_data->'images', '[]'::jsonb),
        (select string_agg(s->>'text', E'\n\n') from jsonb_array_elements(coalesce(v_data->'description_sections', '[]'::jsonb)) s where s->>'type' = 'text'),
        coalesce(v_data->'description_sections', '[]'::jsonb),
        coalesce(v_data->'parameters', '[]'::jsonb),
        nullif(v_data->>'source_link', ''),
        nullif(v_data->>'allegro_product_id', ''),
        case when v_price is null then 'flagged' else 'active' end,
        v_now
      ) returning id into v_product;
    else
      update public.products set
        catalog_id = coalesce(catalog_id, v_catalog),
        sku = coalesce(nullif(sku, ''), nullif(v_data->>'sku', ''), nullif(v_data->>'ean', '')),
        name = coalesce(nullif(name, ''), nullif(v_data->>'catalog_name', ''), 'Bez nazwy'),
        catalog_name = coalesce(catalog_name, nullif(v_data->>'catalog_name', '')),
        producer = coalesce(nullif(v_data->>'producer', ''), producer),
        brand = coalesce(nullif(v_data->>'producer', ''), brand),
        category = coalesce(nullif(v_data->>'category', ''), category),
        category_id = coalesce(nullif(v_data->>'category_id', ''), category_id),
        price = coalesce(v_price, price),
        base_price = coalesce(public.nhp_num(v_data->>'base_price'), base_price),
        price_before_promo = coalesce(public.nhp_num(v_data->>'price_before_promo'), price_before_promo),
        delivery_cost = coalesce(public.nhp_num(v_data->>'delivery_cost'), delivery_cost),
        shipping_time = coalesce(nullif(v_data->>'shipping_time', ''), shipping_time),
        images = case when jsonb_typeof(v_data->'images') = 'array' and jsonb_array_length(v_data->'images') > 0 then v_data->'images' else images end,
        description_sections = case when jsonb_typeof(v_data->'description_sections') = 'array' and jsonb_array_length(v_data->'description_sections') > 0 then v_data->'description_sections' else description_sections end,
        params = case when jsonb_typeof(v_data->'parameters') = 'array' and jsonb_array_length(v_data->'parameters') > 0 then v_data->'parameters' else params end,
        source_link = coalesce(nullif(v_data->>'source_link', ''), source_link),
        allegro_product_id = coalesce(nullif(v_data->>'allegro_product_id', ''), allegro_product_id),
        updated_at = v_now
      where id = v_product;
    end if;

    v_auction := null;
    if coalesce(v_data->>'source_offer_id', '') <> '' then
      select id into v_auction from public.auctions where source_offer_id = v_data->>'source_offer_id' limit 1;
    end if;
    if v_auction is null and coalesce(v_data->>'source_link', '') <> '' then
      select id into v_auction from public.auctions where source_link = v_data->>'source_link' limit 1;
    end if;

    if v_auction is null then
      insert into public.auctions (
        source_offer_id, origin, ean, name, catalog_name, producer, brand, category_id, category,
        price, base_price, price_before_promo, delivery_cost, shipping_time,
        images, description, description_sections, params, source_link, allegro_product_id,
        product_id, missing, status, updated_at
      ) values (
        nullif(v_data->>'source_offer_id', ''),
        'import',
        nullif(v_data->>'ean', ''),
        coalesce(nullif(v_data->>'catalog_name', ''), 'Bez nazwy'),
        nullif(v_data->>'catalog_name', ''),
        nullif(v_data->>'producer', ''),
        nullif(v_data->>'producer', ''),
        nullif(v_data->>'category_id', ''),
        nullif(v_data->>'category', ''),
        v_price,
        public.nhp_num(v_data->>'base_price'),
        public.nhp_num(v_data->>'price_before_promo'),
        public.nhp_num(v_data->>'delivery_cost'),
        nullif(v_data->>'shipping_time', ''),
        coalesce(v_data->'images', '[]'::jsonb),
        (select string_agg(s->>'text', E'\n\n') from jsonb_array_elements(coalesce(v_data->'description_sections', '[]'::jsonb)) s where s->>'type' = 'text'),
        coalesce(v_data->'description_sections', '[]'::jsonb),
        coalesce(v_data->'parameters', '[]'::jsonb),
        nullif(v_data->>'source_link', ''),
        nullif(v_data->>'allegro_product_id', ''),
        v_product,
        coalesce(v_data->'missing', '[]'::jsonb),
        v_status,
        v_now
      ) returning id into v_auction;
    else
      update public.auctions set
        product_id = v_product,
        name = coalesce(nullif(v_data->>'catalog_name', ''), name),
        catalog_name = coalesce(catalog_name, nullif(v_data->>'catalog_name', '')),
        price = coalesce(v_price, price),
        base_price = coalesce(public.nhp_num(v_data->>'base_price'), base_price),
        delivery_cost = coalesce(public.nhp_num(v_data->>'delivery_cost'), delivery_cost),
        missing = coalesce(v_data->'missing', missing),
        status = v_status,
        updated_at = v_now
      where id = v_auction;
    end if;

    insert into public.product_offer_links (auction_id, product_id)
    values (v_auction, v_product)
    on conflict do nothing;

    insert into public.offer_import_items (batch_id, pos, source_offer_id, ean, status, missing, data, product_id, auction_id, updated_at)
    values (
      v_batch,
      coalesce((v_item->>'pos')::int, v_saved),
      nullif(v_data->>'source_offer_id', ''),
      nullif(v_data->>'ean', ''),
      v_status,
      coalesce(v_data->'missing', '[]'::jsonb),
      v_data,
      v_product,
      v_auction,
      v_now
    );
    v_saved := v_saved + 1;
  end loop;

  return jsonb_build_object('ok', true, 'batch_id', v_batch, 'saved', v_saved, 'flagged', v_flagged, 'total_items', v_saved, 'url', '/#import-wtyczki');
end;
$$;

create or replace function public.touch_api_key(p_key_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Nieprawidłowy klucz API.' using errcode = '28000';
  end if;
  update public.api_keys set last_used_at = now()
   where key_hash = p_key_hash and revoked_at is null
   returning label into v_label;
  if v_label is null then
    raise exception 'Nieprawidłowy klucz API.' using errcode = '28000';
  end if;
  return jsonb_build_object('ok', true, 'label', v_label);
end;
$$;

revoke all on function public.import_offer_export(text, jsonb) from public;
revoke all on function public.touch_api_key(text) from public;
grant execute on function public.import_offer_export(text, jsonb) to anon, authenticated, service_role;
grant execute on function public.touch_api_key(text) to anon, authenticated, service_role;

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

-- Wgranie zdjęcia z wtyczki bez service_role: zezwolenie po skrócie klucza, deduplikacja po skrócie pliku.
create table if not exists public.media_files (
  sha256 text primary key,
  path text not null unique,
  public_url text not null,
  mime text,
  created_at timestamptz not null default now()
);
alter table public.media_files enable row level security;
revoke all on public.media_files from anon, authenticated;
grant all on public.media_files to service_role;

create table if not exists public.media_upload_permits (
  path text primary key,
  sha256 text not null,
  mime text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.media_upload_permits enable row level security;
revoke all on public.media_upload_permits from anon, authenticated;
grant all on public.media_upload_permits to service_role;

create or replace function public.media_upload_allowed(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.media_upload_permits
    where path = p_path and expires_at > now()
  );
$$;
revoke all on function public.media_upload_allowed(text) from public;
grant execute on function public.media_upload_allowed(text) to anon, authenticated, service_role;

create or replace function public.claim_media_upload(p_key_hash text, p_sha256 text, p_path text, p_mime text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Nieprawidłowy klucz API.' using errcode = '28000';
  end if;
  if not exists (select 1 from public.api_keys where key_hash = p_key_hash and revoked_at is null) then
    raise exception 'Nieprawidłowy klucz API.' using errcode = '28000';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Zły skrót zdjęcia.';
  end if;
  if p_path is null or p_path !~ '^products/[a-z0-9_-]{1,60}/[a-z0-9_-]{1,60}-[0-9]{1,4}\.(jpg|jpeg|png|webp|gif|avif)$' then
    raise exception 'Zła ścieżka zdjęcia.';
  end if;
  select public_url into v_url from public.media_files where sha256 = p_sha256;
  if v_url is not null then
    return jsonb_build_object('skip', true, 'path', (select path from public.media_files where sha256 = p_sha256), 'public_url', v_url);
  end if;
  insert into public.media_upload_permits (path, sha256, mime, expires_at)
  values (p_path, p_sha256, left(coalesce(p_mime, 'image/jpeg'), 80), now() + interval '20 minutes')
  on conflict (path) do update set sha256 = excluded.sha256, mime = excluded.mime, expires_at = excluded.expires_at;
  return jsonb_build_object('skip', false, 'path', p_path);
end;
$$;

create or replace function public.complete_media_upload(p_key_hash text, p_sha256 text, p_path text, p_public_url text, p_mime text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$'
     or not exists (select 1 from public.api_keys where key_hash = p_key_hash and revoked_at is null) then
    raise exception 'Nieprawidłowy klucz API.' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.media_upload_permits
    where path = p_path and sha256 = p_sha256 and expires_at > now()
  ) then
    raise exception 'Brak zezwolenia na ten plik.';
  end if;
  insert into public.media_files (sha256, path, public_url, mime)
  values (p_sha256, p_path, p_public_url, left(coalesce(p_mime, ''), 80))
  on conflict (sha256) do update set path = excluded.path, public_url = excluded.public_url;
  delete from public.media_upload_permits where path = p_path;
  return jsonb_build_object('ok', true, 'path', p_path, 'public_url', p_public_url);
end;
$$;

revoke all on function public.claim_media_upload(text, text, text, text) from public;
revoke all on function public.complete_media_upload(text, text, text, text, text) from public;
grant execute on function public.claim_media_upload(text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.complete_media_upload(text, text, text, text, text) to anon, authenticated, service_role;

drop policy if exists media_permit_insert on storage.objects;
create policy media_permit_insert on storage.objects
  for insert to anon
  with check (bucket_id = 'media' and public.media_upload_allowed(name));

-- Klucz OpenAI: tylko szyfrogram. Brak polityk SELECT. Panel dostaje last4 przez funkcję statusu.
create table if not exists public.openai_connection (
  id smallint primary key default 1 check (id = 1),
  cipher text not null,
  iv text not null,
  last4 text not null,
  text_model text not null,
  image_model text not null,
  proof text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.openai_connection enable row level security;
revoke all on public.openai_connection from anon, authenticated;
grant all on public.openai_connection to service_role;

create or replace function public.openai_connection_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.openai_connection%rowtype;
begin
  if not public.is_team() then
    raise exception 'Brak uprawnień zespołu. Ten e-mail nie jest na liście allowed_emails.' using errcode = '42501';
  end if;
  select * into v from public.openai_connection where id = 1;
  if not found then
    return jsonb_build_object('has_key', false, 'last4', '', 'text_model', 'gpt-5-mini', 'image_model', 'gpt-image-1');
  end if;
  return jsonb_build_object(
    'has_key', true,
    'last4', v.last4,
    'text_model', v.text_model,
    'image_model', v.image_model
  );
end;
$$;

create or replace function public.openai_connection_save(
  p_cipher text,
  p_iv text,
  p_last4 text,
  p_text_model text,
  p_image_model text,
  p_proof text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_team() then
    raise exception 'Brak uprawnień zespołu. Ten e-mail nie jest na liście allowed_emails.' using errcode = '42501';
  end if;
  if p_cipher is null or p_cipher !~ '^[A-Za-z0-9+/]+=*$' or length(p_cipher) < 16 or length(p_cipher) > 8000 then
    raise exception 'Zły szyfrogram.';
  end if;
  if p_iv is null or p_iv !~ '^[A-Za-z0-9+/]+=*$' or length(p_iv) < 8 or length(p_iv) > 64 then
    raise exception 'Zły wektor szyfrowania.';
  end if;
  if p_last4 is null or p_last4 !~ '^[A-Za-z0-9]{4}$' then
    raise exception 'Zła końcówka klucza.';
  end if;
  if p_text_model is null or p_text_model !~ '^[A-Za-z0-9._:-]{1,64}$' then
    raise exception 'Zła nazwa modelu tekstu.';
  end if;
  if p_image_model is null or p_image_model !~ '^[A-Za-z0-9._:-]{1,64}$' then
    raise exception 'Zła nazwa modelu zdjęć.';
  end if;
  if p_proof is null or p_proof !~ '^[0-9a-f]{64}$' then
    raise exception 'Zły dowód szyfrowania.';
  end if;
  insert into public.openai_connection (id, cipher, iv, last4, text_model, image_model, proof, updated_by)
  values (1, p_cipher, p_iv, p_last4, p_text_model, p_image_model, p_proof, auth.uid())
  on conflict (id) do update set
    cipher = excluded.cipher,
    iv = excluded.iv,
    last4 = excluded.last4,
    text_model = excluded.text_model,
    image_model = excluded.image_model,
    proof = excluded.proof,
    updated_by = excluded.updated_by,
    updated_at = now();
end;
$$;

create or replace function public.openai_connection_models(p_text_model text, p_image_model text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_team() then
    raise exception 'Brak uprawnień zespołu. Ten e-mail nie jest na liście allowed_emails.' using errcode = '42501';
  end if;
  if p_text_model is null or p_text_model !~ '^[A-Za-z0-9._:-]{1,64}$' then
    raise exception 'Zła nazwa modelu tekstu.';
  end if;
  if p_image_model is null or p_image_model !~ '^[A-Za-z0-9._:-]{1,64}$' then
    raise exception 'Zła nazwa modelu zdjęć.';
  end if;
  update public.openai_connection
     set text_model = p_text_model, image_model = p_image_model, updated_at = now(), updated_by = auth.uid()
   where id = 1;
  if not found then
    raise exception 'Najpierw zapisz klucz OpenAI.';
  end if;
end;
$$;

create or replace function public.openai_connection_clear()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_team() then
    raise exception 'Brak uprawnień zespołu. Ten e-mail nie jest na liście allowed_emails.' using errcode = '42501';
  end if;
  delete from public.openai_connection where id = 1;
end;
$$;

-- Szyfrogram tylko dla wywołania z dowodem sha256(NHP_ENC_KEY). Sam dowód nie odszyfrowuje klucza.
create or replace function public.openai_connection_cipher(p_proof text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.openai_connection%rowtype;
begin
  if not public.is_team() then
    raise exception 'Brak uprawnień zespołu. Ten e-mail nie jest na liście allowed_emails.' using errcode = '42501';
  end if;
  if p_proof is null or p_proof !~ '^[0-9a-f]{64}$' then
    raise exception 'Brak dostępu do zapisanego klucza.' using errcode = '42501';
  end if;
  select * into v from public.openai_connection where id = 1;
  if not found then
    return null;
  end if;
  if v.proof is distinct from p_proof then
    raise exception 'Brak dostępu do zapisanego klucza.' using errcode = '42501';
  end if;
  return jsonb_build_object('cipher', v.cipher, 'iv', v.iv, 'text_model', v.text_model, 'image_model', v.image_model);
end;
$$;

revoke all on function public.openai_connection_status() from public, anon;
revoke all on function public.openai_connection_save(text, text, text, text, text, text) from public, anon;
revoke all on function public.openai_connection_models(text, text) from public, anon;
revoke all on function public.openai_connection_clear() from public, anon;
revoke all on function public.openai_connection_cipher(text) from public, anon;
grant execute on function public.openai_connection_status() to authenticated, service_role;
grant execute on function public.openai_connection_save(text, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.openai_connection_models(text, text) to authenticated, service_role;
grant execute on function public.openai_connection_clear() to authenticated, service_role;
grant execute on function public.openai_connection_cipher(text) to authenticated, service_role;

-- =====================================================================
-- Shopify, statusy produktów, statystyki stron i faktury KSeF.
-- Skrypt można puścić ponownie. Nie kasuje danych.
-- Sekrety sklepu i token KSeF NIE są w bazie — tylko w Cloudflare.
-- status (active/flagged) zostaje oznaczeniem braków danych.
-- workflow_status to lejek sprzedaży.
-- =====================================================================

alter table public.products add column if not exists workflow_status text not null default 'pobrany';
alter table public.products add column if not exists shopify_product_id text;
alter table public.products add column if not exists shopify_variant_id text;
alter table public.products add column if not exists shopify_handle text;
alter table public.products add column if not exists shopify_url text;
alter table public.products add column if not exists shopify_status text;
alter table public.products add column if not exists shopify_synced_at timestamptz;
alter table public.products add column if not exists shopify_sync_error text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_workflow_status_check'
  ) then
    alter table public.products add constraint products_workflow_status_check
      check (workflow_status in ('pobrany', 'w_przygotowaniu', 'strona_gotowa', 'opublikowany', 'wstrzymany', 'archiwum'));
  end if;
end $$;

create unique index if not exists products_shopify_id on public.products (shopify_product_id) where shopify_product_id is not null and shopify_product_id <> '';
create index if not exists products_workflow on public.products (workflow_status);

create table if not exists public.product_status_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor uuid,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists product_status_events_product on public.product_status_events (product_id, created_at desc);

create table if not exists public.shopify_sync_queue (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  reason text not null default 'product',
  created_at timestamptz not null default now(),
  done_at timestamptz,
  error text
);
create index if not exists shopify_sync_queue_pending on public.shopify_sync_queue (created_at) where done_at is null;

create table if not exists public.shopify_orders (
  id uuid primary key default gen_random_uuid(),
  shopify_order_id text not null unique,
  order_number text,
  email text,
  financial_status text not null default 'pending',
  currency text not null default 'PLN',
  total numeric,
  taxes_included boolean not null default true,
  customer_name text,
  billing jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  placed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shopify_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.shopify_orders(id) on delete cascade,
  shopify_line_id text not null,
  product_id uuid references public.products(id) on delete set null,
  shopify_product_id text,
  sku text,
  title text,
  quantity integer not null default 1,
  unit_price numeric,
  line_total numeric,
  unique (order_id, shopify_line_id)
);
create index if not exists shopify_order_lines_product on public.shopify_order_lines (product_id);
create index if not exists shopify_order_lines_shopify_product on public.shopify_order_lines (shopify_product_id);

create table if not exists public.ksef_invoices (
  id uuid primary key default gen_random_uuid(),
  shopify_order_id text not null unique,
  invoice_number text unique,
  ksef_number text,
  ksef_reference text,
  session_reference text,
  status text not null default 'szkic',
  xml text,
  error text,
  env text,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ksef_invoices_status_check'
  ) then
    alter table public.ksef_invoices add constraint ksef_invoices_status_check
      check (status in ('szkic', 'oczekuje_konfiguracji', 'wyslana', 'przyjeta', 'odrzucona', 'blad'));
  end if;
end $$;

create table if not exists public.ksef_counters (
  ym text primary key,
  n integer not null
);

create table if not exists public.page_metrics (
  page_id text primary key,
  slug text not null,
  views bigint not null default 0,
  last_view_at timestamptz
);
create index if not exists page_metrics_slug on public.page_metrics (slug);

create table if not exists public.page_view_days (
  page_id text not null,
  day date not null,
  views integer not null default 0,
  primary key (page_id, day)
);

create table if not exists public.shopify_state (
  id integer primary key default 1 check (id = 1),
  last_orders_pull timestamptz,
  last_error text
);
insert into public.shopify_state (id) values (1) on conflict (id) do nothing;

create table if not exists public.shopify_webhook_events (
  id text primary key,
  topic text,
  created_at timestamptz not null default now()
);

-- Zespół czyta. Zapis kolejek, zamówień i faktur robi serwer (service_role) albo trigger.
do $$
declare t text;
begin
  foreach t in array array[
    'product_status_events','shopify_sync_queue','shopify_orders','shopify_order_lines',
    'ksef_invoices','page_metrics','page_view_days','shopify_state'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists zespol_czyta on public.%I', t);
    execute format('create policy zespol_czyta on public.%I for select to authenticated using (public.is_team())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

alter table public.ksef_counters enable row level security;
alter table public.shopify_webhook_events enable row level security;
revoke all on public.ksef_counters from anon, authenticated;
revoke all on public.shopify_webhook_events from anon, authenticated;
grant all on public.ksef_counters to service_role;
grant all on public.shopify_webhook_events to service_role;

create or replace view public.product_sales
with (security_invoker = true) as
select
  p.id as product_id,
  count(distinct o.id) filter (
    where o.financial_status in ('paid', 'partially_paid', 'partially_refunded')
  )::integer as orders_count,
  coalesce(sum(l.quantity) filter (
    where o.financial_status in ('paid', 'partially_paid', 'partially_refunded')
  ), 0)::integer as units_sold,
  coalesce(sum(l.line_total) filter (
    where o.financial_status in ('paid', 'partially_paid', 'partially_refunded')
  ), 0)::numeric as revenue
from public.products p
left join public.shopify_order_lines l on l.product_id = p.id
left join public.shopify_orders o on o.id = l.order_id
group by p.id;

revoke all on public.product_sales from anon, public;
grant select on public.product_sales to authenticated, service_role;

create or replace function public.nhp_product_workflow_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.product_status_events (product_id, from_status, to_status, note)
    values (new.id, null, new.workflow_status, 'utworzenie');
    return new;
  end if;
  if new.workflow_status is distinct from old.workflow_status then
    insert into public.product_status_events (product_id, from_status, to_status, actor, note)
    values (new.id, old.workflow_status, new.workflow_status, auth.uid(), '');
  end if;
  return new;
end;
$$;

create or replace function public.nhp_queue_shopify_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('nhp.skip_shopify_sync', true), '') = '1' then
    return new;
  end if;
  if new.shopify_product_id is null
     and new.workflow_status not in ('strona_gotowa', 'opublikowany', 'wstrzymany', 'archiwum') then
    return new;
  end if;
  insert into public.shopify_sync_queue (product_id, reason)
  values (new.id, 'product');
  return new;
end;
$$;

create or replace function public.nhp_queue_shopify_page()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(current_setting('nhp.skip_shopify_sync', true), '') = '1' then
    return new;
  end if;
  if new.product_id is not null and new.product_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_id := new.product_id::uuid;
    insert into public.shopify_sync_queue (product_id, reason)
    select p.id, 'page'
    from public.products p
    where p.id = v_id
      and (
        p.shopify_product_id is not null
        or p.workflow_status in ('strona_gotowa', 'opublikowany', 'wstrzymany', 'archiwum')
      );
  end if;
  if tg_op = 'UPDATE'
     and old.product_id is distinct from new.product_id
     and old.product_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_id := old.product_id::uuid;
    insert into public.shopify_sync_queue (product_id, reason)
    select p.id, 'page'
    from public.products p
    where p.id = v_id and p.shopify_product_id is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists products_workflow_history on public.products;
create trigger products_workflow_history
  after insert or update of workflow_status on public.products
  for each row execute function public.nhp_product_workflow_history();

drop trigger if exists products_shopify_queue on public.products;
create trigger products_shopify_queue
  after update of workflow_status, price, description, name, catalog_name, ean, sku, images, description_sections
  on public.products
  for each row execute function public.nhp_queue_shopify_product();

drop trigger if exists pages_shopify_queue on public.pages;
create trigger pages_shopify_queue
  after insert or update of data, status, name, slug, product_id on public.pages
  for each row execute function public.nhp_queue_shopify_page();

-- Zmiana z Shopify nie wraca od razu do sklepu (flaga transakcji).
create or replace function public.apply_shopify_inbound(p_product_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workflow text;
begin
  perform set_config('nhp.skip_shopify_sync', '1', true);
  v_workflow := nullif(p_patch->>'workflow_status', '');
  if v_workflow is not null and v_workflow not in (
    'pobrany', 'w_przygotowaniu', 'strona_gotowa', 'opublikowany', 'wstrzymany', 'archiwum'
  ) then
    raise exception 'Nieznany status produktu.';
  end if;
  update public.products set
    name = coalesce(nullif(p_patch->>'name', ''), name),
    catalog_name = coalesce(nullif(p_patch->>'catalog_name', ''), catalog_name),
    description = case when p_patch ? 'description' then left(p_patch->>'description', 20000) else description end,
    price = case when nullif(p_patch->>'price', '') is not null then (p_patch->>'price')::numeric else price end,
    sku = coalesce(nullif(p_patch->>'sku', ''), sku),
    ean = coalesce(nullif(p_patch->>'ean', ''), ean),
    workflow_status = coalesce(v_workflow, workflow_status),
    shopify_product_id = coalesce(nullif(p_patch->>'shopify_product_id', ''), shopify_product_id),
    shopify_variant_id = coalesce(nullif(p_patch->>'shopify_variant_id', ''), shopify_variant_id),
    shopify_handle = coalesce(nullif(p_patch->>'shopify_handle', ''), shopify_handle),
    shopify_url = coalesce(nullif(p_patch->>'shopify_url', ''), shopify_url),
    shopify_status = coalesce(nullif(p_patch->>'shopify_status', ''), shopify_status),
    shopify_synced_at = now(),
    shopify_sync_error = null,
    updated_at = now()
  where id = p_product_id;
end;
$$;

create or replace function public.next_ksef_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := to_char(now() at time zone 'Europe/Warsaw', 'YYYYMM');
  v_ym text := to_char(now() at time zone 'Europe/Warsaw', 'YYYY/MM');
  v_n integer;
begin
  insert into public.ksef_counters (ym, n) values (v_key, 1)
  on conflict (ym) do update set n = public.ksef_counters.n + 1
  returning n into v_n;
  return 'FV/' || v_ym || '/' || lpad(v_n::text, 4, '0');
end;
$$;

create or replace function public.record_page_view(p_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_day date := (now() at time zone 'Europe/Warsaw')::date;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9-]{1,70}$' then
    return;
  end if;
  select id into v_id from public.pages where slug = p_slug and status = 'published' limit 1;
  if v_id is null then
    return;
  end if;
  insert into public.page_metrics (page_id, slug, views, last_view_at)
  values (v_id, p_slug, 1, now())
  on conflict (page_id) do update
    set views = public.page_metrics.views + 1,
        slug = excluded.slug,
        last_view_at = now();
  insert into public.page_view_days (page_id, day, views)
  values (v_id, v_day, 1)
  on conflict (page_id, day) do update
    set views = public.page_view_days.views + 1;
end;
$$;

revoke all on function public.nhp_product_workflow_history() from public, anon;
revoke all on function public.nhp_queue_shopify_product() from public, anon;
revoke all on function public.nhp_queue_shopify_page() from public, anon;
revoke all on function public.apply_shopify_inbound(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.next_ksef_invoice_number() from public, anon, authenticated;
revoke all on function public.record_page_view(text) from public;
-- Trigger przy zapisie zespołu wymaga EXECUTE. To funkcje trigger — PostgREST ich nie woła jak zwykłego RPC.
grant execute on function public.nhp_product_workflow_history() to authenticated, service_role;
grant execute on function public.nhp_queue_shopify_product() to authenticated, service_role;
grant execute on function public.nhp_queue_shopify_page() to authenticated, service_role;
grant execute on function public.apply_shopify_inbound(uuid, jsonb) to service_role;
grant execute on function public.next_ksef_invoice_number() to service_role;
grant execute on function public.record_page_view(text) to anon, authenticated, service_role;


-- ============================================================
-- Dane sprzedawcy wpisywane raz (Ustawienia → Dane sprzedawcy).
-- Źródło: records col='config' id='main' → data.seller.
-- Karta produktu dziedziczy puste pola, zmiana w Ustawieniach trafia do kart,
-- a strona www czyta je przez nhp_public_seller() (dane sprzedawcy są jawne z mocy prawa).
-- ============================================================
create or replace function public.nhp_config_seller()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when jsonb_typeof(data->'seller') = 'object' then data->'seller' end
  from public.records where col = 'config' and id = 'main'
$$;
revoke all on function public.nhp_config_seller() from public, anon, authenticated;

create or replace function public.nhp_public_seller()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'name', coalesce(s->>'name', ''),
    'address', coalesce(s->>'address', ''),
    'nip', coalesce(s->>'nip', ''),
    'email', coalesce(s->>'email', ''),
    'phone', coalesce(s->>'phone', ''),
    'vat_exempt', coalesce((s->>'vat_exempt')::boolean, false)
  )
  from (select coalesce(public.nhp_config_seller(), '{}'::jsonb) as s) x
$$;
revoke all on function public.nhp_public_seller() from public;
grant execute on function public.nhp_public_seller() to anon, authenticated;

create or replace function public.nhp_pages_fill_seller()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_def jsonb := public.nhp_config_seller();
  v_s jsonb;
  k text;
begin
  if v_def is null then
    return new;
  end if;
  v_s := case when jsonb_typeof(new.data->'seller') = 'object' then new.data->'seller' else '{}'::jsonb end;
  foreach k in array array['name', 'address', 'nip', 'email', 'phone'] loop
    if coalesce(v_s->>k, '') = '' and coalesce(v_def->>k, '') <> '' then
      v_s := v_s || jsonb_build_object(k, v_def->>k);
    end if;
  end loop;
  if v_s->'vat_exempt' is null then
    v_s := v_s || jsonb_build_object('vat_exempt', coalesce((v_def->>'vat_exempt')::boolean, false));
  end if;
  new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{seller}', v_s);
  return new;
end;
$$;
revoke all on function public.nhp_pages_fill_seller() from public, anon;
grant execute on function public.nhp_pages_fill_seller() to authenticated, service_role;

drop trigger if exists pages_fill_seller on public.pages;
create trigger pages_fill_seller
before insert or update of data on public.pages
for each row execute function public.nhp_pages_fill_seller();

-- Zmiana w Ustawieniach: karty z pustym sprzedawcą albo z poprzednimi danymi z Ustawień
-- dostają nowe dane. Karty z ręcznie wpisanym innym sprzedawcą zostają bez zmian.
create or replace function public.nhp_config_push_seller()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new jsonb := case when jsonb_typeof(new.data->'seller') = 'object' then new.data->'seller' end;
  v_old jsonb := case when tg_op = 'UPDATE' and jsonb_typeof(old.data->'seller') = 'object' then old.data->'seller' end;
begin
  if new.col <> 'config' or new.id <> 'main' or v_new is null or v_new is not distinct from v_old then
    return null;
  end if;
  perform set_config('nhp.skip_shopify_sync', '1', true);
  update public.pages p
     set data = jsonb_set(coalesce(p.data, '{}'::jsonb), '{seller}',
           jsonb_build_object(
             'name', coalesce(v_new->>'name', ''),
             'address', coalesce(v_new->>'address', ''),
             'nip', coalesce(v_new->>'nip', ''),
             'email', coalesce(v_new->>'email', ''),
             'phone', coalesce(v_new->>'phone', ''),
             'vat_exempt', coalesce((v_new->>'vat_exempt')::boolean, false)))
   where coalesce(p.data->'seller'->>'name', '') = ''
      or (v_old is not null
          and coalesce(p.data->'seller'->>'name', '') = coalesce(v_old->>'name', '')
          and coalesce(p.data->'seller'->>'email', '') = coalesce(v_old->>'email', ''));
  perform set_config('nhp.skip_shopify_sync', '', true);
  return null;
end;
$$;
revoke all on function public.nhp_config_push_seller() from public, anon;
grant execute on function public.nhp_config_push_seller() to authenticated, service_role;

drop trigger if exists records_push_seller on public.records;
create trigger records_push_seller
after insert or update of data on public.records
for each row when (new.col = 'config' and new.id = 'main')
execute function public.nhp_config_push_seller();

-- Realizacja zamówień (fulfil_settings, fulfil_rules, fulfilments, fulfil_log, klucze w Vault, cron nhp-fulfil)
-- jest wdrożona migracjami Supabase: fulfilment_queue, fulfilment_ordered_at, fulfilment_cron.
-- Kod funkcji Edge: supabase/functions/fulfil (logika: lib/fulfil-core.mjs, testy: tests/fulfil.test.mjs).

-- Meta Pixel: records config/main → data.tracking.meta_pixel trafia do kart (wyzwalacze pages_fill_tracking, records_push_tracking),
-- wdrożone migracją pages_tracking_defaults.

-- Obsługa klienta: wiadomość (records col=messages) → zgłoszenie (col=tickets), wyzwalacz records_ticket_from_message,
-- migracja support_tickets_from_messages.

-- Śledzenie: Meta Pixel + Google Ads (google_ads_id, google_ads_label) z config/main trafia do kart — migracja pages_tracking_defaults_google.

-- Social: platformy youtube i x, dostawcy google i x — migracja social_youtube_x. Kod funkcji: supabase/functions/social-connect, social-autopilot.
